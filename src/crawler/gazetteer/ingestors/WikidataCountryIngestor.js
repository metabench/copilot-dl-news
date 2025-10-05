'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ingestQueries = require('../../db/sqlite/queries/gazetteer.ingest');

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
    timeoutMs = 20000,
    sleepMs = 250,
    useCache = true
  } = {}) {
    if (!db) {
      throw new Error('WikidataCountryIngestor requires a database handle');
    }
    this.db = db;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.sleepMs = sleepMs;
    this.useCache = useCache;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache', 'sparql');

    this.id = 'wikidata-countries';
    this.name = 'Wikidata Country Ingestor';

    // Ensure cache directory exists
    if (this.useCache) {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      } catch (err) {
        this.logger.warn('[WikidataCountryIngestor] Could not create cache directory:', err.message);
      }
    }

    // Create prepared statements from data layer
    this.stmts = ingestQueries.createIngestionStatements(this.db);
  }

  async execute({ signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();
    let recordsProcessed = 0;
    let recordsUpserted = 0;
    let errors = 0;

    this.logger.info('[WikidataCountryIngestor] Starting country ingestion...');

    try {
      // Step 1: Fetch all country QIDs via SPARQL
      this._emitProgress(emitProgress, { phase: 'discovery', message: 'Querying Wikidata for all countries' });
      
      const sparql = `
        SELECT ?country ?countryLabel ?iso2 ?coord WHERE {
          ?country wdt:P31 wd:Q6256.  # Instance of: country
          OPTIONAL { ?country wdt:P297 ?iso2. }  # ISO 3166-1 alpha-2 code
          OPTIONAL { ?country wdt:P625 ?coord. }  # Coordinates
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,pt,it,ja,ko,und". }
        }
        ORDER BY ?countryLabel
      `;

      const sparqlResult = await this._fetchSparql(sparql);
      const bindings = sparqlResult?.results?.bindings || [];
      
      if (bindings.length === 0) {
        this.logger.warn('[WikidataCountryIngestor] No countries found in SPARQL query');
        return { recordsProcessed: 0, recordsUpserted: 0, errors: 0 };
      }

      this.logger.info(`[WikidataCountryIngestor] Found ${bindings.length} countries`);
      this._emitProgress(emitProgress, { 
        phase: 'discovery-complete', 
        totalRecords: bindings.length 
      });

      // Step 2: Fetch full entity data for each country
      const qids = bindings.map(b => this._extractQid(b.country?.value)).filter(Boolean);
      const entities = await this._fetchEntities(qids);

      this._emitProgress(emitProgress, { 
        phase: 'processing', 
        message: 'Processing country entities',
        totalRecords: qids.length
      });

      // Step 3: Upsert each country
      for (let i = 0; i < bindings.length; i++) {
        if (signal?.aborted) {
          throw new Error('WikidataCountryIngestor aborted');
        }

        const binding = bindings[i];
        const qid = this._extractQid(binding.country?.value);
        if (!qid) {
          errors++;
          continue;
        }

        const entity = entities?.entities?.[qid];
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
    const claims = entity.claims || {};
    
    // Extract properties
    const iso2 = this._extractStringClaim(claims.P297) || sparqlBinding.iso2?.value || null;
    const population = this._extractQuantityClaim(claims.P1082);
    const area = this._extractQuantityClaim(claims.P2046);
    const gdp = this._extractQuantityClaim(claims.P2131);
    const coords = this._extractCoordinates(claims.P625) || this._parseWktPoint(sparqlBinding.coord?.value);
    const osmRelationId = this._extractStringClaim(claims.P402);
    const geonamesId = this._extractStringClaim(claims.P1566);

    // Build wikidata_props JSON with comprehensive data
    const wikidataProps = {
      qid,
      iso2,
      iso3: this._extractStringClaim(claims.P298),
      capital: this._extractItemClaim(claims.P36),
      officialLanguages: this._extractItemClaimArray(claims.P37),
      population,
      area,
      gdp,
      gdpPerCapita: this._extractQuantityClaim(claims.P2132),
      timezone: this._extractStringClaim(claims.P421),
      continent: this._extractItemClaim(claims.P30),
      memberOf: this._extractItemClaimArray(claims.P463),
      osmRelationId,
      geonamesId,
      currency: this._extractItemClaim(claims.P38)
    };

    // Upsert place using data layer
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
      priorityScore: 1000
    };

    const placeId = ingestQueries.upsertPlace(this.db, this.stmts, placeData);

    // Insert names (labels and aliases)
    const names = this._extractNames(entity);
    names.forEach(name => {
      ingestQueries.insertPlaceName(this.stmts, placeId, {
        text: name.text,
        lang: name.lang,
        kind: name.kind,
        isPreferred: name.isPreferred,
        isOfficial: name.isOfficial,
        source: 'wikidata'
      });
    });

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
    const names = [];
    const labels = entity.labels || {};
    const aliases = entity.aliases || {};

    // Labels (official)
    Object.entries(labels).forEach(([lang, labelObj]) => {
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
    Object.entries(aliases).forEach(([lang, aliasArray]) => {
      (aliasArray || []).forEach(aliasObj => {
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
    if (!Array.isArray(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    return typeof value === 'string' ? value : null;
  }

  _extractQuantityClaim(claimArray) {
    if (!Array.isArray(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    if (value?.amount) {
      const num = parseFloat(value.amount);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }

  _extractItemClaim(claimArray) {
    if (!Array.isArray(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    return value?.id || null;
  }

  _extractItemClaimArray(claimArray) {
    if (!Array.isArray(claimArray)) return [];
    return claimArray
      .map(claim => claim?.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
  }

  _extractCoordinates(claimArray) {
    if (!Array.isArray(claimArray) || claimArray.length === 0) return null;
    const value = claimArray[0]?.mainsnak?.datavalue?.value;
    if (value?.latitude != null && value?.longitude != null) {
      return { lat: value.latitude, lon: value.longitude };
    }
    return null;
  }

  _parseWktPoint(wkt) {
    if (typeof wkt !== 'string') return null;
    const match = wkt.match(/Point\(([-0-9.]+)\s+([-0-9.]+)\)/i);
    if (!match) return null;
    const lon = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
    return null;
  }

  async _fetchSparql(query) {
    const cacheKey = crypto.createHash('sha1').update(query).digest('hex');
    const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);

    // Try cache first
    if (this.useCache) {
      try {
        if (fs.existsSync(cachePath)) {
          const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          this.logger.info('[WikidataCountryIngestor] SPARQL cache hit');
          return cached;
        }
      } catch (err) {
        this.logger.warn('[WikidataCountryIngestor] Cache read error:', err.message);
      }
    }

    // Fetch from Wikidata
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    this.logger.info('[WikidataCountryIngestor] Fetching SPARQL:', url.substring(0, 100) + '...');

    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'copilot-dl-news/1.0 (Wikidata gazetteer importer)',
          'Accept': 'application/sparql-results+json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      if (this.useCache) {
        try {
          fs.writeFileSync(cachePath, JSON.stringify(data));
        } catch (err) {
          this.logger.warn('[WikidataCountryIngestor] Cache write error:', err.message);
        }
      }

      // Rate limiting
      if (this.sleepMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.sleepMs));
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _fetchEntities(qids) {
    if (qids.length === 0) return { entities: {} };

    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qids.join('|'))}.json`;
    this.logger.info(`[WikidataCountryIngestor] Fetching ${qids.length} entities`);

    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(this.timeoutMs, 30000));

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'copilot-dl-news/1.0 (Wikidata entity fetch)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (this.sleepMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.sleepMs));
      }

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _emitProgress(handler, payload) {
    if (typeof handler === 'function') {
      try {
        handler(payload);
      } catch (err) {
        // Best effort
      }
    }
  }
}

module.exports = { WikidataCountryIngestor };
