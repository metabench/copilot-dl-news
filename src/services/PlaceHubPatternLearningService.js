'use strict';

/**
 * PlaceHubPatternLearningService - Learns URL patterns from verified place hubs
 * 
 * This service analyzes verified place hubs to:
 * 1. Extract URL structural patterns specific to place hubs
 * 2. Identify common path segments indicating place pages
 * 3. Build domain-specific place hub profiles
 * 4. Enable prediction of new place hubs during crawling
 * 
 * Pattern Types:
 * - path: Full path patterns like "/news/local/{place}"
 * - segment: Path segments like "/places/", "/location/"
 * - depth: URL depth patterns (place hubs often at depth 2-3)
 */

const { URL } = require('url');
const { createPlaceHubUrlPatternsStore } = require('../data/db/placeHubUrlPatternsStore');
const { getDb } = require('../data/db');

// Common place hub URL indicators
const PLACE_HUB_INDICATORS = [
  'places', 'locations', 'local', 'region', 'regions', 'city', 'cities',
  'country', 'countries', 'town', 'towns', 'area', 'areas', 'district',
  'state', 'states', 'province', 'county', 'counties', 'world', 'uk', 'us',
  'europe', 'asia', 'africa', 'americas', 'australia', 'news'
];

// Patterns that indicate NOT a place hub (exclusions)
const NON_PLACE_INDICATORS = [
  'article', 'story', 'post', 'comment', 'author', 'about', 'contact',
  'search', 'login', 'signup', 'register', 'account', 'profile', 'settings',
  'terms', 'privacy', 'help', 'faq', 'api', 'feed', 'rss', 'tag', 'tags'
];

class PlaceHubPatternLearningService {
  /**
   * @param {Object} options
   * @param {Database} options.db - Database instance
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Configuration options
   */
  constructor({ db, logger = console, config = {} } = {}) {
    this.db = db;
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    if (!this.db) {
      throw new Error('PlaceHubPatternLearningService requires db instance');
    }

    this.logger = logger;
    this.config = {
      minSampleSize: config.minSampleSize || 3,
      minAccuracy: config.minAccuracy || 0.5,
      maxPatternAge: config.maxPatternAge || 30 * 24 * 60 * 60 * 1000,
      maxExampleUrls: config.maxExampleUrls || 5,
      ...config
    };

    this.store = createPlaceHubUrlPatternsStore(this.db);
    this._preparedStatements = null;
  }

  /**
   * Get or create prepared statements for querying verified place hubs
   */
  _getStatements() {
    if (this._preparedStatements) {
      return this._preparedStatements;
    }

    this._preparedStatements = {
      // Get verified place hubs for a domain
      getVerifiedPlaceHubs: this.db.prepare(`
        SELECT 
          ph.id,
          ph.host,
          u.url,
          ph.place_slug,
          ph.place_kind,
          ph.title,
          ph.nav_links_count,
          ph.article_links_count,
          ph.first_seen_at,
          ph.last_seen_at
        FROM place_hubs ph
        JOIN urls u ON ph.url_id = u.id
        WHERE ph.host = ?
        ORDER BY ph.last_seen_at DESC
      `),

      // Get verified place hub candidates for a domain
      getVerifiedCandidates: this.db.prepare(`
        SELECT 
          id,
          domain,
          candidate_url,
          place_kind,
          place_name,
          pattern,
          validation_status,
          created_at
        FROM place_hub_candidates
        WHERE domain = ?
          AND validation_status = 'valid'
        ORDER BY created_at DESC
      `),

      // Get all domains with verified place hubs
      getDomainsWithPlaceHubs: this.db.prepare(`
        SELECT DISTINCT host, COUNT(*) as hub_count
        FROM place_hubs
        GROUP BY host
        HAVING COUNT(*) >= ?
        ORDER BY COUNT(*) DESC
      `),

      // Get place page mappings for pattern learning
      getPlacePageMappings: this.db.prepare(`
        SELECT 
          host,
          page_url,
          place_slug,
          page_kind,
          status,
          verification_reason
        FROM place_page_mappings
        WHERE host = ?
          AND status = 'verified'
          AND page_kind IN ('country-hub', 'region-hub', 'city-hub', 'state-hub', 'area-hub')
        ORDER BY created_at DESC
      `)
    };

    return this._preparedStatements;
  }

  /**
   * Learn patterns from all verified place hubs for a domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Learning results
   */
  learnPatternsFromDomain(domain) {
    if (!domain) {
      return { domain: null, error: 'Domain required' };
    }

    const stmts = this._getStatements();
    const normalizedDomain = domain.toLowerCase().trim();

    // Gather verified place hub URLs from multiple sources
    const placeHubs = stmts.getVerifiedPlaceHubs.all(normalizedDomain);
    const verifiedCandidates = stmts.getVerifiedCandidates.all(normalizedDomain);
    
    let placePageMappings = [];
    try {
      placePageMappings = stmts.getPlacePageMappings.all(normalizedDomain);
    } catch (_) {
      // Table might not exist
    }

    // Collect all verified place hub URLs
    const hubUrls = [];
    
    for (const hub of placeHubs) {
      if (hub.url) {
        hubUrls.push({
          url: hub.url,
          placeKind: hub.place_kind,
          placeSlug: hub.place_slug,
          source: 'place_hubs'
        });
      }
    }

    for (const candidate of verifiedCandidates) {
      if (candidate.candidate_url) {
        hubUrls.push({
          url: candidate.candidate_url,
          placeKind: candidate.place_kind,
          placeSlug: candidate.place_name,
          source: 'place_hub_candidates'
        });
      }
    }

    for (const mapping of placePageMappings) {
      if (mapping.page_url) {
        hubUrls.push({
          url: mapping.page_url,
          placeKind: mapping.page_kind,
          placeSlug: mapping.place_slug,
          source: 'place_page_mappings'
        });
      }
    }

    if (hubUrls.length < this.config.minSampleSize) {
      return {
        domain: normalizedDomain,
        urlCount: hubUrls.length,
        patternsLearned: 0,
        message: `Insufficient verified place hubs (need ${this.config.minSampleSize})`
      };
    }

    // Extract and save patterns
    const patterns = this._extractPatterns(normalizedDomain, hubUrls);
    let patternsLearned = 0;

    for (const pattern of patterns) {
      if (pattern.sampleCount >= this.config.minSampleSize) {
        this.store.savePattern(pattern);
        patternsLearned++;
      }
    }

    // Clean up stale patterns
    this.store.deleteStalePatterns(normalizedDomain, {
      minAccuracy: this.config.minAccuracy,
      maxAgeMs: this.config.maxPatternAge
    });

    return {
      domain: normalizedDomain,
      urlCount: hubUrls.length,
      patternsLearned,
      patterns: patterns.slice(0, 10) // Return top 10 for inspection
    };
  }

  /**
   * Learn patterns from all domains with verified place hubs
   * @param {Object} options - Options
   * @returns {Object} Learning results
   */
  learnFromAllDomains({ minHubs = 3 } = {}) {
    const stmts = this._getStatements();
    const domains = stmts.getDomainsWithPlaceHubs.all(minHubs);

    const results = {
      domainsProcessed: 0,
      totalPatternsLearned: 0,
      domainResults: []
    };

    for (const { host } of domains) {
      try {
        const result = this.learnPatternsFromDomain(host);
        results.domainsProcessed++;
        results.totalPatternsLearned += result.patternsLearned || 0;
        results.domainResults.push({
          domain: host,
          patternsLearned: result.patternsLearned,
          urlCount: result.urlCount
        });
      } catch (error) {
        this.logger.error(`Error learning patterns for ${host}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Extract URL patterns from a list of verified place hub URLs
   * @param {string} domain - Domain
   * @param {Array} hubUrls - Array of {url, placeKind, placeSlug} objects
   * @returns {Array} Extracted patterns
   */
  _extractPatterns(domain, hubUrls) {
    const patterns = [];
    const segmentCounts = new Map();
    const pathPatternCounts = new Map();
    const depthCounts = new Map();
    const placeKindSegments = new Map();

    for (const hubInfo of hubUrls) {
      const { url, placeKind, placeSlug } = hubInfo;
      
      try {
        const parsed = new URL(url);
        const pathParts = parsed.pathname.split('/').filter(p => p.length > 0);
        const depth = pathParts.length;

        // Count URL depth
        const depthKey = `depth:${depth}`;
        if (!depthCounts.has(depthKey)) {
          depthCounts.set(depthKey, { count: 0, urls: [], placeKinds: new Set() });
        }
        const depthInfo = depthCounts.get(depthKey);
        depthInfo.count++;
        if (depthInfo.urls.length < this.config.maxExampleUrls) {
          depthInfo.urls.push(url);
        }
        if (placeKind) depthInfo.placeKinds.add(placeKind);

        // Extract path segments
        for (let i = 0; i < pathParts.length; i++) {
          const segment = pathParts[i].toLowerCase();
          
          // Skip the place name itself (we want structural patterns)
          if (placeSlug && segment === placeSlug.toLowerCase().replace(/\s+/g, '-')) {
            continue;
          }

          // Count indicator segments
          if (PLACE_HUB_INDICATORS.includes(segment)) {
            const segmentKey = `/${segment}/`;
            if (!segmentCounts.has(segmentKey)) {
              segmentCounts.set(segmentKey, { count: 0, urls: [], placeKinds: new Set(), position: i });
            }
            const info = segmentCounts.get(segmentKey);
            info.count++;
            if (info.urls.length < this.config.maxExampleUrls) {
              info.urls.push(url);
            }
            if (placeKind) info.placeKinds.add(placeKind);
          }
        }

        // Build path pattern (replacing place name with placeholder)
        const pathPattern = this._buildPathPattern(pathParts, placeSlug);
        if (pathPattern) {
          if (!pathPatternCounts.has(pathPattern)) {
            pathPatternCounts.set(pathPattern, { count: 0, urls: [], placeKinds: new Set() });
          }
          const info = pathPatternCounts.get(pathPattern);
          info.count++;
          if (info.urls.length < this.config.maxExampleUrls) {
            info.urls.push(url);
          }
          if (placeKind) info.placeKinds.add(placeKind);
        }

      } catch (error) {
        this.logger.debug(`Error parsing URL ${url}:`, error.message);
      }
    }

    // Convert segment patterns
    for (const [segment, info] of segmentCounts) {
      if (info.count >= 2) {
        const placeKind = info.placeKinds.size === 1 ? Array.from(info.placeKinds)[0] : null;
        patterns.push({
          domain,
          patternType: 'segment',
          patternRegex: segment.replace(/\//g, '\\/'),
          patternDescription: `URL contains ${segment} segment`,
          placeKind,
          sampleCount: info.count,
          exampleUrls: info.urls
        });
      }
    }

    // Convert path patterns
    for (const [pathPattern, info] of pathPatternCounts) {
      if (info.count >= 2) {
        const placeKind = info.placeKinds.size === 1 ? Array.from(info.placeKinds)[0] : null;
        patterns.push({
          domain,
          patternType: 'path',
          patternRegex: pathPattern,
          patternDescription: `Path pattern matching place hub structure`,
          placeKind,
          sampleCount: info.count,
          exampleUrls: info.urls
        });
      }
    }

    // Convert depth patterns
    for (const [depthKey, info] of depthCounts) {
      const depth = parseInt(depthKey.split(':')[1], 10);
      if (info.count >= 3 && depth >= 1 && depth <= 4) {
        const placeKind = info.placeKinds.size === 1 ? Array.from(info.placeKinds)[0] : null;
        patterns.push({
          domain,
          patternType: 'depth',
          patternRegex: `^[^/]*(\\/[^/]+){${depth}}\\/?$`,
          patternDescription: `URL depth of ${depth} segments`,
          placeKind,
          sampleCount: info.count,
          exampleUrls: info.urls
        });
      }
    }

    // Sort by sample count descending
    patterns.sort((a, b) => b.sampleCount - a.sampleCount);

    return patterns;
  }

  /**
   * Build a regex pattern from path parts, replacing the place slug with a placeholder
   * @param {Array} pathParts - Path segments
   * @param {string} placeSlug - Place slug to replace
   * @returns {string|null} Regex pattern
   */
  _buildPathPattern(pathParts, placeSlug) {
    if (pathParts.length === 0) return null;

    const patternParts = pathParts.map(part => {
      const partLower = part.toLowerCase();
      const slugLower = placeSlug ? placeSlug.toLowerCase().replace(/\s+/g, '-') : null;

      // Replace place slug with wildcard pattern
      if (slugLower && partLower === slugLower) {
        return '[a-z0-9-]+';
      }

      // Keep indicator segments as literals
      if (PLACE_HUB_INDICATORS.includes(partLower)) {
        return partLower;
      }

      // Skip non-indicator, non-place segments
      return '[a-z0-9-]+';
    });

    // Only create pattern if there's at least one indicator segment
    const hasIndicator = pathParts.some(p => 
      PLACE_HUB_INDICATORS.includes(p.toLowerCase())
    );

    if (!hasIndicator && pathParts.length > 3) {
      return null;
    }

    return `^\\/${patternParts.join('\\/')}\\/?$`;
  }

  /**
   * Predict if a URL might be a place hub based on learned patterns
   * @param {string} url - URL to check
   * @param {string} domain - Domain (optional, will be extracted from URL)
   * @returns {Object} Prediction result
   */
  predictPlaceHub(url, domain = null) {
    if (!url) {
      return { isPlaceHub: false, confidence: 0, reason: 'No URL provided' };
    }

    try {
      const parsed = new URL(url);
      let targetDomain = domain || parsed.hostname.toLowerCase();
      // Strip www. for consistent matching
      if (targetDomain.startsWith('www.')) {
        targetDomain = targetDomain.slice(4);
      }

      // Check against learned patterns
      const matchResult = this.store.matchUrl(url, targetDomain);

      if (matchResult && matchResult.matched) {
        return {
          isPlaceHub: true,
          confidence: matchResult.confidence,
          placeKind: matchResult.placeKind,
          pattern: matchResult.pattern,
          reason: `Matched pattern: ${matchResult.pattern.pattern_description}`
        };
      }

      // Heuristic fallback: check for place hub indicators in URL
      const pathLower = parsed.pathname.toLowerCase();
      const hasIndicator = PLACE_HUB_INDICATORS.some(ind => pathLower.includes(`/${ind}/`));
      const hasNonIndicator = NON_PLACE_INDICATORS.some(ind => pathLower.includes(`/${ind}/`) || pathLower.includes(`/${ind}`));

      if (hasIndicator && !hasNonIndicator) {
        return {
          isPlaceHub: true,
          confidence: 0.4, // Lower confidence for heuristic match
          placeKind: null,
          pattern: null,
          reason: 'Heuristic: URL contains place hub indicators'
        };
      }

      return {
        isPlaceHub: false,
        confidence: 0,
        placeKind: null,
        pattern: null,
        reason: 'No matching patterns or indicators found'
      };

    } catch (error) {
      return {
        isPlaceHub: false,
        confidence: 0,
        reason: `Invalid URL: ${error.message}`
      };
    }
  }

  /**
   * Get the patterns store for direct access
   * @returns {Object} The patterns store
   */
  getStore() {
    return this.store;
  }

  /**
   * Analyze URLs from a crawl to identify potential place hubs
   * @param {Array} urls - Array of URLs discovered during crawling
   * @param {string} domain - Domain being crawled
   * @returns {Array} Potential place hub URLs with predictions
   */
  analyzeDiscoveredUrls(urls, domain) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return [];
    }

    const results = [];
    const normalizedDomain = domain ? domain.toLowerCase().trim() : null;

    for (const url of urls) {
      const prediction = this.predictPlaceHub(url, normalizedDomain);
      if (prediction.isPlaceHub && prediction.confidence >= 0.4) {
        results.push({
          url,
          ...prediction
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    return results;
  }

  /**
   * Update pattern accuracy based on validation result
   * @param {string} url - URL that was validated
   * @param {string} domain - Domain
   * @param {boolean} isPlaceHub - Whether URL is actually a place hub
   * @returns {number} Number of patterns updated
   */
  recordValidation(url, domain, isPlaceHub) {
    if (!url || !domain) return 0;

    const normalizedDomain = domain.toLowerCase().trim();
    const patterns = this.store.getPatternsForDomain(normalizedDomain);
    let updated = 0;

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern.pattern_regex);
        if (regex.test(url)) {
          this.store.updatePatternAccuracy({
            domain: normalizedDomain,
            patternType: pattern.pattern_type,
            patternRegex: pattern.pattern_regex,
            isCorrect: isPlaceHub
          });
          updated++;
        }
      } catch (_) {
        // Invalid regex, skip
      }
    }

    return updated;
  }
}

module.exports = {
  PlaceHubPatternLearningService,
  PLACE_HUB_INDICATORS,
  NON_PLACE_INDICATORS
};

