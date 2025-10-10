'use strict';

const fs = require('fs');
const path = require('path');
const { tof, is_array } = require('lang-tools');
const ingestQueries = require('../../../db/sqlite/queries/gazetteer.ingest');

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
 * Loads first-level administrative divisions (ADM1) from a curated Wikidata snapshot
 * and upserts them into the gazetteer database in an ordered, planner-friendly sequence.
 */
class WikidataAdm1Ingestor {
  constructor({
    db,
    logger = console,
    snapshotPath = DEFAULT_SNAPSHOT_PATH,
    useSnapshot = true,
    priorityScore = 650
  } = {}) {
    if (!db) {
      throw new Error('WikidataAdm1Ingestor requires a database handle');
    }
    this.db = db;
    this.logger = logger || console;
    this.snapshotPath = snapshotPath;
    this.useSnapshot = useSnapshot !== false;
    this.priorityScore = priorityScore;
    this.id = 'wikidata-adm1';
    this.name = 'Wikidata ADM1 Ingestor';

    this.statements = ingestQueries.createIngestionStatements(this.db);
  }

  async execute({ signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();
    const summary = {
      recordsProcessed: 0,
      recordsUpserted: 0,
      errors: 0,
      durationMs: 0,
      preview: []
    };

    this.logger.info('[WikidataAdm1Ingestor] Starting ADM1 ingestion…');

    const entries = this._loadDataset();
    const orderedEntries = entries.sort((a, b) => {
      const countryA = (a.country?.label || '').toLowerCase();
      const countryB = (b.country?.label || '').toLowerCase();
      if (countryA !== countryB) {
        return countryA.localeCompare(countryB);
      }
      return (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase());
    });

    if (!orderedEntries.length) {
      this.logger.warn('[WikidataAdm1Ingestor] No ADM1 entries found in snapshot');
      summary.notes = 'No ADM1 entries available';
      return summary;
    }

    this._emitProgress(emitProgress, {
      phase: 'discovery-complete',
      totalItems: orderedEntries.length,
      message: `Discovered ${orderedEntries.length} ADM1 divisions`
    });

    const preview = [];

    for (let idx = 0; idx < orderedEntries.length; idx += 1) {
      if (signal?.aborted) {
        throw new Error('WikidataAdm1Ingestor aborted');
      }

      const entry = orderedEntries[idx];
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

        if (idx % 10 === 0 || idx === orderedEntries.length - 1) {
          this._emitProgress(emitProgress, {
            phase: 'processing',
            current: idx + 1,
            totalItems: orderedEntries.length,
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
      return parsed.filter((entry) => entry && typeof entry === 'object');
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
    const adm1Code = this._deriveAdm1Code(entry.isoCode, countryCode);
    const existing = entry.qid ? this.statements.getPlaceByWikidataQid.get(entry.qid) : null;

    const placeId = ingestQueries.upsertPlace(this.db, this.statements, {
      wikidataQid: entry.qid || null,
      kind: 'region',
      countryCode,
      population: entry.population ?? null,
      timezone: entry.timezone ?? null,
      lat: entry.coord?.lat ?? null,
      lng: entry.coord?.lon ?? null,
      bbox: null,
      source: 'wikidata',
      extra: null,
      area: entry.areaSqKm ?? null,
      gdpUsd: null,
      adminLevel: entry.adminLevel ?? 4,
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
      isNew: !existing
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

  _deriveAdm1Code(isoCode, countryCode) {
    if (tof(isoCode) !== 'string') {
      return null;
    }
    const parts = isoCode.split('-');
    if (parts.length < 2) {
      return isoCode.trim() || null;
    }
    const code = parts.slice(1).join('-');
    if (countryCode && code.toUpperCase().startsWith(countryCode.toUpperCase())) {
      return code.slice(countryCode.length).replace(/^-/, '') || code;
    }
    return code;
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
}

module.exports = WikidataAdm1Ingestor;
