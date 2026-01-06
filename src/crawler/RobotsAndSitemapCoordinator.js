const { each } = require('lang-tools');

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

    this.robotsRules = null;
    this.robotsTxtLoaded = false;
    this.sitemapUrls = [];
    this.sitemapDiscovered = 0;
  }

  getRobotsInfo() {
    return {
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
    const robotsUrl = `${this.baseUrl}/robots.txt`;
    const dbAdapter = typeof this.dbAdapter === 'function' ? this.dbAdapter() : this.dbAdapter;
    const db = dbAdapter?.db || dbAdapter; // Handle both CrawlerDb wrapper and direct SQLiteNewsDatabase
    
    // Try cache first
    if (db && typeof db.getArticleByUrl === 'function') {
      try {
        const cached = db.getArticleByUrl(robotsUrl);
        // Check if cached and fresh enough (e.g. 24 hours)
        const now = Date.now();
        const fetchedAt = cached?.fetched_at ? new Date(cached.fetched_at).getTime() : 0;
        const ageSeconds = Math.floor((now - fetchedAt) / 1000);
        
        if (cached && cached.http_status === 200 && cached.html && ageSeconds < 86400) {
          const robotsTxt = Buffer.isBuffer(cached.html) ? cached.html.toString('utf8') : String(cached.html);
          this.robotsRules = this.robotsParser(robotsUrl, robotsTxt);
          this.robotsTxtLoaded = true;
          this.logger.log(`robots.txt loaded from DB cache (age: ${ageSeconds}s)`);
          this._harvestSitemaps(robotsTxt);
          return;
        }
      } catch (err) {
        // Cache miss or read error, continue to fetch
      }
    }

    // Fetch with retry logic
    this.logger.log(`Loading robots.txt from: ${robotsUrl}`);
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.fetch(robotsUrl);
        if (response.ok) {
          const robotsTxt = await response.text();
          this.robotsRules = this.robotsParser(robotsUrl, robotsTxt);
          this.robotsTxtLoaded = true;
          this.logger.log('robots.txt loaded successfully');
          this._harvestSitemaps(robotsTxt);
          
          // Cache the successful fetch to DB
          if (db && typeof db.upsertArticle === 'function' && robotsTxt) {
            try {
              const now = new Date().toISOString();
              db.upsertArticle({
                url: robotsUrl,
                fetched_at: now,
                http_status: 200,
                content_type: 'text/plain',
                html: robotsTxt,
                title: 'robots.txt',
                classification: 'robots'
              }, { compress: false });
            } catch (_) {
              // Cache write failure is non-critical
            }
          }
          return;
        } else if (response.status === 404) {
          this.logger.log('No robots.txt found (404), proceeding without restrictions');
          return;
        }
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error.message;
        if (attempt < 3) {
          const delay = attempt * 1000; // 1s, 2s backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    this.logger.log(`Failed to load robots.txt after 3 attempts (${lastError}), proceeding without restrictions`);
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
