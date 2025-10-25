'use strict';

/**
 * Gazetteer Names Module
 *
 * Provides utilities for managing place names and canonical name assignments.
 */

const { normalizeName } = require('./gazetteer.utils');
const { getAllPlaceNames } = require('./gazetteerPlaceNames');

/**
 * Fix canonical names for places that have names but no canonical_name_id set
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} options - Fix options
 * @param {boolean} options.dryRun - If true, only preview changes
 * @param {string|null} options.kindFilter - Filter by place kind
 * @param {string|null} options.roleFilter - Filter by role
 * @returns {object} Fix results { placesWithoutCanonical, fixedCount, skippedCount }
 */
function fixCanonicalNames(db, options = {}) {
  const { dryRun = true, kindFilter = null, roleFilter = null } = options;

  // Build query with optional filters
  let whereConditions = ['p.canonical_name_id IS NULL'];
  if (kindFilter) whereConditions.push(`p.kind = '${kindFilter}'`);
  if (roleFilter) whereConditions.push(`json_extract(p.extra, '$.role') = '${roleFilter}'`);

  const query = `
    SELECT
      p.id,
      p.kind,
      p.country_code,
      p.extra,
      COUNT(pn.id) as name_count
    FROM places p
    LEFT JOIN place_names pn ON p.id = pn.place_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY p.id
    HAVING name_count > 0
    ORDER BY p.kind, p.country_code, p.id
  `;

  const placesWithoutCanonical = db.prepare(query).all();

  // Prepare statement to find best name
  const getBestName = db.prepare(`
    SELECT id, name, lang, is_official, is_preferred
    FROM place_names
    WHERE place_id = ?
    ORDER BY
      is_official DESC,
      is_preferred DESC,
      (lang = 'en') DESC,
      (lang = 'und') DESC,
      id ASC
    LIMIT 1
  `);

  // Prepare statement to update canonical_name_id
  const updateCanonical = db.prepare(`
    UPDATE places
    SET canonical_name_id = ?
    WHERE id = ?
  `);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const place of placesWithoutCanonical) {
    const bestName = getBestName.get(place.id);

    if (!bestName) {
      skippedCount++;
      continue;
    }

    if (!dryRun) {
      try {
        updateCanonical.run(bestName.id, place.id);
        fixedCount++;
      } catch (err) {
        skippedCount++;
      }
    }
  }

  return { placesWithoutCanonical, fixedCount, skippedCount };
}

/**
 * Fix place names with empty normalized values by re-normalizing them
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} options - Fix options
 * @param {boolean} options.dryRun - If true, only preview changes
 * @returns {object} Fix results { namesToFix, fixedCount, skippedCount }
 */
function fixNormalizedNames(db, options = {}) {
  const { dryRun = true } = options;

  const namesToFix = db.prepare(`
    SELECT id, name, normalized, lang
    FROM place_names
    WHERE normalized = '' AND name != ''
    ORDER BY lang, name
  `).all();

  const updateNormalized = db.prepare(`
    UPDATE place_names
    SET normalized = ?
    WHERE id = ?
  `);

  let fixedCount = 0;
  let skippedCount = 0;

  for (const nameRecord of namesToFix) {
    const newNormalized = normalizeName(nameRecord.name);

    if (!newNormalized) {
      skippedCount++;
      continue;
    }

    if (!dryRun) {
      try {
        updateNormalized.run(newNormalized, nameRecord.id);
        fixedCount++;
      } catch (err) {
        skippedCount++;
      }
    }
  }

  return { namesToFix, fixedCount, skippedCount };
}

/**
 * Fix place hub slugs to match gazetteer names
 * @param {object} db - Better-sqlite3 database handle
 * @param {object} options - Fix options
 * @param {boolean} options.dryRun - If true, only preview changes
 * @returns {object} Fix results { corrections }
 */
function fixPlaceHubNames(db, options = {}) {
  const { dryRun = true } = options;

  // Load all place names from gazetteer (includes all variations)
  const allPlaceNames = getAllPlaceNames(db);

  // Get all place hubs
  const placeHubs = db.prepare(`
    SELECT id, place_slug, title, url
    FROM place_hubs
    WHERE place_slug IS NOT NULL
    AND place_slug != ''
    ORDER BY place_slug
  `).all();

  // Normalize function: remove spaces, hyphens, lowercase
  function normalize(str) {
    return str.toLowerCase().replace(/[\s-]/g, '');
  }

  // Find matches and corrections
  const corrections = [];

  placeHubs.forEach(hub => {
    const normalizedSlug = normalize(hub.place_slug);

    // Check if normalized slug matches any place name
    for (const placeName of allPlaceNames) {
      const normalizedPlace = normalize(placeName);

      if (normalizedSlug === normalizedPlace) {
        // Found a match! Convert place name to slug format
        const correctSlug = placeName.toLowerCase().replace(/\s+/g, '-');

        // Only correct if different from current slug
        if (hub.place_slug !== correctSlug) {
          corrections.push({
            id: hub.id,
            currentSlug: hub.place_slug,
            correctSlug: correctSlug,
            placeName: placeName,
            url: hub.url
          });
        }
        break; // Found match, no need to check more
      }
    }
  });

  if (!dryRun && corrections.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE place_hubs
      SET place_slug = ?
      WHERE id = ?
    `);

    const updateMany = db.transaction((corrections) => {
      for (const correction of corrections) {
        updateStmt.run(correction.correctSlug, correction.id);
      }
    });

    updateMany(corrections);
  }

  return { corrections };
}

module.exports = {
  fixCanonicalNames,
  fixNormalizedNames,
  fixPlaceHubNames
};