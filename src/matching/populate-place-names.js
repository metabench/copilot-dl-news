#!/usr/bin/env node

/**
 * Populate Place Name Lookup Table
 *
 * Creates a materialized view of place names for fast matching.
 * Should be run after gazetteer updates.
 */

const { ensureDatabase } = require('../db/sqlite');

function populatePlaceNameLookup(dbPath) {
  const db = ensureDatabase(dbPath);

  console.log('Populating place name lookup table...');

  // Clear existing data
  db.prepare('DELETE FROM place_name_lookup').run();

  // Insert place names with ranking
  const insertStmt = db.prepare(`
    INSERT INTO place_name_lookup (
      place_id, name, normalized_name, name_length, language,
      is_canonical, population_rank
    )
    SELECT
      p.id as place_id,
      pn.name,
      LOWER(COALESCE(pn.normalized, pn.name)) as normalized_name,
      LENGTH(pn.name) as name_length,
      pn.lang as language,
      CASE WHEN p.canonical_name_id = pn.id THEN 1 ELSE 0 END as is_canonical,
      ROW_NUMBER() OVER (ORDER BY p.population DESC NULLS LAST) as population_rank
    FROM places p
    JOIN place_names pn ON p.id = pn.place_id
    WHERE pn.name IS NOT NULL
      AND LENGTH(TRIM(pn.name)) > 2
      AND pn.name NOT GLOB '*[0-9]*'  -- Exclude names with numbers
    ORDER BY p.population DESC NULLS LAST, name_length DESC
  `);

  const result = insertStmt.run();
  console.log(`Inserted ${result.changes} place name entries`);

  // Create some useful indexes if they don't exist
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_place_name_lookup_normalized ON place_name_lookup(normalized_name)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_place_name_lookup_place ON place_name_lookup(place_id)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_place_name_lookup_length ON place_name_lookup(name_length DESC)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_place_name_lookup_population ON place_name_lookup(population_rank)`).run();

  console.log('Place name lookup table populated successfully');

  // Show some statistics
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_names,
      COUNT(DISTINCT place_id) as unique_places,
      AVG(name_length) as avg_name_length,
      COUNT(CASE WHEN is_canonical = 1 THEN 1 END) as canonical_names
    FROM place_name_lookup
  `).get();

  console.log('Statistics:');
  console.log(`  Total names: ${stats.total_names}`);
  console.log(`  Unique places: ${stats.unique_places}`);
  console.log(`  Average name length: ${stats.avg_name_length.toFixed(1)}`);
  console.log(`  Canonical names: ${stats.canonical_names}`);

  db.close();
}

// CLI interface
if (require.main === module) {
  const dbPath = process.argv[2] || './data/database.db';
  populatePlaceNameLookup(dbPath);
}

module.exports = { populatePlaceNameLookup };