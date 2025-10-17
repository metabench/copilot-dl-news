'use strict';

const { is_array } = require('lang-tools');

/**
 * Gazetteer attribute helpers
 *
 * Stores per-source attribute values for places so we can reconcile
 * conflicting data across providers (Wikidata, REST Countries, OSM, etc.).
 */

/**
 * Create prepared statements used for inserting/updating attribute values.
 *
 * @param {import('better-sqlite3').Database} db - Open database handle.
 * @returns {{upsertAttribute: import('better-sqlite3').Statement, deleteAttribute: import('better-sqlite3').Statement}}
 */
function createAttributeStatements(db) {
  return {
    upsertAttribute: db.prepare(`
      INSERT INTO place_attribute_values(
        place_id, attr, source, value_json, confidence, fetched_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(place_id, attr, source) DO UPDATE SET
        value_json = excluded.value_json,
        confidence = COALESCE(excluded.confidence, place_attribute_values.confidence),
        fetched_at = excluded.fetched_at,
        metadata = COALESCE(excluded.metadata, place_attribute_values.metadata)
    `),
    deleteAttribute: db.prepare(`
      DELETE FROM place_attribute_values
      WHERE place_id = ? AND attr = ? AND source = ?
    `)
  };
}

/**
 * Serialize attribute values to JSON for storage.
 *
 * @param {*} value - Arbitrary attribute value.
 * @returns {string|null} JSON string or null when value is absent.
 */
function coerceJson(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  return JSON.stringify(value);
}

/**
 * Ensure attribute keys consistently map to lowercase strings.
 *
 * @param {string} attr - Attribute identifier provided by caller.
 * @returns {string} Normalized attribute key.
 */
function normalizeAttrKey(attr) {
  if (!attr) throw new Error('attr is required for place attribute value');
  return String(attr).trim().toLowerCase();
}

/**
 * Upsert a single attribute value for a place.
 *
 * @param {{upsertAttribute: import('better-sqlite3').Statement}} statements - Prepared statements from createAttributeStatements.
 * @param {object} options - Attribute insertion options.
 * @param {number} options.placeId - Target place identifier.
 * @param {string} options.attr - Attribute key to upsert.
 * @param {string} [options.source] - Upstream data source identifier.
 * @param {*} [options.value] - Raw attribute value (will be JSON stringified).
 * @param {number|null} [options.confidence] - Optional confidence score (0-1).
 * @param {number|null} [options.fetchedAt] - Epoch milliseconds when value was fetched.
 * @param {object|null} [options.metadata] - Additional metadata blob for debugging/provenance.
 */
function recordAttribute(statements, {
  placeId,
  attr,
  source,
  value = null,
  confidence = null,
  fetchedAt = null,
  metadata = null
}) {
  if (!statements || !statements.upsertAttribute) {
    throw new Error('recordAttribute requires attribute statements created via createAttributeStatements');
  }
  if (!Number.isInteger(placeId)) {
    throw new TypeError('recordAttribute requires a numeric placeId');
  }
  const normalizedAttr = normalizeAttrKey(attr);
  const normalizedSource = String(source || 'unknown').trim().toLowerCase();
  const fetched = Number.isFinite(fetchedAt) ? fetchedAt : Date.now();

  statements.upsertAttribute.run(
    placeId,
    normalizedAttr,
    normalizedSource,
    coerceJson(value),
    confidence == null ? null : Number(confidence),
    fetched,
    metadata == null ? null : JSON.stringify(metadata)
  );
}

/**
 * Upsert multiple attribute entries for a single place.
 *
 * @param {{upsertAttribute: import('better-sqlite3').Statement}} statements - Prepared statements from createAttributeStatements.
 * @param {number} placeId - Target place identifier.
 * @param {Array<object>} [entries=[]] - Collection of attribute definitions accepted by recordAttribute.
 */
function recordAttributes(statements, placeId, entries = []) {
  if (!is_array(entries) || entries.length === 0) {
    return;
  }
  for (const entry of entries) {
    recordAttribute(statements, {
      placeId,
      ...entry
    });
  }
}

module.exports = {
  createAttributeStatements,
  recordAttribute,
  recordAttributes
};
