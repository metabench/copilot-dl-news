'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { tof, each, is_array } = require('lang-tools');
const { compact } = require('../../../utils/pipelines');
const { AttributeBuilder } = require('../../../utils/attributeBuilder');
const ingestQueries = require('../../../db/sqlite/queries/gazetteer.ingest');

/**
 * WikidataCountryIngestor
 * 
 * Fetches all countries from Wikidata with comprehensive properties:
 * - Basic: labels, aliases, descriptions (all languages)
 * - Geographic: coordinates (P625), area (P2046), population (P1082)
 * - Economic: GDP (P2131), GDP per capita (P2132)
 * - Administrative: ISO codes (P297, P300), capital (P36), official language (P37)
 * - External IDs: OSM relation (P402), GeoNames (P1566)
 * - Hierarchical: member of (P463), part of (P361)
 * 
 * Uses SPARQL for initial discovery, then fetches full entities for complete data.
 */
class WikidataCountryIngestor {
  constructor({
    db,
    cacheDir = null,
    logger = console,
    timeoutMs = 60000,
    sleepMs = 250,
    useCache = true,
    maxRetries = 3,
    maxCountries = null
  } = {}) {
    this.logger = logger;
    this.logger.info('[WikidataCountryIngestor] Constructor starting...');
    if (!db) {
      throw new Error('WikidataCountryIngestor requires a database handle (pass backgroundTaskManager.db or getDbRW())');
    }
    // Defensive: Validate it's a better-sqlite3 Database instance
    if (typeof db.prepare !== 'function') {
      throw new Error('WikidataCountryIngestor: db must be a better-sqlite3 Database instance with prepare() method');
    }
    this.db = db;
    this.timeoutMs = timeoutMs;
    this.sleepMs = sleepMs;
    this.useCache = useCache;
    this.maxRetries = maxRetries;
    this.maxCountries = maxCountries;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache', 'sparql');

    this.id = 'wikidata-countries';
    this.name = 'Wikidata Country Ingestor';

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO place_sources(name, version, url, license)
        VALUES ('wikidata', 'latest', 'https://www.wikidata.org', 'CC0 1.0')
      `).run();
    } catch (err) {
      this.logger.warn('[WikidataCountryIngestor] Failed to register source metadata:', err.message);
    }

    // Ensure cache directory exists
    if (this.useCache) {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
          this.logger.info(`[WikidataCountryIngestor] Created cache directory: ${this.cacheDir}`);
        }
      } catch (err) {
        this.logger.error('[WikidataCountryIngestor] Could not create cache directory:', err.message);
        throw err;
      }
    }

    // Create prepared statements from data layer
    this.logger.info('[WikidataCountryIngestor] Creating prepared statements...');
    this.stmts = ingestQueries.createIngestionStatements(this.db);
    this.logger.info('[WikidataCountryIngestor] Constructor complete');
    console.error('[WikidataCountryIngestor] CONSTRUCTOR COMPLETE - Ingestor ready');
    console.error('[WikidataCountryIngestor] Config:', { maxCountries: this.maxCountries, useCache: this.useCache, cacheDir: this.cacheDir });
  }

  async execute({ signal = null, emitProgress = null } = {}) {
    console.error('[WikidataCountryIngestor] execute() CALLED - starting country ingestion');
    const startedAt = Date.now();
    const queryStart = Date.now();  // Track query/processing start time for progress reporting
    let recordsProcessed = 0;
    let recordsUpserted = 0;
    let errors = 0;

    this.logger.info('[WikidataCountryIngestor] Starting country ingestion...');
    console.error('[WikidataCountryIngestor] About to emit telemetry');
    this._emitTelemetry(emitProgress, 'info', 'Starting Wikidata country discovery', {
      maxCountries: this.maxCountries,
      timeout: this.timeoutMs,
      retries: this.maxRetries,
      cacheEnabled: this.useCache
    });
    console.error('[WikidataCountryIngestor] Telemetry emitted, proceeding to SPARQL query');

    try {
      // Step 1: Fetch all country QIDs via SPARQL
      console.error('[WikidataCountryIngestor] Step 1: Building SPARQL query');
      this._emitProgress(emitProgress, { phase: 'discovery', message: 'Querying Wikidata SPARQL endpoint for countries' });
      
      const limitClause = this.maxCountries ? `LIMIT ${this.maxCountries}` : '';
      console.error('[WikidataCountryIngestor] Limit clause:', limitClause);
      
      const sparql = `SELECT DISTINCT ?country ?countryLabel ?iso2 ?coord WHERE {
  ?country wdt:P31 wd:Q3624078 .
  OPTIONAL { ?country wdt:P297 ?iso2 . }
  OPTIONAL { ?country wdt:P625 ?coord . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,pt,it,ja,ko,und" . }
}
ORDER BY ?countryLabel
${limitClause}`.trim();

      console.error('[WikidataCountryIngestor] SPARQL query built, length:', sparql.length);
      console.error('[WikidataCountryIngestor] Query preview:', sparql.substring(0, 200));
      
      this._emitTelemetry(emitProgress, 'debug', 'SPARQL query prepared', {
        queryLength: sparql.length,
        limitApplied: !!this.maxCountries,
        limitValue: this.maxCountries,
        queryPreview: sparql.substring(0, 150)
      });

      console.error('[WikidataCountryIngestor] About to call _fetchSparql');
      const sparqlResult = await this._fetchSparql(sparql, emitProgress);
      console.error('[WikidataCountryIngestor] _fetchSparql returned');
      console.error('[WikidataCountryIngestor] SPARQL result structure:', {
        hasResults: !!sparqlResult?.results,
        hasBindings: !!sparqlResult?.results?.bindings,
        bindingsLength: sparqlResult?.results?.bindings?.length
      });
      
      // Defensive: Validate SPARQL response structure
      if (!sparqlResult || typeof sparqlResult !== 'object') {
        throw new Error('SPARQL query returned invalid response (not an object)');
      }
      if (!sparqlResult.results || typeof sparqlResult.results !== 'object') {
        throw new Error('SPARQL query returned invalid response (missing results object)');
      }
      if (!Array.isArray(sparqlResult.results.bindings)) {
        throw new Error('SPARQL query returned invalid response (results.bindings is not an array)');
      }
      
      const bindings = sparqlResult.results.bindings;
      
      this.logger.info(`[WikidataCountryIngestor] SPARQL returned ${bindings.length} bindings`);
      console.error('[WikidataCountryIngestor] CRITICAL: bindings.length =', bindings.length);
      
      this._emitTelemetry(emitProgress, 'info', `SPARQL query completed: ${bindings.length} countries found`, {
        resultCount: bindings.length,
        hasResults: !!sparqlResult?.results,
        hasBindings: !!sparqlResult?.results?.bindings,
        bindingsIsArray: Array.isArray(sparqlResult?.results?.bindings),
        bindingsLength: sparqlResult?.results?.bindings?.length,
        headVars: sparqlResult?.head?.vars || [],
        firstResult: bindings[0] ? {
          hasCountry: !!bindings[0].country,
          hasLabel: !!bindings[0].countryLabel,
          hasIso2: !!bindings[0].iso2,
          hasCoord: !!bindings[0].coord,
          countryValue: bindings[0].country?.value,
          labelValue: bindings[0].countryLabel?.value
        } : null
      });
      this._emitTelemetry(emitProgress, 'info', `SPARQL query completed: ${bindings.length} countries found`, {
        resultCount: bindings.length,
        hasHead: !!sparqlResult?.head,
        headVars: sparqlResult?.head?.vars || [],
        firstResult: bindings[0] ? {
          hasCountry: !!bindings[0].country,
          hasLabel: !!bindings[0].countryLabel,
          hasIso2: !!bindings[0].iso2,
          hasCoord: !!bindings[0].coord,
          countryValue: bindings[0].country?.value,
          labelValue: bindings[0].countryLabel?.value
        } : null
      });
      
      if (bindings.length === 0) {
        console.error('[WikidataCountryIngestor] EARLY RETURN: Zero bindings from SPARQL!');
        console.error('[WikidataCountryIngestor] Query was:', sparql.substring(0, 300));
        this.logger.warn('[WikidataCountryIngestor] No countries found in SPARQL query');
        this._emitTelemetry(emitProgress, 'warning', 'SPARQL query returned zero results', {
          sparqlQuery: sparql.substring(0, 200),
          cacheUsed: this.useCache,
          endpointUrl: 'https://query.wikidata.org/sparql'
        });
        return { recordsProcessed: 0, recordsUpserted: 0, errors: 0 };
      }

      this.logger.info(`[WikidataCountryIngestor] Found ${bindings.length} countries`);
      this._emitProgress(emitProgress, { 
        phase: 'discovery-complete', 
        message: `Discovered ${bindings.length} countries`,
        totalItems: bindings.length,
        current: 0
      });

      // Step 2: Fetch full entity data for each country
      const qids = compact(bindings, b => this._extractQid(b.country?.value));
      
      // Defensive: Ensure we extracted valid QIDs
      if (!Array.isArray(qids) || qids.length === 0) {
        throw new Error(`Failed to extract valid QIDs from ${bindings.length} SPARQL bindings`);
      }
      
      this._emitTelemetry(emitProgress, 'info', `Extracted ${qids.length} QIDs from SPARQL results`, {
        qidCount: qids.length,
        firstQids: qids.slice(0, 5),
        mismatchCount: bindings.length - qids.length
      });
      
      const entities = await this._fetchEntities(qids, emitProgress);
      
      console.error('[WikidataCountryIngestor] Entity fetch returned. Type:', typeof entities);
      console.error('[WikidataCountryIngestor] Has .entities property:', !!entities?.entities);
      console.error('[WikidataCountryIngestor] Entity keys:', Object.keys(entities || {}).slice(0, 10));
      if (entities?.error) {
        console.error('[WikidataCountryIngestor] API ERROR:', JSON.stringify(entities.error));
      }
      if (entities?.entities) {
        console.error('[WikidataCountryIngestor] entities.entities keys:', Object.keys(entities.entities).slice(0, 5));
      } else {
        console.error('[WikidataCountryIngestor] CRITICAL: No .entities property in response!');
      }
      console.error('[WikidataCountryIngestor] Sample entity for', qids[0], ':', JSON.stringify(entities?.entities?.[qids[0]] || null)?.substring(0, 200));
      
      // Defensive: Validate entity fetch response
      if (!entities || typeof entities !== 'object') {
        throw new Error('Entity fetch returned invalid response (not an object)');
      }
      if (!entities.entities || typeof entities.entities !== 'object') {
        throw new Error('Entity fetch returned invalid response (missing entities object)');
      }
      
      this._emitTelemetry(emitProgress, 'info', 'Entity fetch completed', {
        requestedQids: qids.length,
        receivedEntities: Object.keys(entities.entities).length,
        hasErrors: !!entities?.error,
        errorMessage: entities?.error?.info
      });

      this._emitProgress(emitProgress, { 
        phase: 'processing', 
        message: 'Processing country entities',
        totalItems: qids.length,
        current: 0
      });

      // Step 3: Upsert each country
      for (let i = 0; i < bindings.length; i++) {
        if (signal?.aborted) {
          throw new Error('WikidataCountryIngestor aborted');
        }

        // Defensive: Validate binding exists
        const binding = bindings[i];
        if (!binding || typeof binding !== 'object') {
          this.logger.warn(`[WikidataCountryIngestor] Skipping invalid binding at index ${i}`);
          errors++;
          continue;
        }
        
        const qid = this._extractQid(binding.country?.value);
        if (!qid) {
          this.logger.warn(`[WikidataCountryIngestor] Skipping binding ${i}: no valid QID extracted`);
          errors++;
          continue;
        }

        const entity = entities.entities[qid];
        if (!entity) {
          this.logger.warn(`[WikidataCountryIngestor] No entity data for ${qid}`);
          errors++;
          recordsProcessed++;
          continue;
        }

        try {
          const upserted = this._upsertCountry(qid, entity, binding);
          if (upserted) recordsUpserted++;
          recordsProcessed++;

          // Emit progress every 5 records or on last record for more frequent updates
          if (i % 5 === 0 || i === bindings.length - 1) {
            const elapsed = Date.now() - queryStart;
            this._emitProgress(emitProgress, {
              phase: 'processing',
              current: i + 1,
              totalItems: bindings.length,
              message: `Processing countries: ${i+1}/${bindings.length} (${recordsUpserted} upserted, ${Math.round(elapsed/1000)}s)`
            });
          }

          if (recordsProcessed % 10 === 0) {
            this._emitProgress(emitProgress, {
              phase: 'processing',
              recordsProcessed,
              recordsUpserted,
              totalRecords: bindings.length
            });
          }
        } catch (err) {
          this.logger.error(`[WikidataCountryIngestor] Error upserting ${qid}:`, err.message);
          errors++;
          recordsProcessed++;
        }
      }

      const finishedAt = Date.now();
      const summary = {
        recordsProcessed,
        recordsUpserted,
        errors,
        durationMs: finishedAt - startedAt
      };

      this.logger.info('[WikidataCountryIngestor] Completed:', summary);
      this._emitProgress(emitProgress, { phase: 'complete', summary });

      return summary;
    } catch (error) {
      this.logger.error('[WikidataCountryIngestor] Fatal error:', error.message);
      throw error;
    }
  }

  _upsertCountry(qid, entity, sparqlBinding) {
    // Defensive: Validate required parameters
    if (!qid || typeof qid !== 'string') {
      throw new Error('_upsertCountry: qid must be a non-empty string');
    }
    if (!entity || typeof entity !== 'object') {
      throw new Error(`_upsertCountry: entity for ${qid} must be an object`);
    }
    if (!sparqlBinding || typeof sparqlBinding !== 'object') {
      throw new Error(`_upsertCountry: sparqlBinding for ${qid} must be an object`);
    }
    
    const claims = entity.claims || {};
    
    // Extract properties
    const iso2 = this._extractStringClaim(claims.P297) || sparqlBinding.iso2?.value || null;
    
    // Skip entities without valid 2-letter ISO codes (historical territories, special regions, etc.)
    if (!iso2 || iso2.length !== 2) {
      const label = entity.labels?.en?.value || entity.labels?.[Object.keys(entity.labels)[0]]?.value || qid;
      console.error(`[WikidataCountryIngestor] Skipping ${qid} (${label}): missing or invalid ISO-3166 alpha-2 code (got: ${iso2 || 'null'})`);
      return false;
    }
    const population = this._extractQuantityClaim(claims.P1082);
    const area = this._extractQuantityClaim(claims.P2046);
    const gdp = this._extractQuantityClaim(claims.P2131);
    const coords = this._extractCoordinates(claims.P625) || this._parseWktPoint(sparqlBinding.coord?.value);
    const osmRelationId = this._extractStringClaim(claims.P402);
    const geonamesId = this._extractStringClaim(claims.P1566);

    // Build wikidata_props JSON with comprehensive data
    const gdpPerCapita = this._extractQuantityClaim(claims.P2132);

    const wikidataProps = {
      qid,
      iso2,
      iso3: this._extractStringClaim(claims.P298),
      capital: this._extractItemClaim(claims.P36),
      officialLanguages: this._extractItemClaimArray(claims.P37),
      population,
      area,
      gdp,
      gdpPerCapita,
      timezone: this._extractStringClaim(claims.P421),
      continent: this._extractItemClaim(claims.P30),
      memberOf: this._extractItemClaimArray(claims.P463),
      osmRelationId,
      geonamesId,
      currency: this._extractItemClaim(claims.P38)
    };

    // Upsert place using data layer
    const attributes = [];
    const coordValue = coords ? { lat: coords.lat, lng: coords.lon } : null;

    if (population != null) {
      attributes.push({ attr: 'population', value: population, metadata: { property: 'P1082' } });
    }
    if (area != null) {
      attributes.push({ attr: 'area_sq_km', value: area, metadata: { property: 'P2046' } });
    }
    if (gdp != null) {
      attributes.push({ attr: 'gdp_usd', value: gdp, metadata: { property: 'P2131' } });
    }
    if (gdpPerCapita != null) {
      attributes.push({ attr: 'gdp_per_capita_usd', value: gdpPerCapita, metadata: { property: 'P2132' } });
    }
    if (iso2) {
      attributes.push({ attr: 'iso.alpha2', value: iso2, metadata: { property: 'P297' } });
    }
    if (coordValue) {
      attributes.push({ attr: 'coordinates', value: coordValue, metadata: { property: 'P625' } });
    }
    if (osmRelationId) {
      attributes.push({ attr: 'osm.relation', value: osmRelationId, metadata: { property: 'P402' } });
    }
    if (geonamesId) {
      attributes.push({ attr: 'geonames.id', value: geonamesId, metadata: { property: 'P1566' } });
    }

    const placeData = {
      wikidataQid: qid,
      kind: 'country',
      countryCode: iso2,
      population,
      timezone: null,
      lat: coords?.lat,
      lng: coords?.lon,
      bbox: null,
      source: 'wikidata',
      extra: null,
      area,
      gdpUsd: gdp,
      adminLevel: 2,
      wikidataProps,
      crawlDepth: 0,
      priorityScore: 1000,
      osmType: osmRelationId ? 'relation' : null,
      osmId: osmRelationId || null,
      attributes
    };

    // Defensive: Validate place data before database operation
    if (!Array.isArray(placeData.attributes)) {
      throw new Error(`_upsertCountry: attributes for ${qid} must be an array`);
    }

    const placeId = ingestQueries.upsertPlace(this.db, this.stmts, placeData);
    
    // Defensive: Validate upsert returned a valid place ID
    if (!placeId || (typeof placeId !== 'number' && typeof placeId !== 'string')) {
      throw new Error(`_upsertCountry: Failed to upsert place for ${qid} (no valid placeId returned)`);
    }

    // Insert names (labels and aliases)
    const names = this._extractNames(entity);
    
    // Defensive: Validate names array
    if (!Array.isArray(names)) {
      this.logger.warn(`[WikidataCountryIngestor] _extractNames returned non-array for ${qid}`);
    } else {
      each(names, name => {
        // Defensive: Validate name object has required fields
        if (!name || typeof name !== 'object' || !name.text || !name.lang) {
          this.logger.warn(`[WikidataCountryIngestor] Skipping invalid name for ${qid}:`, name);
          return;
        }
        ingestQueries.insertPlaceName(this.stmts, placeId, {
          text: name.text,
          lang: name.lang,
          kind: name.kind,
          isPreferred: name.isPreferred,
          isOfficial: name.isOfficial,
          source: 'wikidata'
        });
      });
    }

    // Set canonical name
    ingestQueries.setCanonicalName(this.stmts, placeId);

    // Insert external IDs
    ingestQueries.insertExternalId(this.stmts, 'wikidata', qid, placeId);
    if (osmRelationId) {
      ingestQueries.insertExternalId(this.stmts, 'osm', `relation/${osmRelationId}`, placeId);
    }
    if (geonamesId) {
      ingestQueries.insertExternalId(this.stmts, 'geonames', geonamesId, placeId);
    }

    return true;
  }

  _extractNames(entity) {
    // Defensive: Validate entity parameter
    if (!entity || typeof entity !== 'object') {
      this.logger.warn('[WikidataCountryIngestor] _extractNames: invalid entity object');
      return [];
    }
    
    const names = [];
    const labels = entity.labels || {};
    const aliases = entity.aliases || {};

    // Labels (official)
    each(labels, (labelObj, lang) => {
      if (labelObj?.value) {
        names.push({
          text: labelObj.value,
          lang,
          kind: 'official',
          isPreferred: true,
          isOfficial: true
        });
      }
    });

    // Aliases
    each(aliases, (aliasArray, lang) => {
      each(aliasArray, aliasObj => {
        if (aliasObj?.value) {
          names.push({
            text: aliasObj.value,
            lang,
            kind: 'alias',
            isPreferred: false,
            isOfficial: false
          });
        }
      });
    });

    return names;
  }

  _normalizeName(text) {
    if (!text) return null;
    return text.normalize('NFD').replace(/\p{Diacritic}+/gu, '').toLowerCase();
  }

  _extractQid(url) {
    if (!url) return null;
    const match = url.match(/Q\d+$/);
    return match ? match[0] : null;
  }

  _extractStringClaim(claimArray) {
    if (!is_array(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    return tof(value) === 'string' ? value : null;
  }

  _extractQuantityClaim(claimArray) {
    if (!is_array(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    if (value?.amount) {
      const num = parseFloat(value.amount);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }

  _extractItemClaim(claimArray) {
    if (!is_array(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    return value?.id || null;
  }

  _extractItemClaimArray(claimArray) {
    if (!is_array(claimArray)) return [];
    return compact(claimArray, claim => claim?.mainsnak?.datavalue?.value?.id);
  }

  _extractCoordinates(claimArray) {
    if (!is_array(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    if (value?.latitude != null && value?.longitude != null) {
      return { lat: value.latitude, lon: value.longitude };
    }
    return null;
  }

  _parseWktPoint(wkt) {
    if (tof(wkt) !== 'string') return null;
    const match = wkt.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/i);
    if (!match) return null;
    const lon = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
    return null;
  }

  async _fetchSparql(query, emitProgress = null) {
    console.error('[WikidataCountryIngestor] _fetchSparql CALLED');
    const queryStartTime = Date.now();
    const cacheKey = crypto.createHash('sha1').update(query).digest('hex');
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
    console.error('[WikidataCountryIngestor] Cache key:', cacheKey.substring(0, 12), 'Path:', cachePath);

    // Try cache first
    if (this.useCache) {
      console.error('[WikidataCountryIngestor] Checking cache at:', cachePath);
      try {
        if (fs.existsSync(cachePath)) {
          console.error('[WikidataCountryIngestor] CACHE HIT!');
          const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          console.error('[WikidataCountryIngestor] Cached data has', cached?.results?.bindings?.length, 'bindings');
          const cacheReadTime = Date.now() - queryStartTime;
          this.logger.info('[WikidataCountryIngestor] SPARQL cache hit');
          this._emitTelemetry(emitProgress, 'performance', 'SPARQL cache hit', { 
            cacheKey,
            cacheReadTimeMs: cacheReadTime,
            resultCount: cached?.results?.bindings?.length || 0
          });
          return cached;
        }
      } catch (err) {
        this.logger.warn('[WikidataCountryIngestor] Cache read error:', err.message);
        this._emitTelemetry(emitProgress, 'warning', 'Cache read failed', { error: err.message });
      }
    }

    // Fetch from Wikidata with retries
    console.error('[WikidataCountryIngestor] CACHE MISS - Making network request');
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const networkStartTime = Date.now();
    console.error('[WikidataCountryIngestor] URL:', url.substring(0, 150));
    this.logger.info('[WikidataCountryIngestor] Fetching SPARQL:', url.substring(0, 100) + '...');
    
    this._emitTelemetry(emitProgress, 'query-start', 'Querying Wikidata SPARQL endpoint', {
      queryType: 'sparql',
      endpoint: 'https://query.wikidata.org/sparql',
      queryLength: query.length,
      queryPreview: query.substring(0, 200).replace(/\s+/g, ' '),
      cacheKey,
      timeout: this.timeoutMs,
      retries: this.maxRetries,
      startTime: networkStartTime,
      queryHash: cacheKey.substring(0, 8)
    });

    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Use native fetch (Node.js 18+)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          this._emitTelemetry(emitProgress, 'debug', `SPARQL fetch attempt ${attempt}/${this.maxRetries}`, {
            attempt,
            maxRetries: this.maxRetries,
            timeoutMs: this.timeoutMs
          });
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'copilot-dl-news/1.0 (Geography gazetteer; https://github.com/metabench/copilot-dl-news)',
              'Accept': 'application/sparql-results+json'
            },
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error body');
            this._emitTelemetry(emitProgress, 'error', `SPARQL HTTP error on attempt ${attempt}`, {
              status: response.status,
              statusText: response.statusText,
              errorBody: errorText.substring(0, 500),
              attempt
            });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          const queryDurationMs = Date.now() - networkStartTime;
          const totalDurationMs = Date.now() - queryStartTime;
          
          this._emitTelemetry(emitProgress, 'query-complete', `SPARQL request succeeded on attempt ${attempt}`, {
            queryType: 'sparql',
            endpoint: 'https://query.wikidata.org/sparql',
            success: true,
            attempt,
            resultCount: data?.results?.bindings?.length || 0,
            hasHead: !!data?.head,
            headVars: data?.head?.vars || [],
            networkDurationMs: queryDurationMs,
            totalDurationMs: totalDurationMs,
            cacheWriteTime: 0, // Will be updated after cache write
            queryHash: cacheKey.substring(0, 8),
            // Planning assessment metrics
            avgTimePerResult: data?.results?.bindings?.length > 0 
              ? Math.round(queryDurationMs / data.results.bindings.length) 
              : 0,
            resultsPerSecond: data?.results?.bindings?.length > 0
              ? Math.round((data.results.bindings.length / queryDurationMs) * 1000)
              : 0
          });

          // Cache the result
          if (this.useCache) {
            const cacheWriteStart = Date.now();
            try {
              fs.writeFileSync(cachePath, JSON.stringify(data));
              const cacheWriteDuration = Date.now() - cacheWriteStart;
              
              this._emitTelemetry(emitProgress, 'performance', 'SPARQL result cached', {
                cacheKey: cacheKey.substring(0, 8),
                cacheWriteTimeMs: cacheWriteDuration,
                cacheSizeBytes: JSON.stringify(data).length,
                cachePath
              });
            } catch (err) {
              this.logger.warn('[WikidataCountryIngestor] Cache write error:', err.message);
              this._emitTelemetry(emitProgress, 'warning', 'Cache write failed', { 
                error: err.message,
                cacheKey: cacheKey.substring(0, 8)
              });
            }
          }

          // Rate limiting
          if (this.sleepMs > 0) {
            await new Promise(resolve => setTimeout(resolve, this.sleepMs));
          }

          this.logger.info(`[WikidataCountryIngestor] SPARQL query succeeded (attempt ${attempt})`);
          return data;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        lastError = error;
        this.logger.warn(`[WikidataCountryIngestor] SPARQL attempt ${attempt}/${this.maxRetries} failed: ${error.message}`);
        
        this._emitTelemetry(emitProgress, 'error', `SPARQL attempt ${attempt} failed: ${error.message}`, {
          attempt,
          maxRetries: this.maxRetries,
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.code,
          errorType: error.type,
          isAbortError: error.name === 'AbortError',
          isNetworkError: error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED',
          isProtocolError: error.message?.includes('Protocol') || error.message?.includes('not supported'),
          errorStack: error.stack?.split('\n').slice(0, 3).join(' | ')
        });
        
        if (attempt < this.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          this.logger.info(`[WikidataCountryIngestor] Retrying in ${backoffMs}ms...`);
          this._emitTelemetry(emitProgress, 'info', `Waiting ${backoffMs}ms before retry`, {
            backoffMs,
            nextAttempt: attempt + 1
          });
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries failed
    this.logger.error('[WikidataCountryIngestor] SPARQL fetch failed after all retries:', lastError.message);
    
    // Build detailed error message
    let detailedError = lastError.message;
    if (lastError.code) {
      detailedError = `${lastError.code}: ${detailedError}`;
    }
    if (lastError.message?.includes('Protocol') && lastError.message?.includes('not supported')) {
      detailedError += ' (Note: Ensure node-fetch supports HTTPS - may need to update dependencies or check import)';
    }
    
    this._emitTelemetry(emitProgress, 'error', `SPARQL query failed after all retries: ${detailedError}`, {
      attempts: this.maxRetries,
      finalError: detailedError,
      errorName: lastError.name,
      errorCode: lastError.code,
      errorType: lastError.type,
      queryPreview: query.substring(0, 200),
      isProtocolError: lastError.message?.includes('Protocol')
    });
    throw new Error(`SPARQL query failed after ${this.maxRetries} attempts: ${detailedError}`);
  }

  async _fetchEntities(qids, emitProgress = null) {
    if (qids.length === 0) return { entities: {} };

    const fetchStartTime = Date.now();
    const BATCH_SIZE = 50; // Wikidata API limit
    
    this.logger.info(`[WikidataCountryIngestor] Fetching ${qids.length} entities in batches of ${BATCH_SIZE}`);
    
    // Split QIDs into batches
    const batches = [];
    for (let i = 0; i < qids.length; i += BATCH_SIZE) {
      batches.push(qids.slice(i, i + BATCH_SIZE));
    }
    
    console.error(`[WikidataCountryIngestor] Split ${qids.length} QIDs into ${batches.length} batches`);
    
    this._emitTelemetry(emitProgress, 'info', `Starting entity fetch: ${batches.length} batches`, {
      totalQids: qids.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE
    });
    
    // Fetch all batches
    const allEntities = {};
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const elapsed = Math.round((Date.now() - fetchStartTime) / 1000);
      console.error(`[WikidataCountryIngestor] Fetching batch ${batchIndex + 1}/${batches.length} (${batch.length} entities, ${elapsed}s elapsed)`);
      
      this._emitProgress(emitProgress, {
        phase: 'fetching-entities',
        current: batchIndex + 1,
        totalItems: batches.length,
        message: `Fetching entity batch ${batchIndex + 1}/${batches.length} (${batch.length} entities, ${elapsed}s)`
      });
      
      try {
        const batchData = await this._fetchEntityBatch(batch, emitProgress, fetchStartTime);
        
        // Merge entities from this batch
        if (batchData?.entities) {
          Object.assign(allEntities, batchData.entities);
        }
      } catch (error) {
        console.error(`[WikidataCountryIngestor] Batch ${batchIndex + 1} failed:`, error.message);
        this._emitTelemetry(emitProgress, 'error', `Failed to fetch entity batch ${batchIndex + 1}/${batches.length}`, {
          batchIndex: batchIndex + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack
        });
        // Continue with remaining batches instead of failing entirely
      }
      
      // Sleep between batches to respect rate limits
      if (this.sleepMs > 0 && batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, this.sleepMs));
      }
    }
    
    const fetchDurationMs = Date.now() - fetchStartTime;
    console.error(`[WikidataCountryIngestor] Completed fetching ${Object.keys(allEntities).length}/${qids.length} entities in ${fetchDurationMs}ms`);
    
    return { entities: allEntities };
  }

  async _fetchEntityBatch(qids, emitProgress = null, overallStartTime = Date.now()) {
    // Defensive: Validate qids array
    if (!Array.isArray(qids) || qids.length === 0) {
      throw new Error('_fetchEntityBatch: qids must be a non-empty array');
    }
    if (qids.length > 50) {
      throw new Error(`_fetchEntityBatch: batch size ${qids.length} exceeds Wikidata API limit of 50`);
    }
    
    const batchStartTime = Date.now();
    
    // Wikidata API supports up to 50 entities per request (500 for bots)
    // Request specific properties to reduce response size
    const ids = qids.join('|');
    const props = 'labels|aliases|descriptions|claims|sitelinks';
    const languages = 'en|fr|de|es|ru|zh|ar|pt|it|ja|ko';
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=${props}&languages=${languages}&format=json`;
    
    this._emitTelemetry(emitProgress, 'query-start', 'Fetching entity batch from Wikidata API', {
      queryType: 'wikidata-api',
      apiAction: 'wbgetentities',
      entityCount: qids.length,
      requestedProps: props.split('|'),
      languages: languages.split('|').length,
      apiEndpoint: 'https://www.wikidata.org/w/api.php',
      startTime: batchStartTime,
      firstQids: qids.slice(0, 5)
    });

    // Use native fetch (Node.js 18+)
    const controller = new AbortController();
    const timeoutMs = Math.max(this.timeoutMs, 30000); // At least 30s for entity fetch
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'copilot-dl-news/1.0 (Geography gazetteer; https://github.com/metabench/copilot-dl-news)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error body');
        this._emitTelemetry(emitProgress, 'error', 'Entity fetch HTTP error', {
          status: response.status,
          statusText: response.statusText,
          qidCount: qids.length,
          errorBody: errorText.substring(0, 500)
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API-level errors (Wikidata returns HTTP 200 with error object)
      if (data.error) {
        this._emitTelemetry(emitProgress, 'error', `Wikidata API error: ${data.error.code} - ${data.error.info}`, {
          errorCode: data.error.code,
          errorInfo: data.error.info,
          parameter: data.error.parameter,
          limit: data.error.limit,
          requestedCount: qids.length
        });
        throw new Error(`Wikidata API error: ${data.error.code} - ${data.error.info}`);
      }
      
      const fetchDurationMs = Date.now() - batchStartTime;
      
      const entityCount = Object.keys(data?.entities || {}).length;
      const errorCount = Object.values(data?.entities || {}).filter(e => e.missing).length;
      const responseSizeBytes = JSON.stringify(data).length;
      
      this._emitTelemetry(emitProgress, 'query-complete', 'Entity batch fetch succeeded', {
        queryType: 'wikidata-api',
        apiAction: 'wbgetentities',
        success: true,
        requestedCount: qids.length,
        receivedCount: entityCount,
        missingCount: errorCount,
        successRate: qids.length > 0 ? Math.round((entityCount / qids.length) * 100) : 0,
        durationMs: fetchDurationMs,
        responseSizeBytes,
        responseSizeKB: Math.round(responseSizeBytes / 1024),
        // Planning assessment metrics
        avgTimePerEntity: entityCount > 0 ? Math.round(fetchDurationMs / entityCount) : 0,
        entitiesPerSecond: Math.round((entityCount / fetchDurationMs) * 1000),
        bytesPerEntity: entityCount > 0 ? Math.round(responseSizeBytes / entityCount) : 0
      });

      return data;
    } catch (error) {
      // Build detailed error message
      let detailedError = error.message;
      if (error.code) {
        detailedError = `${error.code}: ${detailedError}`;
      }
      
      this._emitTelemetry(emitProgress, 'error', `Entity batch fetch failed: ${detailedError}`, {
        errorMessage: detailedError,
        errorName: error.name,
        errorCode: error.code,
        errorType: error.type,
        qidCount: qids.length,
        timeoutMs,
        isAbortError: error.name === 'AbortError',
        isProtocolError: error.message?.includes('Protocol'),
        errorStack: error.stack?.split('\n').slice(0, 3).join(' | ')
      });
      throw new Error(`Failed to fetch entity batch (${qids.length} entities): ${detailedError}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _emitProgress(handler, payload) {
    if (tof(handler) === 'function') {
      try {
        handler(payload);
      } catch (err) {
        // Best effort
      }
    }
  }

  _emitTelemetry(handler, level, message, details = {}) {
    if (tof(handler) !== 'function') return;
    
    try {
      const telemetryEvent = {
        type: 'telemetry',
        source: 'WikidataCountryIngestor',
        level,  // 'debug', 'info', 'warning', 'error', 'performance', 'query-start', 'query-complete'
        message,
        details,
        timestamp: new Date().toISOString(),
        timestampMs: Date.now()
      };
      
      // Add performance metadata for planning assessment
      if (level === 'query-complete' || level === 'query-start' || level === 'performance') {
        telemetryEvent.category = 'query-performance';
        telemetryEvent.planningMetadata = {
          canCache: details.queryType === 'sparql',
          estimatedCost: this._estimateQueryCost(details),
          recommendedFrequency: this._recommendQueryFrequency(details)
        };
      }
      
      handler(telemetryEvent);
    } catch (err) {
      // Best effort - don't let telemetry break execution
    }
  }
  
  _estimateQueryCost(details) {
    // Estimate query cost for planning purposes
    if (details.queryType === 'sparql') {
      const baseMs = details.networkDurationMs || details.durationMs || 0;
      const resultCount = details.resultCount || 0;
      return {
        timeMs: baseMs,
        results: resultCount,
        costScore: baseMs + (resultCount * 10), // Simple heuristic
        category: baseMs < 1000 ? 'fast' : baseMs < 5000 ? 'medium' : 'slow'
      };
    } else if (details.queryType === 'wikidata-api') {
      const baseMs = details.durationMs || 0;
      const entityCount = details.receivedCount || 0;
      return {
        timeMs: baseMs,
        entities: entityCount,
        costScore: baseMs + (entityCount * 50),
        category: baseMs < 2000 ? 'fast' : baseMs < 10000 ? 'medium' : 'slow'
      };
    }
    return { timeMs: 0, costScore: 0, category: 'unknown' };
  }
  
  _recommendQueryFrequency(details) {
    // Recommend how often this query should run based on performance
    const cost = this._estimateQueryCost(details);
    if (cost.category === 'fast') {
      return { frequency: 'high', intervalMinutes: 5, reasoning: 'Fast query suitable for frequent updates' };
    } else if (cost.category === 'medium') {
      return { frequency: 'medium', intervalMinutes: 60, reasoning: 'Moderate cost, run hourly' };
    } else if (cost.category === 'slow') {
      return { frequency: 'low', intervalMinutes: 1440, reasoning: 'Expensive query, run daily' };
    }
    return { frequency: 'unknown', intervalMinutes: 0, reasoning: 'Unable to assess' };
  }
}

module.exports = { WikidataCountryIngestor };
