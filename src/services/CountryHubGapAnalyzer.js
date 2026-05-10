/**
 * CountryHubGapAnalyzer - Service for analyzing country hub coverage gaps
 * 
 * Extends HubGapAnalyzerBase to provide country-specific hub URL prediction
 * and gap analysis for news website coverage.
 * 
 * Provides gap analysis, predictions, and pattern learning for country-level place hubs.
 * Uses database query module for all SQL operations (no inline SQL).
 * Learns URL patterns from existing data via Domain-Specific Pattern Libraries (DSPLs).
 */

const { getAllCountries, getTopCountries, getCountryByName, getPlaceNameVariantsForHubDiscovery } = require('../data/db/sqlite/v1/queries/gazetteer.places');
const { getCountryHubCoverage } = require('../data/db/sqlite/v1/queries/placePageMappings');
const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');
const { getDsplForDomain } = require('./shared/dspl');
const { slugify, generateSlugVariants } = require('../tools/slugify');
const { PredictionStrategyManager } = require('./shared/PredictionStrategyManager');
const { UrlPatternGenerator } = require('./shared/UrlPatternGenerator');
const { PatternInferenceService } = require('news-db-pure-analysis');
const {
  listVerifiedPlacePageMappingUrls,
  listUrlsForHost,
  listCountryNamesForHubInference,
  listCountryRowsForHubDiscovery,
  getLatestHttpStatusForUrl
} = require('news-crawler-db');

const MAX_KNOWN_404_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class CountryHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({
    db,
    gazetteerData = null,
    logger = console,
    dsplDir
  } = {}) {
    super({ db, logger, dsplDir });

    this.gazetteerData = gazetteerData;

    // Cache for analysis results
    this.lastAnalysis = null;
    this.lastAnalysisTime = 0;
    this.analysisCacheMs = 5000;

    // Initialize prediction strategy manager
    this.predictionManager = new PredictionStrategyManager({
      db: this.db,
      dspls: this.dspls,
      entityType: 'country',
      buildMetadata: this.buildEntityMetadata.bind(this),
      logger: this.logger
    });

    this.maxKnown404AgeMs = MAX_KNOWN_404_AGE_MS;
    this._knownStatusCache = new Map();
    this._initLatestHttpStatusStatement();

    // Override the _getExistingMappings method for country-specific logic
    this.predictionManager._getExistingMappings = (domain) => {
      return listVerifiedPlacePageMappingUrls(this.db, domain, 'country-hub', { limit: 10 });
    };

  }

  getInferredPatterns(domain) {
    if (!this._inferredPatternsCache) this._inferredPatternsCache = new Map();
    if (this._inferredPatternsCache.has(domain)) {
      return this._inferredPatternsCache.get(domain);
    }

    try {
      const rows = listUrlsForHost(this.db, domain, { limit: 10000 });
      const paths = rows.map(r => {
        try { return new URL(r.url).pathname; } catch { return ''; }
      }).filter(Boolean);

      const countries = listCountryNamesForHubInference(this.db);
      const slugs = countries.map(c => c.title);

      const inferred = PatternInferenceService.inferCountryHubPatterns(paths, slugs);
      this._inferredPatternsCache.set(domain, inferred);
      return inferred;
    } catch (e) {
      if (this.logger && this.logger.warn) this.logger.warn(`Failed to infer patterns for ${domain}: ${e.message}`);
      this._inferredPatternsCache.set(domain, []);
      return [];
    }
  }

  /**
   * Discover country hubs from URLs already in the database — zero HTTP cost.
   * Cross-references existing URL paths against the gazetteer to find matches.
   * @param {string} domain - Target domain
   * @returns {Array<{path: string, country: {name: string, code: string, id: number}}>}
   */
  discoverHubsFromExistingUrls(domain) {
    try {
      // Get all short URLs (likely hubs) from the domain
      const rows = listUrlsForHost(this.db, domain, { limit: 20000 });

      const paths = rows.map(r => {
        try { return new URL(r.url).pathname; } catch { return ''; }
      }).filter(Boolean);

      // Build a slug -> country lookup from the gazetteer
      const countries = listCountryRowsForHubDiscovery(this.db);

      const slugMap = new Map();
      for (const c of countries) {
        const slug = String(c.title).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        slugMap.set(slug, { name: c.title, code: c.code, id: c.id });
        // Also add without hyphens for compact matches (e.g. 'saudiarabia')
        const compact = slug.replace(/-/g, '');
        if (compact !== slug) slugMap.set(compact, { name: c.title, code: c.code, id: c.id });
      }
      // Standard shortcodes
      const codeMap = new Map();
      for (const c of countries) {
        if (c.code) codeMap.set(c.code.toLowerCase(), { name: c.title, code: c.code, id: c.id });
      }
      // GB -> UK alias
      if (codeMap.has('gb')) slugMap.set('uk', codeMap.get('gb'));

      // Merge code map into slug map
      for (const [k, v] of codeMap) slugMap.set(k, v);

      return PatternInferenceService.discoverHubsFromPaths(paths, slugMap);
    } catch (e) {
      if (this.logger && this.logger.warn) this.logger.warn(`discoverHubsFromExistingUrls failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Country label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'country';
  }

  /**
   * Fallback patterns for country hubs
   * Includes:
   * - English standard patterns
   * - Language-prefixed patterns for multilingual sites (e.g., /de/deutschland)
   * - Regional patterns (e.g., /afrique/, /asie/, /europe/)
   */
  getFallbackPatterns() {
    return [
      // Standard English patterns
      '/world/{slug}',
      '/news/world/{slug}',
      '/world/{code}',
      '/news/{code}',
      '/{slug}',
      '/international/{slug}',
      '/news/world-{region}-{slug}',

      // Language-prefixed patterns (for multilingual sites like DW, France24)
      '/{lang}/{slug}',
      '/{lang}/news/{slug}',
      '/{lang}/world/{slug}',
      '/{lang}/{localSlug}',      // e.g., /de/deutschland

      // Regional hub patterns (common for French-language sites)
      '/afrique/{slug}',           // Africa
      '/asie/{slug}',              // Asia
      '/asie-pacifique/{slug}',    // Asia-Pacific
      '/europe/{slug}',            // Europe
      '/ameriques/{slug}',         // Americas
      '/moyen-orient/{slug}',      // Middle East
      '/africa/{slug}',
      '/asia/{slug}',
      '/asia-pacific/{slug}',
      '/americas/{slug}',
      '/middle-east/{slug}',
      '/latin-america/{slug}',

      // English section for international sites
      '/en/{slug}',
      '/en/world/{slug}',
      '/en/news/{slug}',

      // Alternative structures
      '/monde/{slug}',             // World (French)
      '/international/article/{slug}'
    ];
  }

  /**
   * Build metadata for country entity.
   * Includes all name variants and slug strategies for comprehensive URL generation.
   * 
   * @param {Object} country - Country object with name, code, id
   * @param {Object} [options] - Options for language handling
   * @param {string} [options.publicationLang='en'] - Publication language
   * @param {Array<string>} [options.placeNativeLanguages=[]] - Native languages of the place
   */
  buildEntityMetadata(country, options = {}) {
    if (!country || !country.name) return null;

    const { publicationLang = 'en', placeNativeLanguages = [] } = options;

    const slug = slugify(country.name);
    const code = country.code ? country.code.toLowerCase() : '';
    const region = this._getRegion(country.code);

    // Determine native languages if not provided
    let nativeLangs = placeNativeLanguages;
    if (nativeLangs.length === 0 && country.code) {
      nativeLangs = this._getPlaceNativeLanguages(country.code);
    }

    // Get all name variants if we have a country id
    let nameVariants = [];
    let allSlugs = [];
    let byLanguage = {};

    if (country.id) {
      const variants = getPlaceNameVariantsForHubDiscovery(this.db, country.id, {
        publicationLang,
        placeNativeLanguages: nativeLangs
      });
      nameVariants = variants.allNames || [];
      byLanguage = variants.byLanguage || {};

      // Generate slug variants for each name
      const seenSlugs = new Set();
      for (const name of nameVariants) {
        const slugVariants = generateSlugVariants(name);
        for (const { slug: s, strategy } of slugVariants) {
          if (!seenSlugs.has(s)) {
            seenSlugs.add(s);
            allSlugs.push({ slug: s, strategy, sourceName: name });
          }
        }
      }
    } else {
      // Fallback: just use the single name provided
      nameVariants = [country.name];
      allSlugs = generateSlugVariants(country.name).map(v => ({
        ...v,
        sourceName: country.name
      }));
    }

    // Build local slug from publication language name (e.g., "allemagne" for French, "deutschland" for German)
    let localSlug = slug;  // Default to English slug
    if (byLanguage[publicationLang] && byLanguage[publicationLang].length > 0) {
      localSlug = slugify(byLanguage[publicationLang][0]);
    }

    return {
      slug,
      code,
      region,
      lang: publicationLang,          // For {lang} placeholder in patterns
      localSlug,                       // Local name slug for publication language
      name: country.name,
      nameVariants,
      allSlugs,  // Array of { slug, strategy, sourceName }
      byLanguage,  // Names grouped by language code
      publicationLang,
      placeNativeLanguages: nativeLangs
    };
  }

  /**
   * Get native/official languages for a country based on country code.
   * Used to prioritize local name forms in URL generation.
   * @param {string} countryCode - ISO 3166-1 alpha-2 code
   * @returns {Array<string>} Language codes
   */
  _getPlaceNativeLanguages(countryCode) {
    const languageMap = {
      // Major languages by country
      'DE': ['de'],
      'FR': ['fr'],
      'ES': ['es'],
      'IT': ['it'],
      'PT': ['pt'],
      'BR': ['pt'],
      'RU': ['ru'],
      'CN': ['zh'],
      'TW': ['zh'],
      'JP': ['ja'],
      'KR': ['ko'],
      'SA': ['ar'],
      'AE': ['ar'],
      'EG': ['ar'],
      'IR': ['fa'],
      'IL': ['he'],
      'IN': ['hi', 'en'],
      'PK': ['ur'],
      'TH': ['th'],
      'VN': ['vi'],
      'ID': ['id'],
      'MY': ['ms'],
      'TR': ['tr'],
      'PL': ['pl'],
      'NL': ['nl'],
      'SE': ['sv'],
      'NO': ['nb', 'no'],
      'DK': ['da'],
      'FI': ['fi'],
      'GR': ['el'],
      'UA': ['uk'],
      'CZ': ['cs'],
      'RO': ['ro'],
      'HU': ['hu'],
      'AT': ['de'],
      'CH': ['de', 'fr', 'it'],
      'BE': ['nl', 'fr', 'de'],
      'MX': ['es'],
      'AR': ['es'],
      'CO': ['es'],
      'VE': ['es'],
      'CL': ['es'],
      'PE': ['es'],
      // English-speaking countries don't need native language boost
      'US': [],
      'GB': [],
      'AU': [],
      'CA': ['en', 'fr'],
      'NZ': [],
      'IE': ['en'],
      'ZA': ['en', 'af', 'zu']
    };

    return languageMap[countryCode] || [];
  }

  /**
   * Get list of all countries from gazetteer
   * @param {string} [lang='en'] - Language code (e.g. 'es', 'fr')
   * @returns {Array} Array of {name, code, importance}
   */
  getAllCountries(lang = 'en') {
    return getAllCountries(this.db, lang);
  }

  /**
   * Get top N countries (limited subset)
   * @param {number} limit - Maximum number of countries to return
   * @param {string} [lang='en'] - Language code
   * @returns {Array} Countries (up to limit)
   */
  getTopCountries(limit = 50, lang = 'en') {
    return getTopCountries(this.db, limit, lang);
  }

  /**
   * Get country by name
   * @param {string} name - Country name
   * @param {string} [lang='en'] - Language code
   * @returns {Object|null} Country object
   */
  getCountryByName(name, lang = 'en') {
    return getCountryByName(this.db, name, lang);
  }

  /**
   * Enhanced URL prediction with multiple strategies and fallbacks.
   * Now supports comprehensive name variant lookup when placeId is provided.
   * 
   * @param {string} domain - Target domain
   * @param {string} countryName - Country name
   * @param {string} countryCode - Country code (e.g., 'US', 'GB')
   * @param {Object} [options] - Additional options
   * @param {number} [options.placeId] - Place ID for fetching all name variants
   * @param {number} [options.maxUrls=20] - Maximum URLs to return
   * @param {boolean} [options.useAllNameVariants=true] - Whether to use all name variants
   * @param {string} [options.publicationLang='en'] - Publication language for name prioritization
   * @param {Array<string>} [options.placeNativeLanguages] - Override native languages
   * @returns {Array<string>} Predicted URLs
   */
  predictCountryHubUrls(domain, countryName, countryCode, options = {}) {
    const {
      placeId,
      maxUrls = 20,
      useAllNameVariants = true,
      publicationLang = 'en',
      placeNativeLanguages
    } = options;
    const entity = { name: countryName, code: countryCode, id: placeId };
    const predictions = [];

    // Pre-build metadata to use across strategies
    const metadata = this.buildEntityMetadata(entity, {
      publicationLang,
      placeNativeLanguages: placeNativeLanguages || []
    });

    // STRATEGY 0: Dynamically Inferred Patterns (highest dynamic priority)
    const inferredPatterns = this.getInferredPatterns(domain);
    if (inferredPatterns && inferredPatterns.length > 0) {
      const seenUrls = new Set();
      const slugsToTry = metadata?.allSlugs?.length > 0 ? metadata.allSlugs : [{ slug: slugify(countryName) }];

      for (const { pattern, weight } of inferredPatterns) {
        for (const { slug } of slugsToTry) {
          const url = `https://${domain}${pattern.replace('{slug}', slug)}`;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            predictions.push({
              url,
              confidence: weight,
              strategy: 'data-inferred',
              pattern: pattern,
              entity,
              domain
            });
          }
        }
      }
    }

    // Strategy 1: DSPL patterns (highest priority)
    const dsplPredictions = this.predictionManager.predictFromDspl(entity, domain);
    predictions.push(...dsplPredictions);

    // Strategy 2: Gazetteer-based patterns (learned from verified hubs)
    const gazetteerPredictions = this.predictionManager.predictFromGazetteer(entity, domain);
    predictions.push(...gazetteerPredictions);

    // Strategy 2.5: Crawl data (map of the site)
    const crawlPredictions = this.predictionManager.predictFromCrawlData(entity, domain);
    predictions.push(...crawlPredictions);

    // Strategy 3: Name variant patterns (ALWAYS run when placeId is provided)
    if (useAllNameVariants && metadata?.allSlugs?.length > 0) {
      // Generate URLs for each slug variant
      const prefixes = ['/world/', '/news/world/', '/international/', '/news/', '/'];
      const seenUrls = new Set(predictions.map(p => p.url));

      // Lower base confidence if DSPL patterns exist
      const baseConfidence = dsplPredictions.length > 0 ? 0.3 : 0.4;

      // FIRST: Add special patterns for major countries BEFORE name variants
      // These get highest priority (e.g., The Guardian uses /us-news, /uk-news, /world/southafrica, etc.)
      if (countryCode) {
        const code = countryCode.toLowerCase();
        const specialPatterns = [];
        if (code === 'us') {
          specialPatterns.push(`/${code}-news`, `/${code}`, `/america`, `/americas`, `/world/us`, `/world/usa`);
        } else if (code === 'gb') {
          specialPatterns.push(`/uk`, `/uk-news`, `/britain`, `/england`, `/world/uk`);
        } else if (code === 'au') {
          specialPatterns.push(`/australia`, `/${code}`, `/world/australia`);
        } else if (code === 'za') {
          specialPatterns.push(`/world/southafrica`, `/world/south-africa`, `/south-africa`, `/africa/south-africa`);
        } else if (code === 'sa') {
          specialPatterns.push(`/world/saudiarabia`, `/world/saudi-arabia`, `/middle-east/saudi-arabia`);
        }

        for (const pattern of specialPatterns) {
          const url = `https://${domain}${pattern}`;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            predictions.push({
              url,
              confidence: 0.85,  // Very high confidence for known patterns
              strategy: 'special-code',
              pattern,
              entity,
              domain
            });
          }
        }
      }

      // SECOND: Add name variant patterns
      for (const { slug, strategy } of metadata.allSlugs) {
        for (const prefix of prefixes) {
          const url = `https://${domain}${prefix}${slug}`;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          // Higher confidence for /world/ prefix and hyphenated slugs
          let confidence = baseConfidence;
          if (prefix === '/world/') confidence += 0.2;
          else if (prefix === '/news/world/') confidence += 0.15;
          if (strategy === 'hyphenated') confidence += 0.1;

          predictions.push({
            url,
            confidence,
            strategy: 'name-variant',
            pattern: `${prefix}${slug}`,
            entity,
            domain
          });
        }
      }

      // THIRD: Add generic country code patterns
      if (countryCode) {
        const code = countryCode.toLowerCase();
        for (const prefix of prefixes) {
          const url = `https://${domain}${prefix}${code}`;
          if (!seenUrls.has(url)) {
            seenUrls.add(url);
            predictions.push({
              url,
              confidence: baseConfidence - 0.05,
              strategy: 'country-code',
              pattern: `${prefix}${code}`,
              entity,
              domain
            });
          }
        }
      }
    } else if (dsplPredictions.length === 0) {
      // Fallback to original single-name patterns when no placeId
      const commonPatterns = [
        { pattern: `/world/${slugify(countryName)}`, confidence: 0.6 },
        { pattern: `/news/world/${slugify(countryName)}`, confidence: 0.5 },
        { pattern: `/news/${countryCode.toLowerCase()}`, confidence: 0.4 },
        { pattern: `/${slugify(countryName)}`, confidence: 0.4 },
        { pattern: `/international/${slugify(countryName)}`, confidence: 0.3 },
        { pattern: `/news/world-${this._getRegion(countryCode)}-${slugify(countryName)}`, confidence: 0.3 }
      ];
      const commonPredictions = this.predictionManager.predictFromCommonPatterns(entity, domain, commonPatterns);
      predictions.push(...commonPredictions);
    }

    // Strategy 4: Regional patterns for countries without direct coverage
    const regionalPredictions = this.predictionManager.predictFromRegionalPatterns(entity, domain);
    predictions.push(...regionalPredictions);

    // Remove duplicates and score predictions
    const uniquePredictions = this.deduplicateAndScore(predictions);
    const filteredPredictions = uniquePredictions.filter((prediction) => !this._isKnown404Url(prediction.url));
    const finalPredictions = filteredPredictions.length > 0 ? filteredPredictions : uniquePredictions;

    return finalPredictions.slice(0, maxUrls).map((p) => p.url);
  }

  /**
   * Analyze country hub coverage for a specific domain
   * @param {string} domain - Domain to analyze
   * @param {Object} hubStats - Hub visit statistics from crawler state
   * @returns {Object} Gap analysis summary
   */
  analyzeGaps(domain, hubStats = {}) {
    const host = this._normalizeHost(domain);
    const now = Date.now();

    // Return cached analysis if recent
    const cacheKey = `${host || ''}`;
    if (this.lastAnalysis?.[cacheKey] && (now - this.lastAnalysisTime) < this.analysisCacheMs) {
      return this.lastAnalysis[cacheKey];
    }

    const countryStats = hubStats.perKind?.country || { seeded: 0, visited: 0 };
    const coverage = host
      ? getCountryHubCoverage(this.db, host)
      : { seeded: 0, visited: 0, missingCountries: [], totalCountries: 0, missing: 0 };

    const seeded = coverage.seeded || countryStats.seeded || 0;
    const visited = coverage.visited || countryStats.visited || 0;
    const missingCountries = coverage.missingCountries || [];
    const missing = coverage.missing ?? Math.max(seeded - visited, 0);

    const coveragePercent = seeded > 0 ? Math.round((visited / seeded) * 100) : 0;
    const totalCountries = coverage.totalCountries || seeded;
    const isComplete = missing === 0 && totalCountries > 0;

    const analysis = {
      domain: host,
      seeded,
      visited,
      missing,
      coveragePercent,
      isComplete,
      timestamp: new Date().toISOString(),
      totalCountries,
      missingCountries
    };

    // Cache result
    if (!this.lastAnalysis) this.lastAnalysis = {};
    this.lastAnalysis[cacheKey] = analysis;
    this.lastAnalysisTime = now;

    return analysis;
  }

  /**
   * Generate gap predictions for missing countries
   * @param {string} domain - Target domain
   * @param {Array} missingCountries - Array of {name, code} for missing countries
   * @returns {Array} Prediction objects
   */
  generatePredictions(domain, missingCountries = []) {
    const predictions = [];

    for (const country of missingCountries) {
      const predictedUrls = this.predictCountryHubUrls(domain, country.name, country.code);

      for (const url of predictedUrls) {
        predictions.push({
          url,
          countryName: country.name,
          countryCode: country.code,
          confidence: this._calculateConfidence(country),
          priority: this._calculatePriority(country),
          predictionSource: 'country-hub-gap-analysis',
          timestamp: new Date().toISOString()
        });
      }
    }

    return predictions;
  }

  /**
   * Extract country name from URL
   * @param {string} url - URL to analyze
   * @returns {string|null} Extracted country name
   */
  extractCountryNameFromUrl(url) {
    if (!url) return null;

    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // Extract last meaningful segment
      const segments = path.split('/').filter(s => s && s.length > 2);
      if (segments.length === 0) return null;

      const lastSegment = segments[segments.length - 1];

      // Convert slug to title case
      return lastSegment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } catch (err) {
      return null;
    }
  }

  // Private methods

  _getRegion(countryCode) {
    const regionMap = {
      'CN': 'asia', 'JP': 'asia', 'IN': 'asia', 'KR': 'asia',
      'GB': 'europe', 'DE': 'europe', 'FR': 'europe', 'IT': 'europe', 'ES': 'europe', 'RU': 'europe',
      'US': 'americas', 'CA': 'americas', 'MX': 'americas', 'BR': 'americas',
      'AU': 'oceania'
    };
    return regionMap[countryCode] || 'international';
  }

  _calculateConfidence(country) {
    const importanceNormalized = Math.min((country.importance || 0) / 100, 1.0);
    return 0.4 + (importanceNormalized * 0.4);
  }

  _calculatePriority(country) {
    return Math.max(10, Math.floor(country.importance || 0));
  }

  _initLatestHttpStatusStatement() {
    this._selectLatestHttpStatusStmt = true;
  }

  _getLatestHttpStatus(url) {
    if (!url || !this._selectLatestHttpStatusStmt) {
      return null;
    }

    const cached = this._knownStatusCache.get(url);
    if (cached && (Date.now() - cached.cachedAt) <= 5 * 60 * 1000) { // 5 minute memoization window
      return cached.row;
    }

    try {
      const row = getLatestHttpStatusForUrl(this.db, url) || null;
      this._knownStatusCache.set(url, { row, cachedAt: Date.now() });
      return row;
    } catch (err) {
      if (err && typeof err.message === 'string' && err.message.includes('no such table')) {
        this._selectLatestHttpStatusStmt = null;
        return null;
      }
      throw err;
    }
  }

  _isKnown404Url(url) {
    const row = this._getLatestHttpStatus(url);
    if (!row || row.http_status !== 404) {
      return false;
    }
    if (!row.fetched_at) {
      return true;
    }
    const fetchedAtMs = Date.parse(row.fetched_at);
    if (!Number.isFinite(fetchedAtMs)) {
      return true;
    }
    return (Date.now() - fetchedAtMs) <= this.maxKnown404AgeMs;
  }
}

module.exports = { CountryHubGapAnalyzer };
