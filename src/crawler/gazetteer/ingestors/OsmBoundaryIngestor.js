'use strict';

const { tof, is_array } = require('lang-tools');
const { OsmHttpClient } = require('../clients/OsmHttpClient');
const {
  createOsmBoundaryStatements,
  listBoundaryCandidates,
  saveBoundaryData
} = require('../../../db/sqlite/queries/gazetteer.osm');

class OsmBoundaryIngestor {
  constructor({
    db,
    client = null,
    logger = console,
    batchSize = 10,
    overpassTimeout = 60
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
      errors: 0,
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

    for (const candidate of candidates) {
      if (signal?.aborted) {
        throw new Error('OsmBoundaryIngestor aborted');
      }
      try {
        const resolved = this._resolveOsmIdentifiers(candidate);
        if (!resolved) {
          this.logger.debug('[OsmBoundaryIngestor] Skipping candidate without OSM identifier', candidate.id);
          continue;
        }

        const { osmType, osmId } = resolved;
        const overpassData = await this._fetchBoundary(osmType, osmId, { signal });
        if (!overpassData) {
          this.logger.warn(`[OsmBoundaryIngestor] No Overpass data for ${osmType}/${osmId}`);
          continue;
        }

        const relation = overpassData.elements?.find((el) => el.type === 'relation' && String(el.id) === String(osmId));
        const bbox = this._extractBoundingBox(overpassData, relation);
        const tags = relation?.tags || null;

        const attributes = [
          {
            attr: 'osm.boundary.overpass',
            source: 'osm.overpass',
            value: overpassData
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

        saveBoundaryData(this.statements, candidate.id, {
          bbox,
          osmTags: tags,
          areaSqKm: this._coalesceArea(candidate, relation),
          attributes
        });

        summary.recordsProcessed++;
        summary.recordsUpserted++;
        this._emitProgress(emitProgress, {
          phase: 'processing',
          current: summary.recordsProcessed,
          totalItems: candidates.length,
          recordsProcessed: summary.recordsProcessed,
          recordsUpserted: summary.recordsUpserted,
          candidateId: candidate.id,
          canonicalName: candidate.canonicalName,
          countryCode: candidate.countryCode,
          kind: candidate.kind,
          osmType,
          osmId
        });
      } catch (err) {
        summary.recordsProcessed++;
        summary.errors++;
        this.logger.error('[OsmBoundaryIngestor] Failed to process candidate', candidate.id, err.message);
      }
    }

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
