'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { tof, is_array, each } = require('lang-tools');
const { compact } = require('../../../utils/pipelines');
const ingestQueries = require('../../../db/sqlite/v1/queries/gazetteer.ingest');
const {
  DEFAULT_LABEL_LANGUAGES,
  DEFAULT_REGION_CLASS_QIDS,
  buildAdm1DiscoveryQuery,
  buildCountryClause
} = require('../queries/geographyQueries');

const DEFAULT_SNAPSHOT_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'data',
  'bootstrap',
  'wikidata-adm1-snapshot.json'
);

/**
 * WikidataAdm1Ingestor
 *
 * Fetches first-level administrative divisions (ADM1) from Wikidata dynamically
 * with comprehensive properties per country, or falls back to curated snapshot.
 * 
 * Dynamic mode (useDynamicFetch=true):
 * - Processes each country sequentially
 * - Fetches regions via SPARQL + Entity API
 * - Progress tracking per country with ETAs
 * - Caches results per country
 * 
 * Snapshot mode (useDynamicFetch=false):
 * - Uses pre-generated data/bootstrap/wikidata-adm1-snapshot.json
 * - Faster but may be incomplete/outdated
 */
class WikidataAdm1Ingestor {
  constructor({
    db,
    logger = console,
    snapshotPath = DEFAULT_SNAPSHOT_PATH,
    useSnapshot = true,
    useDynamicFetch = false,
    cacheDir = null,
    useCache = true,
    timeoutMs = 20000,
    sleepMs = 250,
    priorityScore = 650,
    maxRegionsPerCountry = 500,
    limitCountries = null,
    targetCountries = null
  } = {}) {
    if (!db) {
      throw new Error('WikidataAdm1Ingestor requires a database handle');
    }
    this.db = db;
    this.logger = logger || console;
    this.snapshotPath = snapshotPath;
    this.useSnapshot = useSnapshot !== false;
    this.useDynamicFetch = useDynamicFetch === true;
    this.cacheDir = cacheDir || path.join(process.cwd(), 'data', 'cache', 'sparql');
    this.useCache = useCache;
    this.timeoutMs = timeoutMs;
    this.sleepMs = sleepMs;
    this.priorityScore = priorityScore;
    this.maxRegionsPerCountry = maxRegionsPerCountry;
    this.limitCountries = limitCountries;
    this.targetCountries = Array.isArray(targetCountries) && targetCountries.length ? targetCountries : null;
    this.countryFilter = this.targetCountries ? this._buildCountryFilter(this.targetCountries) : null;
    this.id = 'wikidata-adm1';
    this.name = 'Wikidata ADM1 Ingestor';
  this.defaultWikidataAdminLevel = 4;
    this.labelLanguages = [...DEFAULT_LABEL_LANGUAGES];
    this.regionClassQids = [...DEFAULT_REGION_CLASS_QIDS];

    if (this.useCache && this.useDynamicFetch) {
      try {
        if (!fs.existsSync(this.cacheDir)) {
          fs.mkdirSync(this.cacheDir, { recursive: true });
        }
      } catch (err) {
        this.logger.warn('[WikidataAdm1Ingestor] Could not create cache directory:', err.message);
      }
    }

    this.statements = ingestQueries.createIngestionStatements(this.db);
  }

  async execute({ signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();

    if (this.useDynamicFetch) {
      return await this._executeDynamic({ signal, emitProgress, startedAt });
    } else {
      return await this._executeSnapshot({ signal, emitProgress, startedAt });
    }
  }

  async _executeDynamic({ signal, emitProgress, startedAt }) {
    let recordsProcessed = 0;
    let recordsUpserted = 0;
    let errors = 0;

    this.logger.info('[WikidataAdm1Ingestor] Starting dynamic ADM1 ingestion from Wikidata...');

    try {
      // Get all countries from database
      const allCountries = this.db.prepare(`
        SELECT p.id, p.country_code, p.wikidata_qid, pn.name AS canonical_name, pn.normalized AS canonical_normalized
        FROM places p
        LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
        WHERE p.kind = 'country' AND p.country_code IS NOT NULL
        ORDER BY p.country_code
      `).all();
      
      // Apply limit if specified
      let countries = allCountries;

      if (this.countryFilter) {
        const { filteredCountries, unmatchedSpecifiers } = this._filterDynamicCountryList(allCountries);
        this.logger.info(`[WikidataAdm1Ingestor] Target country filter applied: ${filteredCountries.length}/${allCountries.length} countries retained`);
        if (unmatchedSpecifiers.length) {
          this.logger.warn('[WikidataAdm1Ingestor] Some target countries were not found in database list:', unmatchedSpecifiers.map(spec => spec.raw || spec.value || spec.key));
        }
        countries = filteredCountries;
      }

      if (this.limitCountries && countries.length > this.limitCountries) {
        countries = countries.slice(0, this.limitCountries);
      }

      if (countries.length === 0) {
        this.logger.warn(this.countryFilter
          ? '[WikidataAdm1Ingestor] No countries matched the requested target filter'
          : '[WikidataAdm1Ingestor] No countries found in database');
        return { recordsProcessed: 0, recordsUpserted: 0, errors: 0 };
      }

      this._emitProgress(emitProgress, {
        phase: 'discovery',
        message: `Processing regions for ${countries.length} countries`,
        totalCountries: countries.length,
        maxRegionsPerCountry: this.maxRegionsPerCountry,
        estimatedTotal: countries.length * 20  // Estimate ~20 regions per country average
      });

      // Process each country
      for (let i = 0; i < countries.length; i++) {
        if (signal?.aborted) {
          throw new Error('WikidataAdm1Ingestor aborted');
        }

        const country = countries[i];
        
        try {
          const result = await this._processRegionsForCountry(country, emitProgress);
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
            regionsProcessed: result.processed,
            regionsUpserted: result.upserted,
            totalProcessed: recordsProcessed,
            totalUpserted: recordsUpserted,
            totalErrors: errors,
            timing: {
              elapsedMs: elapsed,
              avgPerCountryMs: Math.round(avgTimePerCountry),
              estimatedRemainingMs: Math.round(estimatedRemaining)
            },
            message: `[${i + 1}/${countries.length}] ${country.country_code}: ${result.processed} regions (${percentComplete}% complete)`
          });
        } catch (err) {
          this.logger.error(`[WikidataAdm1Ingestor] Error processing country ${country.country_code}:`, err.message);
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

      const avgRegionsPerCountry = Math.round(recordsProcessed / countries.length);
      const successRate = countries.length > 0 ? Math.round(((countries.length - errors) / countries.length) * 100) : 0;
      
      this.logger.info(`[WikidataAdm1Ingestor] Completed: ${JSON.stringify(summary)}`);
      this._emitProgress(emitProgress, {
        phase: 'complete',
        summary: {
          ...summary,
          countriesProcessed: countries.length,
          avgRegionsPerCountry,
          successRate,
          avgTimePerCountryMs: Math.round(summary.durationMs / countries.length)
        },
        message: `Regions ingestion complete: ${recordsUpserted} regions across ${countries.length} countries`
      });

      return summary;
    } catch (error) {
      const errorDetails = `${error.name}: ${error.message}`;
      this.logger.error(`[WikidataAdm1Ingestor] Fatal error:`, errorDetails);
      
      if (emitProgress) {
        this._emitTelemetry(emitProgress, 'error', `Regions ingestion fatal error: ${errorDetails}`, {
          errorMessage: error.message,
          errorName: error.name
        });
      }
      
      throw new Error(`WikidataAdm1Ingestor failed: ${errorDetails}`);
    }
  }

  async _executeSnapshot({ signal, emitProgress, startedAt }) {
    const summary = {
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0,
      durationMs: 0,
      preview: []
    };

    this.logger.info('[WikidataAdm1Ingestor] Starting ADM1 ingestion from snapshot…');

    const entries = this._loadDataset();
    const orderedEntries = entries.sort((a, b) => {
      const countryA = (a.country?.label || '').toLowerCase();
      const countryB = (b.country?.label || '').toLowerCase();
      if (countryA !== countryB) {
        return countryA.localeCompare(countryB);
      }
      return (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase());
    });

    let workingEntries = orderedEntries;

    if (this.countryFilter) {
      const { filteredEntries, unmatchedSpecifiers } = this._filterSnapshotEntries(orderedEntries);
      this.logger.info(`[WikidataAdm1Ingestor] Snapshot target country filter applied: ${filteredEntries.length}/${orderedEntries.length} entries retained`);
      if (unmatchedSpecifiers.length) {
        this.logger.warn('[WikidataAdm1Ingestor] Snapshot filter could not match some target countries:', unmatchedSpecifiers.map(spec => spec.raw || spec.value || spec.key));
      }
      workingEntries = filteredEntries;
    }

    if (!workingEntries.length) {
      this.logger.warn('[WikidataAdm1Ingestor] No ADM1 entries found in snapshot');
      summary.notes = this.countryFilter
        ? 'No ADM1 entries matched the requested target countries'
        : 'No ADM1 entries available';
      return summary;
    }

    this._emitProgress(emitProgress, {
      phase: 'discovery-complete',
      totalItems: workingEntries.length,
      message: `Discovered ${workingEntries.length} ADM1 divisions`
    });

    const preview = [];

    for (let idx = 0; idx < workingEntries.length; idx += 1) {
      if (signal?.aborted) {
        throw new Error('WikidataAdm1Ingestor aborted');
      }

      const entry = workingEntries[idx];
      try {
        const result = this._upsertRegion(entry);
        summary.recordsProcessed += 1;
        if (result.isNew) {
          summary.recordsUpserted += 1;
        }

        if (preview.length < 10) {
          preview.push({
            country: entry.country?.label,
            name: entry.label,
            isoCode: entry.isoCode,
            population: entry.population || null
          });
        }

        if (idx % 10 === 0 || idx === workingEntries.length - 1) {
          this._emitProgress(emitProgress, {
            phase: 'processing',
            current: idx + 1,
            totalItems: workingEntries.length,
            recordsProcessed: summary.recordsProcessed,
            recordsUpserted: summary.recordsUpserted,
            sample: {
              country: entry.country?.label,
              name: entry.label
            }
          });
        }
      } catch (error) {
        summary.recordsProcessed += 1;
        summary.errors += 1;
        this.logger.error('[WikidataAdm1Ingestor] Failed to ingest ADM1 entry:', entry.label, error.message);
        this._emitProgress(emitProgress, {
          phase: 'ingestor-error',
          entry: entry.label,
          country: entry.country?.label,
          error: error.message
        });
      }
    }

    summary.durationMs = Date.now() - startedAt;
    summary.preview = preview;

    this._emitProgress(emitProgress, {
      phase: 'complete',
      summary
    });

    this.logger.info('[WikidataAdm1Ingestor] Completed ADM1 ingestion:', {
      processed: summary.recordsProcessed,
      upserted: summary.recordsUpserted,
      errors: summary.errors
    });

    return summary;
  }

  _loadDataset() {
    if (!this.useSnapshot) {
      return [];
    }
    try {
      const raw = fs.readFileSync(this.snapshotPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!is_array(parsed)) {
        this.logger.warn('[WikidataAdm1Ingestor] Snapshot file did not contain an array, ignoring');
        return [];
      }
      return parsed
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const normalized = { ...entry };
          if (normalized.wikidataAdminLevel == null) {
            const candidate = normalized.adminLevel;
            const numeric = Number(candidate);
            normalized.wikidataAdminLevel = Number.isFinite(numeric)
              ? numeric
              : this.defaultWikidataAdminLevel;
          }
          return normalized;
        });
    } catch (error) {
      this.logger.warn('[WikidataAdm1Ingestor] Unable to read snapshot:', error.message);
      return [];
    }
  }

  _upsertRegion(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid ADM1 entry');
    }

    const countryCode = entry.country?.code || null;
    const adm1Code = this._deriveAdm1Code(entry.isoCode, countryCode, entry.qid);
    const existing = entry.qid ? this.statements.getPlaceByWikidataQid.get(entry.qid) : null;

    const wikidataAdminLevel = this._resolveWikidataAdminLevel(entry);
    const extra = this._buildRegionExtra(entry, wikidataAdminLevel);

    const { placeId, created } = ingestQueries.upsertPlace(this.db, this.statements, {
      wikidataQid: entry.qid || null,
      kind: 'region',
      countryCode,
      population: entry.population ?? null,
      timezone: entry.timezone ?? null,
      lat: entry.coord?.lat ?? null,
      lng: entry.coord?.lon ?? null,
      bbox: null,
      source: 'wikidata',
      extra,
      area: entry.areaSqKm ?? null,
      gdpUsd: null,
      wikidataAdminLevel,
      wikidataProps: this._buildWikidataProps(entry),
      crawlDepth: 1,
      priorityScore: entry.priorityScore ?? this.priorityScore,
      osmType: null,
      osmId: null,
      attributes: this._buildAttributes(entry),
      adm1Code
    });

    this._storeNames(placeId, entry);

    return {
      placeId,
      isNew: created || !existing
    };
  }

  _storeNames(placeId, entry) {
    const names = [];
    if (entry.label) {
      names.push({
        text: entry.label,
        lang: entry.labelLang || 'en',
        kind: 'official',
        isPreferred: true,
        isOfficial: true
      });
    }

    if (is_array(entry.aliases)) {
      for (const alias of entry.aliases) {
        if (!alias || typeof alias !== 'object' || !alias.text) continue;
        names.push({
          text: alias.text,
          lang: alias.lang || 'und',
          kind: 'alias',
          isPreferred: false,
          isOfficial: false
        });
      }
    }

    for (const nameEntry of names) {
      ingestQueries.insertPlaceName(this.statements, placeId, {
        text: nameEntry.text,
        lang: nameEntry.lang,
        kind: nameEntry.kind,
        isPreferred: nameEntry.isPreferred,
        isOfficial: nameEntry.isOfficial,
        source: 'wikidata'
      });
    }

    ingestQueries.setCanonicalName(this.statements, placeId);
  }

  _deriveAdm1Code(isoCode, countryCode, fallbackQid = null) {
    if (tof(isoCode) === 'string') {
      const trimmed = isoCode.trim();
      if (trimmed) {
        const parts = trimmed.split('-');
        if (parts.length < 2) {
          return trimmed;
        }
        const code = parts.slice(1).join('-');
        if (countryCode && code.toUpperCase().startsWith(countryCode.toUpperCase())) {
          const stripped = code.slice(countryCode.length).replace(/^-/, '');
          return stripped || code;
        }
        return code;
      }
    }

    if (fallbackQid) {
      const normalized = String(fallbackQid).trim();
      if (normalized) {
        return normalized.replace(/^wd:/i, '').toUpperCase();
      }
    }

    return null;
  }

  _buildWikidataProps(entry) {
    const props = {
      qid: entry.qid || null,
      isoCode: entry.isoCode || null,
      country: entry.country?.qid || null,
      capital: entry.capital || null,
      population: entry.population ?? null,
      areaSqKm: entry.areaSqKm ?? null
    };
    if (entry.website) {
      props.officialWebsite = entry.website;
    }
    return props;
  }

  _buildAttributes(entry) {
    const attributes = [];
    if (entry.isoCode) {
      attributes.push({ attr: 'iso.subdivision', value: entry.isoCode, metadata: { property: 'P300' } });
    }
    if (entry.population != null) {
      attributes.push({ attr: 'population', value: entry.population, metadata: { property: 'P1082' } });
    }
    if (entry.areaSqKm != null) {
      attributes.push({ attr: 'area_sq_km', value: entry.areaSqKm, metadata: { property: 'P2046' } });
    }
    if (entry.capital) {
      attributes.push({ attr: 'capital', value: entry.capital, metadata: { property: 'P36' } });
    }
    if (entry.coord && Number.isFinite(entry.coord.lat) && Number.isFinite(entry.coord.lon)) {
      attributes.push({
        attr: 'coordinates',
        value: { lat: entry.coord.lat, lng: entry.coord.lon },
        metadata: { property: 'P625' }
      });
    }
    return attributes;
  }

  _emitProgress(handler, payload) {
    if (typeof handler === 'function') {
      try {
        handler({
          ...payload,
          emittedAt: Date.now()
        });
      } catch (_) {
        // ignore listener failures
      }
    }
  }
  
  _emitTelemetry(handler, type, message, context = {}) {
    if (tof(handler) === 'function') {
      try {
        handler({
          type,
          stage: 'adm1',
          message,
          timestamp: Date.now(),
          context
        });
      } catch (err) {
        // Best effort
      }
    }
  }

  // ========== Dynamic Fetching Methods (Wikidata SPARQL + Entity API) ==========

  async _processRegionsForCountry(country, emitProgress) {
    const result = { processed: 0, upserted: 0, errors: 0 };

    // Emit progress for this specific country
    this._emitProgress(emitProgress, {
      phase: 'country-query',
      countryCode: country.country_code,
      message: `Querying regions for ${country.country_code}`
    });

    // Try to get from cache first
    if (this.useCache) {
      const cached = this._getCachedRegions(country.country_code);
      if (cached && cached.length > 0) {
        for (const regionData of cached) {
          try {
            const upserted = this._upsertRegionFromDynamic(regionData, country);
            if (upserted) result.upserted++;
            result.processed++;
          } catch (err) {
            result.errors++;
            result.processed++;
          }
        }
        return result;
      }
    }

    const countryClause = this._buildCountryClause(country);
    const sparql = buildAdm1DiscoveryQuery({
      countryClause,
      regionClassQids: this.regionClassQids,
      languages: this.labelLanguages,
      limit: this.maxRegionsPerCountry
    });

    try {
      const sparqlResult = await this._fetchSparql(sparql);
      const bindings = sparqlResult?.results?.bindings || [];

      if (bindings.length === 0) {
        return result;
      }

      // Extract QIDs
      const qids = compact(bindings, b => this._extractQid(b.region?.value));
      if (qids.length === 0) {
        return result;
      }

      // Fetch full entity data
      const entities = await this._fetchEntities(qids);

      const regionsData = [];

      // Process each region
      for (const binding of bindings) {
        const qid = this._extractQid(binding.region?.value);
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
          const regionData = this._extractRegionData(qid, entity, binding, country);
          regionsData.push(regionData);
          const upserted = this._upsertRegionFromDynamic(regionData, country);
          if (upserted) result.upserted++;
          result.processed++;
        } catch (err) {
          result.errors++;
          result.processed++;
          this.logger.error(`[WikidataAdm1Ingestor] Failed to process region ${qid}:`, err.message);
        }
      }

      // Cache results
      if (this.useCache && regionsData.length > 0) {
        this._cacheRegions(country.country_code, regionsData);
      }

      return result;
    } catch (error) {
      this.logger.error(`[WikidataAdm1Ingestor] SPARQL/API error for ${country.country_code}:`, error.message);

      try {
        this.logger.info(`[WikidataAdm1Ingestor] Falling back to incremental region ingestion for ${country.country_code}`);
        const fallbackResult = await this._fallbackIngestRegions(country, emitProgress);
        result.processed += fallbackResult.processed;
        result.upserted += fallbackResult.upserted;
        result.errors += fallbackResult.errors;
        return result;
      } catch (fallbackError) {
        this.logger.error(`[WikidataAdm1Ingestor] Fallback ingestion failed for ${country.country_code}:`, fallbackError.message);
        throw fallbackError;
      }
    }
  }

  _extractRegionData(qid, entity, sparqlBinding = {}, country) {
    const claims = entity.claims || {};
    const labels = entity.labels || {};
    const aliases = entity.aliases || {};

    // Extract basic info
    const label = labels.en?.value || labels[Object.keys(labels)[0]]?.value || qid;
    const isoCode = sparqlBinding.isoCode?.value || this._extractClaim(claims, 'P300');
    
    // Extract coordinates
    let coord = null;
    if (sparqlBinding.coord?.value) {
      const match = sparqlBinding.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
      if (match) {
        coord = { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    }
    if (!coord) {
      coord = this._extractCoordinates(claims);
    }

    // Extract population
    const population = sparqlBinding.pop?.value 
      ? parseInt(sparqlBinding.pop.value, 10) 
      : this._extractPopulation(claims);

    // Extract area
    const areaSqKm = this._extractArea(claims);

    // Extract admin level from Wikidata (P2959)
    const rawWikidataAdminLevel = this._extractWikidataAdminLevel(claims);
    const resolvedWikidataAdminLevel = rawWikidataAdminLevel != null
      ? rawWikidataAdminLevel
      : this.defaultWikidataAdminLevel;

    // Extract capital
    const capitalQid = this._extractClaim(claims, 'P36');

    // Build aliases
    const aliasTexts = [];
    each(aliases, (langAliases, lang) => {
      if (is_array(langAliases)) {
        for (const alias of langAliases) {
          if (alias?.value) {
            aliasTexts.push({ text: alias.value, lang });
          }
        }
      }
    });

    return {
      qid,
      label,
      labelLang: labels.en ? 'en' : Object.keys(labels)[0] || 'und',
      isoCode,
      coord,
      population,
      areaSqKm,
      wikidataAdminLevel: resolvedWikidataAdminLevel,
      // Legacy alias retained until all downstream consumers migrate
      adminLevel: resolvedWikidataAdminLevel,
      capital: capitalQid,
      country: {
        qid: country.wikidata_qid,
        code: country.country_code,
        label: null  // Not needed for upsert
      },
      aliases: aliasTexts,
      priorityScore: this.priorityScore
    };
  }

  _upsertRegionFromDynamic(regionData, country) {
    const countryCode = country.country_code;
    const adm1Code = this._deriveAdm1Code(regionData.isoCode, countryCode, regionData.qid);
    const existing = regionData.qid ? this.statements.getPlaceByWikidataQid.get(regionData.qid) : null;

    const wikidataAdminLevel = this._resolveWikidataAdminLevel(regionData);
    const extra = this._buildRegionExtra(regionData, wikidataAdminLevel);

    const { placeId, created } = ingestQueries.upsertPlace(this.db, this.statements, {
      wikidataQid: regionData.qid || null,
      kind: 'region',
      countryCode,
      population: regionData.population ?? null,
      timezone: null,
      lat: regionData.coord?.lat ?? null,
      lng: regionData.coord?.lon ?? null,
      bbox: null,
      source: 'wikidata',
    extra,
    area: regionData.areaSqKm ?? null,
    gdpUsd: null,
    wikidataAdminLevel,
      wikidataProps: this._buildWikidataPropsFromDynamic(regionData),
      crawlDepth: 1,
      priorityScore: regionData.priorityScore ?? this.priorityScore,
      osmType: null,
      osmId: null,
      attributes: this._buildAttributesFromDynamic(regionData),
      adm1Code
    });

    this._storeNamesFromDynamic(placeId, regionData);

    return created || !existing;
  }

  _buildWikidataPropsFromDynamic(regionData) {
    const props = {
      qid: regionData.qid || null,
      isoCode: regionData.isoCode || null,
      country: regionData.country?.qid || null,
      capital: regionData.capital || null,
      population: regionData.population ?? null,
      areaSqKm: regionData.areaSqKm ?? null
    };
    return props;
  }

  _buildAttributesFromDynamic(regionData) {
    const attributes = [];
    if (regionData.isoCode) {
      attributes.push({ attr: 'iso.subdivision', value: regionData.isoCode, metadata: { property: 'P300' } });
    }
    if (regionData.population != null) {
      attributes.push({ attr: 'population', value: regionData.population, metadata: { property: 'P1082' } });
    }
    if (regionData.areaSqKm != null) {
      attributes.push({ attr: 'area_sq_km', value: regionData.areaSqKm, metadata: { property: 'P2046' } });
    }
    if (regionData.capital) {
      attributes.push({ attr: 'capital', value: regionData.capital, metadata: { property: 'P36' } });
    }
    if (regionData.coord && Number.isFinite(regionData.coord.lat) && Number.isFinite(regionData.coord.lon)) {
      attributes.push({
        attr: 'coordinates',
        value: { lat: regionData.coord.lat, lng: regionData.coord.lon },
        metadata: { property: 'P625' }
      });
    }
    return attributes;
  }

  _storeNamesFromDynamic(placeId, regionData) {
    const names = [];
    if (regionData.label) {
      names.push({
        text: regionData.label,
        lang: regionData.labelLang || 'en',
        kind: 'official',
        isPreferred: true,
        isOfficial: true
      });
    }

    if (is_array(regionData.aliases)) {
      for (const alias of regionData.aliases) {
        if (!alias || typeof alias !== 'object' || !alias.text) continue;
        names.push({
          text: alias.text,
          lang: alias.lang || 'und',
          kind: 'alias',
          isPreferred: false,
          isOfficial: false
        });
      }
    }

    for (const nameEntry of names) {
      ingestQueries.insertPlaceName(this.statements, placeId, {
        text: nameEntry.text,
        lang: nameEntry.lang,
        kind: nameEntry.kind,
        isPreferred: nameEntry.isPreferred,
        isOfficial: nameEntry.isOfficial,
        source: 'wikidata'
      });
    }

    ingestQueries.setCanonicalName(this.statements, placeId);
  }

  _buildCountryClause(country) {
    return buildCountryClause({
      subjectVar: 'region',
      countryCode: country?.country_code,
      countryQid: country?.wikidata_qid
    });
  }

  _resolveWikidataAdminLevel(source) {
    if (!source || typeof source !== 'object') {
      return this.defaultWikidataAdminLevel;
    }

    const candidate = source.wikidataAdminLevel ?? source.adminLevel;
    if (candidate == null) {
      return this.defaultWikidataAdminLevel;
    }

    const numericValue = Number(candidate);
    return Number.isFinite(numericValue) ? numericValue : this.defaultWikidataAdminLevel;
  }

  _buildRegionExtra(region, wikidataAdminLevel) {
    const extra = {};
    if (wikidataAdminLevel != null) {
      extra.wikidataAdminLevel = wikidataAdminLevel;
      extra.level = wikidataAdminLevel; // Legacy alias retained for backward compatibility
    }
    if (region && typeof region.isoCode === 'string' && region.isoCode.trim()) {
      extra.isoCode = region.isoCode.trim();
    }
    if (Object.keys(extra).length === 0) {
      return null;
    }
    try {
      return JSON.stringify(extra);
    } catch (error) {
      this.logger.warn('[WikidataAdm1Ingestor] Failed to serialize region extra metadata:', error.message);
      return null;
    }
  }

  async _fallbackIngestRegions(country, emitProgress) {
    const result = { processed: 0, upserted: 0, errors: 0 };

    const qids = await this._fetchRegionQidsSimple(country);
    if (!qids.length) {
      this.logger.warn(`[WikidataAdm1Ingestor] Fallback query returned no regions for ${country.country_code}`);
      const snapshotResult = this._fallbackIngestFromSnapshot(country, emitProgress);
      result.processed += snapshotResult.processed;
      result.upserted += snapshotResult.upserted;
      result.errors += snapshotResult.errors;
      return result;
    }

    this.logger.info(`[WikidataAdm1Ingestor] Fallback region ingestion starting for ${country.country_code} (${qids.length} QIDs)`);
    this._emitProgress(emitProgress, {
      phase: 'fallback-start',
      countryCode: country.country_code,
      totalItems: qids.length,
      message: `Fallback region ingestion starting (${qids.length} QIDs)`
    });

    let entities = {};
    try {
      const entitiesResponse = await this._fetchEntities(qids);
      entities = entitiesResponse?.entities || {};
    } catch (error) {
      this.logger.error(`[WikidataAdm1Ingestor] Fallback entity fetch failed for ${country.country_code}: ${error.message}`);
      throw error;
    }
    const regionsForCache = [];

    for (let index = 0; index < qids.length; index++) {
      const qid = qids[index];
      const entity = entities[qid];
      if (!entity) {
        result.errors++;
        continue;
      }

      try {
        const regionData = this._extractRegionData(qid, entity, {}, country);
        regionsForCache.push(regionData);
        const upserted = this._upsertRegionFromDynamic(regionData, country);
        if (upserted) {
          result.upserted++;
        }
        result.processed++;
      } catch (error) {
        result.errors++;
        this.logger.error(`[WikidataAdm1Ingestor] Fallback failed for ${qid} (${country.country_code}): ${error.message}`);
      }

      const current = index + 1;
      if (current === 1 || current % 5 === 0 || current === qids.length) {
        this.logger.info(`[WikidataAdm1Ingestor] Fallback ${country.country_code} ${current}/${qids.length} processed (new: ${result.upserted}, errors: ${result.errors})`);
      }

      this._emitProgress(emitProgress, {
        phase: 'fallback-processing',
        countryCode: country.country_code,
        current,
        totalItems: qids.length,
        regionsProcessed: result.processed,
        regionsUpserted: result.upserted,
        totalErrors: result.errors,
        message: `Fallback region fetch ${current}/${qids.length}`
      });

      if (this.sleepMs > 0 && current < qids.length) {
        await this._sleep(this.sleepMs);
      }
    }

    if (this.useCache && regionsForCache.length > 0) {
      this._cacheRegions(country.country_code, regionsForCache);
    }

    this.logger.info(`[WikidataAdm1Ingestor] Fallback complete for ${country.country_code} (processed=${result.processed}, new=${result.upserted}, errors=${result.errors})`);
    return result;
  }

  async _fetchRegionQidsSimple(country) {
    try {
      const countryClause = this._buildCountryClause(country);
      const regionClassValues = this.regionClassQids.map(qid => `wd:${qid}`).join(' ');
      const sparql = `
        SELECT DISTINCT ?region WHERE {
          VALUES ?regionClass { ${regionClassValues} }
          ?region wdt:P31/wdt:P279* ?regionClass.
          ${countryClause}
        }
        LIMIT ${this.maxRegionsPerCountry}
      `;

      const data = await this._fetchSparql(sparql);
      const bindings = data?.results?.bindings || [];
      const qids = compact(bindings, b => this._extractQid(b.region?.value));
      this.logger.info(`[WikidataAdm1Ingestor] Fallback query retrieved ${qids.length} region QIDs for ${country.country_code}`);
      return qids;
    } catch (error) {
      this.logger.error(`[WikidataAdm1Ingestor] Fallback SPARQL list query failed for ${country.country_code}: ${error.message}`);
      return [];
    }
  }

  _fallbackIngestFromSnapshot(country, emitProgress) {
    const result = { processed: 0, upserted: 0, errors: 0 };

    if (this.useSnapshot === false) {
      this.logger.warn(`[WikidataAdm1Ingestor] Snapshot fallback disabled; cannot recover regions for ${country.country_code}`);
      return result;
    }

    const dataset = this._loadDataset();
    if (!Array.isArray(dataset) || dataset.length === 0) {
      this.logger.warn(`[WikidataAdm1Ingestor] Snapshot dataset unavailable; cannot recover regions for ${country.country_code}`);
      return result;
    }

    const matches = dataset.filter(entry => {
      const entryCode = entry?.country?.code ? String(entry.country.code).toUpperCase() : null;
      const entryQid = entry?.country?.qid ? String(entry.country.qid).toUpperCase() : null;
      const countryCode = country?.country_code ? String(country.country_code).toUpperCase() : null;
      const countryQid = country?.wikidata_qid ? String(country.wikidata_qid).toUpperCase() : null;
      return (entryCode && countryCode && entryCode === countryCode) || (entryQid && countryQid && entryQid === countryQid);
    });

    if (!matches.length) {
      this.logger.warn(`[WikidataAdm1Ingestor] Snapshot fallback found no entries for ${country.country_code}`);
      return result;
    }

    this.logger.info(`[WikidataAdm1Ingestor] Using snapshot fallback for ${country.country_code} (${matches.length} entries)`);
    this._emitProgress(emitProgress, {
      phase: 'fallback-snapshot',
      countryCode: country.country_code,
      totalItems: matches.length,
      message: `Snapshot fallback for regions (${matches.length} entries)`
    });

    for (let index = 0; index < matches.length; index++) {
      const entry = matches[index];
      try {
        const upsertResult = this._upsertRegion(entry);
        result.processed++;
        if (upsertResult.isNew) {
          result.upserted++;
        }
      } catch (error) {
        result.processed++;
        result.errors++;
        this.logger.error(`[WikidataAdm1Ingestor] Snapshot fallback failed for ${entry?.label || 'unknown'} (${country.country_code}): ${error.message}`);
      }

      const current = index + 1;
      if (current === 1 || current % 5 === 0 || current === matches.length) {
        this.logger.info(`[WikidataAdm1Ingestor] Snapshot fallback ${country.country_code} ${current}/${matches.length} processed (new: ${result.upserted}, errors: ${result.errors})`);
      }

      this._emitProgress(emitProgress, {
        phase: 'fallback-snapshot-processing',
        countryCode: country.country_code,
        current,
        totalItems: matches.length,
        regionsProcessed: result.processed,
        regionsUpserted: result.upserted,
        totalErrors: result.errors,
        message: `Snapshot fallback region ${current}/${matches.length}`
      });
    }

    return result;
  }

  // ========== SPARQL and Entity API Methods ==========

  async _fetchSparql(sparql) {
    const url = 'https://query.wikidata.org/sparql';
    const params = new URLSearchParams({ query: sparql, format: 'json' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'User-Agent': 'copilot-dl-news/1.0 (Geography gazetteer; https://github.com/metabench/copilot-dl-news)',
          'Accept': 'application/sparql-results+json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`SPARQL HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Check for API-level errors
      if (data.error) {
        throw new Error(`SPARQL API error: ${data.error.code || 'unknown'} - ${data.error.info || data.error.message || ''}`);
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _fetchEntities(qids) {
    if (!qids || qids.length === 0) {
      return null;
    }

    // Wikidata entity API has a limit of 50 entities per request
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < qids.length; i += batchSize) {
      batches.push(qids.slice(i, i + batchSize));
    }

    const allEntities = {};

    for (const batch of batches) {
      const url = 'https://www.wikidata.org/w/api.php';
      const params = new URLSearchParams({
        action: 'wbgetentities',
        ids: batch.join('|'),
        format: 'json',
        props: 'labels|aliases|descriptions|claims'
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${url}?${params}`, {
          headers: {
            'User-Agent': 'copilot-dl-news/1.0 (Geography gazetteer; https://github.com/metabench/copilot-dl-news)'
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Entity API HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Check for API-level errors
        if (data.error) {
          throw new Error(`Entity API error: ${data.error.code || 'unknown'} - ${data.error.info || ''}`);
        }

        // Merge entities
        if (data.entities) {
          Object.assign(allEntities, data.entities);
        }
      } finally {
        clearTimeout(timeout);
      }

      // Brief pause between batches
      if (batches.length > 1) {
        await this._sleep(this.sleepMs);
      }
    }

    return { entities: allEntities };
  }

  _extractQid(wikidataUrl) {
    if (!wikidataUrl || typeof wikidataUrl !== 'string') {
      return null;
    }
    const match = wikidataUrl.match(/\/(Q\d+)$/);
    return match ? match[1] : null;
  }

  _extractClaim(claims, property) {
    const claim = claims[property];
    if (!claim || !is_array(claim) || claim.length === 0) {
      return null;
    }
    const value = claim[0]?.mainsnak?.datavalue?.value;
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && value.id) {
      return value.id;
    }
    return null;
  }

  _extractCoordinates(claims) {
    const coordClaim = claims.P625;
    if (!coordClaim || !is_array(coordClaim) || coordClaim.length === 0) {
      return null;
    }
    const value = coordClaim[0]?.mainsnak?.datavalue?.value;
    if (value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) {
      return { lat: value.latitude, lon: value.longitude };
    }
    return null;
  }

  _extractPopulation(claims) {
    const popClaim = claims.P1082;
    if (!popClaim || !is_array(popClaim) || popClaim.length === 0) {
      return null;
    }
    const value = popClaim[0]?.mainsnak?.datavalue?.value;
    if (value && typeof value === 'object' && Number.isFinite(value.amount)) {
      return parseInt(value.amount, 10);
    }
    if (typeof value === 'number') {
      return parseInt(value, 10);
    }
    return null;
  }

  _extractArea(claims) {
    const areaClaim = claims.P2046;
    if (!areaClaim || !is_array(areaClaim) || areaClaim.length === 0) {
      return null;
    }
    const value = areaClaim[0]?.mainsnak?.datavalue?.value;
    if (value && typeof value === 'object' && Number.isFinite(value.amount)) {
      return parseFloat(value.amount);
    }
    if (typeof value === 'number') {
      return value;
    }
    return null;
  }

  _extractWikidataAdminLevel(claims) {
    const adminClaim = claims.P2959;  // P2959 = permanent duplicated item
    if (!adminClaim || !is_array(adminClaim) || adminClaim.length === 0) {
      return null;
    }
    const value = adminClaim[0]?.mainsnak?.datavalue?.value;
    if (typeof value === 'number') {
      return value;
    }
    if (value && typeof value === 'object' && Number.isFinite(value.amount)) {
      return parseInt(value.amount, 10);
    }
    return null;
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

  _filterDynamicCountryList(countries) {
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

  _filterSnapshotEntries(entries) {
    if (!Array.isArray(entries)) {
      return { filteredEntries: [], unmatchedSpecifiers: this.countryFilter?.specifiers || [], matchDetails: [] };
    }
    if (!this.countryFilter) {
      return { filteredEntries: [...entries], unmatchedSpecifiers: [], matchDetails: [] };
    }

    const filteredEntries = [];
    const matchDetails = [];
    const matchedKeys = new Set();

    for (const entry of entries) {
      const match = this._matchTargetCountry({
        qid: entry?.country?.qid,
        code: entry?.country?.code,
        labels: [entry?.country?.label]
      });
      if (match) {
        filteredEntries.push(entry);
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
    return { filteredEntries, unmatchedSpecifiers, matchDetails };
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

  // ========== Cache Methods ==========

  _getCacheKey(countryCode) {
    return `adm1-${countryCode.toLowerCase()}`;
  }

  _getCachePath(countryCode) {
    const key = this._getCacheKey(countryCode);
    const hash = crypto.createHash('md5').update(key).digest('hex').substring(0, 8);
    return path.join(this.cacheDir, `${key}-${hash}.json`);
  }

  _getCachedRegions(countryCode) {
    if (!this.useCache) {
      return null;
    }

    try {
      const cachePath = this._getCachePath(countryCode);
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const raw = fs.readFileSync(cachePath, 'utf8');
      const cached = JSON.parse(raw);

      // Check cache age (refresh after 30 days)
      const cacheAge = Date.now() - (cached.timestamp || 0);
      const maxAge = 30 * 24 * 60 * 60 * 1000;  // 30 days
      if (cacheAge > maxAge) {
        return null;
      }

      return cached.regions || null;
    } catch (err) {
      return null;
    }
  }

  _cacheRegions(countryCode, regions) {
    if (!this.useCache) {
      return;
    }

    try {
      const cachePath = this._getCachePath(countryCode);
      const cacheData = {
        countryCode,
        timestamp: Date.now(),
        regions
      };
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (err) {
      this.logger.warn(`[WikidataAdm1Ingestor] Failed to cache regions for ${countryCode}:`, err.message);
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WikidataAdm1Ingestor;
