'use strict';

const { tof, is_array } = require('lang-tools');
const { OsmHttpClient } = require('../clients/OsmHttpClient');
const {
  createOsmBoundaryStatements,
  listBoundaryCandidates,
  saveBoundaryData
} = require('../../../db/sqlite/v1/queries/gazetteer.osm');

class OsmBoundaryIngestor {
  constructor({
    db,
    client = null,
    logger = console,
    batchSize = 10,
    overpassTimeout = 60,
    maxConcurrentFetches = 2,
    maxBatchSize = 5,
    freshnessIntervalMs = 7 * 24 * 60 * 60 * 1000
  } = {}) {
    process.stderr.write('[OsmBoundaryIngestor] Constructor starting...\n');
    if (!db) {
      throw new Error('OsmBoundaryIngestor requires a database handle');
    }
    this.db = db;
    this.logger = logger || console;
    this.batchSize = batchSize;
    this.overpassTimeout = overpassTimeout;
    this.client = client || new OsmHttpClient({ logger: this.logger });
    this.maxConcurrentFetches = Math.max(1, Math.floor(maxConcurrentFetches));
    this.maxBatchSize = Math.max(1, Math.floor(maxBatchSize));
    this.freshnessIntervalMs = Number.isFinite(freshnessIntervalMs) && freshnessIntervalMs > 0 ? freshnessIntervalMs : null;
    process.stderr.write('[OsmBoundaryIngestor] Creating boundary statements...\n');
    this.statements = createOsmBoundaryStatements(this.db);
    process.stderr.write('[OsmBoundaryIngestor] Statements created\n');
    this.id = 'osm-boundaries';
    this.name = 'OpenStreetMap Boundary Ingestor';

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO place_sources(name, version, url, license)
        VALUES ('osm.overpass', 'api', 'https://overpass-api.de', 'ODbL 1.0')
      `).run();
    } catch (err) {
      this.logger.warn('[OsmBoundaryIngestor] Failed to register source metadata:', err.message);
    }
    process.stderr.write('[OsmBoundaryIngestor] Constructor complete\n');
  }

  async execute({ limit = this.batchSize, signal = null, emitProgress = null } = {}) {
    const startedAt = Date.now();
    const summary = {
      recordsProcessed: 0,
      recordsUpserted: 0,
      recordsSkipped: 0,
      errors: 0,
      batchesAttempted: 0,
      batchesSucceeded: 0,
      batchesRetried: 0,
      singleFallbacks: 0,
      durationMs: 0
    };

    const candidates = listBoundaryCandidates(this.statements, { limit });
    if (!candidates.length) {
      this.logger.info('[OsmBoundaryIngestor] No candidates needing OSM boundaries');
      return summary;
    }

    this._emitProgress(emitProgress, {
      phase: 'discovery',
      totalItems: candidates.length,
      current: 0
    });

    const filteredCandidates = [];
    for (const candidate of candidates) {
      if (signal?.aborted) {
        throw new Error('OsmBoundaryIngestor aborted');
      }
      if (this._shouldSkipCandidate(candidate)) {
        summary.recordsSkipped++;
        continue;
      }
      const resolved = this._resolveOsmIdentifiers(candidate);
      if (!resolved) {
        this.logger.debug('[OsmBoundaryIngestor] Skipping candidate without OSM identifier', candidate.id);
        continue;
      }
      filteredCandidates.push({ ...candidate, resolved });
    }

    this._emitProgress(emitProgress, {
      phase: 'discovery-complete',
      totalItems: filteredCandidates.length,
      skipped: summary.recordsSkipped,
      current: 0
    });

    if (!filteredCandidates.length) {
      summary.durationMs = Date.now() - startedAt;
      this._emitProgress(emitProgress, { phase: 'complete', summary });
      return summary;
    }

    const batches = this._createBatches(filteredCandidates);
    if (!batches.length) {
      summary.durationMs = Date.now() - startedAt;
      this._emitProgress(emitProgress, { phase: 'complete', summary });
      return summary;
    }

    let nextBatchIndex = 0;
    const workerCount = Math.min(this.maxConcurrentFetches, batches.length);

    const runWorker = async () => {
      while (true) {
        if (signal?.aborted) {
          throw new Error('OsmBoundaryIngestor aborted');
        }
        const index = nextBatchIndex++;
        if (index >= batches.length) {
          break;
        }
        const batch = batches[index];
        await this._processBatch(batch, {
          signal,
          emitProgress,
          summary,
          batchIndex: index,
          totalBatches: batches.length,
          totalCandidates: filteredCandidates.length
        });
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    summary.durationMs = Date.now() - startedAt;
    this._emitProgress(emitProgress, { phase: 'complete', summary });
    return summary;
  }

  _resolveOsmIdentifiers(candidate) {
    const attrValue = candidate.osmRelationAttr;
    const fallbackId = tof(attrValue) === 'string' ? attrValue : attrValue?.id || attrValue?.value || null;
    const resolvedId = candidate.osmId || fallbackId;
    if (!resolvedId) {
      return null;
    }
    const attrType = tof(attrValue) === 'object' && attrValue?.type ? String(attrValue.type).toLowerCase() : null;
    const resolvedType = (candidate.osmType || attrType || 'relation').toLowerCase();
    return { osmType: resolvedType, osmId: resolvedId };
  }

  _shouldSkipCandidate(candidate) {
    if (!this.freshnessIntervalMs) {
      return false;
    }
    if (candidate.lastCrawledAt == null) {
      return false;
    }
    const last = Number(candidate.lastCrawledAt);
    if (!Number.isFinite(last)) {
      return false;
    }
    return Date.now() - last < this.freshnessIntervalMs;
  }

  _createBatches(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }
    const groups = new Map();
    for (const candidate of candidates) {
      const key = this._resolveBatchGroupKey(candidate);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(candidate);
    }

    const batches = [];
    for (const groupCandidates of groups.values()) {
      for (let i = 0; i < groupCandidates.length; i += this.maxBatchSize) {
        batches.push(groupCandidates.slice(i, i + this.maxBatchSize));
      }
    }
    return batches;
  }

  _resolveBatchGroupKey(candidate) {
    const kind = candidate?.kind ? String(candidate.kind).toLowerCase() : 'unknown';
    const osmType = candidate?.resolved?.osmType ? String(candidate.resolved.osmType).toLowerCase() : 'relation';
    let countryKey = null;
    if (candidate?.countryCode) {
      countryKey = String(candidate.countryCode).trim();
      if (!countryKey) {
        countryKey = null;
      }
    }

    if (!countryKey) {
      if (kind === 'country') {
        countryKey = 'global-country';
      } else if (kind === 'region') {
        countryKey = 'global-region';
      } else {
        countryKey = 'global';
      }
    }

    return `${countryKey.toLowerCase()}:${kind}:${osmType}`;
  }

  async _processBatch(batch, context) {
    const { signal, summary } = context;
    summary.batchesAttempted++;
    try {
      const response = await this._fetchBatch(batch, { signal });
      const elementMap = this._buildElementMap(response);
      const results = batch.map((candidate) => this._buildCandidateResult(candidate, elementMap));
      this._persistCandidateResults(results, summary, context);
      summary.batchesSucceeded++;
      this._emitTelemetry(context.emitProgress, 'info', 'OSM batch processed', {
        batchSize: batch.length,
        batchIndex: context.batchIndex,
        totalBatches: context.totalBatches
      });
    } catch (error) {
      this.logger.warn('[OsmBoundaryIngestor] Batch fetch failed, falling back to sequential processing:', error.message);
      summary.batchesRetried++;
      this._emitTelemetry(context.emitProgress, 'warning', 'OSM batch fetch failed; falling back to sequential fetches', {
        batchSize: batch.length,
        batchIndex: context.batchIndex,
        totalBatches: context.totalBatches,
        error: error.message
      });
      for (const candidate of batch) {
        summary.singleFallbacks++;
        await this._processSingleCandidate(candidate, {
          ...context,
          fallbackFromBatch: true,
          batchError: error
        });
      }
    }
  }

  async _processSingleCandidate(candidate, context) {
    const { signal, summary } = context;
    if (signal?.aborted) {
      throw new Error('OsmBoundaryIngestor aborted');
    }
    try {
      const response = await this._fetchBoundary(candidate.resolved.osmType, candidate.resolved.osmId, { signal });
      if (!response) {
        throw new Error('No Overpass data returned');
      }
      const elementMap = this._buildElementMap(response);
      const result = this._buildCandidateResult(candidate, elementMap);
      this._persistCandidateResults([result], summary, context);
    } catch (error) {
      summary.recordsProcessed++;
      summary.errors++;
      this.logger.error('[OsmBoundaryIngestor] Failed to process candidate', candidate.id, error.message);
      this._emitTelemetry(context.emitProgress, 'error', 'OSM single candidate fetch failed', {
        candidateId: candidate.id,
        countryCode: candidate.countryCode,
        kind: candidate.kind,
        fallbackFromBatch: context?.fallbackFromBatch === true,
        error: error.message
      });
      this._emitProgress(context.emitProgress, {
        phase: 'processing',
        current: summary.recordsProcessed,
        totalItems: context.totalCandidates,
        recordsProcessed: summary.recordsProcessed,
        recordsUpserted: summary.recordsUpserted,
        recordsSkipped: summary.recordsSkipped,
        candidateId: candidate.id,
        canonicalName: candidate.canonicalName,
        countryCode: candidate.countryCode,
        kind: candidate.kind,
        error: error.message
      });
    }
  }

  async _fetchBatch(batch, { signal } = {}) {
    const query = this._buildBatchQuery(batch);
    return this.client.fetchOverpass(query, { signal });
  }

  _buildBatchQuery(batch) {
    const timeout = Math.max(30, this.overpassTimeout);
    const lines = batch.map((candidate) => {
      const { osmType, osmId } = candidate.resolved;
      return `  ${osmType}(${osmId});`;
    });
    return `
[out:json][timeout:${timeout}];
(
${lines.join('\n')}
);
out body geom;`.trim();
  }

  _buildElementMap(overpassData) {
    const map = new Map();
    const elements = is_array(overpassData?.elements) ? overpassData.elements : [];
    for (const element of elements) {
      if (!element || element.id == null || !element.type) continue;
      map.set(`${element.type}:${element.id}`, element);
    }
    return map;
  }

  _collectElementsForCandidate(primaryElement, elementMap) {
    const seen = new Set();
    const elements = [];
    const pushElement = (element) => {
      if (!element) return;
      const key = `${element.type}:${element.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      elements.push(element);
    };

    pushElement(primaryElement);
    if (primaryElement?.type === 'relation' && is_array(primaryElement.members)) {
      for (const member of primaryElement.members) {
        const memberElement = elementMap.get(`${member.type}:${member.ref}`);
        if (memberElement) {
          pushElement(memberElement);
        }
      }
    }

    return elements;
  }

  _buildCandidateResult(candidate, elementMap) {
    const key = this._elementKey(candidate.resolved);
    const primaryElement = elementMap.get(key);
    if (!primaryElement) {
      return {
        candidate,
        success: false,
        error: new Error(`Overpass result missing element ${key}`)
      };
    }

    const scopedElements = this._collectElementsForCandidate(primaryElement, elementMap);
    const scopedData = { elements: scopedElements };
    const bbox = this._extractBoundingBox(scopedData, primaryElement);
    const tags = primaryElement?.tags || null;

    const attributes = [
      {
        attr: 'osm.boundary.overpass',
        source: 'osm.overpass',
        value: scopedData
      }
    ];
    if (bbox) {
      attributes.push({
        attr: 'osm.boundary.bbox',
        source: 'osm.overpass',
        value: bbox
      });
    }
    if (tags) {
      attributes.push({
        attr: 'osm.tags',
        source: 'osm.overpass',
        value: tags
      });
    }

    return {
      candidate,
      success: true,
      data: {
        bbox,
        tags,
        areaSqKm: this._coalesceArea(candidate, primaryElement),
        attributes
      }
    };
  }

  _persistCandidateResults(results, summary, context) {
    const successful = results.filter((result) => result.success && !result.error);
    if (successful.length) {
      const transaction = this.db.transaction((items) => {
        for (const item of items) {
          saveBoundaryData(this.statements, item.candidate.id, {
            bbox: item.data.bbox,
            osmTags: item.data.tags,
            areaSqKm: item.data.areaSqKm,
            attributes: item.data.attributes
          });
        }
      });

      try {
        transaction(successful);
      } catch (err) {
        this.logger.error('[OsmBoundaryIngestor] Transactional boundary save failed, retrying individually:', err.message);
        for (const item of successful) {
          try {
            saveBoundaryData(this.statements, item.candidate.id, {
              bbox: item.data.bbox,
              osmTags: item.data.tags,
              areaSqKm: item.data.areaSqKm,
              attributes: item.data.attributes
            });
          } catch (saveErr) {
            item.success = false;
            item.error = saveErr;
          }
        }
      }
    }

    for (const result of results) {
      summary.recordsProcessed++;
      if (result.success && !result.error) {
        summary.recordsUpserted++;
      } else {
        summary.errors++;
        if (result.error) {
          this.logger.error('[OsmBoundaryIngestor] Failed to process candidate', result.candidate.id, result.error.message);
        }
      }

      this._emitProgress(context.emitProgress, {
        phase: 'processing',
        current: summary.recordsProcessed,
        totalItems: context.totalCandidates,
        recordsProcessed: summary.recordsProcessed,
        recordsUpserted: summary.recordsUpserted,
        recordsSkipped: summary.recordsSkipped,
        candidateId: result.candidate.id,
        canonicalName: result.candidate.canonicalName,
        countryCode: result.candidate.countryCode,
        kind: result.candidate.kind,
        batchIndex: context.batchIndex != null ? context.batchIndex + 1 : undefined,
        totalBatches: context.totalBatches
      });
    }
  }

  _elementKey(resolved) {
    if (!resolved) {
      return 'relation:unknown';
    }
    return `${resolved.osmType}:${resolved.osmId}`;
  }

  async _fetchBoundary(osmType, osmId, { signal } = {}) {
    const query = `
      [out:json][timeout:${Math.max(30, this.overpassTimeout)}];
      ${osmType}(${osmId});
      out body geom;
    `;
    return this.client.fetchOverpass(query.trim(), { signal });
  }

  _extractBoundingBox(overpassData, relation) {
    if (relation?.bounds) {
      const { minlat, minlon, maxlat, maxlon } = relation.bounds;
      if ([minlat, minlon, maxlat, maxlon].every((v) => Number.isFinite(v))) {
        return [minlon, minlat, maxlon, maxlat];
      }
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    const elements = is_array(overpassData?.elements) ? overpassData.elements : [];
    for (const element of elements) {
      const geometry = element.geometry;
      if (!is_array(geometry)) continue;
      for (const point of geometry) {
        if (tof(point.lat) !== 'number' || tof(point.lon) !== 'number') continue;
        if (point.lat < minLat) minLat = point.lat;
        if (point.lat > maxLat) maxLat = point.lat;
        if (point.lon < minLon) minLon = point.lon;
        if (point.lon > maxLon) maxLon = point.lon;
      }
    }

    if (!Number.isFinite(minLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLat) || !Number.isFinite(maxLon)) {
      return null;
    }

    return [minLon, minLat, maxLon, maxLat];
  }

  _coalesceArea(candidate, relation) {
    const areaTag = relation?.tags?.['area'];
    if (areaTag && Number.isFinite(Number(areaTag))) {
      return Number(areaTag);
    }
    return null;
  }

  _emitProgress(handler, payload) {
    if (tof(handler) === 'function') {
      try {
        handler(payload);
      } catch (_) {
        // no-op
      }
    }
  }
  
  _emitTelemetry(handler, type, message, context = {}) {
    if (tof(handler) === 'function') {
      try {
        handler({
          type,
          stage: 'boundaries',
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

module.exports = OsmBoundaryIngestor;
