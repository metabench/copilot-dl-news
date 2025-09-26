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
const { UrlPolicy } = require('./crawler/urlPolicy');
const { DeepUrlAnalyzer } = require('./crawler/deepUrlAnalysis');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { Readability } = require('@mozilla/readability');
// Extracted helper modules (structure-only refactor)
const Links = require('./crawler/links');
const { loadSitemaps } = require('./crawler/sitemap');

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
    this.jobId = options.jobId || null;
    
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
  // Optional per-type freshness windows (override maxAgeMs when provided)
  this.maxAgeArticleMs = typeof options.maxAgeArticleMs === 'number' && options.maxAgeArticleMs >= 0 ? options.maxAgeArticleMs : undefined;
  this.maxAgeHubMs = typeof options.maxAgeHubMs === 'number' && options.maxAgeHubMs >= 0 ? options.maxAgeHubMs : undefined;
  this.dbPath = options.dbPath || path.join(this.dataDir, 'news.db');
  this.fastStart = options.fastStart === true; // skip heavy startup stats
  this.enableDb = options.enableDb !== undefined ? options.enableDb : true;
  this.preferCache = options.preferCache !== false; // default to prefer cache unless explicitly disabled
  // Sitemap support
  this.useSitemap = options.useSitemap !== false; // default true
  this.sitemapOnly = options.sitemapOnly === true; // only crawl URLs from sitemaps
  this.sitemapMaxUrls = Math.max(0, options.sitemapMaxUrls || 5000);
  this.sitemapUrls = [];
  this.sitemapDiscovered = 0;
  this.robotsTxtLoaded = false;
  // Intelligent planner options
  this.hubMaxPages = typeof options.hubMaxPages === 'number' ? options.hubMaxPages : undefined;
  this.hubMaxDays = typeof options.hubMaxDays === 'number' ? options.hubMaxDays : undefined;
  this.intMaxSeeds = typeof options.intMaxSeeds === 'number' ? options.intMaxSeeds : 50;
  this.intTargetHosts = Array.isArray(options.intTargetHosts) ? options.intTargetHosts.map(s => String(s||'').toLowerCase()) : null;
  this.plannerVerbosity = typeof options.plannerVerbosity === 'number' ? options.plannerVerbosity : 0;
    
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
  this.domainLimits = new Map(); // host -> state object
  this._domainWindowMs = 60 * 1000;
  // Networking config
  this.requestTimeoutMs = typeof options.requestTimeoutMs === 'number' && options.requestTimeoutMs > 0 ? options.requestTimeoutMs : 10000; // default 10s
  // Pacing jitter to avoid worker alignment
  this.pacerJitterMinMs = typeof options.pacerJitterMinMs === 'number' ? Math.max(0, options.pacerJitterMinMs) : 25;
  this.pacerJitterMaxMs = typeof options.pacerJitterMaxMs === 'number' ? Math.max(this.pacerJitterMinMs, options.pacerJitterMaxMs) : 50;
  // Crawl type determines planner features (e.g., 'intelligent')
  this.crawlType = (options.crawlType || 'basic').toLowerCase();
  this.plannerEnabled = this.crawlType.startsWith('intelligent');
  this.skipQueryUrls = options.skipQueryUrls !== undefined ? !!options.skipQueryUrls : true;
  this.urlPolicy = new UrlPolicy({ baseUrl: this.baseUrl, skipQueryUrls: this.skipQueryUrls });
  this.deepUrlAnalyzer = new DeepUrlAnalyzer({ getDb: () => this.db, policy: this.urlPolicy });
    
    // Statistics
    this.stats = {
      pagesVisited: 0,
      pagesDownloaded: 0,
  articlesFound: 0,
  articlesSaved: 0,
      errors: 0,
      bytesDownloaded: 0,
      depth2PagesProcessed: 0
    };
    this.emittedMilestones = new Set();
    this.depth2Visited = new Set();
  }

  // --- Analysis helpers: use both URL and content signals ---
  _computeUrlSignals(rawUrl) {
    try {
      const u = new URL(rawUrl, this.baseUrl);
      const host = u.hostname;
      const path = u.pathname || '/';
      const segments = path.split('/').filter(Boolean);
      const section = segments[0] || null;
      const pathDepth = segments.length;
      const slug = segments[pathDepth - 1] || '';
      const slugLen = slug.length;
      const lower = path.toLowerCase();
      const hasDatePath = /\/\d{4}\/\d{2}\/\d{2}\//.test(lower);
      const hasArticleWords = /(article|story|news|post|opinion|uk-news|us-news|world|politics|business|sport|culture|technology)/.test(lower);
      const queryCount = Array.from(new URLSearchParams(u.search)).length;
      const hostParts = host.split('.');
      const tld = hostParts[hostParts.length - 1] || null;
      return { host, tld, section, pathDepth, slugLen, hasDatePath, hasArticleWords, queryCount };
    } catch (_) { return null; }
  }

  _computeContentSignals($, html) {
    let linkDensity = null, h2 = null, h3 = null, aCount = null, pCount = null;
    try {
      const bodyText = ($('body').text() || '').replace(/\s+/g, ' ').trim();
      let aTextLen = 0; $('a').each((_, el) => { const t = $(el).text(); aTextLen += (t||'').trim().length; });
      const len = bodyText.length || 1; linkDensity = Math.min(1, Math.max(0, aTextLen / len));
      h2 = $('h2').length; h3 = $('h3').length; aCount = $('a').length; pCount = $('p').length;
    } catch (_) {}
    return { linkDensity, h2, h3, a: aCount, p: pCount };
  }

  _combineSignals(urlSignals, contentSignals, opts = {}) {
    const votes = { article: 0, nav: 0, other: 0 };
    const consider = [];
    // URL-based votes
    if (urlSignals) {
      if (urlSignals.hasDatePath || urlSignals.hasArticleWords) { votes.article++; consider.push('url-article'); }
      if (urlSignals.pathDepth <= 2 && !urlSignals.hasDatePath) { votes.nav++; consider.push('url-shallow'); }
    }
    // Content-based votes
    const cs = contentSignals || {};
    if (typeof cs.linkDensity === 'number') {
      if (cs.linkDensity > 0.25 && (cs.a || 0) > 40) { votes.nav++; consider.push('content-link-dense'); }
      if (cs.linkDensity < 0.08 && (cs.p || 0) >= 3) { votes.article++; consider.push('content-text-heavy'); }
    }
    if (typeof opts.wordCount === 'number') {
      if (opts.wordCount > 150) { votes.article++; consider.push('wc>150'); }
      if (opts.wordCount < 60 && (cs.a || 0) > 20) { votes.nav++; consider.push('wc<60'); }
    }
    // Decide
    let hint = 'other';
    let maxVotes = -1;
    for (const k of Object.keys(votes)) { if (votes[k] > maxVotes) { maxVotes = votes[k]; hint = k; } }
    const considered = consider.length || 1;
    const confidence = Math.min(1, Math.max(0, maxVotes / Math.max(2, considered))); // crude but bounded
    return { hint, confidence, considered };
  }

  // --- Lightweight emitter for queue instrumentation ---
  emitQueueEvent(evt) {
    try {
      // Shape example: { action: 'enqueued'|'dequeued'|'retry'|'drop', url, depth?, host?, reason?, queueSize? }
      console.log('QUEUE ' + JSON.stringify(evt));
    } catch (_) { /* ignore */ }
  }

  // --- Structured problems surface ---
  emitProblem(problem) {
    try {
      // Example: { kind: 'missing-hub', scope: 'country', target: 'France', hintUrl?, details? }
      console.log('PROBLEM ' + JSON.stringify(problem));
    } catch (_) { /* ignore */ }
  }

  // --- Structured milestones surface ---
  emitMilestone(milestone) {
    try {
      // Example: { kind: 'patterns-learned', scope: 'guardian', message: 'Homepage sections inferred', details? }
      console.log('MILESTONE ' + JSON.stringify(milestone));
    } catch (_) { /* ignore */ }
  }

  _emitMilestoneOnce(key, milestone) {
    if (!this.emittedMilestones) this.emittedMilestones = new Set();
    if (this.emittedMilestones.has(key)) return;
    this.emittedMilestones.add(key);
    this.emitMilestone(Object.assign({ scope: this.domain }, milestone));
  }

  _noteDepthVisit(normalizedUrl, depth) {
    if (depth !== 2 || !normalizedUrl) return;
    if (!this.depth2Visited) this.depth2Visited = new Set();
    if (this.depth2Visited.has(normalizedUrl)) return;
    this.depth2Visited.add(normalizedUrl);
    this.stats.depth2PagesProcessed = (this.stats.depth2PagesProcessed || 0) + 1;
  }

  _checkAnalysisMilestones({ depth, isArticle }) {
    // depth milestones
    if ((this.stats.depth2PagesProcessed || 0) >= 10) {
      this._emitMilestoneOnce('depth2-coverage-10', {
        kind: 'depth2-coverage',
        message: 'Completed analysis of 10 depth-2 pages from the front page',
        details: { depth: 2, pages: this.stats.depth2PagesProcessed }
      });
    }

    // downloads milestone
    if (this.stats.pagesDownloaded >= 1000) {
      this._emitMilestoneOnce('downloads-1k', {
        kind: 'downloads-1k',
        message: 'Downloaded 1,000 documents',
        details: { count: this.stats.pagesDownloaded }
      });
    }

    // article identification milestones (analysis-driven)
    if (this.stats.articlesFound >= 1000) {
      this._emitMilestoneOnce('articles-found-1k', {
        kind: 'articles-identified-1k',
        message: 'Identified 1,000 articles during analysis',
        details: { count: this.stats.articlesFound }
      });
    }
    if (this.stats.articlesFound >= 10000) {
      this._emitMilestoneOnce('articles-found-10k', {
        kind: 'articles-identified-10k',
        message: 'Identified 10,000 articles during analysis',
        details: { count: this.stats.articlesFound }
      });
    }

  // Provide a hook for intelligent crawls to optionally schedule deeper analysis
  if (this.plannerEnabled && isArticle && typeof this.scheduleWideHistoryCheck === 'function') {
      try {
        this.scheduleWideHistoryCheck({ depth, articlesFound: this.stats.articlesFound });
      } catch (_) {
        // Analysis scheduling is best-effort; ignore errors
      }
    }
  }

  // --- Per-domain rate limiter state management ---

  _getDomainState(host) {
    let state = this.domainLimits.get(host);
    if (!state) {
      state = {
        host,
        // Core state
        isLimited: false,       // True if any 429 has been received
        rpm: null,              // Current requests-per-minute limit
        nextRequestAt: 0,       // Earliest time the next request is allowed
        backoffUntil: 0,        // A hard stop for all requests after a 429
        // Telemetry for adaptive behavior
        lastRequestAt: 0,
        lastSuccessAt: 0,
        last429At: 0,
        successStreak: 0,
        err429Streak: 0,
        // Metrics for UI
        rpmLastMinute: 0,
        windowStartedAt: 0,
        windowCount: 0
      };
      this.domainLimits.set(host, state);
    }
    return state;
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
        if (this.fastStart) {
          console.log(`SQLite DB initialized at: ${this.dbPath} (fast-start)`);
        } else {
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
        }
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
    const pushed = await loadSitemaps(this.baseUrl, this.domain, this.sitemapUrls, {
      sitemapMaxUrls: this.sitemapMaxUrls,
      push: (u) => {
        const n = this.normalizeUrl(u);
        if (!n) return;
        if (!this.isOnDomain(n) || !this.isAllowed(n)) return;
        const type = this.looksLikeArticle(n) ? 'article' : 'nav';
        this.enqueueRequest({ url: n, depth: 0, type });
        this.sitemapDiscovered = (this.sitemapDiscovered||0) + 1;
        this.emitProgress();
      }
    });
    console.log(`Sitemap enqueue complete: ${pushed} URL(s)`);
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

  normalizeUrl(url, context = {}) {
    return this.urlPolicy.normalize(url, context);
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

    const policyDecision = this.urlPolicy.decide(normalizedUrl, { phase: 'fetch', depth: context.depth || 0 });
    if (!policyDecision.allow) {
      if (policyDecision.reason === 'query-superfluous') {
        this._handlePolicySkip(policyDecision, { depth: context.depth || 0, queueSize: this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length });
      } else {
        try { console.log(`Skipping fetch due to policy: ${normalizedUrl} reason=${policyDecision.reason}`); } catch (_) {}
      }
      return { status: 'skipped-policy' };
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
  this.currentDownloads.set(normalizedUrl, { startedAt: started, policy: policyDecision });
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
          try { this.noteSuccess(u.hostname); } catch (_) {}
      
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
        domainRpm = st.rpmLastMinute;
        domainLimit = st.rpm;
        domainRateLimited = st.isLimited;
        if (st.rpm > 0) domainIntervalMs = Math.floor(60000 / st.rpm);
        if (st.backoffUntil > now2) domainBackoffMs = st.backoffUntil - now2;
      }
      // Include per-host limiter state for UI badges
      for (const [host, s] of this.domainLimits.entries()) {
        try {
          const backoff = (s.backoffUntil > now2) ? (s.backoffUntil - now2) : null;
          const interval = s.rpm > 0 ? Math.floor(60000 / s.rpm) : null;
          perHostLimits[host] = {
            rateLimited: s.isLimited,
            limit: s.rpm,
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
    return Links.findNavigationLinks($, (u)=>this.normalizeUrl(u), (u)=>this.isOnDomain(u));
  }

  findArticleLinks($) {
    return Links.findArticleLinks($, (u)=>this.normalizeUrl(u), (u)=>this.looksLikeArticle(u), (u)=>this.isOnDomain(u));
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
        // Build article-level analysis using URL + content signals
        let articleAnalysis = null;
        try {
          const $a = cheerio.load(html || '');
          const urlSig = this._computeUrlSignals(metadata.url);
          const contentSig = this._computeContentSignals($a, html || '');
          const combined = this._combineSignals(urlSig, contentSig, { wordCount: wordCount ?? undefined });
          articleAnalysis = { url: urlSig, content: { ...contentSig, wordCount: wordCount ?? null, articleXPath: articleXPath || null }, combined };
        } catch (_) {}
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
          article_xpath: articleXPath,
          analysis: articleAnalysis ? JSON.stringify(articleAnalysis) : null
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
    // Determine effective max-age by type
    const effectiveMaxAgeMs = (looksArticle && this.maxAgeArticleMs != null)
      ? this.maxAgeArticleMs
      : ((!looksArticle && this.maxAgeHubMs != null) ? this.maxAgeHubMs : this.maxAgeMs);
    if (effectiveMaxAgeMs != null || this.preferCache) {
      const cached = await this.getCachedArticle(url);
      if (cached) {
        const decision = shouldUseCache({ preferCache: this.preferCache, maxAgeMs: effectiveMaxAgeMs, crawledAt: cached.crawledAt });
        if (decision.use) {
          const ageSeconds = decision.ageSeconds;
          try { console.log(`CACHE ${JSON.stringify({ url: this.normalizeUrl(url), source: cached.source, ageSeconds })}`); } catch (_) {}
          console.log(`Using cached page (age ${ageSeconds}s, source=${cached.source}): ${url}`);
          // Fast path: mark visited and count as found if looks like article; skip heavy DOM work
          const norm = this.normalizeUrl(url);
          pageData = { url: norm, html: cached.html };
          this.visited.add(norm);
          this._noteDepthVisit(norm, depth);
          this.stats.pagesVisited++;
          fromCache = true;
          // Optionally record a lightweight fetch row for visibility without re-parsing
          try {
            if (this.db) {
              // Lightweight analysis snapshot for the cache hit
              let analysis = null;
              try {
                const $c = cheerio.load(cached.html || '');
                const contentSig = this._computeContentSignals($c, cached.html || '');
                const urlSig = this._computeUrlSignals(norm);
                const combined = this._combineSignals(urlSig, contentSig);
                analysis = { kind: 'cache-hit', url: urlSig, content: contentSig, combined };
              } catch (_) {}
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
                analysis: analysis ? JSON.stringify(analysis) : null
              });
            }
          } catch (_) {}
          this.emitProgress();
          // On fast path, return early to allow rapid progression through cached URLs
          if (this.looksLikeArticle(norm)) {
            this.stats.articlesFound++;
            this.emitProgress();
          }
          this._checkAnalysisMilestones({ depth, isArticle: this.looksLikeArticle(norm) });
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
      const normFetched = this.normalizeUrl(pageData.url);
      this.visited.add(normFetched);
      this._noteDepthVisit(normFetched, depth);
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
          // Compute URL+content analysis for fetch row
          const contentSig = this._computeContentSignals($, pageData.html);
          const urlSig = this._computeUrlSignals(pageData.url);
          const combined = this._combineSignals(urlSig, contentSig, { wordCount: wc ?? undefined });
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
            word_count: wc,
            analysis: JSON.stringify({ url: urlSig, content: { ...contentSig, wordCount: wc ?? null }, combined })
          });
        }
      }
    }

    // Find navigation and article links
  const navigationLinks = this.findNavigationLinks($);
  const articleLinks = this.findArticleLinks($);
    
  console.log(`Found ${navigationLinks.length} navigation links and ${articleLinks.length} article links on ${pageData.url}`);

    this._checkAnalysisMilestones({ depth, isArticle: isArticleByUrl });

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
      // URL+content analysis for non-article pages
      const contentSig = this._computeContentSignals($, pageData.html);
      const urlSig = this._computeUrlSignals(pageData.url);
      const combined = this._combineSignals(urlSig, contentSig, { wordCount: wc ?? undefined });
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
        word_count: wc,
        analysis: JSON.stringify({ url: urlSig, content: { ...contentSig, wordCount: wc ?? null }, combined })
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

  _handlePolicySkip(decision, { depth, queueSize }) {
    const analysis = decision?.analysis || {};
    const normalized = analysis.normalized || analysis.raw || null;
    let host = null;
    try { if (normalized) host = new URL(normalized).hostname; } catch (_) {}
    this.emitQueueEvent({
      action: 'drop',
      url: normalized || analysis.raw,
      depth,
      host,
      reason: 'query-skip',
      queueSize,
      alias: decision.guessedUrl || analysis.guessedWithoutQuery || null
    });
    try { this.deepUrlAnalyzer?.analyze(decision); } catch (_) {}
    if (normalized) {
      try {
        console.log(`Skipping query URL (heuristic superfluous): ${normalized} -> ${decision.guessedUrl || analysis.guessedWithoutQuery || '<none>'}`);
      } catch (_) {}
    }
  }

  enqueueRequest({ url, depth, type }) {
    const currentSize = this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length;
    const policyDecision = this.urlPolicy.decide(url, { phase: 'enqueue', depth });
    const analysis = policyDecision.analysis || {};
    const normalized = analysis && !analysis.invalid ? analysis.normalized : this.normalizeUrl(url);
    let host = null;
    try { if (normalized) host = new URL(normalized).hostname; } catch (_) {}

    if (!policyDecision.allow) {
      if (policyDecision.reason === 'query-superfluous') {
        this._handlePolicySkip(policyDecision, { depth, queueSize: currentSize });
      } else {
        this.emitQueueEvent({ action: 'drop', url: normalized || url, depth, host, reason: policyDecision.reason || 'policy-blocked', queueSize: currentSize });
      }
      return;
    }

    if (depth > this.maxDepth) {
      this.emitQueueEvent({ action: 'drop', url: normalized || url, depth, host, reason: 'max-depth', queueSize: currentSize });
      return;
    }
    if (!normalized) {
      // Unable to normalize URL; drop silently (reason: bad-url)
      this.emitQueueEvent({ action: 'drop', url: url, depth, host: null, reason: 'bad-url', queueSize: currentSize });
      return;
    }
    if (!this.isOnDomain(normalized)) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'off-domain', queueSize: currentSize });
      return;
    }
    if (!this.isAllowed(normalized)) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'robots-disallow', queueSize: currentSize });
      return;
    }
    if (this.visited.has(normalized)) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'visited', queueSize: currentSize });
      return;
    }
    if (this.queuedUrls.has(normalized)) {
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'duplicate', queueSize: currentSize });
      return;
    }
    if (this.queueHeap.size() >= this.maxQueue) {
      // bounded: drop new on overflow
      this.emitQueueEvent({ action: 'drop', url: normalized, depth, host, reason: 'overflow', queueSize: currentSize });
      return;
    }
    const discoveredAt = Date.now();
    const inferredType = this.looksLikeArticle(normalized) ? 'article' : 'nav';
    // Allow passing an object shape for type: { kind: 'nav'|'article', reason?: string }
    const kind = (type && typeof type === 'object') ? (type.kind || type.type || inferredType) : (type || inferredType);
    const reason = (type && typeof type === 'object' && type.reason) ? type.reason : undefined;
    const item = {
      url: normalized,
      depth,
      type: kind,
      retries: 0,
      nextEligibleAt: 0,
      discoveredAt,
      policyDecision
    };
    item.priority = this.computePriority({ type: item.type, depth: item.depth, discoveredAt });
    this.queueHeap.push(item);
    this.queuedUrls.add(normalized);
    // Emit enqueued event with updated size
    const sizeAfter = this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length;
    this.emitQueueEvent({ action: 'enqueued', url: normalized, depth, host, queueSize: sizeAfter, reason });
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
    // Delegate to limiter for timing; mirror state to legacy map for UI telemetry
    const before = this._getDomainState(host);
    await (async () => {
      try {
        // Lazy require to avoid circular timing
        const { DomainLimiter } = require('./crawler/limiter');
        if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
        await this._domainLimiter.acquire(host);
        const s = this._domainLimiter._get(host);
        if (s) Object.assign(before, { isLimited: s.isLimited, rpm: s.rpm, nextRequestAt: s.nextRequestAt, backoffUntil: s.backoffUntil, lastRequestAt: s.lastRequestAt, rpmLastMinute: s.rpmLastMinute, windowStartedAt: s.windowStartedAt, windowCount: s.windowCount });
      } catch (_) {
        // Fall back to old behavior if helper unavailable
        const now = nowMs();
        if (before.backoffUntil > now) await sleep(before.backoffUntil - now);
        before.lastRequestAt = now;
      }
    })();
  }

  note429(host, retryAfterMs) {
    try {
      const { DomainLimiter } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
      this._domainLimiter.note429(host, retryAfterMs);
      const s = this._domainLimiter._get(host); const st = this._getDomainState(host); if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.isLimited = true; state.last429At = now; state.successStreak = 0; state.err429Streak++;
      const baseBlackout = retryAfterMs != null ? Math.max(30000, retryAfterMs) : 45000; const jitterV = Math.floor(baseBlackout * ((Math.random() * 0.2) - 0.1)); let blackout = baseBlackout + jitterV;
      if (state.err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);
      if (state.err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000);
      state.backoffUntil = now + blackout;
      const currentRpm = state.rpm || 60; const newRpm = Math.max(1, Math.floor(currentRpm * 0.25)); state.rpm = newRpm; state.nextRequestAt = now + Math.floor(60000 / newRpm);
    }
  }

  noteSuccess(host) {
    try {
      const { DomainLimiter } = require('./crawler/limiter');
      if (!this._domainLimiter) this._domainLimiter = new DomainLimiter({ pacerJitterMinMs: this.pacerJitterMinMs, pacerJitterMaxMs: this.pacerJitterMaxMs });
      this._domainLimiter.noteSuccess(host);
      const s = this._domainLimiter._get(host); const st = this._getDomainState(host); if (s && st) Object.assign(st, s);
    } catch (_) {
      const now = nowMs();
      const state = this._getDomainState(host);
      state.lastSuccessAt = now; state.successStreak++; state.err429Streak = 0;
      if (state.isLimited && state.successStreak > 100) {
        const canProbe = (now - state.last429At) > 5 * 60 * 1000; if (canProbe) { const currentRpm = state.rpm || 10; const nextRpm = Math.max(1, Math.floor(currentRpm * 1.1)); state.rpm = Math.min(nextRpm, 300); state.successStreak = 0; }
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
      // Dequeue for processing
      try {
        const host = (() => { try { return new URL(item.url).hostname; } catch (_) { return null; } })();
        const sizeNow = this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length;
        this.emitQueueEvent({ action: 'dequeued', url: item.url, depth: item.depth, host, queueSize: sizeNow });
      } catch (_) {}
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
          // Emit retry event after requeue
          try {
            const host = (() => { try { return new URL(item.url).hostname; } catch (_) { return null; } })();
            const sizeNow = this.usePriorityQueue ? this.queueHeap.size() : this.requestQueue.length;
            this.emitQueueEvent({ action: 'retry', url: item.url, depth: item.depth, host, reason: 'retriable-error', queueSize: sizeNow });
          } catch (_) {}
        }
      }
      // loop continues
    }
  }

  async crawlConcurrent() {
    await this.init();
    // Optional intelligent planning path
  if (this.plannerEnabled) {
      try { await this.planIntelligent(); } catch (e) { try { this.emitProblem({ kind: 'intelligent-plan-failed', message: e?.message || String(e) }); } catch(_) {} }
    }
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

  // --- Intelligent planner ---
  async planIntelligent() {
    // Sense: what site is this? What gazetteer do we have? What hubs have we seen before?
    const host = this.domain.toLowerCase();
    const start = this.startUrl;
  try { console.log(`Intelligent crawl planning for host=${host}`); } catch(_) {}
    if (Array.isArray(this.intTargetHosts) && this.intTargetHosts.length > 0) {
      const ok = this.intTargetHosts.some(h => host.endsWith(h));
      if (!ok) {
        this.emitProblem({ kind: 'planner-skipped-host', host, targetHosts: this.intTargetHosts });
        return;
      }
    }
    // Learn patterns from homepage: detect prominent top-level sections to use as hubs
    let homepageHtml = null;
    try {
      const page = await this.fetchPage(this.startUrl, { referrerUrl: null, depth: 0 });
      if (page && !page.error) { homepageHtml = page.html; }
    } catch (_) {}
  const learned = this._inferSitePatternsFromHomepage(homepageHtml);
    if (learned && (learned.sections?.length || learned.articleHints?.length)) {
  this.emitMilestone({ kind: 'patterns-learned', scope: host, details: learned, message: 'Homepage patterns inferred' });
    }
    // Seed hubs from learned sections
    const sectionHubs = (learned.sections || []).map(s => `${this.baseUrl}/${s}/`);
    // Fallback: Guardian-style countries when host matches
    let candidates = [];
    if (/guardian\.com$/.test(host)) {
      candidates = await this._computeCountryHubCandidates(host);
    }
    // Merge and de-duplicate hub list (sections + guardian countries)
    const hubSet = new Set(sectionHubs.concat(candidates.map(c => c.url)));
    const cap = typeof this.intMaxSeeds === 'number' ? this.intMaxSeeds : 50;
    const hubs = Array.from(hubSet).slice(0, cap);
    const seeded = [];
    for (const hubUrl of hubs) {
  this.enqueueRequest({ url: hubUrl, depth: 0, type: { kind: 'nav', reason: 'intelligent-seed' } });
      seeded.push(hubUrl);
      try {
        // Record as place_hub best-effort if DB available
        this.db?.db?.prepare(`INSERT OR IGNORE INTO place_hubs(host, url, place_slug, place_kind, topic_slug, topic_label, topic_kind, title, first_seen_at, last_seen_at, nav_links_count, article_links_count, evidence) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, datetime('now'), datetime('now'), NULL, NULL, ?)`)
          .run(host, hubUrl, JSON.stringify({ by: 'intelligent-plan', reason: 'learned-section-or-country' }));
      } catch (_) {}
    }
    try { console.log(`Intelligent plan: seeded ${seeded.length} hub(s)`); } catch(_) {}
    if (seeded.length === 0) {
      this.emitProblem({ kind: 'no-hubs-seeded', scope: host, message: 'No suitable hubs found from homepage or models' });
    } else {
      this.emitMilestone({ kind: 'hubs-seeded', scope: host, message: `Seeded ${candidates.length} hubs`, details: { count: candidates.length } });
    }
  }

  _inferSitePatternsFromHomepage(html) {
    if (!html) return { sections: [], articleHints: [] };
    const $ = cheerio.load(html);
    const counts = new Map();
    const skip = new Set(['about','contact','privacy','terms','cookies','help','advertising','sitemap','account','login','signup','subscribe','newsletter','careers']);
    const add = (seg) => {
      const s = (seg || '').trim().toLowerCase();
      if (!s || skip.has(s)) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    };
    $('a[href]').each((_, el) => {
      try {
        const href = $(el).attr('href');
        const u = new URL(href, this.baseUrl);
        if (u.hostname !== this.domain) return;
        const seg = (u.pathname || '/').split('/').filter(Boolean)[0] || null;
        if (!seg) return;
        add(seg);
      } catch (_) {}
    });
    const sections = Array.from(counts.entries())
      .sort((a,b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k]) => k);
    // Simple article hints from homepage links
    const articleHints = [];
    try {
      const sample = new Set();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        try {
          const u = new URL(href, this.baseUrl);
          if (u.hostname !== this.domain) return;
          const p = u.pathname || '/';
          if (/\/\d{4}\/\d{2}\/\d{2}\//.test(p)) sample.add('date-path');
          if (/(?:^|\/)article[s]?\b|\bnews\b|\bstory\b|\bopinion\b/i.test(p)) sample.add('keywords');
        } catch(_){}
      });
      articleHints.push(...Array.from(sample));
    } catch(_){}
    return { sections, articleHints };
  }

  async _computeCountryHubCandidates(host) {
    const out = [];
    // Guardian pattern: https://www.theguardian.com/world/<slug>
    if (/guardian\.com$/.test(host)) {
      // Sense: use a small set of high-confidence country slugs to start; can expand later from gazetteer table.
      const slugs = this._getTopCountrySlugsFromGazetteer(100) || [
        'france','germany','spain','italy','china','india','united-states','russia','brazil','canada','australia','japan','south-africa','mexico','nigeria','argentina','poland','netherlands','sweden','norway','denmark','ireland','portugal','greece','turkey','ukraine','egypt','saudiarabia','iran','iraq','israel'
      ];
      for (const slug of slugs) {
        // Map common variations (spaces -> hyphens, lowercase)
        const s = String(slug).trim().toLowerCase().replace(/\s+/g, '-');
        const url = `${this.baseUrl}/world/${encodeURIComponent(s)}`;
        out.push({ url, slug: s, reason: 'guardian-world-country' });
      }
    }
    // Future: add patterns for BBC, NYTimes, etc.
    return out;
  }

  _getTopCountrySlugsFromGazetteer(limit = 50) {
    try {
      if (!this.db || !this.db.db) return null;
      const rows = this.db.db.prepare(`SELECT name FROM place_names WHERE id IN (SELECT canonical_name_id FROM places WHERE kind='country') ORDER BY name LIMIT ?`).all(limit);
      // Normalize names to slugs similar to Guardian style
      const toSlug = (name) => String(name || '').trim().toLowerCase()
        .replace(/\band\b/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const uniq = new Set();
      const slugs = [];
      for (const r of rows) {
        const s = toSlug(r.name);
        if (s && !uniq.has(s)) { uniq.add(s); slugs.push(s); }
      }
      return slugs;
    } catch (_) { return null; }
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
  const crawlTypeArg = args.find(a => a.startsWith('--crawl-type='));
  const crawlType = crawlTypeArg ? String(crawlTypeArg.split('=')[1]) : undefined;
  const reqTimeoutArg = args.find(a => a.startsWith('--request-timeout-ms='));
  const requestTimeoutMs = reqTimeoutArg ? parseInt(reqTimeoutArg.split('=')[1], 10) : undefined;
  const jitterMinArg = args.find(a => a.startsWith('--pacer-jitter-min-ms='));
  const pacerJitterMinMs = jitterMinArg ? parseInt(jitterMinArg.split('=')[1], 10) : undefined;
  const jitterMaxArg = args.find(a => a.startsWith('--pacer-jitter-max-ms='));
  const pacerJitterMaxMs = jitterMaxArg ? parseInt(jitterMaxArg.split('=')[1], 10) : undefined;
  const maxPagesArg = args.find(a => a.startsWith('--max-pages=')) || args.find(a => a.startsWith('--max-downloads='));
  const maxDownloads = maxPagesArg ? parseInt(maxPagesArg.split('=')[1], 10) : undefined;
  const maxAgeArg = args.find(a => a.startsWith('--max-age=')) || args.find(a => a.startsWith('--refetch-if-older-than='));
  const maxAgeArticleArg = args.find(a => a.startsWith('--max-age-article=')) || args.find(a => a.startsWith('--refetch-article-if-older-than='));
  const maxAgeHubArg = args.find(a => a.startsWith('--max-age-hub=')) || args.find(a => a.startsWith('--refetch-hub-if-older-than='));
  const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
  const maxQueueArg = args.find(a => a.startsWith('--max-queue='));
  // Intelligent planner flags
  const hubMaxPagesArg = args.find(a => a.startsWith('--hub-max-pages='));
  const hubMaxDaysArg = args.find(a => a.startsWith('--hub-max-days='));
  const intMaxSeedsArg = args.find(a => a.startsWith('--int-max-seeds='));
  const intTargetHostsArg = args.find(a => a.startsWith('--int-target-hosts='));
  const plannerVerbosityArg = args.find(a => a.startsWith('--planner-verbosity='));
  // Cache preference: default is to prefer cache; allow override with --no-prefer-cache
  const preferCache = args.includes('--no-prefer-cache') ? false : true;
  const useSitemap = !args.includes('--no-sitemap');
  const sitemapOnly = args.includes('--sitemap-only');
  const sitemapMaxArg = args.find(a => a.startsWith('--sitemap-max='));
  const fastStart = args.includes('--fast-start');
  const jobIdArg = args.find(a => a.startsWith('--job-id='));
  const allowQueryUrls = args.includes('--allow-query-urls');

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
  let maxAgeArticleMs = maxAgeArticleArg ? parseMaxAgeToMs(maxAgeArticleArg.split('=')[1]) : undefined;
  let maxAgeHubMs = maxAgeHubArg ? parseMaxAgeToMs(maxAgeHubArg.split('=')[1]) : undefined;
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
  maxAgeArticleMs,
  maxAgeHubMs,
    concurrency: concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 1,
  maxQueue: maxQueueArg ? parseInt(maxQueueArg.split('=')[1], 10) : undefined,
  preferCache,
  requestTimeoutMs,
  pacerJitterMinMs,
  pacerJitterMaxMs
  , useSitemap, sitemapOnly,
  sitemapMaxUrls: sitemapMaxArg ? parseInt(sitemapMaxArg.split('=')[1], 10) : undefined
  , fastStart
  , crawlType
  , hubMaxPages: hubMaxPagesArg ? parseInt(hubMaxPagesArg.split('=')[1], 10) : undefined
  , hubMaxDays: hubMaxDaysArg ? parseInt(hubMaxDaysArg.split('=')[1], 10) : undefined
  , intMaxSeeds: intMaxSeedsArg ? parseInt(intMaxSeedsArg.split('=')[1], 10) : undefined
  , intTargetHosts: intTargetHostsArg ? String(intTargetHostsArg.split('=')[1]).split(',').map(s => s.trim()).filter(Boolean) : undefined
  , plannerVerbosity: plannerVerbosityArg ? parseInt(plannerVerbosityArg.split('=')[1], 10) : undefined
  , jobId: jobIdArg ? jobIdArg.split('=')[1] : undefined
  , skipQueryUrls: !allowQueryUrls
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