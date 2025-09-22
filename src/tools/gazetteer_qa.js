// Shared gazetteer validation and repair algorithms
// Exports:
//  - validateGazetteer(db): returns { details, summary }
//  - repairGazetteer(db): performs safe fixes and returns a summary of actions

function validateGazetteer(db) {
  const details = {};
  // Nameless places
  details.nameless = db.prepare(`
    SELECT p.id
    FROM places p
    WHERE (p.canonical_name_id IS NULL OR p.canonical_name_id NOT IN (SELECT id FROM place_names))
      AND NOT EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id)
    LIMIT 10000
  `).all();
  // Canonical not belonging to place
  details.badCanonical = db.prepare(`
    SELECT p.id, p.canonical_name_id
    FROM places p
    WHERE p.canonical_name_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = p.canonical_name_id AND pn.place_id = p.id
      )
    LIMIT 10000
  `).all();
  // Regions missing codes
  details.badRegions = db.prepare(`
    SELECT id
    FROM places
    WHERE kind='region' AND (country_code IS NULL OR TRIM(country_code)=''
       OR adm1_code IS NULL OR TRIM(adm1_code)='')
    LIMIT 10000
  `).all();
  // Countries missing/invalid code
  details.badCountries = db.prepare(`
    SELECT id
    FROM places
    WHERE kind='country' AND (country_code IS NULL OR LENGTH(TRIM(country_code)) <> 2)
    LIMIT 10000
  `).all();
  // Orphan hierarchy links
  details.orphanEdges = db.prepare(`
    SELECT parent_id, child_id
    FROM place_hierarchy h
    WHERE parent_id NOT IN (SELECT id FROM places)
       OR child_id NOT IN (SELECT id FROM places)
    LIMIT 10000
  `).all();
  // Two-node cycles
  details.twoNodeCycles = db.prepare(`
    SELECT h1.parent_id AS a, h1.child_id AS b
    FROM place_hierarchy h1
    JOIN place_hierarchy h2 ON h2.parent_id = h1.child_id AND h2.child_id = h1.parent_id
    WHERE h1.parent_id < h1.child_id
    LIMIT 10000
  `).all();
  // Long cycles via recursive CTE (limit size)
  let longCycles = [];
  try {
    longCycles = db.prepare(`
      WITH RECURSIVE walk(start, node, depth) AS (
        SELECT parent_id, child_id, 1 FROM place_hierarchy
        UNION ALL
        SELECT walk.start, h.child_id, walk.depth + 1
        FROM place_hierarchy h
        JOIN walk ON h.parent_id = walk.node
        WHERE walk.depth < 20
      )
      SELECT DISTINCT start, node AS back_to
      FROM walk
      WHERE start = node
      LIMIT 1000
    `).all();
  } catch (_) {}
  details.longCycles = longCycles;
  // Duplicates: place_names by (place_id, normalized, lang, kind)
  details.dupNames = db.prepare(`
    SELECT place_id, COALESCE(NULLIF(TRIM(normalized), ''), LOWER(TRIM(name))) AS norm,
           COALESCE(lang,'') AS lang, COALESCE(name_kind,'') AS kind, COUNT(*) AS cnt
    FROM place_names
    GROUP BY place_id, norm, lang, kind
    HAVING cnt > 1
    LIMIT 10000
  `).all();
  // Missing normalized
  details.missingNormalized = db.prepare(`
    SELECT id, place_id, name
    FROM place_names
    WHERE normalized IS NULL OR TRIM(normalized) = ''
    LIMIT 10000
  `).all();
  // External IDs attached to multiple places
  details.dupExternalIds = db.prepare(`
    SELECT source, ext_id, COUNT(DISTINCT place_id) AS places
    FROM place_external_ids
    GROUP BY source, ext_id
    HAVING places > 1
    LIMIT 10000
  `).all();

  const summary = {
    nameless: details.nameless.length,
    badCanonical: details.badCanonical.length,
    badRegions: details.badRegions.length,
    badCountries: details.badCountries.length,
    orphanEdges: details.orphanEdges.length,
    twoNodeCycles: details.twoNodeCycles.length,
    longCycles: details.longCycles.length,
    dupNames: details.dupNames.length,
    missingNormalized: details.missingNormalized.length,
    dupExternalIds: details.dupExternalIds.length,
  };
  return { details, summary };
}

function repairGazetteer(db) {
  const actions = { normalizedBackfilled: 0, emptyNamesDeleted: 0, namelessPlacesDeleted: 0, canonicalsCleared: 0, orphanEdgesDeleted: 0, twoNodeCyclesDeleted: 0 };
  // Normalize names
  try {
    const info = db.prepare(`UPDATE place_names SET normalized = LOWER(TRIM(name)) WHERE (normalized IS NULL OR TRIM(normalized) = '') AND name IS NOT NULL`).run();
    actions.normalizedBackfilled = info.changes || 0;
  } catch (_) {}
  // Delete empty names
  try {
    db.exec(`UPDATE place_names SET name=TRIM(name) WHERE name <> TRIM(name);`);
  } catch (_) {}
  try {
    const info = db.prepare(`DELETE FROM place_names WHERE name IS NULL OR TRIM(name) = ''`).run();
    actions.emptyNamesDeleted = info.changes || 0;
  } catch (_) {}
  // Delete nameless places
  try {
    const info = db.prepare(`
      DELETE FROM places
      WHERE (canonical_name_id IS NULL OR canonical_name_id NOT IN (SELECT id FROM place_names))
        AND NOT EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = places.id)
    `).run();
    actions.namelessPlacesDeleted = info.changes || 0;
  } catch (_) {}
  // Clear invalid canonical references
  try {
    const info1 = db.prepare(`UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id IS NOT NULL AND canonical_name_id NOT IN (SELECT id FROM place_names)`).run();
    const info2 = db.prepare(`UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM place_names pn WHERE pn.id = places.canonical_name_id AND pn.place_id = places.id)`).run();
    actions.canonicalsCleared = (info1.changes || 0) + (info2.changes || 0);
  } catch (_) {}
  // Orphan edges
  try {
    const info = db.prepare(`DELETE FROM place_hierarchy WHERE parent_id NOT IN (SELECT id FROM places) OR child_id NOT IN (SELECT id FROM places)`).run();
    actions.orphanEdgesDeleted = info.changes || 0;
  } catch (_) {}
  // Two-node cycles (remove one direction deterministically)
  try {
    const info = db.prepare(`
      DELETE FROM place_hierarchy
      WHERE (parent_id, child_id) IN (
        SELECT h1.parent_id, h1.child_id
        FROM place_hierarchy h1
        JOIN place_hierarchy h2 ON h2.parent_id = h1.child_id AND h2.child_id = h1.parent_id
        WHERE h1.parent_id < h1.child_id
      )
    `).run();
    actions.twoNodeCyclesDeleted = info.changes || 0;
  } catch (_) {}
  return actions;
}

module.exports = { validateGazetteer, repairGazetteer };
