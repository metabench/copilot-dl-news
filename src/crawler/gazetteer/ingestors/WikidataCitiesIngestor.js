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
const { tof, each, is_array } = require('lang-tools');
const { compact } = require('../../../utils/pipelines');
const { AttributeBuilder } = require('../../../utils/attributeBuilder');
const ingestQueries = require('../../../db/sqlite/queries/gazetteer.ingest');

class WikidataCitiesIngestor {
  constructor({
    db,
    cacheDir = null,
    logger = console,
    timeoutMs = 20000,
    sleepMs = 250,
    useCache = true,
    maxCitiesPerCountry = 50,
    minPopulation = 100000
  } = {}) {
    if (!db) {
      throw new Error('WikidataCitiesIngestor requires a database handle');
    }
    this.db = db;
    this.logger = logger;
    this.timeoutMs = timeoutMs;
    this.sleepMs = sleepMs;
    this.useCache = useCache;
    this.maxCitiesPerCountry = maxCitiesPerCountry;
    this.minPopulation = minPopulation;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache', 'sparql');

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
      const countries = this.db.prepare(`
        SELECT id, country_code
        FROM places
        WHERE kind = 'country' AND country_code IS NOT NULL
        ORDER BY country_code
      `).all();

      if (countries.length === 0) {
        this.logger.warn('[WikidataCitiesIngestor] No countries found in database');
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
      
      this.logger.info('[WikidataCitiesIngestor] Completed:', summary);
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

    // SPARQL query for cities in this country
    const sparql = `
      SELECT ?city ?cityLabel ?coord ?pop WHERE {
        ?city wdt:P31/wdt:P279* wd:Q515.  # Instance of city (or subclass)
        ?city wdt:P17 ?country.  # Country
        ?country wdt:P297 "${country.country_code}".  # ISO code
        OPTIONAL { ?city wdt:P625 ?coord. }  # Coordinates
        OPTIONAL { ?city wdt:P1082 ?pop. }  # Population
        FILTER(?pop > ${this.minPopulation})  # Minimum population
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,es,ru,zh,ar,pt,it,ja,und". }
      }
      ORDER BY DESC(?pop)
      LIMIT ${this.maxCitiesPerCountry}
    `;

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

      // Fetch full entity data
      const entities = await this._fetchEntities(qids);

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
      this.logger.error(`[WikidataCitiesIngestor] Error fetching cities for ${country.country_code}:`, err.message);
      result.errors++;
    }

    return result;
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

    // Build attributes for extra field
    const extra = new AttributeBuilder()
      .add('wikidata_qid', qid)
      .add('elevation_m', elevation)
      .add('timezone', timezone)
      .add('osm_node_id', osmNodeId)
      .add('osm_relation_id', osmRelationId)
      .add('geonames_id', geonamesId)
      .build();

    // Extract names from labels and aliases
    const names = this._extractNames(entity);

    // Upsert place
    const placeId = this.stmts.upsertPlace.run({
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
      extra
    }).lastInsertRowid;

    // Upsert external ID
    try {
      this.stmts.upsertExternalId.run({
        source: 'wikidata',
        extId: qid,
        placeId
      });
    } catch (_) {}

    // Upsert names
    let canonicalNameId = null;
    for (const name of names) {
      try {
        const result = this.stmts.upsertPlaceName.run({
          placeId,
          name: name.name,
          normalized: name.normalized,
          lang: name.lang,
          script: name.script,
          nameKind: name.kind,
          isPreferred: name.preferred ? 1 : 0,
          isOfficial: name.official ? 1 : 0,
          source: 'wikidata'
        });
        if (name.preferred && !canonicalNameId) {
          canonicalNameId = result.lastInsertRowid;
        }
      } catch (_) {}
    }

    // Set canonical name
    if (canonicalNameId) {
      try {
        this.stmts.updateCanonicalName.run({
          canonicalNameId,
          placeId
        });
      } catch (_) {}
    }

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
        return cached;
      } catch (_) {}
    }

    const url = 'https://query.wikidata.org/sparql';
    const params = new URLSearchParams({ query, format: 'json' });
    
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
        } catch (_) {}
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  async _fetchEntities(qids) {
    if (!qids || qids.length === 0) return null;

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
