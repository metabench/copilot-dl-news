const { slugify } = require('../../tools/slugify');
const { fetchUrl } = require('./utils/httpUtils');
const { extractTitle } = require('./utils/domainUtils');
const { createFetchRow } = require('./utils/dataUtils');
const { getConfidenceConfig, scoreHubCandidate, applyConfidenceDecision } = require('./utils/hubConfidenceScorer');
const { CRAWL_EVENT_TYPES, SEVERITY_LEVELS, createTelemetryEvent } = require('../../core/crawler/telemetry');
const { PatternInferenceService, detectHomeCountry, generateCompoundSectionCandidates, COUNTRY_ALIASES } = require('news-db-pure-analysis');
const {
  listUrlsForHost,
  listCountryNamesForHubInference
} = require('news-crawler-db');
const dns = require('dns').promises;

// Well-known probe countries used to bootstrap pattern detection on unknown domains
const BOOTSTRAP_COUNTRIES = [
  { name: 'Australia', slug: 'australia', code: 'AU' },
  { name: 'France', slug: 'france', code: 'FR' },
  { name: 'Japan', slug: 'japan', code: 'JP' },
  { name: 'Brazil', slug: 'brazil', code: 'BR' },
  { name: 'India', slug: 'india', code: 'IN' },
  { name: 'Germany', slug: 'germany', code: 'DE' },
  { name: 'Nigeria', slug: 'nigeria', code: 'NG' },
  { name: 'Canada', slug: 'canada', code: 'CA' }
];

// Common URL patterns found across news websites
const COMMON_HUB_PATTERNS = [
  '/world/{slug}',
  '/{slug}',
  '/news/{slug}',
  '/international/{slug}',
  '/news/world/{slug}',
  '/topics/{slug}',
  '/location/{slug}'
];

class ActiveProbeProcessor {
  constructor() {
    this.name = 'ActiveProbeProcessor';
  }

  /**
   * Process domain with active pattern probing
   * @param {Object} options
   * @param {string} options.domain
   * @param {string} options.activePattern - The pattern to probe, e.g. '/world/{slug}'
   * @param {string[]} options.kinds - Kinds of places to probe (e.g. ['country'])
   * @param {boolean} options.apply - Whether to persist valid hubs
   * @param {Object} deps
   * @returns {Promise<Object>}
   */
  async processDomain(options = {}, deps = {}) {
    const {
      analyzers,
      validator,
      queries,
      logger,
      fetchFn,
      telemetryBridge
    } = deps;

    const domain = options.domain;
    if (!domain) throw new Error('Domain is required');

    // DNS Validation for Active Probe
    const normalized = domain.toLowerCase().trim();
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(normalized)) {
      throw new Error(`Invalid domain format: "${domain}"`);
    }
    try {
      await dns.lookup(normalized);
    } catch (err) {
      if (err.code === 'ENOTFOUND') {
        throw new Error(`Domain not resolved (DNS): "${domain}" - please check spelling or connectivity`);
      }
      throw new Error(`DNS lookup failed for "${domain}": ${err.message}`);
    }

    const pattern = options.activePattern;
    if (!pattern) {
      // No pattern specified — try auto-discover mode
      logger.info(`[ActiveProbe] No pattern specified, entering auto-discover mode`);
      return this.autoDiscover(options, deps);
    }

    const runId = options.runId || `probe-${Date.now()}`;
    const summary = {
      domain,
      mode: 'active-probe',
      pattern,
      confidenceMode: getConfidenceConfig(options).mode,
      minConfidence: getConfidenceConfig(options).threshold,
      confidenceScored: 0,
      confidenceRejected: 0,
      confidenceScoreTotal: 0,
      confidenceAverage: 0,
      totalCandidates: 0,
      fetched: 0,
      valid: 0,
      failed: 0,
      errors: 0,
      inserted: 0,
      updated: 0,
      startTime: new Date().toISOString()
    };

    const emitTelemetry = (type, data = {}, severity = SEVERITY_LEVELS.INFO) => {
      if (telemetryBridge?.emitEvent) {
        telemetryBridge.emitEvent(createTelemetryEvent(type, data, {
          jobId: runId,
          crawlType: 'active-probe',
          source: 'orchestration:active-probe'
        }));
      }
    };

    logger.info(`[ActiveProbe] Starting active probe for ${domain} with pattern "${pattern}"`);
    emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_STARTED, { domain, pattern, runId });

    const limit = options.limit || 0;
    logger.info(`[ActiveProbe] Limit: ${limit}, Options limit: ${options.limit}`);

    // Determine language (default to 'en')
    const lang = options.lang || 'en';
    logger.info(`[ActiveProbe] Using language: "${lang}"`);

    try {
      // 1. Gather targets
      let targets = [];
      // Priority Codes (ISO alpha-2) to ensure major countries are checked first regardless of language slug
      const priorityCodes = ['FR', 'AU', 'UA', 'DE', 'ES', 'IT', 'JP', 'CN', 'IN', 'BR', 'CA', 'RU', 'US', 'GB', 'CO', 'VE'];

      // Resolve parent place constraint if provided (e.g. "Canada")
      let parentCountryCode = null;
      if (options.parentPlace) {
        if (analyzers.country && typeof analyzers.country.getCountryByName === 'function') {
          const c = analyzers.country.getCountryByName(options.parentPlace, lang);
          if (c) {
            parentCountryCode = c.code;
            logger.info(`[ActiveProbe] Resolved parent place "${options.parentPlace}" to country code ${parentCountryCode}`);
          } else {
            logger.warn(`[ActiveProbe] Could not resolve parent place "${options.parentPlace}"`);
          }
        }
      }

      if (options.kinds.includes('country')) {
        // Use getTopCountries to prioritize major countries (using DB importance/population)
        const countries = analyzers.country.getTopCountries(300, lang);

        let mapped = countries.map(c => ({
          placeId: c.id ?? c.placeId ?? c.place_id ?? null,
          kind: 'country',
          name: c.name,
          code: c.code,
          slug: slugify(c.name),
          importance: c.importance
        }));

        // Boost priority codes to the top
        mapped.sort((a, b) => {
          const aP = priorityCodes.includes(a.code);
          const bP = priorityCodes.includes(b.code);
          if (aP && !bP) return -1;
          if (!aP && bP) return 1;
          // Otherwise desc importance
          return (b.importance || 0) - (a.importance || 0);
        });

        targets = targets.concat(mapped);
      }

      if (options.kinds.includes('region')) {
        let regions = [];
        if (parentCountryCode && typeof analyzers.region.getRegionsByCountry === 'function') {
          regions = analyzers.region.getRegionsByCountry(parentCountryCode, 300, lang);
        } else {
          regions = analyzers.region.getTopRegions(300, lang);
        }

        const mapped = regions.map(r => ({
          placeId: r.id ?? r.placeId ?? r.place_id ?? null,
          kind: 'region',
          name: r.name,
          code: r.code,
          slug: slugify(r.name),
          importance: r.importance,
          countryCode: r.countryCode
        }));
        targets = targets.concat(mapped);
      }

      if (options.kinds.includes('city')) {
        let cities = [];
        if (parentCountryCode && typeof analyzers.city.getCitiesByCountry === 'function') {
          cities = analyzers.city.getCitiesByCountry(parentCountryCode, 300, lang);
        } else {
          cities = analyzers.city.getTopCities(300, lang);
        }

        const mapped = cities.map(c => ({
          placeId: c.id ?? c.placeId ?? c.place_id ?? null,
          kind: 'city',
          name: c.name,
          slug: slugify(c.name),
          importance: c.importance,
          countryCode: c.countryCode
        }));
        targets = targets.concat(mapped);
      }

      // A6 slice 3: settlement kinds ride the city analyzer's kind-generic
      // query (same shape as the city block).
      for (const settlementKind of ['town', 'village']) {
        if (!options.kinds.includes(settlementKind)) continue;
        if (typeof analyzers.city.getTopSettlements !== 'function') break;
        const settlements = analyzers.city.getTopSettlements(settlementKind, 300, lang);
        const mapped = settlements.map(s => ({
          placeId: s.id ?? s.placeId ?? s.place_id ?? null,
          kind: settlementKind,
          name: s.name,
          slug: slugify(s.name),
          importance: s.importance,
          countryCode: s.countryCode
        }));
        targets = targets.concat(mapped);
      }

      summary.totalCandidates = targets.length;
      logger.info(`[ActiveProbe] Generated ${targets.length} targets`);

      const targetLimit = options.limit || 0;
      const targetsToProcess = targetLimit > 0 ? targets.slice(0, targetLimit) : targets;
      summary.candidates = [];

      // Check if batch processing is available (distributed mode)
      const batchProcessor = deps.batchProcessor;
      if (batchProcessor && batchProcessor.isAvailable()) {
        logger.info(`[ActiveProbe] Using distributed batch processing for ${targetsToProcess.length} targets`);
        await this._processBatch(targetsToProcess, pattern, domain, options, deps, summary, emitTelemetry);
      } else {
        // Sequential processing fallback
        logger.info(`[ActiveProbe] Using sequential processing for ${targetsToProcess.length} targets`);
        let processedCount = 0;
        for (const target of targetsToProcess) {
          await this._processTarget(target, pattern, domain, options, deps, summary, emitTelemetry);
          processedCount++;
        }
      }

    } catch (error) {
      summary.errors++;
      logger.error(`[ActiveProbe] Error: ${error.message}`);
      emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_FAILED, { error: error.message }, SEVERITY_LEVELS.ERROR);
      throw error;
    }

    summary.endTime = new Date().toISOString();
    logger.info(`[ActiveProbe] Completed. Valid: ${summary.valid}/${summary.totalCandidates}`);
    emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_GUESS_COMPLETED, { summary });

    return summary;
  }

  async _processTarget(target, pattern, domain, options, deps, summary, emitTelemetry) {
    const { fetchFn, queries, validator, logger, stores } = deps;
    const scheme = options.scheme || 'https';

    // Construct URL
    let path = pattern
      .replace('{slug}', target.slug)
      .replace('{code}', target.code ? target.code.toLowerCase() : '')
      .replace('{name}', target.name); // basic replacement

    // Ensure path starts with / 
    if (!path.startsWith('/')) path = '/' + path;

    const url = `${scheme}://${domain}${path}`;

    logger.info(`[ActiveProbe] Checking ${url} (Target: ${target.name})`);

    // Skip if recently checked (cache)? 
    // DomainProcessor checks cache. We probably should too to avoid hammering if re-running.
    // However, "Active Probe" implies "Check Now".
    // We'll skip recently valid ones, but maybe retry 404s if forced?
    // For now, simple fetch.

    summary.fetched++;

    try {
      const result = await fetchUrl(url, fetchFn, { logger, timeoutMs: 15000 });
      logger.info(`[ActiveProbe] Fetch result for ${url}: status=${result.status}, ok=${result.ok}`);

      // Record fetch
      const fetchRow = createFetchRow(result, domain);
      // Record fetch if recorder is available
      if (stores?.fetchRecorder?.record) {
        try {
          stores.fetchRecorder.record(fetchRow);
        } catch (err) {
          // Ignore recorder errors to prevent crash
        }
      }

      if (!result.ok) {
        summary.failed++;
        return;
      }

      // Validate
      const pageTitle = extractTitle(result.body) || target.name;

      let validation = { isValid: false, reason: 'links' };
      try {
        if (validator && typeof validator.validatePlaceHub === 'function') {
          validation = validator.validatePlaceHub(pageTitle, url);
        }
      } catch (err) {
        // Fallback if validator fails (e.g. DB schema mismatch)
        // For active probe, 200 OK + Title is often good enough evidence
        // We'll verify title contains place name or is reasonable
        logger.warn(`[ActiveProbe] Validator exception for ${url}: ${err.message}`);
        const titleLower = pageTitle.toLowerCase();
        const placeLower = target.name.toLowerCase();
        const isValid = titleLower.includes(placeLower);
        validation = {
          isValid,
          reason: isValid ? 'probe-fallback-ok' : 'probe-fallback-title-mismatch',
          confidence: isValid ? 0.6 : 0.0
        };
      }

      // If no validator was present, we still need basic validation
      if (!validation.isValid && validation.reason === 'links') {
        // Check title match as fallback
        const titleLower = pageTitle.toLowerCase();
        const placeLower = target.name.toLowerCase();
        if (titleLower.includes(placeLower)) {
          validation = { isValid: true, reason: 'title-match', confidence: 0.7 };
        } else {
          logger.info(`[ActiveProbe] Title mismatch for ${url}. Title: "${pageTitle}", Target: "${target.name}"`);
        }
      } else if (!validation.isValid) {
        logger.info(`[ActiveProbe] Invalid ${url}: ${validation.reason}`);
      }

      const confidenceConfig = getConfidenceConfig(options);
      const confidenceAssessment = scoreHubCandidate({
        validation,
        predictionSource: null,
        title: pageTitle,
        place: { name: target.name },
        topic: null,
        httpStatus: result.status
      });
      const confidenceDecision = applyConfidenceDecision({
        validation,
        assessment: confidenceAssessment,
        config: confidenceConfig
      });
      summary.confidenceScored += 1;
      summary.confidenceScoreTotal += confidenceAssessment.score;
      summary.confidenceAverage = summary.confidenceScored > 0
        ? summary.confidenceScoreTotal / summary.confidenceScored
        : 0;
      if (confidenceDecision.rejectedByConfidence) {
        summary.confidenceRejected += 1;
      }

      if (confidenceDecision.isValid) {
        summary.valid++;
        summary.candidates.push({
          url,
          place_slug: target.slug, // guess-place-hubs expects snake_case for CLI
          exists: true, // indicates it was found/validated
          status: 'validated',
          confidenceScore: confidenceAssessment.score,
          confidenceBand: confidenceAssessment.band,
          confidenceMode: confidenceConfig.mode
        });

        emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_DETERMINATION, {
          domain, url, determination: { accepted: true, reason: 'active-probe' }
        });

        if (options.apply) {
          const packet = {
            url,
            domain,
            placeSlug: target.slug,
            placeKind: target.kind,
            title: pageTitle,
            evidence: JSON.stringify({ source: 'active-probe', pattern })
            // nav/article links counts? 
          };
          // Upsert
          const existing = queries.getPlaceHub(domain, url);
          if (existing) {
            queries.updatePlaceHub(packet);
            summary.updated++;
          } else {
            queries.insertPlaceHub(packet);
            summary.inserted++;
          }
        }
      } else {
        summary.failed++;
      }

    } catch (err) {
      summary.errors++;
      logger.warn(`[ActiveProbe] Failed ${url}: ${err.message}`);
    }
  }

  /**
   * Auto-discover country hub patterns for an unknown domain.
   * 
   * Strategy:
   * 1. Check if we have existing URL data in the DB for this domain
   *    - If yes, use PatternInferenceService to infer patterns
   * 2. If no DB data (or inference returns nothing), bootstrap:
   *    - Probe a small set of well-known countries against common patterns
   *    - Any pattern that gets multiple 200s is likely a valid hub structure
   * 3. Run full active-probe with each validated pattern
   *
   * @param {Object} options
   * @param {Object} deps
   * @returns {Promise<Object>} Combined summary
   */
  async autoDiscover(options = {}, deps = {}) {
    const { logger, db } = deps;
    const domain = options.domain;
    const scheme = options.scheme || 'https';

    logger.info(`[AutoDiscover] Starting pattern detection for ${domain}`);

    // Phase 1: Try to infer patterns from existing DB data
    let inferredPatterns = [];
    try {
      if (db) {
        const rows = listUrlsForHost(db, domain, { limit: 20000 });
        if (rows.length > 0) {
          const paths = rows.map(r => {
            try { return new URL(r.url).pathname; } catch { return ''; }
          }).filter(Boolean);

          const countries = listCountryNamesForHubInference(db);
          const slugs = countries.map(c => c.title);

          inferredPatterns = PatternInferenceService.inferCountryHubPatterns(paths, slugs);
          if (inferredPatterns.length > 0) {
            logger.info(`[AutoDiscover] Inferred ${inferredPatterns.length} patterns from ${rows.length} existing URLs:`);
            inferredPatterns.forEach(p => logger.info(`  ${p.pattern} (${p.count} matches, weight ${p.weight})`));
          } else {
            logger.info(`[AutoDiscover] No patterns inferred from ${rows.length} existing URLs`);
          }
        } else {
          logger.info(`[AutoDiscover] No existing URLs found for ${domain}`);
        }
      }
    } catch (e) {
      logger.warn(`[AutoDiscover] Pattern inference failed: ${e.message}`);
    }

    // Phase 2: If no inferred patterns, bootstrap by probing common patterns
    let patternsToUse = inferredPatterns.map(p => p.pattern);

    if (patternsToUse.length === 0) {
      logger.info(`[AutoDiscover] Bootstrapping: probing ${BOOTSTRAP_COUNTRIES.length} countries against ${COMMON_HUB_PATTERNS.length} common patterns`);

      const patternHits = new Map();

      for (const pattern of COMMON_HUB_PATTERNS) {
        let hits = 0;
        for (const country of BOOTSTRAP_COUNTRIES) {
          const path = pattern.replace('{slug}', country.slug);
          const url = `${scheme}://${domain}${path}`;

          try {
            const result = await fetchUrl(url, deps.fetchFn, {
              logger: { info: () => { }, warn: () => { }, error: () => { } },
              timeoutMs: 10000
            });
            if (result.ok) {
              hits++;
              logger.info(`[AutoDiscover] ✓ ${url} -> HTTP ${result.status}`);
            }
          } catch {
            // Network error — skip
          }

          // Short-circuit: if we got 3+ hits, this pattern is confirmed
          if (hits >= 3) break;
        }

        if (hits >= 2) {
          patternHits.set(pattern, hits);
          logger.info(`[AutoDiscover] Pattern "${pattern}" validated with ${hits}/${BOOTSTRAP_COUNTRIES.length} hits`);
        }
      }

      patternsToUse = Array.from(patternHits.keys());

      if (patternsToUse.length === 0) {
        logger.warn(`[AutoDiscover] No valid patterns found. The domain may not use standard country hub structures.`);
        return {
          domain,
          mode: 'auto-discover',
          status: 'no-patterns-found',
          totalCandidates: 0,
          fetched: 0,
          valid: 0,
          candidates: []
        };
      }
    }

    const allCandidates = [];

    // Phase 2.5: Home country + compound section probing
    // Uses analysis module to generate candidates based on TLD detection
    const { paths: compoundPaths, homeCountryCode } = generateCompoundSectionCandidates(domain);
    logger.info(`[AutoDiscover] Probing ${compoundPaths.length} compound section candidates${homeCountryCode ? ` (home country: ${homeCountryCode})` : ''}`);

    for (const path of compoundPaths) {
      const url = `${scheme}://${domain}${path}`;
      try {
        const result = await fetchUrl(url, deps.fetchFn, {
          logger: { info: () => { }, warn: () => { }, error: () => { } },
          timeoutMs: 10000
        });
        if (result.ok) {
          const title = extractTitle(result.body) || '';
          // Basic validation: the page should have a meaningful title, not just "404" or "Not Found"
          const titleLower = title.toLowerCase();
          if (titleLower.includes('not found') || titleLower.includes('error') || title.length < 3) {
            continue; // soft 404
          }
          logger.info(`[AutoDiscover] ✓ Compound hub found: ${url} (title: "${title.slice(0, 60)}")`);
          allCandidates.push({
            url,
            place_slug: path.replace('/', '').replace(/-news$|-politics$|-sport$|-opinion$|-business$/, ''),
            exists: true,
            status: 'validated',
            strategy: homeCountryCode ? 'home-country' : 'compound-section',
            confidenceScore: 0.85,
            confidenceBand: 'high',
            confidenceMode: 'auto-discover'
          });
        }
      } catch {
        // Skip network errors
      }
    }

    // Phase 3: Run active probe with each validated pattern
    logger.info(`[AutoDiscover] Running active probe with ${patternsToUse.length} pattern(s): ${patternsToUse.join(', ')}`);

    let totalFetched = 0;
    let totalValid = 0;
    const patternResults = [];

    for (const pattern of patternsToUse) {
      logger.info(`[AutoDiscover] === Probing pattern: ${pattern} ===`);
      try {
        const probeOptions = {
          ...options,
          activePattern: pattern,
          mode: 'active-probe'
        };
        const result = await this.processDomain(probeOptions, deps);
        totalFetched += result.fetched || 0;
        totalValid += result.valid || 0;
        if (result.candidates) {
          allCandidates.push(...result.candidates);
        }
        patternResults.push({ pattern, fetched: result.fetched, valid: result.valid });
      } catch (err) {
        logger.warn(`[AutoDiscover] Pattern "${pattern}" failed: ${err.message}`);
        patternResults.push({ pattern, error: err.message });
      }
    }

    // Deduplicate candidates by URL
    const seen = new Set();
    const uniqueCandidates = allCandidates.filter(c => {
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      return true;
    });

    logger.info(`[AutoDiscover] Complete: ${uniqueCandidates.length} unique hubs found across ${patternsToUse.length} patterns`);

    return {
      domain,
      mode: 'auto-discover',
      patternsUsed: patternsToUse,
      patternResults,
      totalCandidates: uniqueCandidates.length,
      fetched: totalFetched,
      valid: totalValid,
      candidates: uniqueCandidates
    };
  }

  /**
   * Process targets in batch using distributed worker
   * @param {Array} targets - Targets to process
   * @param {string} pattern - URL pattern
   * @param {string} domain - Domain
   * @param {Object} options - Options
   * @param {Object} deps - Dependencies
   * @param {Object} summary - Summary to update
   * @param {Function} emitTelemetry - Telemetry emitter
   */
  async _processBatch(targets, pattern, domain, options, deps, summary, emitTelemetry) {
    const { batchProcessor, queries, validator, logger, stores } = deps;
    const scheme = options.scheme || 'https';

    // Build candidates for batch processing
    const candidates = targets.map(target => {
      let path = pattern
        .replace('{slug}', target.slug)
        .replace('{code}', target.code ? target.code.toLowerCase() : '')
        .replace('{name}', target.name);

      if (!path.startsWith('/')) path = '/' + path;

      return {
        url: `${scheme}://${domain}${path}`,
        target,  // Store target for later processing
        placeSlug: target.slug,
        placeKind: target.kind,
        placeName: target.name
      };
    });

    logger.info(`[ActiveProbe] Batch processing ${candidates.length} URLs via distributed worker`);

    try {
      // Use batch processor for HEAD check + GET fetch
      const batchResult = await batchProcessor.processCandidatesBatch(candidates, {
        domain,
        validateLinks: true,  // We want body content for validation
        minLinks: 1
      });

      // Result structure: { results: [...], summary: { totalCandidates, headChecked, getFetched, rateLimited, elapsedMs }}
      const { results, summary: batchSummary } = batchResult;
      logger.info(`[ActiveProbe] Batch result: ${batchSummary.getFetched} fetched, ${batchSummary.headChecked} head-checked, ${batchSummary.totalCandidates} total (${batchSummary.elapsedMs}ms)`);
      summary.fetched = batchSummary.headChecked;

      // Process each result
      for (const result of results) {
        // Result structure: { candidate, headResult, getResult, outcome, validation?, shouldRecordAbsent }
        const { candidate, getResult, outcome, validation: batchValidation } = result;
        const url = candidate.url;
        const target = candidate.target;

        // Check outcome
        if (outcome === 'rate-limited') {
          logger.warn(`[ActiveProbe] Rate limited: ${url}`);
          summary.errors++;
          continue;
        }

        if (outcome === 'not-found') {
          summary.failed++;
          continue;
        }

        if (outcome === 'head-failed' || outcome === 'fetch-error') {
          summary.failed++;
          continue;
        }

        if (outcome !== 'fetched') {
          summary.failed++;
          continue;
        }

        // outcome === 'fetched' — use batch validation or our own
        const pageTitle = batchValidation?.pageTitle || getResult?.title || candidate.placeName;

        // Use batch processor's validation (checks for >=10 links)
        let isValid = batchValidation?.isValid || false;
        let validationReason = 'links';

        // Also check title match as secondary validation
        const titleLower = (pageTitle || '').toLowerCase();
        const placeLower = candidate.placeName.toLowerCase();

        if (titleLower.includes(placeLower)) {
          isValid = true;
          validationReason = 'title-match';
        } else if (batchValidation?.linkCount >= 10) {
          isValid = true;
          validationReason = 'has-10-links';
        }

        const confidenceConfig = getConfidenceConfig(options);
        const confidenceAssessment = scoreHubCandidate({
          validation: {
            isValid,
            confidence: batchValidation?.confidence || null,
            linkCount: batchValidation?.linkCount || 0,
            pageTitle,
            reason: validationReason
          },
          predictionSource: null,
          title: pageTitle,
          place: { name: candidate.placeName },
          topic: null,
          httpStatus: getResult?.status
        });
        const confidenceDecision = applyConfidenceDecision({
          validation: {
            isValid,
            reason: validationReason
          },
          assessment: confidenceAssessment,
          config: confidenceConfig
        });
        summary.confidenceScored += 1;
        summary.confidenceScoreTotal += confidenceAssessment.score;
        summary.confidenceAverage = summary.confidenceScored > 0
          ? summary.confidenceScoreTotal / summary.confidenceScored
          : 0;
        if (confidenceDecision.rejectedByConfidence) {
          summary.confidenceRejected += 1;
        }

        if (confidenceDecision.isValid) {
          summary.valid++;
          summary.candidates.push({
            url,
            place_slug: target.slug,
            exists: true,
            status: 'validated',
            confidenceScore: confidenceAssessment.score,
            confidenceBand: confidenceAssessment.band,
            confidenceMode: confidenceConfig.mode
          });

          emitTelemetry(CRAWL_EVENT_TYPES.PLACE_HUB_DETERMINATION, {
            domain,
            url,
            determination: { accepted: true, reason: 'active-probe-batch', validationReason }
          });

          if (options.apply) {
            const packet = {
              url,
              domain,
              placeSlug: target.slug,
              placeKind: target.kind,
              title: pageTitle,
              evidence: JSON.stringify({ source: 'active-probe-batch', pattern, links: batchValidation?.linkCount })
            };

            const existing = queries.getPlaceHub(domain, url);
            if (existing) {
              queries.updatePlaceHub(packet);
              summary.updated++;
            } else {
              queries.insertPlaceHub(packet);
              summary.inserted++;
            }
          }
        } else {
          logger.info(`[ActiveProbe] Validation failed for ${url}: ${batchValidation?.linkCount || 0} links, title: "${pageTitle}"`);
          summary.failed++;
        }
      }

    } catch (err) {
      logger.error(`[ActiveProbe] Batch processing failed: ${err.message}`);
      summary.errors++;

      // Fall back to sequential processing
      logger.info(`[ActiveProbe] Falling back to sequential processing`);
      for (const target of targets) {
        await this._processTarget(target, pattern, domain, options, deps, summary, emitTelemetry);
      }
    }
  }
}

module.exports = { ActiveProbeProcessor };
