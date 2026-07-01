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
      discovered: this.sitemapDiscovered
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
      push: (url, meta) => this._handleSitemapUrl(url, meta)
    });
    this.logger.log(`Sitemap enqueue complete: ${pushed} URL(s)`);
    return pushed;
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
