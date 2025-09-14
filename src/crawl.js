#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
const NewsDatabase = require('./db');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');

// Scheduling helpers (min-heap and small utilities)
class MinHeap {
  constructor(compare) {
    this.data = [];
    this.compare = compare;
  }
  size() { return this.data.length; }
  peek() { return this.data[0]; }
  push(item) { this.data.push(item); this._siftUp(this.data.length - 1); }
  pop() {
    const n = this.data.length;
    if (n === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (n > 1) { this.data[0] = last; this._siftDown(0); }
    return top;
  }
  _siftUp(i) {
    const d = this.data; const cmp = this.compare; let idx = i;
    while (idx > 0) {
      const p = Math.floor((idx - 1) / 2);
      if (cmp(d[idx], d[p]) < 0) { [d[idx], d[p]] = [d[p], d[idx]]; idx = p; } else break;
    }
  }
  _siftDown(i) {
    const d = this.data; const cmp = this.compare; let idx = i; const n = d.length;
    while (true) {
      let left = 2 * idx + 1, right = 2 * idx + 2, smallest = idx;
      if (left < n && cmp(d[left], d[smallest]) < 0) smallest = left;
      if (right < n && cmp(d[right], d[smallest]) < 0) smallest = right;
      if (smallest !== idx) { [d[idx], d[smallest]] = [d[smallest], d[idx]]; idx = smallest; } else break;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function nowMs() { return Date.now(); }
function jitter(ms, maxJitter = 250) { return ms + Math.floor(Math.random() * maxJitter); }
function parseRetryAfter(headerVal) {
  if (!headerVal) return null;
  const s = String(headerVal).trim();
  const asInt = parseInt(s, 10);
  if (!Number.isNaN(asInt)) return asInt * 1000;
  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now();
    return diff > 0 ? diff : 0;
  }
  return null;
}

class NewsCrawler {
  constructor(startUrl, options = {}) {
    this.startUrl = startUrl;
    this.domain = new URL(startUrl).hostname;
    this.baseUrl = `${new URL(startUrl).protocol}//${this.domain}`;
    
    // Configuration
    this.rateLimitMs = options.rateLimitMs || 1000; // 1 second between requests
    this.maxDepth = options.maxDepth || 3;
        this.dataDir = options.dataDir || path.join(process.cwd(), 'data');
        this._lastProgressEmitAt = 0;
    this.concurrency = Math.max(1, options.concurrency || 1);
    this.maxQueue = Math.max(1000, options.maxQueue || 10000);
    this.retryLimit = options.retryLimit || 3;
    this.backoffBaseMs = options.backoffBaseMs || 500;
    this.backoffMaxMs = options.backoffMaxMs || 5 * 60 * 1000;
    this.maxDownloads =
      typeof options.maxDownloads === 'number' && options.maxDownloads > 0
        ? options.maxDownloads
        : undefined; // Limit number of network downloads
    this.maxAgeMs =
      typeof options.maxAgeMs === 'number' && options.maxAgeMs > 0
        ? options.maxAgeMs
        : undefined; // Freshness window for cached items
  this.dbPath = options.dbPath || path.join(this.dataDir, 'news.db');
  this.enableDb = options.enableDb !== undefined ? options.enableDb : true;
    
    // State
    this.visited = new Set();
    this.queuedUrls = new Set(); // to dedupe queued items in priority mode
    this.robotsRules = null;
    this.requestQueue = []; // used by FIFO single-thread mode
  this.isProcessing = false;
  this.db = null;
    this.usePriorityQueue = this.concurrency > 1; // enable PQ only when concurrent
    if (this.usePriorityQueue) {
      this.queueHeap = new MinHeap((a, b) => a.priority - b.priority);
    }
    this.lastRequestTime = 0; // for global spacing
    
    // Statistics
    this.stats = {
      pagesVisited: 0,
      pagesDownloaded: 0,
      articlesFound: 0,
      articlesSaved: 0
    };
  }


  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });
    
    // Initialize database (optional)
    if (this.enableDb) {
      this.db = new NewsDatabase(this.dbPath);
      console.log(`SQLite DB initialized at: ${this.dbPath}`);
    }
    
    // Load robots.txt
    await this.loadRobotsTxt();
    
    console.log(`Starting crawler for ${this.domain}`);
    console.log(`Data will be saved to: ${this.dataDir}`);
  }

  async loadRobotsTxt() {
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      console.log(`Loading robots.txt from: ${robotsUrl}`);
      
      const response = await fetch(robotsUrl);
      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsRules = robotsParser(robotsUrl, robotsTxt);
        console.log('robots.txt loaded successfully');
      } else {
        console.log('No robots.txt found, proceeding without restrictions');
      }
    } catch (error) {
      console.log('Failed to load robots.txt, proceeding without restrictions');
    }
  }

  isAllowed(url) {
    if (!this.robotsRules) return true;
    return this.robotsRules.isAllowed(url, '*');
  }

  isOnDomain(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      return urlObj.hostname === this.domain;
    } catch {
      return false;
    }
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url, this.baseUrl);
      // Remove fragment and normalize
      urlObj.hash = '';
      return urlObj.href;
    } catch {
      return null;
    }
  }

  async fetchPage(url, context = {}) {
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedUrl || this.visited.has(normalizedUrl)) {
      return null;
    }

    if (!this.isOnDomain(normalizedUrl) || !this.isAllowed(normalizedUrl)) {
      console.log(`Skipping ${normalizedUrl} (not allowed or off-domain)`);
      return null;
    }
    
    try {
      console.log(`Fetching: ${normalizedUrl}`);
      const started = Date.now();
      const requestStartedIso = new Date(started).toISOString();
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
        }
      });
      const headersReady = Date.now();
      const ttfbMs = headersReady - started; // time to first byte (headers received)

      if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = parseRetryAfter(retryAfterHeader);
        console.log(`Failed to fetch ${normalizedUrl}: ${response.status}`);
        return { error: true, httpStatus: response.status, retryAfterMs, url: normalizedUrl };
      }

      const html = await response.text();
      const finished = Date.now();
      const downloadMs = finished - headersReady;
      const totalMs = finished - started;
      const bytesDownloaded = Buffer.byteLength(html, 'utf8');
      const transferKbps = downloadMs > 0 ? (bytesDownloaded / 1024) / (downloadMs / 1000) : null;
      const contentType = response.headers.get('content-type') || null;
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10) || null;
      const etag = response.headers.get('etag') || null;
      const lastModified = response.headers.get('last-modified') || null;
      const fetchedAtIso = new Date(finished).toISOString();
      const httpStatus = response.status;
      const finalUrl = response.url || normalizedUrl;
      const redirectChain = finalUrl !== normalizedUrl ? JSON.stringify([normalizedUrl, finalUrl]) : null;
          this.stats.pagesVisited++;
          this.stats.pagesDownloaded++;
          this.emitProgress();
      
      return {
        url: finalUrl,
        html,
        fetchMeta: {
          requestStartedIso,
          fetchedAtIso,
          httpStatus,
          contentType,
          contentLength,
          etag,
          lastModified,
          redirectChain,
          referrerUrl: context.referrerUrl || null,
          crawlDepth: context.depth ?? null,
          ttfbMs,
          downloadMs,
          totalMs,
          bytesDownloaded,
          transferKbps
        }
      };
    } catch (error) {
      console.log(`Error fetching ${normalizedUrl}: ${error.message}`);
      return { error: true, networkError: true, url: normalizedUrl };
    }
  }

  emitProgress(force = false) {
    const now = Date.now();
    if (!force && now - this._lastProgressEmitAt < 300) return;
    this._lastProgressEmitAt = now;
    const p = {
      visited: this.stats.pagesVisited,
      downloaded: this.stats.pagesDownloaded,
      found: this.stats.articlesFound,
      saved: this.stats.articlesSaved
    };
    try {
      console.log(`PROGRESS ${JSON.stringify(p)}`);
    } catch (_) {}
  }

  // Compute JSON file path for an article URL (same logic as saveArticle)
  getArticleFilePathFromUrl(url) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const filename = pathParts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
    return path.join(this.dataDir, filename);
  }

  // Try to retrieve a cached article (DB preferred, else JSON file). Returns {html, crawledAt} or null.
  async getCachedArticle(url) {
    // Check DB first
    if (this.db) {
      const row = this.db.getArticleByUrl(url);
      if (row && row.html && row.crawled_at) {
        return { html: row.html, crawledAt: row.crawled_at };
      }
    }
    // Fall back to JSON file
    try {
      const filePath = this.getArticleFilePathFromUrl(url);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.html && parsed.crawledAt) {
        return { html: parsed.html, crawledAt: parsed.crawledAt };
      }
    } catch (_) {
      // ignore
    }
    return null;
  }

  findNavigationLinks($) {
    const navigationLinks = [];
    
    // Find navigation elements
    const navSelectors = [
      'header a',
      'nav a', 
      'footer a',
      '[role="navigation"] a',
      '.menu a',
      '.nav a',
      '.navigation a',
      '.breadcrumb a',
      '.breadcrumbs a',
      '.pagination a',
      '.pager a'
    ];

    navSelectors.forEach(selector => {
      $(selector).each((i, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        const normalizedUrl = this.normalizeUrl(href);
        if (!normalizedUrl) return;
        const anchor = $(element).text().trim().slice(0, 200) || null;
        const rel = $(element).attr('rel') || null;
        const onDomain = this.isOnDomain(normalizedUrl) ? 1 : 0;
        navigationLinks.push({ url: normalizedUrl, anchor, rel, onDomain });
      });
    });

    // Dedupe by url keeping first occurrence for anchor/rel
    const map = new Map();
    for (const l of navigationLinks) {
      if (!map.has(l.url)) map.set(l.url, l);
    }
    return Array.from(map.values());
  }

  findArticleLinks($) {
    const articleLinks = [];
    
    // Common selectors for article links
    const articleSelectors = [
      'article a',
      '.article a',
      '.story a',
      '.content a[href*="/"]',
      'a[href*="/article"]',
      'a[href*="/story"]',
      'a[href*="/news"]',
      'a[href*="/world"]',
      'a[href*="/politics"]',
      'a[href*="/business"]',
      'a[href*="/sport"]',
      'a[href*="/culture"]',
      'a[href*="/opinion"]',
      'a[href*="/lifestyle"]',
      'a[href*="/technology"]',
      'h1 a', 'h2 a', 'h3 a' // Headlines often link to articles
    ];

    articleSelectors.forEach(selector => {
      $(selector).each((i, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        const normalizedUrl = this.normalizeUrl(href);
        if (!normalizedUrl) return;
        if (this.isOnDomain(normalizedUrl) && this.looksLikeArticle(normalizedUrl)) {
          const anchor = $(element).text().trim().slice(0, 200) || null;
          const rel = $(element).attr('rel') || null;
          const onDomain = 1; // already checked
          articleLinks.push({ url: normalizedUrl, anchor, rel, onDomain });
        }
      });
    });

    // Dedupe by url keeping first occurrence for anchor/rel
    const map = new Map();
    for (const l of articleLinks) {
      if (!map.has(l.url)) map.set(l.url, l);
    }
    return Array.from(map.values());
  }

  looksLikeArticle(url) {
    // Heuristics to determine if URL looks like an article
    const urlStr = url.toLowerCase();
    
    // Skip certain patterns that are unlikely to be articles
    const skipPatterns = [
      '/search', '/login', '/register', '/subscribe', '/newsletter',
      '/contact', '/about', '/privacy', '/terms', '/cookies',
      '/rss', '/feed', '.xml', '.json', '/api/', '/admin/',
      '/profile', '/account', '/settings', '/user/',
      '/tag/', '/tags/', '/category/', '/categories/',
      '/page/', '/index', '/sitemap', '/archive',
      '.pdf', '.jpg', '.png', '.gif', '.css', '.js'
    ];

    if (skipPatterns.some(pattern => urlStr.includes(pattern))) {
      return false;
    }

    // Positive indicators for articles
    const articlePatterns = [
      '/article', '/story', '/news', '/post',
      '/world', '/politics', '/business', '/sport',
      '/culture', '/opinion', '/lifestyle', '/technology',
      '/commentisfree', '/uk-news', '/us-news'
    ];

    return articlePatterns.some(pattern => urlStr.includes(pattern)) ||
           /\/\d{4}\/\d{2}\/\d{2}\//.test(urlStr); // Date pattern
  }

  extractArticleMetadata($, url) {
    // Extract title
    const title = $('h1').first().text().trim() || 
                  $('title').text().trim() || 
                  $('[property="og:title"]').attr('content') || 
                  'Unknown Title';

    // Extract date
    let date = '';
    const dateSelectors = [
      '[datetime]',
      '.date',
      '.published',
      '.timestamp',
      '[property="article:published_time"]',
      '[name="article:published_time"]'
    ];

    for (const selector of dateSelectors) {
      const element = $(selector).first();
      if (element.length) {
        date = element.attr('datetime') || element.attr('content') || element.text().trim();
        if (date) break;
      }
    }

    // Extract section from URL or metadata
    let section = '';
    const urlParts = new URL(url).pathname.split('/').filter(Boolean);
    if (urlParts.length > 0) {
      section = urlParts[0];
    }

    // Try to get section from metadata
    const sectionMeta = $('[property="article:section"]').attr('content') ||
                       $('[name="section"]').attr('content') ||
                       $('.section').first().text().trim();
    
    if (sectionMeta) {
      section = sectionMeta;
    }

    return { title, date, section, url };
  }

  async saveArticle(html, metadata, options = {}) {
    try {
      // Create filename from URL
      const urlObj = new URL(metadata.url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      const filename = pathParts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
      
      const articleData = {
        ...metadata,
        html,
        crawledAt: new Date().toISOString()
      };

      const filePath = path.join(this.dataDir, filename);
      await fs.writeFile(filePath, JSON.stringify(articleData, null, 2));
      
      // Extract canonical URL
      const canonicalUrl = (() => {
        try {
          const $ = cheerio.load(html);
          const c = $('link[rel="canonical"]').attr('href');
          if (c) return this.normalizeUrl(c);
        } catch (_) {}
        return null;
      })();

      // Compute hash and Readability text
      let htmlSha = null, text = null, wordCount = null, language = null;
      try {
        htmlSha = crypto.createHash('sha256').update(html).digest('hex');
        // Mute noisy non-fatal jsdom CSS parse errors using a VirtualConsole
        const vc = new VirtualConsole();
        vc.on('jsdomError', (err) => {
          const msg = (err && err.message) ? err.message : String(err);
          if (/Could not parse CSS stylesheet/i.test(msg)) {
            return; // ignore CSS parse noise
          }
          // For other jsdom errors, keep quiet by default; uncomment to debug:
          // console.warn('jsdomError:', msg);
        });
        const dom = new JSDOM(html, { url: metadata.url, virtualConsole: vc });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent) {
          text = article.textContent.trim();
          wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
          language = dom.window.document.documentElement.getAttribute('lang') || null;
        }
      } catch (_) {}

      // Save to SQLite if enabled
      if (this.db && !options.skipDb) {
        this.db.upsertArticle({
          url: metadata.url,
          title: metadata.title,
          date: metadata.date || null,
          section: metadata.section || null,
          html,
          crawled_at: articleData.crawledAt,
          canonical_url: canonicalUrl,
          referrer_url: options.referrerUrl || null,
          discovered_at: options.discoveredAt || null,
          crawl_depth: options.crawlDepth ?? null,
          fetched_at: options.fetchMeta?.fetchedAtIso || null,
          request_started_at: options.fetchMeta?.requestStartedIso || null,
          http_status: options.fetchMeta?.httpStatus ?? null,
          content_type: options.fetchMeta?.contentType || null,
          content_length: options.fetchMeta?.contentLength ?? null,
          etag: options.fetchMeta?.etag || null,
          last_modified: options.fetchMeta?.lastModified || null,
          redirect_chain: options.fetchMeta?.redirectChain || null,
          ttfb_ms: options.fetchMeta?.ttfbMs ?? null,
          download_ms: options.fetchMeta?.downloadMs ?? null,
          total_ms: options.fetchMeta?.totalMs ?? null,
          bytes_downloaded: options.fetchMeta?.bytesDownloaded ?? null,
          transfer_kbps: options.fetchMeta?.transferKbps ?? null,
          html_sha256: htmlSha,
          text,
          word_count: wordCount ?? null,
          language
        });
      } else if (this.db && options.skipDb) {
        console.log(`Skipped DB save (using cached content): ${metadata.url}`);
      }
      
      this.stats.articlesSaved++;
      console.log(`Saved article: ${metadata.title}`);
          this.emitProgress();
    } catch (error) {
      console.log(`Failed to save article ${metadata.url}: ${error.message}`);
    }
  }

  async processPage(url, depth = 0) {
    if (depth > this.maxDepth) return;

    // Respect max downloads limit
    if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
      return { status: 'skipped' };
    }
    let pageData = null;

    // If this URL looks like an article and we have a freshness window, prefer cache
    const looksArticle = this.looksLikeArticle(url);
    let fromCache = false;
    if (looksArticle && this.maxAgeMs) {
      const cached = await this.getCachedArticle(url);
      if (cached) {
        const ageMs = Date.now() - new Date(cached.crawledAt).getTime();
        if (ageMs <= this.maxAgeMs) {
          console.log(`Using cached article (fresh ${Math.round(ageMs / 1000)}s): ${url}`);
          pageData = { url: this.normalizeUrl(url), html: cached.html };
          // Mark visited so we don't re-queue
          this.visited.add(this.normalizeUrl(url));
          // Do not count as downloaded; still count as visited for processing
          this.stats.pagesVisited++;
          fromCache = true;
          this.emitProgress();
        }
      }
    }

    // If no fresh cache used, fetch normally
    if (!pageData) {
      // Respect max downloads again before network call
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        return { status: 'skipped' };
      }
      pageData = await this.fetchPage(url, { referrerUrl: null, depth });
      if (!pageData) return { status: 'failed', retriable: true };
      if (pageData.error) {
        const retriable = pageData.httpStatus ? (pageData.httpStatus === 429 || (pageData.httpStatus >= 500 && pageData.httpStatus < 600)) : true;
        return { status: 'failed', retriable, retryAfterMs: pageData.retryAfterMs };
      }
    }

    const $ = cheerio.load(pageData.html);
    // Mark visited after successful fetch (or cache earlier)
    if (!fromCache && pageData.url) {
      this.visited.add(this.normalizeUrl(pageData.url));
    }
    
    // Check if this looks like an article page
    if (this.looksLikeArticle(pageData.url)) {
      const metadata = this.extractArticleMetadata($, pageData.url);
      if (fromCache) {
        // On cache hits, do not rewrite JSON or DB; just count as found
        this.stats.articlesFound++;
        this.emitProgress();
      } else {
        // Increment 'found' before saving to avoid transient saved > found
        this.stats.articlesFound++;
        await this.saveArticle(pageData.html, metadata, {
          skipDb: false,
          referrerUrl: null,
          discoveredAt: new Date().toISOString(),
          crawlDepth: depth,
          fetchMeta: pageData.fetchMeta
        });
        // saveArticle emits progress; an extra tick is okay
        this.emitProgress();
      }
    }

    // Find navigation and article links
  const navigationLinks = this.findNavigationLinks($);
  const articleLinks = this.findArticleLinks($);
    
  console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${pageData.url}`);

    // Add found links to queue for processing
    const nowIso = new Date().toISOString();
    const seen = new Set();
    const allLinks = [...navigationLinks.map(l => ({ ...l, type: 'nav' })), ...articleLinks.map(l => ({ ...l, type: 'article' }))];
    for (const link of allLinks) {
      const urlOnly = link.url;
      if (!seen.has(urlOnly)) seen.add(urlOnly);
      if (this.usePriorityQueue) {
        this.enqueueRequest({ url: urlOnly, depth: depth + 1, type: link.type });
      } else {
        if (!this.visited.has(urlOnly)) {
          this.requestQueue.push({ url: urlOnly, depth: depth + 1 });
        }
      }
      // Persist link edge to DB if enabled
      if (this.db) {
        this.db.insertLink({
          src_url: pageData.url,
          dst_url: urlOnly,
          anchor: link.anchor,
          rel: Array.isArray(link.rel) ? link.rel.join(' ') : link.rel,
          type: link.type,
          depth: depth + 1,
          on_domain: link.onDomain ? 1 : 0,
          discovered_at: nowIso
        });
      }
    }
    return { status: fromCache ? 'cache' : 'success' };
  }

  computePriority({ type, depth, discoveredAt }) {
    const typeWeight = type === 'article' ? 0 : 10;
    const depthPenalty = depth;
    const tieBreaker = discoveredAt || 0; // older first
    return typeWeight + depthPenalty + tieBreaker * 1e-9; // small influence of discovery time
  }

  enqueueRequest({ url, depth, type }) {
    if (depth > this.maxDepth) return;
    const normalized = this.normalizeUrl(url);
    if (!normalized) return;
    if (!this.isOnDomain(normalized) || !this.isAllowed(normalized)) return;
    if (this.visited.has(normalized)) return;
    if (this.queuedUrls.has(normalized)) return;
    if (this.queueHeap.size() >= this.maxQueue) {
      // bounded: drop new on overflow
      return;
    }
    const discoveredAt = Date.now();
    const item = {
      url: normalized,
      depth,
      type: type || (this.looksLikeArticle(normalized) ? 'article' : 'nav'),
      retries: 0,
      nextEligibleAt: 0,
      discoveredAt,
    };
    item.priority = this.computePriority({ type: item.type, depth: item.depth, discoveredAt });
    this.queueHeap.push(item);
    this.queuedUrls.add(normalized);
  }

  async acquireRateToken() {
    const now = nowMs();
    const earliest = this.lastRequestTime + this.rateLimitMs;
    const wait = Math.max(0, earliest - now);
    if (wait > 0) await sleep(wait);
    this.lastRequestTime = nowMs();
  }

  async runWorker(workerId) {
    while (true) {
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        return;
      }
      // Pop next item (avoid peek/pop race with other workers)
      let item = this.queueHeap.pop();
      const now = nowMs();
      if (!item) {
        // queue empty: worker can stop
        return;
      }
      if (item.nextEligibleAt > now) {
        // Not yet eligible: put it back and wait a bit
        this.queueHeap.push(item);
        await sleep(Math.min(250, item.nextEligibleAt - now));
        continue;
      }
      this.queuedUrls.delete(item.url);
      // Rate limit globally
      await this.acquireRateToken();
      const res = await this.processPage(item.url, item.depth);
      if (res && res.status === 'failed') {
        const retriable = !!res.retriable && item.retries < this.retryLimit;
        if (retriable) {
          item.retries += 1;
          const base = res.retryAfterMs != null ? res.retryAfterMs : Math.min(this.backoffBaseMs * Math.pow(2, item.retries - 1), this.backoffMaxMs);
          item.nextEligibleAt = nowMs() + jitter(base);
          // Recompute priority to keep ordering roughly stable
          item.priority = this.computePriority({ type: item.type, depth: item.depth, discoveredAt: item.discoveredAt });
          this.queueHeap.push(item);
          this.queuedUrls.add(item.url);
        }
      }
      // loop continues
    }
  }

  async crawlConcurrent() {
    await this.init();
    // Seed
    this.enqueueRequest({ url: this.startUrl, depth: 0, type: 'nav' });
    const workers = [];
    const n = this.concurrency;
    for (let i = 0; i < n; i++) {
      workers.push(this.runWorker(i));
    }
    await Promise.all(workers);

    console.log('\nCrawling completed!');
    console.log(`Final stats: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
  this.emitProgress(true);
    
    if (this.db) {
      const count = this.db.getCount();
      console.log(`Database contains ${count} article records`);
      this.db.close();
    }
  }

  async crawl() {
    if (this.usePriorityQueue) {
      return this.crawlConcurrent();
    }
    await this.init();
    
    // Start with the initial URL
    this.requestQueue.push({ url: this.startUrl, depth: 0 });
    
    while (this.requestQueue.length > 0) {
      // Stop if we've reached the download limit
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        console.log(`Reached max downloads limit: ${this.maxDownloads}`);
        break;
      }
      const { url, depth } = this.requestQueue.shift();
      
      await this.processPage(url, depth);
      
      // Rate limiting
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitMs));
      }
      
      // Log progress periodically
      if (this.stats.pagesVisited % 10 === 0) {
        console.log(`Progress: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
      }
    }

    console.log('\nCrawling completed!');
    console.log(`Final stats: ${this.stats.pagesVisited} pages visited, ${this.stats.pagesDownloaded} pages downloaded, ${this.stats.articlesFound} articles found, ${this.stats.articlesSaved} articles saved`);
  this.emitProgress(true);
    
    if (this.db) {
      const count = this.db.getCount();
      console.log(`Database contains ${count} article records`);
      this.db.close();
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const startUrl = args[0] || 'https://www.theguardian.com';
  const enableDb = !args.includes('--no-db');
  const maxDepthArg = args.find(a => a.startsWith('--depth='));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 2;
  const dbPathArg = args.find(a => a.startsWith('--db='));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : undefined;
  const maxPagesArg = args.find(a => a.startsWith('--max-pages=')) || args.find(a => a.startsWith('--max-downloads='));
  const maxDownloads = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : undefined;
  const maxAgeArg = args.find(a => a.startsWith('--max-age='));
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const maxQueueArg = args.find(a => a.startsWith('--max-queue='));

  function parseMaxAgeToMs(val) {
    if (!val) return undefined;
    const s = String(val).trim();
    const m = s.match(/^([0-9]+)\s*([smhd]?)$/i);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    const unit = (m[2] || 's').toLowerCase();
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60 * 1000 : unit === 'h' ? 3600 * 1000 : unit === 'd' ? 86400 * 1000 : 1000;
    return n * mult;
  }

  const maxAgeMs = maxAgeArg ? parseMaxAgeToMs(maxAgeArg.split('=')[1]) : undefined;
  
  console.log(`Starting news crawler with URL: ${startUrl}`);
  
  const crawler = new NewsCrawler(startUrl, {
    rateLimitMs: 2000, // 2 seconds between requests to be respectful
    maxDepth,
    enableDb,
    dbPath,
    maxDownloads,
    maxAgeMs,
    concurrency: concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 1,
    maxQueue: maxQueueArg ? parseInt(maxQueueArg.split('=')[1], 10) : undefined
  });

  crawler.crawl()
    .then(() => {
      console.log('Crawler finished successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Crawler failed:', error);
      process.exit(1);
    });
}

module.exports = NewsCrawler;