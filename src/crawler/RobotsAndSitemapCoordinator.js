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
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      this.logger.log(`Loading robots.txt from: ${robotsUrl}`);

      const response = await this.fetch(robotsUrl);
      if (response.ok) {
        const robotsTxt = await response.text();
        this.robotsRules = this.robotsParser(robotsUrl, robotsTxt);
        this.robotsTxtLoaded = true;
        this.logger.log('robots.txt loaded successfully');
        this._harvestSitemaps(robotsTxt);
      } else {
        this.logger.log('No robots.txt found, proceeding without restrictions');
      }
    } catch (error) {
      this.logger.log('Failed to load robots.txt, proceeding without restrictions');
    }
  }

  async loadSitemapsAndEnqueue() {
    if (!this.useSitemap) return 0;
    const pushed = await this.loadSitemaps(this.baseUrl, this.domain, this.sitemapUrls, {
      sitemapMaxUrls: this.sitemapMaxUrls,
      push: (url) => this._handleSitemapUrl(url)
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

  _handleSitemapUrl(url) {
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
    this.enqueueRequest({
      url: normalized,
      depth: 0,
      type
    });
    this.sitemapDiscovered = (this.sitemapDiscovered || 0) + 1;
    this.emitProgress();
  }
}

module.exports = {
  RobotsAndSitemapCoordinator
};
