/**
 * @fileoverview Wikidata Cities Ingestor
 * 
 * Fetches major cities from Wikidata with comprehensive properties:
 * - Basic: labels, aliases, descriptions (multiple languages)
 * - Geographic: coordinates, elevation, timezone
 * - Administrative: country, region (ADM1), population
 * - External IDs: OSM node/relation, GeoNames
 * - Hierarchical relationships: part of country/region
 * 
 * Uses SPARQL for discovery + entity API for detailed data.
 * Cities are prioritized by population for efficient ingestion.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const chalk = require('chalk');
const { tof, each, is_array } = require('lang-tools');
const { compact } = require('../../../utils/pipelines');
const { AttributeBuilder } = require('../../../utils/attributeBuilder');
const ingestQueries = require('../../../db/sqlite/queries/gazetteer.ingest');
const {
  DEFAULT_LABEL_LANGUAGES,
  buildCitiesDiscoveryQuery,
  buildCountryClause
} = require('../queries/geographyQueries');

class WikidataCitiesIngestor {
  constructor({
    db,
    cacheDir = null,
    logger = console,
    timeoutMs = 20000,
    sleepMs = 250,
    useCache = true,
    maxCitiesPerCountry = 50,
    minPopulation = 100000,
    limitCountries = null,
    targetCountries = null,
    verbose = false
  } = {}) {
    if (!db) {
      throw new Error('WikidataCitiesIngestor requires a database handle');
    }
    this.db = db;
    this.logger = logger;
    this.verbose = verbose;
    this.timeoutMs = timeoutMs;
    this.sleepMs = sleepMs;
    this.useCache = useCache;
    this.maxCitiesPerCountry = maxCitiesPerCountry;
    this.minPopulation = minPopulation;
    this.limitCountries = limitCountries;
  this.targetCountries = Array.isArray(targetCountries) && targetCountries.length ? targetCountries : null;
  this.countryFilter = this.targetCountries ? this._buildCountryFilter(this.targetCountries) : null;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache', 'sparql');
    this.labelLanguages = [...DEFAULT_LABEL_LANGUAGES];

    this.id = 'wikidata-cities';
    this.name = 'Wikidata Cities Ingestor';

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO place_sources(name, version, url, license)
        VALUES ('wikidata', 'latest', 'https://www.wikidata.org', 'CC0 1.0')
      `).run();
    } catch (err) {
      this.logger.warn('[WikidataCitiesIngestor] Failed to register source metadata:', err.message);
    }

    if (this.useCache) {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      } catch (err) {
        this.logger.warn('[WikidataCitiesIngestor] Could not create cache directory:', err.message);
      }
    }

    this.stmts = ingestQueries.createIngestionStatements(this.db);
  }

  async execute({ signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();
    let recordsProcessed = 0;
    let recordsUpserted = 0;
    let errors = 0;

    this.logger.info('[WikidataCitiesIngestor] Starting cities ingestion...');

    try {
      // Get all countries from database
      const allCountries = this.db.prepare(`
        SELECT p.id, p.country_code, p.wikidata_qid, pn.name AS canonical_name, pn.normalized AS canonical_normalized
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = 'country' AND p.country_code IS NOT NULL
        ORDER BY p.country_code
      `).all();

      let countries = allCountries;

      if (this.countryFilter) {
        const { filteredCountries, unmatchedSpecifiers } = this._filterCountryList(allCountries);
        this.logger.info(`[WikidataCitiesIngestor] Target country filter applied: ${filteredCountries.length}/${allCountries.length} countries retained`);
        if (unmatchedSpecifiers.length) {
          this.logger.warn('[WikidataCitiesIngestor] Some target countries were not found for city ingestion:', unmatchedSpecifiers.map(spec => spec.raw || spec.value || spec.key));
        }
        countries = filteredCountries;
      }

      if (this.limitCountries && countries.length > this.limitCountries) {
        countries = countries.slice(0, this.limitCountries);
      }

      if (countries.length === 0) {
        this.logger.warn(this.countryFilter
          ? '[WikidataCitiesIngestor] No countries matched the requested target filter'
          : '[WikidataCitiesIngestor] No countries found in database');
        return { recordsProcessed: 0, recordsUpserted: 0, errors: 0 };
      }

      this._emitProgress(emitProgress, {
        phase: 'discovery',
        message: `Processing cities for ${countries.length} countries`,
        totalCountries: countries.length,
        maxCitiesPerCountry: this.maxCitiesPerCountry,
        minPopulation: this.minPopulation,
        estimatedTotal: countries.length * this.maxCitiesPerCountry
      });

      // Process each country
      for (let i = 0; i < countries.length; i++) {
        if (signal?.aborted) {
          throw new Error('WikidataCitiesIngestor aborted');
        }

        const country = countries[i];
        
        try {
          const result = await this._processCitiesForCountry(country, emitProgress);
          recordsProcessed += result.processed;
          recordsUpserted += result.upserted;
          errors += result.errors;

          const elapsed = Date.now() - startedAt;
          const avgTimePerCountry = elapsed / (i + 1);
          const estimatedRemaining = avgTimePerCountry * (countries.length - (i + 1));
          const percentComplete = Math.round(((i + 1) / countries.length) * 100);
          
          this._emitProgress(emitProgress, {
            phase: 'processing',
            current: i + 1,
            totalItems: countries.length,
            percentComplete,
            countryCode: country.country_code,
            citiesProcessed: result.processed,
            citiesUpserted: result.upserted,
            totalProcessed: recordsProcessed,
            totalUpserted: recordsUpserted,
            totalErrors: errors,
            timing: {
              elapsedMs: elapsed,
              avgPerCountryMs: Math.round(avgTimePerCountry),
              estimatedRemainingMs: Math.round(estimatedRemaining)
            },
            message: `[${i + 1}/${countries.length}] ${country.country_code}: ${result.processed} cities (${percentComplete}% complete)`
          });
        } catch (err) {
          this.logger.error(`[WikidataCitiesIngestor] Error processing country ${country.country_code}:`, err.message);
          errors++;
        }

        // Brief pause between countries to avoid rate limiting
        if (i < countries.length - 1) {
          await this._sleep(this.sleepMs);
        }
      }

      const finishedAt = Date.now();
      const summary = {
        recordsProcessed,
        recordsUpserted,
        errors,
        durationMs: finishedAt - startedAt
      };

      const avgCitiesPerCountry = Math.round(recordsProcessed / countries.length);
      const successRate = countries.length > 0 ? Math.round(((countries.length - errors) / countries.length) * 100) : 0;
      
      this.logger.info(`[WikidataCitiesIngestor] Completed: ${JSON.stringify(summary)}`);
      this._emitProgress(emitProgress, {
        phase: 'complete',
        summary: {
          ...summary,
          countriesProcessed: countries.length,
          avgCitiesPerCountry,
          successRate,
          avgTimePerCountryMs: Math.round(summary.durationMs / countries.length)
        },
        message: `Cities ingestion complete: ${recordsUpserted} cities across ${countries.length} countries`
      });

      return summary;
    } catch (error) {
      const errorDetails = `${error.name}: ${error.message}`;
      const errorCode = error.code ? ` (${error.code})` : '';
      this.logger.error(`[WikidataCitiesIngestor] Fatal error${errorCode}:`, errorDetails);
      
      if (emitProgress) {
        this._emitTelemetry(emitProgress, 'error', `Cities ingestion fatal error: ${errorDetails}`, {
          errorMessage: error.message,
          errorName: error.name,
          errorCode: error.code,
          isNetworkError: error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED',
          errorStack: error.stack?.split('\n').slice(0, 3).join(' | ')
        });
      }
      
      throw new Error(`WikidataCitiesIngestor failed: ${errorDetails}`);
    }
  }

  async _processCitiesForCountry(country, emitProgress) {
    const result = { processed: 0, upserted: 0, errors: 0 };

    const countryClause = this._buildCountryClause(country, 'city');

    const sparql = buildCitiesDiscoveryQuery({
      countryClause,
      languages: this.labelLanguages,
      limit: this.maxCitiesPerCountry,
      minPopulation: this.minPopulation > 0 ? this.minPopulation : null
    });

    try {
      const sparqlResult = await this._fetchSparql(sparql);
      const bindings = sparqlResult?.results?.bindings || [];

      if (bindings.length === 0) {
        return result;
      }

      // Extract QIDs
      const qids = compact(bindings, b => this._extractQid(b.city?.value));
      if (qids.length === 0) {
        return result;
      }

  // Fetch full entity data in batches to respect Wikidata API limits
  const entities = await this._fetchEntities(qids, emitProgress);

      // Upsert each city
      for (const binding of bindings) {
        const qid = this._extractQid(binding.city?.value);
        if (!qid) {
          result.errors++;
          continue;
        }

        const entity = entities?.entities?.[qid];
        if (!entity) {
          result.errors++;
          result.processed++;
          continue;
        }

        try {
          const upserted = this._upsertCity(qid, entity, binding, country);
          if (upserted) result.upserted++;
          result.processed++;
        } catch (err) {
          this.logger.error(`[WikidataCitiesIngestor] Error upserting city ${qid}:`, err.message);
          result.errors++;
          result.processed++;
        }
      }
    } catch (err) {
      const errorName = err?.name || 'Error';
      const errorMessage = err?.message || String(err);
      const queryLength = sparql.length;
      const isAbortError = errorName === 'AbortError' || err?.code === 'ABORT_ERR';
      const telemetryContext = {
        countryCode: country.country_code,
        timeoutMs: this.timeoutMs,
        maxCitiesPerCountry: this.maxCitiesPerCountry,
        minPopulation: this.minPopulation,
        useCache: this.useCache,
        queryLength,
        errorName,
        errorMessage,
        errorStack: err?.stack?.split('\n').slice(0, 4).join(' | ')
      };

      if (isAbortError) {
        const timeoutMessage = `SPARQL query timed out after ${this.timeoutMs}ms for ${country.country_code}`;
        this.logger.error(`[WikidataCitiesIngestor] ${timeoutMessage}`);
        this._emitTelemetry(emitProgress, 'error', timeoutMessage, {
          ...telemetryContext,
          errorKind: 'timeout'
        });

        const fallbackResult = await this._fallbackIngestCities(country, emitProgress);
        result.processed += fallbackResult.processed;
        result.upserted += fallbackResult.upserted;
        result.errors += fallbackResult.errors;

        if (fallbackResult.processed === 0 && fallbackResult.errors === 0) {
          result.errors++;
        }

        return result;
      } else {
        this.logger.error(`[WikidataCitiesIngestor] Error fetching cities for ${country.country_code}:`, errorMessage);
        this._emitTelemetry(emitProgress, 'error', `Cities ingestion error for ${country.country_code}: ${errorMessage}`, {
          ...telemetryContext,
          errorKind: 'fetch-error'
        });
      }

      result.errors++;
    }

    return result;
  }

  _buildCountryClause(country, subjectVar = 'city') {
    return buildCountryClause({
      subjectVar,
      countryCode: country?.country_code,
      countryQid: country?.wikidata_qid
    });
  }

  async _fallbackIngestCities(country, emitProgress) {
  this.logger.warn(`Cities fallback: switching to incremental ingestion for ${country.country_code}`);
    this._emitTelemetry(emitProgress, 'warning', `Falling back to incremental city ingestion for ${country.country_code}`, {
      countryCode: country.country_code,
      maxCitiesPerCountry: this.maxCitiesPerCountry,
      timeoutMs: this.timeoutMs
    });

    const qids = await this._fetchCityQidsSimple(country);
    if (!Array.isArray(qids) || qids.length === 0) {
  this.logger.warn(`Cities fallback: no candidates returned for ${country.country_code}`);
      return { processed: 0, upserted: 0, errors: 0 };
    }

    const result = { processed: 0, upserted: 0, errors: 0 };

    for (let index = 0; index < qids.length; index++) {
      const qid = qids[index];
      try {
        const batch = await this._fetchEntityBatch([qid]);
        const entity = batch?.entities?.[qid] || null;
        if (!entity) {
          throw new Error('Entity data missing in fallback fetch');
        }

        const binding = {
          city: {
            type: 'uri',
            value: `http://www.wikidata.org/entity/${qid}`
          }
        };

        const upserted = this._upsertCity(qid, entity, binding, country);
        if (upserted) {
          result.upserted++;
        }
        result.processed++;
      } catch (error) {
        result.errors++;
        result.processed++;
  this.logger.error(`Cities fallback: failed to ingest ${qid} (${country.country_code}): ${error.message}`);
      }

      const current = index + 1;
      if (current === 1 || current % 5 === 0 || current === qids.length) {
        this.logger.info(`Cities fallback: ${country.country_code} ${current}/${qids.length} processed (new: ${result.upserted}, errors: ${result.errors})`);
      }

      this._emitProgress(emitProgress, {
        phase: 'fallback-processing',
        countryCode: country.country_code,
        current,
        totalItems: qids.length,
        citiesProcessed: result.processed,
        citiesUpserted: result.upserted,
        totalErrors: result.errors,
        message: `Fallback city fetch ${current}/${qids.length}`
      });

      if (this.sleepMs > 0 && current < qids.length) {
        await this._sleep(this.sleepMs);
      }
    }

  this.logger.info(`Cities fallback: complete for ${country.country_code} (processed=${result.processed}, new=${result.upserted}, errors=${result.errors})`);

    return result;
  }

  async _fetchCityQidsSimple(country) {
    try {
      const countryClause = this._buildCountryClause(country, 'city');
      const sparql = `
        SELECT DISTINCT ?city WHERE {
          ?city wdt:P31/wdt:P279* wd:Q515.
          ${countryClause}
        }
        LIMIT ${this.maxCitiesPerCountry}
      `;

      const data = await this._fetchSparql(sparql);
      const bindings = data?.results?.bindings || [];
      const qids = compact(bindings, b => this._extractQid(b.city?.value));
      this.logger.info(`[WikidataCitiesIngestor] Fallback query retrieved ${qids.length} city QIDs for ${country.country_code}`);
      return qids;
    } catch (error) {
  this.logger.error(`Cities fallback: SPARQL list query failed for ${country.country_code}: ${error.message}`);
      return [];
    }
  }

  _upsertCity(qid, entity, sparqlBinding, country) {
    const claims = entity.claims || {};
    
    // Extract properties
    const population = this._extractQuantityClaim(claims.P1082) || 
                      (sparqlBinding.pop?.value ? parseInt(sparqlBinding.pop.value, 10) : null);
    const coords = this._extractCoordinates(claims.P625) || 
                   this._parseWktPoint(sparqlBinding.coord?.value);
    const elevation = this._extractQuantityClaim(claims.P2044);
    const timezone = this._extractStringClaim(claims.P421);
    const osmNodeId = this._extractStringClaim(claims.P11693);
    const osmRelationId = this._extractStringClaim(claims.P402);
    const geonamesId = this._extractStringClaim(claims.P1566);

    // Get ADM1 (region) if available
    const adm1Qid = this._extractItemClaim(claims.P131); // Located in administrative territorial entity
    let adm1Code = null;
    if (adm1Qid) {
      try {
        const adm1 = this.db.prepare(`
          SELECT p.adm1_code
          FROM places p
          INNER JOIN place_external_ids e ON p.id = e.place_id
          WHERE p.kind = 'region' 
            AND p.country_code = ?
            AND e.source = 'wikidata'
            AND e.ext_id = ?
        `).get(country.country_code, adm1Qid);
        if (adm1) {
          adm1Code = adm1.adm1_code;
        }
      } catch (_) {}
    }

    // Build attributes for attributes field
    const attributesRaw = new AttributeBuilder('wikidata')
      .add('elevation_m', elevation)
      .add('timezone', timezone)
      .add('osm_node_id', osmNodeId)
      .add('osm_relation_id', osmRelationId)
      .add('geonames_id', geonamesId)
      .build();

    // Convert AttributeBuilder format to recordAttributes format
    const attributes = attributesRaw.map(attr => ({
      attr: attr.kind,      // kind -> attr
      value: attr.value,
      source: attr.source
    }));

    // Extract names from labels and aliases
    const names = this._extractNames(entity);

    // Upsert place
    const { placeId } = ingestQueries.upsertPlace(this.db, this.stmts, {
      wikidataQid: qid,
      kind: 'city',
      countryCode: country.country_code,
      adm1Code,
      adm2Code: null,
      population,
      timezone,
      lat: coords?.lat || null,
      lng: coords?.lng || null,
      bbox: null,
      source: 'wikidata',
      attributes
    });

    // Insert external ID (already handled by upsertPlace)
    // ingestQueries.insertExternalId(this.stmts, 'wikidata', qid, placeId);

    // Insert names
    for (const name of names) {
      ingestQueries.insertPlaceName(this.stmts, placeId, {
        text: name.name,
        lang: name.lang,
        kind: name.kind,
        isPreferred: name.preferred,
        isOfficial: name.official,
        source: 'wikidata'
      });
    }

    // Set canonical name (automatically finds best name)
    ingestQueries.setCanonicalName(this.stmts, placeId);

    // Create hierarchy relationship to country
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth)
        VALUES (?, ?, 'admin_parent', 1)
      `).run(country.id, placeId);
    } catch (_) {}

    // If we have ADM1, create relationship to region
    if (adm1Code) {
      try {
        const adm1Place = this.db.prepare(`
          SELECT id FROM places
          WHERE kind = 'region' AND country_code = ? AND adm1_code = ?
        `).get(country.country_code, adm1Code);
        if (adm1Place) {
          this.db.prepare(`
            INSERT OR IGNORE INTO place_hierarchy(parent_id, child_id, relation, depth)
            VALUES (?, ?, 'admin_parent', 1)
          `).run(adm1Place.id, placeId);
        }
      } catch (_) {}
    }

    return true;
  }

  _extractNames(entity) {
    const names = [];
    const seen = new Set();

    // Labels (preferred names)
    if (entity.labels) {
      for (const [lang, obj] of Object.entries(entity.labels)) {
        const name = obj.value?.trim();
        if (!name) continue;
        const key = `${name.toLowerCase()}:${lang}`;
        if (seen.has(key)) continue;
        seen.add(key);
        names.push({
          name,
          normalized: name.toLowerCase(),
          lang,
          script: null,
          kind: 'common',
          preferred: 1,
          official: 0
        });
      }
    }

    // Aliases
    if (entity.aliases) {
      for (const [lang, arr] of Object.entries(entity.aliases)) {
        if (!is_array(arr)) continue;
        for (const obj of arr) {
          const name = obj.value?.trim();
          if (!name) continue;
          const key = `${name.toLowerCase()}:${lang}`;
          if (seen.has(key)) continue;
          seen.add(key);
          names.push({
            name,
            normalized: name.toLowerCase(),
            lang,
            script: null,
            kind: 'alias',
            preferred: 0,
            official: 0
          });
        }
      }
    }

    return names;
  }

  async _fetchSparql(query) {
    const hash = crypto.createHash('sha256').update(query).digest('hex').substring(0, 16);
    const cacheFile = path.join(this.cacheDir, `sparql-${hash}.json`);

    if (this.useCache && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const resultCount = cached?.results?.bindings?.length || 0;
        console.log(chalk.cyan('⚡'), `SPARQL cache hit (${resultCount} results)`);
        return cached;
      } catch (_) {}
    }

    const url = 'https://query.wikidata.org/sparql';
    const params = new URLSearchParams({ query, format: 'json' });
    
    console.log(chalk.yellow('⏳'), 'SPARQL cache miss - querying Wikidata...');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${url}?${params}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NewsC rawler/1.0 (Gazetteer)' }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error body');
        this.logger.error(`[WikidataCitiesIngestor] SPARQL HTTP ${response.status}: ${response.statusText}`);
        throw new Error(`SPARQL query failed: HTTP ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }

      const data = await response.json();

      if (this.useCache) {
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
          const sizeKB = (JSON.stringify(data).length / 1024).toFixed(1);
          console.log(chalk.green('✓'), `Cached SPARQL result (${sizeKB}KB)`);
        } catch (_) {}
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  async _fetchEntities(qids, emitProgress = null) {
    if (!Array.isArray(qids) || qids.length === 0) {
      return { entities: {} };
    }

    const uniqueQids = Array.from(new Set(qids));
    const BATCH_SIZE = 50; // Wikidata API limit for wbgetentities
    const batches = [];
    for (let i = 0; i < uniqueQids.length; i += BATCH_SIZE) {
      batches.push(uniqueQids.slice(i, i + BATCH_SIZE));
    }

    this.logger.info(`[WikidataCitiesIngestor] Fetching ${uniqueQids.length} entities in ${batches.length} batch(es)`);
    this._emitTelemetry(emitProgress, 'info', 'Fetching city entities', {
      totalQids: uniqueQids.length,
      batchCount: batches.length,
      batchSize: BATCH_SIZE
    });

    const aggregate = {};
    for (let index = 0; index < batches.length; index++) {
      const batchQids = batches[index];
      try {
        const batchData = await this._fetchEntityBatch(batchQids);
        if (batchData?.entities) {
          Object.assign(aggregate, batchData.entities);
        }
      } catch (err) {
        this.logger.error(`[WikidataCitiesIngestor] Failed to fetch entity batch ${index + 1}/${batches.length}:`, err.message);
        this._emitTelemetry(emitProgress, 'error', 'City entity batch fetch failed', {
          batchIndex: index + 1,
          batchCount: batches.length,
          batchSize: batchQids.length,
          errorName: err?.name,
          errorMessage: err?.message,
          errorStack: err?.stack?.split('\n').slice(0, 4).join(' | ')
        });
      }

      this._emitProgress(emitProgress, {
        phase: 'fetching-entities',
        current: index + 1,
        totalItems: batches.length,
        message: `Fetched entity batch ${index + 1}/${batches.length}`
      });

      if (this.sleepMs > 0 && index < batches.length - 1) {
        await this._sleep(this.sleepMs);
      }
    }

    return { entities: aggregate };
  }

  async _fetchEntityBatch(qids) {
    if (!Array.isArray(qids) || qids.length === 0) {
      return { entities: {} };
    }
    if (qids.length > 50) {
      throw new Error(`City entity batch exceeds Wikidata limit (got ${qids.length})`);
    }

    const url = 'https://www.wikidata.org/w/api.php';
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: qids.join('|'),
      format: 'json',
      props: 'labels|aliases|claims'
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${url}?${params}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'NewsCrawler/1.0 (Gazetteer)' }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Wikidata API failed: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  _extractQid(uri) {
    if (!uri || typeof uri !== 'string') return null;
    const match = uri.match(/Q\d+$/);
    return match ? match[0] : null;
  }

  _extractStringClaim(claims) {
    if (!is_array(claims) || claims.length === 0) return null;
    const val = claims[0]?.mainsnak?.datavalue?.value;
    return typeof val === 'string' ? val : null;
  }

  _extractQuantityClaim(claims) {
    if (!is_array(claims) || claims.length === 0) return null;
    const val = claims[0]?.mainsnak?.datavalue?.value?.amount;
    if (!val) return null;
    const num = parseFloat(val);
    return Number.isFinite(num) ? Math.round(num) : null;
  }

  _extractItemClaim(claims) {
    if (!is_array(claims) || claims.length === 0) return null;
    const val = claims[0]?.mainsnak?.datavalue?.value?.id;
    return typeof val === 'string' ? val : null;
  }

  _extractCoordinates(claims) {
    if (!is_array(claims) || claims.length === 0) return null;
    const coord = claims[0]?.mainsnak?.datavalue?.value;
    if (!coord || typeof coord !== 'object') return null;
    const lat = parseFloat(coord.latitude);
    const lng = parseFloat(coord.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  _parseWktPoint(wkt) {
    if (!wkt || typeof wkt !== 'string') return null;
    const match = wkt.match(/POINT\(([^ ]+) ([^ ]+)\)/i);
    if (!match) return null;
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  _buildCountryFilter(specifiers) {
    const normalizedSpecs = [];
    const qids = new Set();
    const qidKeys = new Map();
    const isoCodes = new Set();
    const isoKeys = new Map();
    const namesLower = new Set();
    const nameKeys = new Map();
    const normalizedNames = new Set();
    const normalizedNameKeys = new Map();

    if (Array.isArray(specifiers)) {
      for (const spec of specifiers) {
        if (!spec || typeof spec !== 'object') continue;

        if (spec.qid) {
          const value = String(spec.qid).toUpperCase();
          const key = `qid:${value}`;
          if (!qidKeys.has(value)) {
            qids.add(value);
            qidKeys.set(value, key);
            normalizedSpecs.push({ type: 'qid', value, key, raw: spec.raw || spec.qid });
          }
          continue;
        }

        if (spec.code) {
          const value = String(spec.code).toUpperCase();
          const key = `code:${value}`;
          if (!isoKeys.has(value)) {
            isoCodes.add(value);
            isoKeys.set(value, key);
            normalizedSpecs.push({ type: 'code', value, key, raw: spec.raw || spec.code });
          }
          continue;
        }

        const rawName = spec.name || spec.raw;
        const lowerName = spec.nameLower || (rawName ? String(rawName).toLowerCase() : null);
        if (lowerName) {
          const key = `name:${lowerName}`;
          if (!nameKeys.has(lowerName)) {
            namesLower.add(lowerName);
            nameKeys.set(lowerName, key);
            normalizedSpecs.push({ type: 'name', value: lowerName, key, raw: rawName || lowerName });
          }
          const normalizedName = this._normalizeName(rawName || lowerName);
          if (normalizedName && !normalizedNameKeys.has(normalizedName)) {
            normalizedNames.add(normalizedName);
            normalizedNameKeys.set(normalizedName, key);
          }
        }
      }
    }

    return {
      specifiers: normalizedSpecs,
      qids,
      isoCodes,
      namesLower,
      normalizedNames,
      qidKeys,
      isoKeys,
      nameKeys,
      normalizedNameKeys
    };
  }

  _filterCountryList(countries) {
    if (!Array.isArray(countries)) {
      return { filteredCountries: [], unmatchedSpecifiers: this.countryFilter?.specifiers || [], matchDetails: [] };
    }
    if (!this.countryFilter) {
      return { filteredCountries: [...countries], unmatchedSpecifiers: [], matchDetails: [] };
    }

    const filteredCountries = [];
    const matchDetails = [];
    const matchedKeys = new Set();

    for (const country of countries) {
      const match = this._matchTargetCountry({
        qid: country?.wikidata_qid,
        code: country?.country_code,
        labels: [country?.canonical_name, country?.canonical_normalized]
      });
      if (match) {
        filteredCountries.push(country);
        matchDetails.push({
          specKey: match.specKey,
          matchedBy: match.matchedBy,
          qid: match.qid || null,
          iso2: match.iso2 || null,
          label: match.label || null
        });
        if (match.specKey) {
          matchedKeys.add(match.specKey);
        }
      }
    }

    const unmatchedSpecifiers = (this.countryFilter.specifiers || []).filter(spec => !matchedKeys.has(spec.key));
    return { filteredCountries, unmatchedSpecifiers, matchDetails };
  }

  _matchTargetCountry({ qid = null, code = null, labels = [] } = {}) {
    const filter = this.countryFilter;
    if (!filter) return null;

    if (qid) {
      const normalizedQid = String(qid).toUpperCase();
      if (filter.qids.has(normalizedQid)) {
        return {
          matchedBy: 'qid',
          qid: normalizedQid,
          specKey: filter.qidKeys.get(normalizedQid) || `qid:${normalizedQid}`
        };
      }
    }

    if (code) {
      const normalizedCode = String(code).toUpperCase();
      if (filter.isoCodes.has(normalizedCode)) {
        return {
          matchedBy: 'iso2',
          iso2: normalizedCode,
          specKey: filter.isoKeys.get(normalizedCode) || `code:${normalizedCode}`
        };
      }
    }

    for (const label of labels) {
      if (!label) continue;
      const trimmed = String(label).trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();
      if (filter.namesLower.has(lower)) {
        return {
          matchedBy: 'name',
          label: trimmed,
          specKey: filter.nameKeys.get(lower) || `name:${lower}`
        };
      }

      const normalized = this._normalizeName(trimmed);
      if (normalized && filter.normalizedNames.has(normalized)) {
        return {
          matchedBy: 'name-normalized',
          label: trimmed,
          specKey: filter.normalizedNameKeys.get(normalized) || `name:${normalized}`
        };
      }
    }

    return null;
  }

  _normalizeName(text) {
    if (!text) return null;
    return text.normalize('NFD').replace(/\p{Diacritic}+/gu, '').toLowerCase();
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _emitProgress(emitProgress, payload) {
    if (typeof emitProgress === 'function') {
      try {
        emitProgress(payload);
      } catch (_) {}
    }
  }
  _emitTelemetry(handler, type, message, context = {}) {
    if (tof(handler) === 'function') {
      try {
        handler({
          type,
          stage: 'cities',
          message,
          timestamp: Date.now(),
          context
        });
      } catch (err) {
        // Best effort
      }
    }
  }
}

module.exports = WikidataCitiesIngestor;
