const { each } = require('lang-tools');
const { RobotsCache } = require('./RobotsCache');

class RobotsAndSitemapCoordinator {
  constructor({
    baseUrl,
    domain,
    fetchImpl,
    robotsParser,
    loadSitemaps,
    useSitemap = true,
    sitemapMaxUrls = 5000,
    getUrlDecision,
    handlePolicySkip,
    isOnDomain,
    looksLikeArticle,
    enqueueRequest,
    emitProgress,
    getQueueSize,
    dbAdapter = null,
    robotsCache = null,
    robotsCacheTtlSeconds = undefined,
    onRobotsPolicy = null,
    logger = console
  } = {}) {
    if (!baseUrl || !domain) {
      throw new Error('RobotsAndSitemapCoordinator requires baseUrl and domain');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires a fetch implementation');
    }
    if (typeof robotsParser !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires a robotsParser function');
    }
    if (typeof loadSitemaps !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires a loadSitemaps helper');
    }
    if (typeof getUrlDecision !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires getUrlDecision');
    }
    if (typeof handlePolicySkip !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires handlePolicySkip');
    }
    if (typeof isOnDomain !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires isOnDomain');
    }
    if (typeof looksLikeArticle !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires looksLikeArticle');
    }
    if (typeof enqueueRequest !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires enqueueRequest');
    }
    if (typeof emitProgress !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires emitProgress');
    }
    if (typeof getQueueSize !== 'function') {
      throw new Error('RobotsAndSitemapCoordinator requires getQueueSize');
    }

    this.baseUrl = baseUrl;
    this.domain = domain;
    this.fetch = fetchImpl;
    this.robotsParser = robotsParser;
    this.loadSitemaps = loadSitemaps;
    this.useSitemap = useSitemap;
    this.sitemapMaxUrls = sitemapMaxUrls;
    this.getUrlDecision = getUrlDecision;
    this.handlePolicySkip = handlePolicySkip;
    this.isOnDomain = isOnDomain;
    this.looksLikeArticle = looksLikeArticle;
    this.enqueueRequest = enqueueRequest;
    this.emitProgress = emitProgress;
    this.getQueueSize = getQueueSize;
    this.dbAdapter = dbAdapter;
    this.logger = logger;
    this.onRobotsPolicy = typeof onRobotsPolicy === 'function' ? onRobotsPolicy : null;
    this.robotsCache = robotsCache || new RobotsCache({
      baseUrl,
      domain,
      fetchImpl,
      dbAdapter,
      ttlSeconds: robotsCacheTtlSeconds,
      logger
    });

    this.robotsRules = null;
    this.robotsTxtLoaded = false;
    this.robotsInfo = { robotsLoaded: false };
    this.sitemapUrls = [];
    this.sitemapDiscovered = 0;
    // Per-sitemap-file fetch outcomes (url -> { status, bytes, fetchedAtIso }),
    // populated from the onFetch callback so the crawl-status detail panel can
    // show which sitemaps have been fetched vs are still pending.
    this.sitemapFetches = new Map();
  }

  getRobotsInfo() {
    return {
      ...this.robotsInfo,
      robotsLoaded: !!this.robotsTxtLoaded
    };
  }

  getSitemapInfo() {
    return {
      urls: this.sitemapUrls,
      discovered: this.sitemapDiscovered,
      fetches: Array.from(this.sitemapFetches, ([url, r]) => ({ url, ...r }))
    };
  }

  isAllowed(url) {
    if (!this.robotsRules) return true;
    try {
      return this.robotsRules.isAllowed(url, '*');
    } catch (_) {
      return true;
    }
  }

  async loadRobotsTxt() {
    const result = await this.robotsCache.load();
    if (!result.loaded) {
      if (result.httpStatus === 404) {
        this.logger.log('No robots.txt found (404), proceeding without restrictions');
      } else {
        this.logger.log('Failed to load robots.txt, proceeding without restrictions');
      }
      return;
    }

    this.robotsRules = this.robotsParser(result.robotsUrl || `${this.baseUrl}/robots.txt`, result.robotsTxt);
    this.robotsTxtLoaded = true;
    this.robotsInfo = {
      robotsLoaded: true,
      source: result.source || null,
      fetchedAt: result.fetchedAt || null,
      crawlDelaySeconds: result.crawlDelaySeconds ?? null,
      sitemapUrls: Array.isArray(result.sitemapUrls) ? result.sitemapUrls : [],
      politenessFloorMs: result.crawlDelaySeconds != null ? Math.floor(Number(result.crawlDelaySeconds) * 1000) : null
    };
    if (this.onRobotsPolicy) {
      try {
        this.onRobotsPolicy(this.robotsInfo);
      } catch (_) {
        // Policy callback failure must not disable robots allow/deny enforcement.
      }
    }
    this.logger.log(result.source === 'network' ? 'robots.txt loaded successfully' : `robots.txt loaded from ${result.source}`);
    this._harvestSitemaps(result.robotsTxt);
  }

  async loadSitemapsAndEnqueue() {
    if (!this.useSitemap) return 0;
    const pushed = await this.loadSitemaps(this.baseUrl, this.domain, this.sitemapUrls, {
      sitemapMaxUrls: this.sitemapMaxUrls,
      push: (url, meta) => this._handleSitemapUrl(url, meta),
      onFetch: (info) => this._recordSitemapFetch(info),
      cache: this._sitemapCache()
    });
    this.logger.log(`Sitemap enqueue complete: ${pushed} URL(s)`);
    return pushed;
  }

  /**
   * DB-backed conditional-fetch cache for sitemap bodies (news-crawler-db
   * sitemap_cache accessors on the coverage namespace). Returns null when the
   * adapter lacks the accessors — loadSitemaps then fetches unconditionally.
   * All sitemap-cache persistence lives in the DB (hub-loop P0, 2026-07-11).
   */
  _sitemapCache() {
    try {
      const adapter = typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
      if (!adapter) return null;

      // Coverage namespace — resolve it exactly like CrawlerDb.getRobotsCache
      // does (adapter.coverage OR adapter.db.coverage OR adapter._getCoverageAccess()).
      // The live crawler's dbAdapter is CrawlerDb, whose coverage lives on
      // adapter.db.coverage — one level deeper than the drizzle adapter.
      // The drizzle SqliteCoverageAccess self-ensures the table (hub-loop P0).
      const cov = adapter.coverage
        || (adapter.db && adapter.db.coverage)
        || (adapter.db && adapter.db.access && adapter.db.access.coverage)
        || (typeof adapter._getCoverageAccess === 'function' ? adapter._getCoverageAccess() : null);
      if (cov && typeof cov.getSitemapCache === 'function' && typeof cov.upsertSitemapCache === 'function') {
        return {
          get: (url) => cov.getSitemapCache(url),
          set: (url, record) => cov.upsertSitemapCache({ ...record, url })
        };
      }

      // Legacy CrawlerDb path (live crawls): raw-handle functional accessors
      // from the db module — SQL stays inside news-crawler-db.
      const { sitemapCacheGet, sitemapCacheUpsert } = require('news-crawler-db');
      if (typeof sitemapCacheGet === 'function' && typeof sitemapCacheUpsert === 'function') {
        return {
          get: async (url) => sitemapCacheGet(adapter, url),
          set: async (url, record) => { sitemapCacheUpsert(adapter, { ...record, url }); }
        };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Fetch-visibility: land sitemap requests in http_responses like any other
   * real HTTP request. Best-effort — must never break sitemap loading.
   */
  async _recordSitemapFetch(info) {
    // In-memory per-sitemap status for the crawl-status panel — recorded first
    // and unconditionally (the DB visibility below early-returns without an
    // adapter). Never throws.
    try {
      if (info?.url) {
        this.sitemapFetches.set(info.url, {
          status: info.status ?? null,
          bytes: info.bytes || 0,
          fetchedAtIso: info.fetchedAtIso || null
        });
      }
    } catch (_) { /* status tracking is best-effort */ }
    try {
      const adapter = typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
      if (!adapter || typeof adapter.insertHttpResponse !== 'function' || !info?.url) return;
      await adapter.insertHttpResponse({
        url: info.url,
        request_started_at: info.requestStartedIso,
        fetched_at: info.fetchedAtIso,
        http_status: info.status,
        content_type: info.contentType,
        etag: info.etag,
        last_modified: info.lastModified,
        bytes_downloaded: info.bytes || 0
      });
    } catch (_error) { /* visibility is best-effort */ }
  }

  _harvestSitemaps(robotsTxt) {
    try {
      const discovered = new Set();
      if (this.robotsRules && typeof this.robotsRules.getSitemaps === 'function') {
        for (const entry of this.robotsRules.getSitemaps() || []) {
          if (entry) discovered.add(entry);
        }
      } else if (robotsTxt) {
        const sitemapLines = robotsTxt
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => /^sitemap\s*:/i.test(line))
          .map((line) => line.replace(/^sitemap\s*:/i, '').trim())
          .filter(Boolean);
        each(sitemapLines, (entry) => discovered.add(entry));
      }

      if (discovered.size === 0) {
        return;
      }

      const normalized = [];
      for (const entry of discovered) {
        try {
          const abs = new URL(entry, this.baseUrl).href;
          normalized.push(abs);
        } catch (_) {
          // ignore malformed urls
        }
      }

      if (normalized.length === 0) {
        return;
      }

      const combined = Array.from(new Set([...(this.sitemapUrls || []), ...normalized]));
      this.sitemapUrls = combined;
      this.logger.log(`Found ${combined.length} sitemap URL(s)`);
    } catch (_) {
      // ignore harvesting errors
    }
  }

  _handleSitemapUrl(url, meta = {}) {
    const decision = this.getUrlDecision(url, {
      phase: 'sitemap',
      depth: 0,
      source: 'sitemap'
    });
    const analysis = decision?.analysis || {};
    const normalized = analysis && !analysis.invalid ? analysis.normalized : null;
    if (!normalized) {
      return;
    }

    if (!decision.allow) {
      if (decision.reason === 'query-superfluous') {
        this.handlePolicySkip(decision, {
          depth: 0,
          queueSize: this.getQueueSize()
        });
      }
      return;
    }

    if (!this.isOnDomain(normalized) || !this.isAllowed(normalized)) {
      return;
    }

    const type = this.looksLikeArticle(normalized) ? 'article' : 'nav';
    
    const requestMeta = {
      ...meta,
      source: 'sitemap',
      sitemapDiscovery: true
    };

    this.enqueueRequest({
      url: normalized,
      depth: 0,
      type,
      meta: requestMeta
    });
    this.sitemapDiscovered = (this.sitemapDiscovered || 0) + 1;
    this.emitProgress();
  }
}

module.exports = {
  RobotsAndSitemapCoordinator
};
