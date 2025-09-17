#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');
// Lazy-load DB to allow running without SQLite if native module isn't available
let NewsDatabase = null;
const { ArticleCache, shouldUseCache } = require('./cache');
const http = require('http');
const https = require('https');
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
  this.slowMode = options.slowMode === true;
  this.rateLimitMs = typeof options.rateLimitMs === 'number' ? options.rateLimitMs : (this.slowMode ? 1000 : 0); // default: no pacing
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
    // Preserve 0 to mean "always refetch" (never accept cache)
    this.maxAgeMs =
      typeof options.maxAgeMs === 'number' && options.maxAgeMs >= 0
        ? options.maxAgeMs
        : undefined; // Freshness window for cached items
  this.dbPath = options.dbPath || path.join(this.dataDir, 'news.db');
  this.enableDb = options.enableDb !== undefined ? options.enableDb : true;
  this.preferCache = options.preferCache !== false; // default to prefer cache unless explicitly disabled
  // Sitemap support
  this.useSitemap = options.useSitemap !== false; // default true
  this.sitemapOnly = options.sitemapOnly === true; // only crawl URLs from sitemaps
  this.sitemapMaxUrls = Math.max(0, options.sitemapMaxUrls || 5000);
  this.sitemapUrls = [];
  this.sitemapDiscovered = 0;
  this.robotsTxtLoaded = false;
    
    // State
    this.visited = new Set();
    this.queuedUrls = new Set(); // to dedupe queued items in priority mode
    this.robotsRules = null;
    this.requestQueue = []; // used by FIFO single-thread mode
  this.isProcessing = false;
  this.db = null;
  // Track in-flight downloads for UI visibility
  this.currentDownloads = new Map(); // url -> { startedAt: epochMs }
  // Track active workers to coordinate idle waiting
  this.busyWorkers = 0;
  // Pause control
  this.paused = false;
  this.usePriorityQueue = this.concurrency > 1; // enable PQ only when concurrent
    if (this.usePriorityQueue) {
      this.queueHeap = new MinHeap((a, b) => a.priority - b.priority);
    }
  // Cache facade
  this.cache = new ArticleCache({ db: null, dataDir: this.dataDir, normalizeUrl: (u) => this.normalizeUrl(u) });
    this.lastRequestTime = 0; // for global spacing
  // Keep-alive agents for connection reuse
  this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
  this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
  // Per-domain rate limiting and telemetry
  // host -> {
  //   enabled, rampStartMs, last429Until, windowStart, count, nextAt,
  //   rpmCurrent, rpmLastSafe, rpmFloorLearned, err429Streak, successStreak,
  //   ema429, last429At, lastRampAt
  // }
  this.domainLimits = new Map();
  this._domainWindowMs = 60 * 1000;
  // Networking config
  this.requestTimeoutMs = typeof options.requestTimeoutMs === 'number' && options.requestTimeoutMs > 0 ? options.requestTimeoutMs : 10000; // default 10s
  // Pacing jitter to avoid worker alignment
  this.pacerJitterMinMs = typeof options.pacerJitterMinMs === 'number' ? Math.max(0, options.pacerJitterMinMs) : 25;
  this.pacerJitterMaxMs = typeof options.pacerJitterMaxMs === 'number' ? Math.max(this.pacerJitterMinMs, options.pacerJitterMaxMs) : 50;
    
    // Statistics
    this.stats = {
      pagesVisited: 0,
      pagesDownloaded: 0,
  articlesFound: 0,
  articlesSaved: 0,
  errors: 0,
  bytesDownloaded: 0
    };
  }


  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });
    
    // Initialize database (optional)
    if (this.enableDb) {
      try {
        if (!NewsDatabase) {
          // Defer require to runtime to avoid crashing when better-sqlite3 is unavailable
          // (e.g., Node version mismatch). We'll run without DB in that case.
          NewsDatabase = require('./db');
        }
  this.db = new NewsDatabase(this.dbPath);
  this.cache.setDb(this.db);
        console.log(`SQLite DB initialized at: ${this.dbPath}`);
        try {
          const stat = await fs.stat(this.dbPath).catch(() => null);
          const bytes = stat?.size || 0;
          const mb = bytes / (1024 * 1024);
          const gb = bytes / (1024 * 1024 * 1024);
          const sizeStr = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
          const totalPages = this.db.getFetchCount?.() || 0;
          const articlePages = this.db.getArticleClassifiedFetchCount?.() || 0;
          console.log(`Database size: ${sizeStr} — stored pages: ${totalPages}, articles detected: ${articlePages}`);
        } catch (_) { /* ignore size/count errors */ }
      } catch (e) {
        console.log(`SQLite not available, continuing without DB: ${e.message}`);
        this.db = null;
        this.enableDb = false;
      }
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
        this.robotsTxtLoaded = true;
        // Discover sitemap declarations
        try {
          // Prefer parser method when available
          let sm = [];
          if (typeof this.robotsRules.getSitemaps === 'function') {
            sm = this.robotsRules.getSitemaps() || [];
          } else {
            // Fallback: scan lines
            sm = robotsTxt.split(/\r?\n/)
              .map(l => l.trim())
              .filter(l => /^sitemap\s*:/i.test(l))
              .map(l => l.split(/:/i).slice(1).join(':').trim())
              .filter(Boolean);
          }
          // Normalize and keep on-domain first
          const norm = [];
          for (const u of sm) {
            try {
              const abs = new URL(u, this.baseUrl).href;
              norm.push(abs);
            } catch (_) {}
          }
          this.sitemapUrls = Array.from(new Set(norm));
          if (this.sitemapUrls.length) {
            console.log(`Found ${this.sitemapUrls.length} sitemap URL(s)`);
          }
        } catch (_) {}
      } else {
        console.log('No robots.txt found, proceeding without restrictions');
      }
    } catch (error) {
      console.log('Failed to load robots.txt, proceeding without restrictions');
    }
  }

  async loadSitemapsAndEnqueue() {
    if (!this.useSitemap) return;
    const list = Array.isArray(this.sitemapUrls) && this.sitemapUrls.length ? this.sitemapUrls.slice() : [ `${this.baseUrl}/sitemap.xml` ];
    const seen = new Set();
    let enqueued = 0;
    const parser = await (async () => {
      try { return require('fast-xml-parser'); } catch { return null; }
    })();
    const parseXml = (xml) => {
      if (parser && parser.XMLParser) {
        const xp = new parser.XMLParser({ ignoreAttributes: false });
        return xp.parse(xml);
      }
      // Very limited fallback: extract <loc>...</loc> substrings
      const locs = [];
      const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
      let m; while ((m = re.exec(xml)) !== null) { locs.push(m[1]); }
      return { __locs: locs };
    };
    const fetchText = async (u) => {
      try {
        const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } });
        if (!res.ok) return null;
        return await res.text();
      } catch { return null; }
    };
    const pushUrl = (u) => {
      if (this.sitemapMaxUrls && enqueued >= this.sitemapMaxUrls) return;
      const n = this.normalizeUrl(u);
      if (!n) return;
      if (!this.isOnDomain(n) || !this.isAllowed(n)) return;
      if (seen.has(n)) return; seen.add(n);
      // Prefer enqueuing likely articles first
      const type = this.looksLikeArticle(n) ? 'article' : 'nav';
      this.enqueueRequest({ url: n, depth: 0, type });
      enqueued++;
      this.sitemapDiscovered = enqueued;
      this.emitProgress();
    };
    const handleDoc = (doc) => {
      if (!doc) return;
      if (doc.__locs) { for (const u of doc.__locs) pushUrl(u); return; }
      if (doc.urlset && doc.urlset.url) {
        const arr = Array.isArray(doc.urlset.url) ? doc.urlset.url : [doc.urlset.url];
        for (const entry of arr) {
          const loc = entry.loc || (entry['#text'] || null);
          if (loc) pushUrl(String(loc));
        }
        return;
      }
      if (doc.sitemapindex && doc.sitemapindex.sitemap) {
        const arr = Array.isArray(doc.sitemapindex.sitemap) ? doc.sitemapindex.sitemap : [doc.sitemapindex.sitemap];
        for (const entry of arr) {
          const loc = entry.loc || (entry['#text'] || null);
          if (loc) list.push(String(loc));
        }
      }
    };
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (typeof u !== 'string') continue;
      // Avoid fetching off-domain sitemaps
      try { if (new URL(u, this.baseUrl).hostname !== this.domain) continue; } catch { continue; }
      const xml = await fetchText(u);
      if (!xml) continue;
      try { handleDoc(parseXml(xml)); } catch (_) {}
      if (this.sitemapMaxUrls && enqueued >= this.sitemapMaxUrls) break;
    }
    console.log(`Sitemap enqueue complete: ${enqueued} URL(s)`);
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
      // Apply pacing only for actual network fetches when enabled
      const uPre = new URL(normalizedUrl);
      await this.acquireDomainToken(uPre.hostname);
      if (this.rateLimitMs > 0) {
        await this.acquireRateToken();
      }
      console.log(`Fetching: ${normalizedUrl}`);
      const started = Date.now();
      const requestStartedIso = new Date(started).toISOString();
      // Mark as in-flight for progress reporting
      this.currentDownloads.set(normalizedUrl, { startedAt: started });
      this.emitProgress();
  const u = uPre;
      const ac = new AbortController();
      const to = setTimeout(() => {
        try { ac.abort(); } catch (_) {}
      }, this.requestTimeoutMs);
      const response = await fetch(normalizedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
        },
        agent: (parsedUrl => parsedUrl.protocol === 'http:' ? this.httpAgent : this.httpsAgent)(u),
        signal: ac.signal
      });
      try { clearTimeout(to); } catch (_) {}
      const headersReady = Date.now();
      const ttfbMs = headersReady - started; // time to first byte (headers received)

    if (!response.ok) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = parseRetryAfter(retryAfterHeader);
        const status = response.status;
        console.log(`Failed to fetch ${normalizedUrl}: ${status}`);
        this.stats.errors++;
        if (status === 429) {
          // Trigger domain backoff and rate limit ramp
      try { this.note429(u.hostname, retryAfterMs); } catch(_) {}
        }
        // Persist error
        try { this.db?.insertError({ url: normalizedUrl, kind: 'http', code: status, message: `HTTP ${status}`, details: null }); } catch(_) {}
        // Emit a structured error log line for UI colorization
        try { console.log(`ERROR ${JSON.stringify({ url: normalizedUrl, kind: 'http', code: status })}`); } catch(_) {}
        // Remove from in-flight set on failure
        this.currentDownloads.delete(normalizedUrl);
        this.emitProgress();
        return { error: true, httpStatus: status, retryAfterMs, url: normalizedUrl };
      }

  const html = await response.text();
      const finished = Date.now();
      const downloadMs = finished - headersReady;
      const totalMs = finished - started;
  const bytesDownloaded = Buffer.byteLength(html, 'utf8');
      const transferKbps = downloadMs > 0 ? (bytesDownloaded / 1024) / (downloadMs / 1000) : null;
      const contentType = response.headers.get('content-type') || null;
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10) || null;
  const contentEncoding = response.headers.get('content-encoding') || null;
      const etag = response.headers.get('etag') || null;
      const lastModified = response.headers.get('last-modified') || null;
      const fetchedAtIso = new Date(finished).toISOString();
      const httpStatus = response.status;
      const finalUrl = response.url || normalizedUrl;
      const redirectChain = finalUrl !== normalizedUrl ? JSON.stringify([normalizedUrl, finalUrl]) : null;
          this.stats.pagesVisited++;
          this.stats.pagesDownloaded++;
          // Accumulate total bytes downloaded (network only)
          this.stats.bytesDownloaded += (bytesDownloaded || 0);
          // Remove from in-flight set on success
          this.currentDownloads.delete(normalizedUrl);
          this.emitProgress();
          try { this.noteSuccess(u.hostname, ttfbMs, downloadMs, totalMs); } catch (_) {}
      
      return {
        url: finalUrl,
        html,
        fetchMeta: {
          requestStartedIso,
          fetchedAtIso,
    httpStatus,
          contentType,
          contentLength,
    contentEncoding,
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
  this.stats.errors++;
      const isTimeout = (error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(error && error.message || ''))));
      try { this.db?.insertError({ url: normalizedUrl, kind: isTimeout ? 'timeout' : 'network', message: error.message || String(error) }); } catch(_) {}
      try { console.log(`ERROR ${JSON.stringify({ url: normalizedUrl, kind: isTimeout ? 'timeout' : 'network', message: error.message||String(error) })}`); } catch(_) {}
  // Ensure cleanup if fetch threw
  this.currentDownloads.delete(normalizedUrl);
  this.emitProgress();
  return { error: true, networkError: true, url: normalizedUrl };
    }
  }

  emitProgress(force = false) {
    const now = Date.now();
    if (!force && now - this._lastProgressEmitAt < 300) return;
    this._lastProgressEmitAt = now;
    // Prepare a small snapshot of in-flight downloads (most recent up to 5)
    const inflight = [];
    try {
      const entries = Array.from(this.currentDownloads.entries());
      // sort by startedAt desc
      entries.sort((a,b) => (b[1].startedAt||0) - (a[1].startedAt||0));
      for (let i = 0; i < Math.min(5, entries.length); i++) {
        const [u, info] = entries[i];
        inflight.push({ url: u, ageMs: now - (info.startedAt||now) });
      }
    } catch (_) {}
    // Domain RPM metric (for primary domain)
    let domainRpm = null, domainLimit = null, domainBackoffMs = null, domainRateLimited = null, domainIntervalMs = null;
    const perHostLimits = {};
    try {
      const st = this.domainLimits.get(this.domain);
      const now2 = Date.now();
      if (st) {
        const elapsed = Math.max(1, now2 - (st.windowStart || (now2 - this._domainWindowMs)));
        // scale to per-minute based on current window fill
        domainRpm = Math.round((st.count || 0) * (60000 / elapsed));
        if (st.rampStartMs) {
          const lim = (st.rpmCurrent && st.rpmCurrent > 0)
            ? st.rpmCurrent
            : (20 + 10 * Math.floor((now2 - st.rampStartMs) / 60000));
          domainLimit = Math.max(1, Math.floor(lim));
          if (domainLimit > 0) domainIntervalMs = Math.floor(60000 / domainLimit);
        }
        if (st.last429Until && now2 < st.last429Until) domainBackoffMs = st.last429Until - now2;
        domainRateLimited = !!(st.rampStartMs || (st.last429Until && now2 < st.last429Until));
      }
      // Include per-host limiter state for UI badges
      for (const [host, s] of this.domainLimits.entries()) {
        try {
          const mins = s.rampStartMs ? Math.floor((now2 - s.rampStartMs) / 60000) : null;
          const lim = s.rpmCurrent && s.rpmCurrent > 0 ? Math.floor(s.rpmCurrent) : (mins != null ? (20 + 10 * mins) : null);
          const backoff = (s.last429Until && now2 < s.last429Until) ? (s.last429Until - now2) : null;
          const interval = lim && lim > 0 ? Math.floor(60000 / lim) : null;
          perHostLimits[host] = {
            rateLimited: !!(s.rampStartMs || backoff),
            limit: lim,
            intervalMs: interval,
            backoffMs: backoff
          };
        } catch (_) {}
      }
    } catch(_) {}
    const p = {
      visited: this.stats.pagesVisited,
      downloaded: this.stats.pagesDownloaded,
      found: this.stats.articlesFound,
      saved: this.stats.articlesSaved,
      errors: this.stats.errors,
  bytes: this.stats.bytesDownloaded,
      queueSize: this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length,
      currentDownloadsCount: this.currentDownloads.size,
      currentDownloads: inflight,
      paused: !!this.paused,
      robotsLoaded: !!this.robotsTxtLoaded,
      sitemapCount: Array.isArray(this.sitemapUrls) ? this.sitemapUrls.length : 0,
      sitemapEnqueued: this.sitemapDiscovered || 0,
      domain: this.domain,
      domainRpm,
      domainLimit,
  domainBackoffMs,
  domainRateLimited,
  domainIntervalMs,
  perHostLimits
    };
    try {
      console.log(`PROGRESS ${JSON.stringify(p)}`);
    } catch (_) {}
  }

  pause() { this.paused = true; this.emitProgress(true); }
  resume() { this.paused = false; this.emitProgress(true); }
  isPaused() { return !!this.paused; }

  // JSON file saving removed

  // Try to retrieve a cached article (DB only). Returns {html, crawledAt, source} or null.
  async getCachedArticle(url) {
    return this.cache.get(url);
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
      // Prepare article data (used for optional JSON and for DB)
      const articleData = {
        ...metadata,
        html,
        crawledAt: new Date().toISOString()
      };
      
  // JSON file saving removed
      
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
  let htmlSha = null, text = null, wordCount = null, language = null, articleXPath = null;
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
          // Identify article container more accurately by scoring candidates against Readability output
          try {
            const { document } = dom.window;
            const targetLen = text.length;
            const targetParas = (() => {
              try {
                const contentHtml = article.content || '';
                // Simple fast count without extra DOM parse
                const m = contentHtml.match(/<p[\s>]/gi);
                return m ? m.length : 0;
              } catch { return 0; }
            })();

            const selectors = [
              'article', '[role="article"]', '[itemprop="articleBody"]',
              'main article', 'main [itemprop="articleBody"]',
              '.article-body', '.content__article-body', '.story-body', '.entry-content', '.post-content', '.rich-text', '.ArticleBody', '.article__body',
              'main', 'section', 'div[class*="article"]', 'div[id*="article"]'
            ];
            const candSet = new Set();
            for (const sel of selectors) {
              const list = document.querySelectorAll(sel);
              for (const el of list) {
                candSet.add(el);
                if (candSet.size > 200) break; // keep it bounded
              }
              if (candSet.size > 200) break;
            }
            if (candSet.size === 0) {
              const fallback = document.body.querySelectorAll('p, article, main, section');
              for (const el of fallback) candSet.add(el);
            }
            const navClassRe = /(nav|menu|footer|sidebar|comment|promo|related|share|social)/i;
            const scoreOf = (el) => {
              const t = (el.textContent || '').trim();
              const len = t.length;
              if (len === 0) return Number.POSITIVE_INFINITY;
              const paras = el.querySelectorAll('p').length;
              let linkText = 0;
              const anchors = el.querySelectorAll('a');
              for (const a of anchors) linkText += ((a.textContent || '').trim()).length;
              const density = len > 0 ? linkText / len : 0;
              let score = Math.abs(len - targetLen);
              score += Math.abs(paras - targetParas) * 50;
              if (density > 0.3) score += 10000;
              const idcl = `${el.id || ''} ${el.className || ''}`;
              if (navClassRe.test(idcl)) score += 5000;
              // Prefer deeper nodes slightly to avoid selecting <main> when a nested article body exists
              let depth = 0; for (let n = el; n && n.parentNode; n = n.parentNode) depth++;
              score -= Math.min(depth, 20) * 5;
              return score;
            };
            let best = null; let bestScore = Number.POSITIVE_INFINITY;
            for (const el of candSet) {
              const s = scoreOf(el);
              // ensure it's at least half the target length to avoid tiny nodes
              const tlen = (el.textContent || '').trim().length;
              if (tlen < targetLen * 0.5) continue;
              if (s < bestScore) { best = el; bestScore = s; }
            }
            let node = best || document.body;
            // Paragraph coverage refinement: choose the smallest ancestor that covers ~all Readability paragraphs
            try {
              const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
              // Build Readability paragraph set using existing DOM to avoid extra JSDOM instances
              const tmp = document.createElement('div');
              tmp.innerHTML = article.content || '';
              const rbParas = Array.from(tmp.querySelectorAll('p'))
                .map(p => normalize(p.textContent))
                .filter(t => t && t.length >= 60);
              const rbTotal = rbParas.length;
              if (rbTotal >= 3) {
                const rbSet = new Set(rbParas);
                const getNodeParas = (el) => Array.from(el.querySelectorAll('p'))
                  .map(p => normalize(p.textContent))
                  .filter(t => t && t.length >= 60);
                let curr = node;
                const maxSteps = 25;
                let steps = 0;
                while (curr && curr !== document.documentElement && steps++ < maxSteps) {
                  const paras = getNodeParas(curr);
                  if (paras.length) {
                    let matches = 0;
                    for (const t of paras) { if (rbSet.has(t)) matches++; }
                    const coverage = matches / rbTotal;
                    if (coverage >= 0.98) { node = curr; break; }
                  }
                  curr = curr.parentElement;
                }
              }
            } catch (_) { /* ignore refinement errors */ }
            const getXPath = (el) => {
              if (!el || el.nodeType !== 1) return '';
              if (el === document.documentElement) return '/html';
              const segs = [];
              for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
                const name = n.localName;
                if (!name) break;
                let idx = 1;
                if (n.parentNode) {
                  const siblings = Array.from(n.parentNode.children).filter(c => c.localName === name);
                  if (siblings.length > 1) {
                    idx = siblings.indexOf(n) + 1;
                    segs.unshift(`${name}[${idx}]`);
                  } else {
                    segs.unshift(name);
                  }
                } else {
                  segs.unshift(name);
                }
                if (n === document.documentElement) break;
              }
              if (segs[0] !== 'html') segs.unshift('html');
              return '/' + segs.join('/');
            };
            articleXPath = getXPath(node);
          } catch (_) { /* ignore */ }
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
          ,
          article_xpath: articleXPath
        });
  } else if (this.db && options.skipDb) {
        console.log(`Skipped DB save (using cached content): ${metadata.url}`);
      }
      
  this.stats.articlesSaved++;
  console.log(`Saved article: ${metadata.title}`);
          this.emitProgress();
  return { filePath: null, fileSize: null };
    } catch (error) {
      console.log(`Failed to save article ${metadata.url}: ${error.message}`);
      try { this.db?.insertError({ url: metadata.url, kind: 'save', message: error.message || String(error) }); } catch(_) {}
      try { console.log(`ERROR ${JSON.stringify({ url: metadata.url, kind: 'save', message: error.message||String(error) })}`); } catch(_) {}
      return { filePath: null, fileSize: null };
    }
  }

  async processPage(url, depth = 0) {
    if (depth > this.maxDepth) return;

    // Respect max downloads limit
    if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
      return { status: 'skipped' };
    }
    let pageData = null;

  // Try cache if requested (preferCache) or if a freshness window is set
  const looksArticle = this.looksLikeArticle(url);
    let fromCache = false;
    if (this.maxAgeMs || this.preferCache) {
      const cached = await this.getCachedArticle(url);
      if (cached) {
        const decision = shouldUseCache({ preferCache: this.preferCache, maxAgeMs: this.maxAgeMs, crawledAt: cached.crawledAt });
        if (decision.use) {
          const ageSeconds = decision.ageSeconds;
          try { console.log(`CACHE ${JSON.stringify({ url: this.normalizeUrl(url), source: cached.source, ageSeconds })}`); } catch (_) {}
          console.log(`Using cached page (age ${ageSeconds}s, source=${cached.source}): ${url}`);
          // Fast path: mark visited and count as found if looks like article; skip heavy DOM work
          const norm = this.normalizeUrl(url);
          pageData = { url: norm, html: cached.html };
          this.visited.add(norm);
          this.stats.pagesVisited++;
          fromCache = true;
          // Optionally record a lightweight fetch row for visibility without re-parsing
          try {
            if (this.db) {
              this.db.insertFetch({
                url: norm,
                request_started_at: null,
                fetched_at: new Date().toISOString(),
                http_status: 200,
                content_type: 'text/html',
                content_length: cached.html ? Buffer.byteLength(cached.html, 'utf8') : null,
                content_encoding: null,
                bytes_downloaded: 0,
                transfer_kbps: null,
                ttfb_ms: null,
                download_ms: null,
                total_ms: null,
                saved_to_db: 0,
                saved_to_file: 0,
                file_path: null,
                file_size: null,
                classification: this.looksLikeArticle(norm) ? 'article' : 'other',
                nav_links_count: null,
                article_links_count: null,
                word_count: null,
                analysis: 'cache-hit-fast'
              });
            }
          } catch (_) {}
          this.emitProgress();
          // On fast path, return early to allow rapid progression through cached URLs
          if (this.looksLikeArticle(norm)) {
            this.stats.articlesFound++;
            this.emitProgress();
          }
          return { status: 'cache' };
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
    
  // Classify page blending URL pattern + Readability word count
  const isArticleByUrl = this.looksLikeArticle(pageData.url);
    if (isArticleByUrl) {
      const metadata = this.extractArticleMetadata($, pageData.url);
      if (fromCache) {
        // On cache hits, do not rewrite JSON or DB; just count as found
        this.stats.articlesFound++;
        this.emitProgress();
      } else {
        // Increment 'found' before saving to avoid transient saved > found
        this.stats.articlesFound++;
  const saveInfo = await this.saveArticle(pageData.html, metadata, {
          skipDb: false,
          referrerUrl: null,
          discoveredAt: new Date().toISOString(),
          crawlDepth: depth,
          fetchMeta: pageData.fetchMeta
        });
        // saveArticle emits progress; an extra tick is okay
        this.emitProgress();
        // Record fetch details if DB enabled
        if (this.db && pageData.fetchMeta) {
          const navLinks = this.findNavigationLinks($).length;
          const artLinks = this.findArticleLinks($).length;
          // Estimate word count using Readability (same parse used in saveArticle)
          let wc = null;
          try {
            const vc = new VirtualConsole();
            const dom = new JSDOM(pageData.html, { url: pageData.url, virtualConsole: vc });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article && article.textContent) wc = article.textContent.trim().split(/\s+/).filter(Boolean).length;
          } catch(_) {}
          this.db.insertFetch({
            url: pageData.url,
            request_started_at: pageData.fetchMeta.requestStartedIso || null,
            fetched_at: pageData.fetchMeta.fetchedAtIso || null,
            http_status: pageData.fetchMeta.httpStatus ?? null,
            content_type: pageData.fetchMeta.contentType || null,
            content_length: pageData.fetchMeta.contentLength ?? null,
            content_encoding: pageData.fetchMeta.contentEncoding || null,
            bytes_downloaded: pageData.fetchMeta.bytesDownloaded ?? null,
            transfer_kbps: pageData.fetchMeta.transferKbps ?? null,
            ttfb_ms: pageData.fetchMeta.ttfbMs ?? null,
            download_ms: pageData.fetchMeta.downloadMs ?? null,
            total_ms: pageData.fetchMeta.totalMs ?? null,
            saved_to_db: 1,
            saved_to_file: 0,
            file_path: null,
            file_size: null,
            classification: (isArticleByUrl || (wc != null && wc > 150)) ? 'article' : (navLinks > 10 ? 'nav' : 'other'),
            nav_links_count: navLinks,
            article_links_count: artLinks,
            word_count: wc
          });
        }
      }
    }

    // Find navigation and article links
  const navigationLinks = this.findNavigationLinks($);
  const articleLinks = this.findArticleLinks($);
    
  console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${pageData.url}`);

    // If DB enabled, record non-article fetch as well
  if (this.db && pageData.fetchMeta && !isArticleByUrl) {
      // For non-article pages (by final classification), record fetch
      const navLinksCount = navigationLinks.length;
      const articleLinksCount = articleLinks.length;
      let wc = null;
      try {
        const vc = new VirtualConsole();
        const dom = new JSDOM(pageData.html, { url: pageData.url, virtualConsole: vc });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (article && article.textContent) wc = article.textContent.trim().split(/\s+/).filter(Boolean).length;
      } catch(_) {}
      this.db.insertFetch({
        url: pageData.url,
        request_started_at: pageData.fetchMeta.requestStartedIso || null,
        fetched_at: pageData.fetchMeta.fetchedAtIso || null,
        http_status: pageData.fetchMeta.httpStatus ?? null,
        content_type: pageData.fetchMeta.contentType || null,
        content_length: pageData.fetchMeta.contentLength ?? null,
        content_encoding: pageData.fetchMeta.contentEncoding || null,
        bytes_downloaded: pageData.fetchMeta.bytesDownloaded ?? null,
        transfer_kbps: pageData.fetchMeta.transferKbps ?? null,
        ttfb_ms: pageData.fetchMeta.ttfbMs ?? null,
        download_ms: pageData.fetchMeta.downloadMs ?? null,
        total_ms: pageData.fetchMeta.totalMs ?? null,
        saved_to_db: 0,
        saved_to_file: 0,
        file_path: null,
        file_size: null,
        classification: (isArticleByUrl || (wc != null && wc > 150)) ? 'article' : (navLinksCount > 10 ? 'nav' : 'other'),
        nav_links_count: navLinksCount,
        article_links_count: articleLinksCount,
        word_count: wc
      });
    }

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

  // Per-domain limiter: waits if a 429 backoff is active or if the current per-host interval requires spacing.
  async acquireDomainToken(host) {
    const now = nowMs();
    let st = this.domainLimits.get(host);
    if (!st) {
      st = { enabled: false, rampStartMs: null, last429Until: 0, windowStart: Math.floor(now / this._domainWindowMs) * this._domainWindowMs, count: 0, nextAt: 0,
        rpmCurrent: null, rpmLastSafe: null, rpmFloorLearned: null, err429Streak: 0, successStreak: 0, ema429: 0, last429At: 0, lastRampAt: 0 };
      this.domainLimits.set(host, st);
    }
    // 5s blackout after 429
    if (st.last429Until && now < st.last429Until) {
      await sleep(st.last429Until - now);
    }
    // If not enabled (no 429 yet), no per-domain cap applies
    if (!st.rampStartMs) {
      // Still account window counts for RPM metric
      const t = nowMs();
      if (t - st.windowStart >= this._domainWindowMs) {
        st.windowStart = Math.floor(t / this._domainWindowMs) * this._domainWindowMs;
        st.count = 0;
      }
      st.count += 1;
      return;
    }
    // Determine current limit (rpm)
    let limit = st.rpmCurrent && st.rpmCurrent > 0
      ? Math.floor(st.rpmCurrent)
      : (20 + 10 * Math.floor((now - st.rampStartMs) / 60000));
    if (limit < 1) limit = 1;
    const intervalMs = Math.max(1, Math.floor(60000 / limit));
    // Initialize nextAt with a slight random offset to avoid stampedes
    if (!st.nextAt || st.nextAt <= 0) {
      st.nextAt = now + Math.floor(Math.random() * Math.min(intervalMs, 1000));
    }
    // Enforce even spacing across the minute
    let t = nowMs();
  if (t < st.nextAt) {
      await sleep(st.nextAt - t);
      t = nowMs();
    }
    // Window accounting for RPM metric
    if (t - st.windowStart >= this._domainWindowMs) {
      st.windowStart = Math.floor(t / this._domainWindowMs) * this._domainWindowMs;
      st.count = 0;
    }
    // Count and schedule next slot
  st.count += 1;
  // Add small configurable jitter to avoid alignment
  const jitterMin = this.pacerJitterMinMs;
  const jitterMax = this.pacerJitterMaxMs;
  const extra = jitterMax > jitterMin ? (jitterMin + Math.floor(Math.random() * (jitterMax - jitterMin + 1))) : jitterMin;
  st.nextAt = t + intervalMs + extra;
    return;
  }

  note429(host, retryAfterMs) {
    const now = nowMs();
    let st = this.domainLimits.get(host);
    if (!st) {
      st = { enabled: true, rampStartMs: now, last429Until: now + 5000, windowStart: Math.floor(now / this._domainWindowMs) * this._domainWindowMs, count: 0, nextAt: 0,
        rpmCurrent: 20, rpmLastSafe: null, rpmFloorLearned: null, err429Streak: 1, successStreak: 0, ema429: 1, last429At: now, lastRampAt: 0 };
      this.domainLimits.set(host, st);
      return;
    }
    st.enabled = true;
    const baseBlackout = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000;
    const jitterPct = 0.1; // +/-10%
    const jitterAmt = Math.floor(baseBlackout * ((Math.random() * 2 * jitterPct) - jitterPct));
    const blackout = baseBlackout + jitterAmt;
    const prev429 = st.last429At || 0;
    st.last429At = now;
    // Escalate blackout if repeated within 10 minutes
    if (prev429 && (now - prev429) <= 10 * 60 * 1000) {
      st.err429Streak = (st.err429Streak || 0) + 1;
    } else {
      st.err429Streak = 1;
    }
    let escalated = blackout;
    if (st.err429Streak >= 2) escalated = Math.max(escalated, 5 * 60 * 1000);
    if (st.err429Streak >= 3) escalated = Math.max(escalated, 15 * 60 * 1000);
    st.last429Until = Math.max(st.last429Until || 0, now + escalated);
    if (!st.rampStartMs) st.rampStartMs = now;
    // Step down aggressively; use last safe if known
    const current = st.rpmCurrent && st.rpmCurrent > 0 ? st.rpmCurrent : 20;
    const halfSafe = st.rpmLastSafe ? Math.floor(st.rpmLastSafe * 0.5) : current;
    const quarter = Math.max(1, Math.floor(current * 0.25));
    st.rpmCurrent = Math.max(1, Math.min(quarter, halfSafe));
    st.rpmFloorLearned = st.rpmFloorLearned ? Math.min(st.rpmFloorLearned, st.rpmCurrent) : st.rpmCurrent;
    st.successStreak = 0;
    // Reset pacing so we don't burst immediately after a 429
    st.nextAt = now + 500; // small grace before next try
  }

  noteSuccess(host, ttfbMs, downloadMs, totalMs) {
    const now = nowMs();
    const st = this.domainLimits.get(host);
    if (!st || !st.rampStartMs) return;
    st.successStreak = (st.successStreak || 0) + 1;
    // Decay 429 EMA
    const alpha = 0.05;
    st.ema429 = (1 - alpha) * (st.ema429 || 0) + alpha * 0;
    // If recently had 429, be cautious
    const recent429Window = 30 * 60 * 1000;
    const hadRecent429 = st.last429At && (now - st.last429At) < recent429Window;
    const cautiousCap = hadRecent429 && st.rpmLastSafe ? Math.floor(st.rpmLastSafe * 1.25) : null;
    // Probe (ramp up) at most once per minute with conditions
    const canProbe = (!st.lastRampAt || (now - st.lastRampAt) >= 60 * 1000);
    if (canProbe && st.err429Streak <= 0 && (st.ema429 || 0) < 0.002) {
      let next = Math.max(1, Math.floor((st.rpmCurrent || 10) * 1.1));
      if (cautiousCap != null) next = Math.min(next, Math.max(1, cautiousCap));
      // Apply and record last safe after sustained stability (no 429 for 10 min)
      st.rpmCurrent = next;
      st.lastRampAt = now;
      if (st.last429At && (now - st.last429At) >= 10 * 60 * 1000) {
        st.rpmLastSafe = Math.max(st.rpmLastSafe || 0, st.rpmCurrent);
      }
    }
  }

  async runWorker(workerId) {
    while (true) {
      // honor pause
      while (this.paused) {
        await sleep(200);
        this.emitProgress();
      }
      if (this.maxDownloads !== undefined && this.stats.pagesDownloaded >= this.maxDownloads) {
        return;
      }
      // Pop next item (avoid peek/pop race with other workers)
      let item = this.queueHeap.pop();
      const now = nowMs();
      if (!item) {
        // If queue is empty, wait briefly to allow other workers to enqueue new items
        // Only exit when queue has been empty for a while and no workers are busy
        let waited = 0;
        const waitStep = 100;
        while (waited < 1000) { // wait up to 1s total
          await sleep(waitStep);
          waited += waitStep;
          if (this.queueHeap.size() > 0) break;
          if (this.paused) break; // break early to top-level pause check
        }
        if (this.queueHeap.size() === 0 && !this.paused) {
          return; // nothing to do; exit
        }
        continue;
      }
      if (item.nextEligibleAt > now) {
        // Not yet eligible: put it back and wait a bit
        this.queueHeap.push(item);
        await sleep(Math.min(250, item.nextEligibleAt - now));
        continue;
      }
  this.queuedUrls.delete(item.url);
      this.busyWorkers++;
      const res = await this.processPage(item.url, item.depth);
      this.busyWorkers = Math.max(0, this.busyWorkers - 1);
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
    // Optionally preload URLs from sitemaps
    if (this.useSitemap) {
      try { await this.loadSitemapsAndEnqueue(); } catch (_) {}
    }
    // Seed start URL unless we are sitemap-only
    if (!this.sitemapOnly) {
      this.enqueueRequest({ url: this.startUrl, depth: 0, type: 'nav' });
    }
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
      // honor pause
      while (this.paused) { await sleep(200); this.emitProgress(); }
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
  const readline = require('readline');
  const args = process.argv.slice(2);
  const startUrl = args[0] || 'https://www.theguardian.com';
  const enableDb = !args.includes('--no-db');
  const slowMode = args.includes('--slow') || args.includes('--slow-mode');
  const maxDepthArg = args.find(a => a.startsWith('--depth='));
  const maxDepth = maxDepthArg ? parseInt(maxDepthArg.split('=')[1], 10) : 2;
  const dbPathArg = args.find(a => a.startsWith('--db='));
  const dbPath = dbPathArg ? dbPathArg.split('=')[1] : undefined;
  const rateLimitArg = args.find(a => a.startsWith('--rate-limit-ms='));
  const rateLimitMs = rateLimitArg ? parseInt(rateLimitArg.split('=')[1], 10) : undefined;
  const reqTimeoutArg = args.find(a => a.startsWith('--request-timeout-ms='));
  const requestTimeoutMs = reqTimeoutArg ? parseInt(reqTimeoutArg.split('=')[1], 10) : undefined;
  const jitterMinArg = args.find(a => a.startsWith('--pacer-jitter-min-ms='));
  const pacerJitterMinMs = jitterMinArg ? parseInt(jitterMinArg.split('=')[1], 10) : undefined;
  const jitterMaxArg = args.find(a => a.startsWith('--pacer-jitter-max-ms='));
  const pacerJitterMaxMs = jitterMaxArg ? parseInt(jitterMaxArg.split('=')[1], 10) : undefined;
  const maxPagesArg = args.find(a => a.startsWith('--max-pages=')) || args.find(a => a.startsWith('--max-downloads='));
  const maxDownloads = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : undefined;
  const maxAgeArg = args.find(a => a.startsWith('--max-age=')) || args.find(a => a.startsWith('--refetch-if-older-than='));
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const maxQueueArg = args.find(a => a.startsWith('--max-queue='));
  // Cache preference: default is to prefer cache; allow override with --no-prefer-cache
  const preferCache = args.includes('--no-prefer-cache') ? false : true;
  const useSitemap = !args.includes('--no-sitemap');
  const sitemapOnly = args.includes('--sitemap-only');
  const sitemapMaxArg = args.find(a => a.startsWith('--sitemap-max='));

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

  let maxAgeMs = maxAgeArg ? parseMaxAgeToMs(maxAgeArg.split('=')[1]) : undefined;
  if (maxAgeMs === 0) {
    // explicit 0 means always refetch; pass through
  }
  
  console.log(`Starting news crawler with URL: ${startUrl}`);
  
  const crawler = new NewsCrawler(startUrl, {
    rateLimitMs,
    maxDepth,
    enableDb,
    dbPath,
  
  slowMode,
    maxDownloads,
    maxAgeMs,
    concurrency: concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 1,
  maxQueue: maxQueueArg ? parseInt(maxQueueArg.split('=')[1], 10) : undefined,
  preferCache,
  requestTimeoutMs,
  pacerJitterMinMs,
  pacerJitterMaxMs
  , useSitemap, sitemapOnly,
  sitemapMaxUrls: sitemapMaxArg ? parseInt(sitemapMaxArg.split('=')[1], 10) : undefined
  });

  // Accept PAUSE/RESUME commands over stdin (for GUI control)
  try {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const cmd = String(line || '').trim().toUpperCase();
      if (cmd === 'PAUSE') { crawler.pause(); }
      else if (cmd === 'RESUME') { crawler.resume(); }
    });
  } catch (_) {}

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