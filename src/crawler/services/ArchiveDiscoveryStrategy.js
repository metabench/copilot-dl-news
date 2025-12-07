'use strict';

const { URL } = require('url');
const EventEmitter = require('events');

/**
 * ArchiveDiscoveryStrategy - Finds and traverses /archive, /sitemap, and calendar-based navigation.
 * 
 * This strategy is triggered when:
 * - The pending queue drops below a threshold (queue exhaustion)
 * - Periodically per domain (e.g., once per day)
 * 
 * Pattern categories:
 * 1. Standard paths: /archive, /sitemap, /sitemap.xml, /robots.txt
 * 2. Date patterns: /2025/, /2025/12/, /news/2025/
 * 3. Category archives: /category/{section}/archive, /section/{name}/archive
 * 
 * @extends EventEmitter
 */
class ArchiveDiscoveryStrategy extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} [options.telemetry] - Telemetry emitter
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.queueThreshold=10] - Trigger discovery when queue drops below this
   * @param {number} [options.discoveryIntervalMs=86400000] - Minimum time between discoveries per domain (24h)
   * @param {number} [options.maxYearsBack=2] - How many years back to generate date patterns
   */
  constructor(options = {}) {
    super();
    
    this.telemetry = options.telemetry || null;
    this.logger = options.logger || console;
    this.queueThreshold = options.queueThreshold ?? 10;
    this.discoveryIntervalMs = options.discoveryIntervalMs ?? 24 * 60 * 60 * 1000;
    this.maxYearsBack = options.maxYearsBack ?? 2;
    
    // Track last discovery per domain
    this._lastDiscovery = new Map();
    
    // Known archive paths to check
    this._standardPaths = [
      '/archive',
      '/archives',
      '/sitemap',
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/news-sitemap.xml',
      '/post-sitemap.xml',
      '/robots.txt',
      '/all',
      '/all-news',
      '/all-articles'
    ];
    
    // Section-based archive patterns
    this._sectionPatterns = [
      '/news/archive',
      '/articles/archive',
      '/stories/archive',
      '/blog/archive'
    ];
    
    // Statistics
    this._stats = {
      discoveries: 0,
      urlsGenerated: 0,
      urlsNew: 0,
      urlsDuplicate: 0
    };
  }

  /**
   * Check if archive discovery should be triggered.
   * 
   * @param {string} domain - The domain to check
   * @param {number} queueSize - Current queue size for the domain
   * @returns {{ shouldDiscover: boolean, reason: string }}
   */
  shouldTrigger(domain, queueSize) {
    // Check queue exhaustion
    if (queueSize <= this.queueThreshold) {
      const lastTime = this._lastDiscovery.get(domain) || 0;
      const elapsed = Date.now() - lastTime;
      
      if (elapsed >= this.discoveryIntervalMs) {
        return { shouldDiscover: true, reason: 'queue-exhausted' };
      }
      return { 
        shouldDiscover: false, 
        reason: 'cooldown',
        remainingMs: this.discoveryIntervalMs - elapsed
      };
    }
    
    return { shouldDiscover: false, reason: 'queue-sufficient' };
  }

  /**
   * Generate archive candidate URLs for a domain.
   * 
   * @param {string} baseUrl - The base URL of the domain (e.g., https://example.com)
   * @param {Object} [options] - Options
   * @param {Set<string>} [options.knownUrls] - Set of already known URLs to avoid duplicates
   * @param {string[]} [options.knownSections] - Known section paths from previous crawls
   * @returns {Array<{ url: string, type: string, priority: string }>}
   */
  generateCandidates(baseUrl, options = {}) {
    const knownUrls = options.knownUrls || new Set();
    const knownSections = options.knownSections || [];
    const candidates = [];
    
    let parsedBase;
    try {
      parsedBase = new URL(baseUrl);
    } catch (e) {
      this.logger.warn?.(`[ArchiveDiscovery] Invalid base URL: ${baseUrl}`);
      return candidates;
    }
    
    const domain = parsedBase.hostname;
    const origin = parsedBase.origin;
    
    // 1. Standard archive paths
    for (const path of this._standardPaths) {
      const url = `${origin}${path}`;
      if (!knownUrls.has(url)) {
        candidates.push({
          url,
          type: 'archive-standard',
          priority: 'discovery'
        });
      }
    }
    
    // 2. Section-based archives
    for (const pattern of this._sectionPatterns) {
      const url = `${origin}${pattern}`;
      if (!knownUrls.has(url)) {
        candidates.push({
          url,
          type: 'archive-section',
          priority: 'discovery'
        });
      }
    }
    
    // 3. Generate archives for known sections
    for (const section of knownSections) {
      const archiveUrl = `${origin}${section}/archive`;
      if (!knownUrls.has(archiveUrl)) {
        candidates.push({
          url: archiveUrl,
          type: 'archive-custom-section',
          priority: 'discovery'
        });
      }
    }
    
    // 4. Date-based patterns
    const datePatterns = this._generateDatePatterns(origin, knownUrls);
    candidates.push(...datePatterns);
    
    this._stats.urlsGenerated += candidates.length;
    
    return candidates;
  }

  /**
   * Generate date-based archive patterns.
   * 
   * @private
   * @param {string} origin - Origin URL
   * @param {Set<string>} knownUrls - Known URLs
   * @returns {Array<{ url: string, type: string, priority: string }>}
   */
  _generateDatePatterns(origin, knownUrls) {
    const candidates = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // Common date path prefixes
    const prefixes = ['', '/news', '/articles', '/archive'];
    
    for (let yearOffset = 0; yearOffset <= this.maxYearsBack; yearOffset++) {
      const year = currentYear - yearOffset;
      
      for (const prefix of prefixes) {
        // Yearly archives
        const yearUrl = `${origin}${prefix}/${year}/`;
        if (!knownUrls.has(yearUrl)) {
          candidates.push({
            url: yearUrl,
            type: 'archive-year',
            priority: 'discovery'
          });
        }
        
        // Monthly archives for current year only (to limit URL explosion)
        if (yearOffset === 0) {
          for (let month = currentMonth; month >= 1; month--) {
            const monthStr = month.toString().padStart(2, '0');
            const monthUrl = `${origin}${prefix}/${year}/${monthStr}/`;
            if (!knownUrls.has(monthUrl)) {
              candidates.push({
                url: monthUrl,
                type: 'archive-month',
                priority: 'discovery'
              });
            }
          }
        }
      }
    }
    
    return candidates;
  }

  /**
   * Execute archive discovery for a domain.
   * 
   * @param {string} baseUrl - Base URL
   * @param {Object} context - Discovery context
   * @param {Set<string>} context.knownUrls - Set of known URLs
   * @param {Function} context.checkExists - Function to check if URL exists in DB
   * @param {Function} context.enqueue - Function to enqueue discovered URLs
   * @returns {Promise<{ discovered: number, queued: number, duplicates: number }>}
   */
  async discover(baseUrl, context) {
    const { knownUrls, checkExists, enqueue, knownSections } = context;
    
    let parsedBase;
    try {
      parsedBase = new URL(baseUrl);
    } catch (e) {
      return { discovered: 0, queued: 0, duplicates: 0, error: 'invalid-url' };
    }
    
    const domain = parsedBase.hostname;
    
    // Record discovery attempt
    this._lastDiscovery.set(domain, Date.now());
    this._stats.discoveries++;
    
    // Generate candidates
    const candidates = this.generateCandidates(baseUrl, { knownUrls, knownSections });
    
    let queued = 0;
    let duplicates = 0;
    
    for (const candidate of candidates) {
      // Check if URL already exists in database
      const exists = checkExists ? await checkExists(candidate.url) : knownUrls.has(candidate.url);
      
      if (exists) {
        duplicates++;
        this._stats.urlsDuplicate++;
        continue;
      }
      
      // Enqueue for crawling
      if (enqueue) {
        try {
          await enqueue({
            url: candidate.url,
            type: candidate.type,
            priority: candidate.priority,
            depth: 1, // Discovery URLs start at depth 1
            source: 'archive-discovery'
          });
          queued++;
          this._stats.urlsNew++;
        } catch (e) {
          this.logger.warn?.(`[ArchiveDiscovery] Failed to enqueue ${candidate.url}: ${e.message}`);
        }
      } else {
        queued++;
        this._stats.urlsNew++;
      }
    }
    
    this.emit('discovery', {
      domain,
      discovered: candidates.length,
      queued,
      duplicates
    });
    
    if (this.telemetry?.milestone) {
      this.telemetry.milestone({
        kind: 'archive-discovery',
        message: `Archive discovery: ${queued} new URLs queued for ${domain}`,
        details: { domain, queued, duplicates, candidates: candidates.length }
      });
    }
    
    return { discovered: candidates.length, queued, duplicates };
  }

  /**
   * Parse a sitemap and extract URLs.
   * 
   * @param {string} sitemapXml - Sitemap XML content
   * @param {string} [sitemapUrl] - URL of the sitemap (for resolving nested sitemaps)
   * @returns {{ urls: string[], nestedSitemaps: string[] }}
   */
  parseSitemap(sitemapXml, sitemapUrl = null) {
    const urls = [];
    const nestedSitemaps = [];
    
    // Simple regex-based parsing (more robust than DOM parsing for this purpose)
    // Match <loc> tags
    const locPattern = /<loc>\s*(.*?)\s*<\/loc>/gi;
    let match;
    
    while ((match = locPattern.exec(sitemapXml)) !== null) {
      const url = match[1].trim();
      if (url) {
        // Check if it's a nested sitemap
        if (url.endsWith('.xml') || url.includes('sitemap')) {
          nestedSitemaps.push(url);
        } else {
          urls.push(url);
        }
      }
    }
    
    return { urls, nestedSitemaps };
  }

  /**
   * Get discovery statistics.
   * 
   * @returns {Object}
   */
  getStats() {
    return { ...this._stats };
  }

  /**
   * Reset statistics and discovery timestamps.
   */
  reset() {
    this._lastDiscovery.clear();
    this._stats = {
      discoveries: 0,
      urlsGenerated: 0,
      urlsNew: 0,
      urlsDuplicate: 0
    };
  }

  /**
   * Check if a domain has been discovered recently.
   * 
   * @param {string} domain - Domain to check
   * @returns {{ discovered: boolean, lastDiscoveryAt: number|null, elapsedMs: number|null }}
   */
  getDomainStatus(domain) {
    const lastTime = this._lastDiscovery.get(domain);
    if (!lastTime) {
      return { discovered: false, lastDiscoveryAt: null, elapsedMs: null };
    }
    return {
      discovered: true,
      lastDiscoveryAt: lastTime,
      elapsedMs: Date.now() - lastTime
    };
  }
}

module.exports = { ArchiveDiscoveryStrategy };
