'use strict';

const { is_array } = require('lang-tools');
const {
  createAttributeStatements,
  recordAttributes
} = require('./gazetteer.attributes');

function createOsmBoundaryStatements(db) {
  const attributeStatements = createAttributeStatements(db);
  return {
    selectBoundaryCandidates: db.prepare(`
      SELECT
        p.id,
        p.kind,
        p.country_code AS countryCode,
        p.osm_type AS osmType,
        p.osm_id AS osmId,
        p.canonical_name_id,
        pn.name AS canonicalName,
        pav.value_json AS osmRelationAttr,
        p.osm_tags AS osmTags,
        p.bbox AS bbox,
        p.priority_score AS priorityScore,
        p.last_crawled_at AS lastCrawledAt
      FROM places p
      LEFT JOIN place_names pn ON pn.id = p.canonical_name_id
      LEFT JOIN place_attribute_values pav
        ON pav.place_id = p.id AND pav.attr = 'osm.relation'
      WHERE (p.osm_id IS NOT NULL OR pav.value_json IS NOT NULL)
        AND (p.osm_tags IS NULL OR p.bbox IS NULL)
        AND p.kind IN ('country', 'region')
      ORDER BY COALESCE(p.priority_score, 0) DESC, p.id ASC
      LIMIT ?
    `),
    updateBoundaryData: db.prepare(`
      UPDATE places SET
        bbox = COALESCE(bbox, ?),
        osm_tags = COALESCE(osm_tags, ?),
        area = COALESCE(area, ?),
        last_crawled_at = ?
      WHERE id = ?
    `),
    attributeStatements
  };
}

function listBoundaryCandidates(statements, { limit = 25 } = {}) {
  return statements.selectBoundaryCandidates.all(limit).map((row) => ({
    id: row.id,
    kind: row.kind,
    countryCode: row.countryCode,
    canonicalName: row.canonicalName || null,
    osmType: row.osmType || null,
    osmId: row.osmId || null,
    osmRelationAttr: row.osmRelationAttr ? safeParse(row.osmRelationAttr) : null,
    osmTags: row.osmTags ? safeParse(row.osmTags) : null,
    bbox: row.bbox ? safeParse(row.bbox) : null,
    priorityScore: row.priorityScore,
    lastCrawledAt: row.lastCrawledAt || null
  }));
}

function saveBoundaryData(statements, placeId, {
  bbox = null,
  osmTags = null,
  areaSqKm = null,
  attributes = [],
  fetchedAt = Date.now()
} = {}) {
  const bboxJson = bbox ? JSON.stringify(bbox) : null;
  const tagsJson = osmTags ? JSON.stringify(osmTags) : null;

  statements.updateBoundaryData.run(
    bboxJson,
    tagsJson,
    areaSqKm,
    fetchedAt,
    placeId
  );

  if (is_array(attributes) && attributes.length) {
    recordAttributes(statements.attributeStatements, placeId, attributes.map((entry) => ({
      attr: entry.attr,
      source: entry.source,
      value: entry.value,
      confidence: entry.confidence ?? null,
      fetchedAt: entry.fetchedAt ?? fetchedAt,
      metadata: entry.metadata ?? null
    })));
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

module.exports = {
  createOsmBoundaryStatements,
  listBoundaryCandidates,
  saveBoundaryData
};
