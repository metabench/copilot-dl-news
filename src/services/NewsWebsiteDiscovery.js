/**
 * Automated News Website Discovery Service
 * 
 * Analyzes domains from crawl data and automatically registers qualifying domains
 * as news websites. Uses careful heuristics to avoid premature classification.
 */

const { evaluateDomainFromDb } = require('../is_this_a_news_website');

/**
 * Minimum thresholds for automatic registration
 * These ensure we have sufficient data before making a determination
 */
const DEFAULT_THRESHOLDS = {
  minArticleFetches: 20,        // At least 20 articles fetched
  minDistinctSections: 3,       // At least 3 different sections
  minScore: 0.5,                // Higher than default 0.4 threshold for confidence
  minUrlsAnalyzed: 30,          // At least 30 URLs analyzed
  minDatedUrlRatio: 0.1         // At least 10% have date patterns
};

class NewsWebsiteDiscovery {
  constructor(db, options = {}) {
    this.db = db;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.logger = options.logger || console;
    this.dryRun = options.dryRun || false;
  }

  /**
   * Analyze a single domain and determine if it qualifies as a news website
   * @param {string} host - Domain to analyze
   * @returns {Object|null} - Analysis result or null if doesn't qualify
   */
  analyzeDomain(host) {
    try {
      const { analysis, metrics } = evaluateDomainFromDb(this.db, host);
      
      // Check minimum data requirements
      if (metrics.articleFetches < this.thresholds.minArticleFetches) {
        return null; // Not enough data yet
      }

      // Check if score meets threshold
      if (analysis.score < this.thresholds.minScore) {
        return null; // Doesn't qualify as news site
      }

      // Check secondary requirements
      if (metrics.distinctSections < this.thresholds.minDistinctSections) {
        return null; // Not enough diversity
      }

      if (metrics.datedUrlRatio < this.thresholds.minDatedUrlRatio) {
        return null; // Not enough date-based URLs
      }

      // Determine website type based on URL structure
      const websiteType = this.determineWebsiteType(host);
      const parentDomain = this.extractParentDomain(host);

      return {
        host,
        score: analysis.score,
        metrics,
        websiteType,
        parentDomain,
        confidence: this.calculateConfidence(metrics)
      };
    } catch (error) {
      this.logger.error(`[NewsWebsiteDiscovery] Error analyzing ${host}:`, error.message);
      return null;
    }
  }

  /**
   * Determine if domain is subdomain, path-based, or full domain
   * @param {string} host
   * @returns {string} - 'subdomain', 'path', or 'domain'
   */
  determineWebsiteType(host) {
    // Check if it's a subdomain (e.g., news.sky.com)
    const parts = host.split('.');
    if (parts.length > 2) {
      const subdomain = parts[0].toLowerCase();
      // Common news subdomains
      if (['news', 'www', 'm', 'mobile', 'en'].includes(subdomain)) {
        return 'subdomain';
      }
    }

    // For path-based detection, we'd need to analyze URLs
    // This is simplified - could be enhanced based on URL patterns
    const hasNewsPath = this.checkForNewsPath(host);
    if (hasNewsPath) {
      return 'path';
    }

    return 'domain';
  }

  /**
   * Check if domain has path-based news sections
   * @param {string} host
   * @returns {boolean}
   */
  checkForNewsPath(host) {
    try {
      const pats = [
        `http://${host}/news%`,
        `https://${host}/news%`,
        `http://www.${host}/news%`,
        `https://www.${host}/news%`
      ];
      const likeClause = pats.map(() => 'url LIKE ?').join(' OR ');
      
      const result = this.db.db.prepare(
        `SELECT COUNT(*) as count FROM articles WHERE (${likeClause})`
      ).get(...pats);

      return (result?.count || 0) > 5; // At least 5 articles in /news path
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract parent domain (remove subdomain)
   * @param {string} host
   * @returns {string}
   */
  extractParentDomain(host) {
    const parts = host.split('.');
    if (parts.length <= 2) {
      return host; // Already a base domain
    }
    // Return last two parts (domain.tld)
    return parts.slice(-2).join('.');
  }

  /**
   * Calculate confidence score based on data quantity
   * @param {Object} metrics
   * @returns {string} - 'high', 'medium', or 'low'
   */
  calculateConfidence(metrics) {
    if (metrics.articleFetches >= 100 && metrics.distinctSections >= 10) {
      return 'high';
    }
    if (metrics.articleFetches >= 50 && metrics.distinctSections >= 5) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Scan all domains in database and discover news websites
   * @param {Object} options
   * @param {number} [options.limit] - Max domains to check
   * @param {string[]} [options.excludeHosts] - Domains to skip
   * @returns {Object} - Discovery results
   */
  async discoverNewsWebsites(options = {}) {
    const limit = options.limit || 100;
    const excludeHosts = new Set(options.excludeHosts || []);

    this.logger.log('[NewsWebsiteDiscovery] Starting discovery scan...');

    try {
      // Get domains with most activity
      const domains = this.db.db.prepare(`
        SELECT host, COUNT(*) as url_count
        FROM urls
        WHERE host IS NOT NULL AND host != ''
        GROUP BY host
        HAVING url_count >= ?
        ORDER BY url_count DESC
        LIMIT ?
      `).all(this.thresholds.minUrlsAnalyzed, limit);

      this.logger.log(`[NewsWebsiteDiscovery] Analyzing ${domains.length} domains...`);

      const discovered = [];
      const skipped = [];
      const alreadyRegistered = [];

      // Get already registered websites
      const existing = this.db.getNewsWebsites(false); // Include disabled
      const existingHosts = new Set(existing.map(w => {
        try {
          const url = new URL(w.url);
          return url.hostname;
        } catch {
          return null;
        }
      }).filter(Boolean));

      for (const { host, url_count } of domains) {
        // Skip excluded hosts
        if (excludeHosts.has(host)) {
          skipped.push({ host, reason: 'excluded' });
          continue;
        }

        // Skip already registered
        if (existingHosts.has(host)) {
          alreadyRegistered.push({ host, url_count });
          continue;
        }

        // Analyze domain
        const analysis = this.analyzeDomain(host);
        if (analysis) {
          discovered.push({
            ...analysis,
            url_count
          });
        } else {
          skipped.push({ host, reason: 'below_threshold' });
        }
      }

      this.logger.log(`[NewsWebsiteDiscovery] Discovery complete:`);
      this.logger.log(`  - Discovered: ${discovered.length} new news websites`);
      this.logger.log(`  - Already registered: ${alreadyRegistered.length}`);
      this.logger.log(`  - Skipped: ${skipped.length}`);

      return {
        discovered,
        alreadyRegistered,
        skipped,
        summary: {
          total_analyzed: domains.length,
          new_websites: discovered.length,
          already_registered: alreadyRegistered.length,
          skipped: skipped.length
        }
      };
    } catch (error) {
      this.logger.error('[NewsWebsiteDiscovery] Discovery failed:', error);
      throw error;
    }
  }

  /**
   * Register discovered news websites in the database
   * @param {Array} discovered - Discovered websites from discoverNewsWebsites()
   * @returns {Object} - Registration results
   */
  async registerDiscovered(discovered) {
    if (this.dryRun) {
      this.logger.log('[NewsWebsiteDiscovery] DRY RUN - would register:', discovered.length);
      return { registered: 0, failed: 0, dryRun: true };
    }

    const registered = [];
    const failed = [];

    for (const site of discovered) {
      try {
        const url = site.websiteType === 'path'
          ? `https://${site.host}/news`
          : `https://${site.host}/`;

        const urlPattern = url.endsWith('/') ? url + '%' : url + '%';

        const id = this.db.addNewsWebsite({
          url,
          label: this.generateLabel(site.host),
          parent_domain: site.parentDomain,
          url_pattern: urlPattern,
          website_type: site.websiteType,
          added_by: 'auto-discovery',
          metadata: JSON.stringify({
            discovery_date: new Date().toISOString(),
            score: site.score,
            confidence: site.confidence,
            metrics: site.metrics
          })
        });

        registered.push({ ...site, id });
        this.logger.log(`[NewsWebsiteDiscovery] Registered: ${site.host} (ID: ${id}, confidence: ${site.confidence})`);
      } catch (error) {
        failed.push({ ...site, error: error.message });
        this.logger.error(`[NewsWebsiteDiscovery] Failed to register ${site.host}:`, error.message);
      }
    }

    this.logger.log(`[NewsWebsiteDiscovery] Registration complete: ${registered.length} registered, ${failed.length} failed`);

    return {
      registered,
      failed,
      summary: {
        total: discovered.length,
        successful: registered.length,
        failed: failed.length
      }
    };
  }

  /**
   * Generate a label for a domain
   * @param {string} host
   * @returns {string}
   */
  generateLabel(host) {
    // Remove www and convert to title case
    const cleaned = host.replace(/^www\./, '');
    const parts = cleaned.split('.');
    const domain = parts[0];
    
    // Capitalize first letter of each word
    return domain
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Run full discovery and registration process
   * @param {Object} options
   * @returns {Object} - Combined results
   */
  async run(options = {}) {
    const discoveryResults = await this.discoverNewsWebsites(options);
    
    if (discoveryResults.discovered.length === 0) {
      this.logger.log('[NewsWebsiteDiscovery] No new news websites discovered');
      return {
        discovery: discoveryResults,
        registration: { registered: [], failed: [], summary: { total: 0, successful: 0, failed: 0 } }
      };
    }

    const registrationResults = await this.registerDiscovered(discoveryResults.discovered);

    return {
      discovery: discoveryResults,
      registration: registrationResults
    };
  }
}

module.exports = { NewsWebsiteDiscovery, DEFAULT_THRESHOLDS };
