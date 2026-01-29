'use strict';

const { isTotalPrioritisationEnabled } = require('../../../shared/utils/priorityConfig');

/**
 * GazetteerAwareReasonerPlugin: Uses gazetteer data to propose country hub URLs for intelligent crawls.
 * 
 * Purpose:
 * - Queries gazetteer database for known countries
 * - Generates country hub URL predictions for the target domain
 * - Prioritizes countries based on importance (population, common in news)
 * - Integrates with CountryHubGapService for pattern learning
 * 
 * This plugin is for INTELLIGENT CRAWLS (web crawling), NOT gazetteer crawls.
 * It helps intelligent crawls discover country-specific sections on news websites.
 * 
 * Example predictions:
 * - https://www.theguardian.com/world/france
 * - https://www.theguardian.com/world/germany
 * - https://www.bbc.com/news/world-asia-china
 * 
 * Integration with PlannerHost:
 * - init(): Query gazetteer database for top countries
 * - tick(): Generate country hub URL predictions
 * - teardown(): No cleanup needed
 * 
 * Blackboard outputs:
 * - ctx.bb.proposedHubs: Array of predicted country hub URLs
 * - ctx.bb.gazetteerCountries: List of countries considered
 * - ctx.bb.rationale: Explanation of gazetteer-based proposals
 */
class GazetteerAwareReasonerPlugin {
  constructor({ 
    priority = 75,
    maxCountryProposals = 30,
    countryHubGapService = null 
  } = {}) {
    this.pluginId = 'GazetteerAwareReasonerPlugin';
    this.priority = priority; // Lower than GraphReasonerPlugin (80)
    this.maxCountryProposals = maxCountryProposals;
    this.countryHubGapService = countryHubGapService;
    this._initialized = false;
    this._done = false;
    this._topCountries = [];
  }

  async init(ctx) {
    this._initialized = true;
    this._done = false;

    // Initialize blackboard structures
    if (!ctx.bb.proposedHubs) {
      ctx.bb.proposedHubs = [];
    }
    if (!ctx.bb.gazetteerCountries) {
      ctx.bb.gazetteerCountries = [];
    }
    if (!ctx.bb.rationale) {
      ctx.bb.rationale = [];
    }

    // Query gazetteer for top countries
    await this._loadTopCountries(ctx);

    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'init',
      message: `GazetteerAwareReasonerPlugin initialized with ${this._topCountries.length} countries`,
      data: { countryCount: this._topCountries.length }
    });
  }

  async tick(ctx) {
    if (this._done) {
      return true;
    }

    try {
      const { baseUrl, domain } = ctx.options;
      const proposals = [];

      // Generate country hub URL predictions
      for (const country of this._topCountries) {
        const countryHubUrls = this._predictCountryHubUrls(baseUrl, domain, country);
        
        for (const hubUrl of countryHubUrls) {
          proposals.push({
            url: hubUrl,
            source: 'gazetteer-aware-reasoner',
            kind: 'country',
            countryCode: country.code,
            countryName: country.name,
            confidence: this._calculateConfidence(country, domain),
            reason: `Predicted country hub for ${country.name} based on gazetteer`,
            estimatedDiscoveriesPerHub: 50,
            priority: this._calculatePriority(country),
            isCountryHub: true  // Metadata for special processing
          });
        }
      }

      // Add proposals to blackboard
      ctx.bb.proposedHubs.push(...proposals);
      ctx.bb.gazetteerCountries = this._topCountries.map(c => ({
        name: c.name,
        code: c.code,
        importance: c.importance
      }));

      // Add rationale
      ctx.bb.rationale.push(
        `Gazetteer-aware reasoning proposed ${proposals.length} country hub(s) from ${this._topCountries.length} known countries`
      );

      ctx.emit('gofai-trace', {
        pluginId: this.pluginId,
        stage: 'tick',
        message: `Proposed ${proposals.length} gazetteer-based country hub(s)`,
        data: { 
          hubCount: proposals.length, 
          countryCount: this._topCountries.length,
          domain 
        }
      });

      this._done = true;
      return true; // Done in one tick
    } catch (err) {
      ctx.logger.error('[GazetteerAwareReasonerPlugin] Error during tick:', err.message);
      ctx.bb.rationale.push(`Gazetteer-aware reasoning failed: ${err.message}`);
      this._done = true;
      return true;
    }
  }

  async teardown(ctx) {
    ctx.emit('gofai-trace', {
      pluginId: this.pluginId,
      stage: 'teardown',
      message: 'GazetteerAwareReasonerPlugin teardown complete'
    });
  }

  // Private methods

  async _loadTopCountries(ctx) {
    const { dbAdapter } = ctx;
    
    if (!dbAdapter || typeof dbAdapter.db !== 'object') {
      ctx.logger.warn('[GazetteerAwareReasonerPlugin] No database adapter available, using default countries');
      this._topCountries = this._getDefaultCountries();
      return;
    }

    try {
      // Query places table for countries with highest importance
      const countries = dbAdapter.db.prepare(`
        SELECT 
          name,
          country_code as code,
          COALESCE(importance, 0) as importance,
          wikidata_qid
        FROM places
        WHERE kind = 'country'
          AND name IS NOT NULL
          AND country_code IS NOT NULL
        ORDER BY importance DESC, name ASC
        LIMIT 50
      `).all(this.maxCountryProposals);

      if (countries && countries.length > 0) {
        this._topCountries = countries.map(row => ({
          name: row.name,
          code: row.code,
          importance: row.importance || 0,
          wikidataQid: row.wikidata_qid
        }));
        ctx.logger.info(`[GazetteerAwareReasonerPlugin] Loaded ${this._topCountries.length} countries from gazetteer`);
      } else {
        ctx.logger.warn('[GazetteerAwareReasonerPlugin] No countries found in gazetteer, using defaults');
        this._topCountries = this._getDefaultCountries();
      }
    } catch (err) {
      ctx.logger.error('[GazetteerAwareReasonerPlugin] Error loading countries from gazetteer:', err.message);
      this._topCountries = this._getDefaultCountries();
    }
  }

  _getDefaultCountries() {
    // Fallback list of important countries for news websites
    return [
      { name: 'United States', code: 'US', importance: 100 },
      { name: 'United Kingdom', code: 'GB', importance: 90 },
      { name: 'China', code: 'CN', importance: 85 },
      { name: 'India', code: 'IN', importance: 80 },
      { name: 'Germany', code: 'DE', importance: 75 },
      { name: 'France', code: 'FR', importance: 75 },
      { name: 'Japan', code: 'JP', importance: 70 },
      { name: 'Canada', code: 'CA', importance: 70 },
      { name: 'Australia', code: 'AU', importance: 70 },
      { name: 'Brazil', code: 'BR', importance: 65 },
      { name: 'Russia', code: 'RU', importance: 65 },
      { name: 'Italy', code: 'IT', importance: 60 },
      { name: 'Spain', code: 'ES', importance: 60 },
      { name: 'Mexico', code: 'MX', importance: 55 },
      { name: 'South Korea', code: 'KR', importance: 55 }
    ];
  }

  _predictCountryHubUrls(baseUrl, domain, country) {
    const urls = [];
    const countrySlug = this._generateCountrySlug(country.name);
    const countryCodeLower = country.code.toLowerCase();
    
    // Common URL patterns for country hubs on news websites
    const patterns = [
      // Pattern 1: /world/{country-name}
      `/world/${countrySlug}`,
      // Pattern 2: /news/world/{country-name}
      `/news/world/${countrySlug}`,
      // Pattern 3: /world/{country-code}
      `/world/${countryCodeLower}`,
      // Pattern 4: /news/{country-code}
      `/news/${countryCodeLower}`,
      // Pattern 5: /{country-name}
      `/${countrySlug}`,
      // Pattern 6: /international/{country-name}
      `/international/${countrySlug}`,
      // Pattern 7: /news/world-{region}-{country} (e.g., world-asia-china)
      `/news/world-${this._getRegion(country.code)}-${countrySlug}`
    ];

    // If CountryHubGapService is available, use learned patterns
    if (this.countryHubGapService && typeof this.countryHubGapService.predictCountryHubUrls === 'function') {
      try {
        const learnedUrls = this.countryHubGapService.predictCountryHubUrls(domain, country.name, country.code);
        if (learnedUrls && learnedUrls.length > 0) {
          urls.push(...learnedUrls);
          return urls; // Use learned patterns if available
        }
      } catch (err) {
        // Fall through to default patterns
      }
    }

    // Generate URLs from patterns
    for (const pattern of patterns) {
      try {
        const url = new URL(pattern, baseUrl).href;
        urls.push(url);
      } catch (err) {
        // Skip invalid URLs
      }
    }

    // Limit to top 2 most likely patterns per country
    return urls.slice(0, 2);
  }

  _generateCountrySlug(countryName) {
    return String(countryName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  _getRegion(countryCode) {
    // Simplified region mapping for URL generation
    const regionMap = {
      'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia',
      'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe', 'RU': 'europe',
      'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas',
      'AU': 'oceania'
    };
    return regionMap[countryCode] || 'international';
  }

  _calculateConfidence(country, domain) {
    // Higher importance = higher confidence
    // Range: 0.4 to 0.8
    const importanceNormalized = Math.min(country.importance / 100, 1.0);
    return 0.4 + (importanceNormalized * 0.4);
  }

  _calculatePriority(country) {
    // Check if total prioritisation mode is enabled
    if (this._isTotalPrioritisationEnabled()) {
      return 100; // Maximum priority for total prioritisation mode
    }

    // Use high fixed priority for country hubs instead of importance-based calculation
    // This corresponds to the country-hub-discovery bonus (35)
    return 35;
  }

  _isTotalPrioritisationEnabled() {
    return isTotalPrioritisationEnabled();
  }
}

module.exports = { GazetteerAwareReasonerPlugin };
