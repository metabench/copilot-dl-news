#!/usr/bin/env node
/**
 * @fileoverview Gazetteer schema migration script
 * 
 * Implements the following schema changes:
 * 1. Create alias_mappings table
 * 2. Fix canonical_name_id for places that have names
 * 3. Delete places that cannot have canonical names determined
 * 4. Add indexes for performance
 * 5. Standardize place_type values (rename 'kind' to consistent values)
 * 
 * NOTE: url_slug is NOT stored in the database. It is computed at load time
 * by the PlaceLookup matching engine. This avoids redundant storage and
 * keeps the schema simpler.
 * 
 * Usage: node scripts/gazetteer/migrate-schema.js [--dry-run]
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');
const isDryRun = process.argv.includes('--dry-run');

/**
 * Map old kind values to standardized place_type values
 */
const KIND_TO_TYPE = {
  'country': 'country',
  'city': 'city',
  'island': 'locality',
  'state': 'admin1',
  'region': 'admin1',
  'territory': 'admin1',
  'province': 'admin1',
  'planet': 'other',
  'continent': 'continent',
  'dependency': 'territory',
  'autonomous': 'admin1',
};

function main() {
  console.log('=== Gazetteer Schema Migration ===');
  console.log(`Database: ${DB_PATH}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const db = new Database(DB_PATH);
  
  try {
    if (!isDryRun) {
      db.exec('BEGIN TRANSACTION');
    }

    // 1. Create alias_mappings table
    console.log('1. Creating alias_mappings table...');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alias_mappings'").all();
    
    if (tables.length === 0) {
      if (!isDryRun) {
        db.exec(`
          CREATE TABLE alias_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alias TEXT NOT NULL UNIQUE,
            place_id INTEGER NOT NULL,
            source TEXT DEFAULT 'manual',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
          )
        `);
        db.exec('CREATE INDEX idx_alias_mappings_alias ON alias_mappings(alias)');
      }
      console.log('   ✓ Created alias_mappings table');
    } else {
      console.log('   ⏭ alias_mappings table already exists');
    }

    // 2. Fix canonical_name_id for places that have names
    console.log('\n2. Fixing canonical_name_id...');
    const placesWithNullCanonical = db.prepare(`
      SELECT p.id, p.kind, p.source 
      FROM places p 
      WHERE p.canonical_name_id IS NULL
    `).all();
    
    console.log(`   Found ${placesWithNullCanonical.length} places with NULL canonical_name_id`);
    
    let fixed = 0;
    let deleted = 0;
    
    for (const place of placesWithNullCanonical) {
      // Try to find an English name, preferring is_preferred=1
      const englishName = db.prepare(`
        SELECT id, name FROM place_names 
        WHERE place_id = ? AND lang = 'en' 
        ORDER BY is_preferred DESC, id ASC 
        LIMIT 1
      `).get(place.id);
      
      if (englishName) {
        if (!isDryRun) {
          db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(englishName.id, place.id);
        }
        console.log(`   ✓ Fixed place ${place.id} (${place.kind}): canonical = "${englishName.name}"`);
        fixed++;
      } else {
        // No English name - try any name
        const anyName = db.prepare(`
          SELECT id, name FROM place_names 
          WHERE place_id = ? 
          ORDER BY is_preferred DESC, id ASC 
          LIMIT 1
        `).get(place.id);
        
        if (anyName) {
          if (!isDryRun) {
            db.prepare('UPDATE places SET canonical_name_id = ? WHERE id = ?').run(anyName.id, place.id);
          }
          console.log(`   ✓ Fixed place ${place.id} (${place.kind}): canonical = "${anyName.name}" (non-English)`);
          fixed++;
        } else {
          // No names at all - delete the place
          if (!isDryRun) {
            db.prepare('DELETE FROM places WHERE id = ?').run(place.id);
          }
          console.log(`   ✗ Deleted place ${place.id} (${place.kind}) - no names found`);
          deleted++;
        }
      }
    }
    
    console.log(`   Summary: ${fixed} fixed, ${deleted} deleted`);

    // 3. Verify no NULL canonical_name_id remain
    console.log('\n3. Verifying canonical_name_id integrity...');
    const remainingNull = db.prepare('SELECT COUNT(*) as count FROM places WHERE canonical_name_id IS NULL').get();
    if (remainingNull.count === 0) {
      console.log('   ✓ All places have canonical_name_id');
    } else {
      console.log(`   ⚠ ${remainingNull.count} places still have NULL canonical_name_id`);
    }

    // 4. Add indexes
    console.log('\n4. Adding indexes...');
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(i => i.name);
    
    const indexesToCreate = [
      { name: 'idx_place_names_normalized', sql: 'CREATE INDEX idx_place_names_normalized ON place_names(normalized)' },
      { name: 'idx_place_names_place_id', sql: 'CREATE INDEX idx_place_names_place_id ON place_names(place_id)' },
    ];
    
    for (const idx of indexesToCreate) {
      if (!indexes.includes(idx.name)) {
        if (!isDryRun) {
          db.exec(idx.sql);
        }
        console.log(`   ✓ Created ${idx.name}`);
      } else {
        console.log(`   ⏭ ${idx.name} already exists`);
      }
    }

    // 5. Add place_type column (standardized from kind)
    console.log('\n5. Adding place_type column...');
    const placesCols = db.prepare("PRAGMA table_info(places)").all();
    const hasPlaceType = placesCols.some(c => c.name === 'place_type');
    
    if (!hasPlaceType) {
      if (!isDryRun) {
        db.exec('ALTER TABLE places ADD COLUMN place_type TEXT');
      }
      console.log('   ✓ Added place_type column');
      
      // Populate from kind
      const placesWithKind = db.prepare('SELECT id, kind FROM places').all();
      if (!isDryRun) {
        const updateType = db.prepare('UPDATE places SET place_type = ? WHERE id = ?');
        for (const p of placesWithKind) {
          const mappedType = KIND_TO_TYPE[p.kind] || p.kind || 'unknown';
          updateType.run(mappedType, p.id);
        }
      }
      console.log(`   ✓ Populated place_type for ${placesWithKind.length} places`);
    } else {
      console.log('   ⏭ place_type column already exists');
    }

    // Commit
    if (!isDryRun) {
      db.exec('COMMIT');
      console.log('\n✓ Migration completed successfully!');
    } else {
      console.log('\n✓ Dry run completed - no changes made');
    }

    // Summary stats
    console.log('\n=== Final Statistics ===');
    const stats = {
      places: db.prepare('SELECT COUNT(*) as c FROM places').get().c,
      place_names: db.prepare('SELECT COUNT(*) as c FROM place_names').get().c,
    };
    
    // Only query alias_mappings if not dry-run (it exists)
    if (!isDryRun) {
      stats.alias_count = db.prepare("SELECT COUNT(*) as c FROM alias_mappings").get().c;
    }
    
    console.log(`Places: ${stats.places}`);
    console.log(`Place names: ${stats.place_names}`);
    if (!isDryRun) {
      console.log(`Alias mappings: ${stats.alias_count}`);
    }
    console.log('\nNote: URL slugs are computed at runtime by PlaceLookup, not stored in DB.');

  } catch (err) {
    if (!isDryRun) {
      db.exec('ROLLBACK');
    }
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
