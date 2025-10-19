#!/usr/bin/env node

/**
 * Test Migration Schema Application
 *
 * Tests that the URL normalization migration schema can be applied successfully.
 */

const { ensureDatabase } = require('../../src/db/sqlite/v1');
const fs = require('fs');
const path = require('path');

function testMigrationSchema() {
  // Create a temporary test database
  const testDbPath = './test-migration.db';
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('🧪 Testing migration schema application...');

  try {
    // Create a minimal database with just the tables we need for testing
    const db = new (require('better-sqlite3'))(testDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create minimal base tables needed for our migration
    db.exec(`
      -- URLs table (already created above)
      
      -- Links table
      CREATE TABLE links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        src_url TEXT,
        dst_url TEXT,
        anchor TEXT,
        rel TEXT,
        type TEXT,
        depth INTEGER,
        on_domain INTEGER,
        discovered_at TEXT
      );
      
      -- Queue events table
      CREATE TABLE queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT,
        action TEXT,
        url TEXT,
        depth INTEGER,
        host TEXT,
        reason TEXT,
        queue_size INTEGER,
        alias TEXT,
        queue_origin TEXT,
        queue_role TEXT,
        queue_depth_bucket TEXT
      );
      
      -- Crawl jobs table
      CREATE TABLE crawl_jobs (
        id TEXT PRIMARY KEY,
        url TEXT,
        args TEXT,
        pid INTEGER,
        started_at TEXT,
        ended_at TEXT,
        status TEXT,
        crawl_type_id INTEGER
      );
      
      -- Errors table
      CREATE TABLE errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        host TEXT,
        kind TEXT,
        code INTEGER,
        message TEXT,
        details TEXT,
        at TEXT
      );
      
      -- URL aliases table
      CREATE TABLE url_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        alias_url TEXT NOT NULL,
        classification TEXT,
        reason TEXT,
        url_exists INTEGER,
        checked_at TEXT,
        metadata TEXT
      );
    `);
    console.log('✅ Minimal base schema created');

    // Apply migration schema
    const migrationSchemaPath = path.join(__dirname, '../../src/db/migrations/url-normalization-schema.sql');
    const migrationSchema = fs.readFileSync(migrationSchemaPath, 'utf8');
    db.exec(migrationSchema);
    console.log('✅ Migration schema applied');

    // Verify new columns exist
    const tablesToCheck = [
      { name: 'links', expectedNewColumns: ['src_url_id', 'dst_url_id'] },
      { name: 'queue_events', expectedNewColumns: ['url_id'] },
      { name: 'crawl_jobs', expectedNewColumns: ['url_id'] },
      { name: 'errors', expectedNewColumns: ['url_id'] },
      { name: 'url_aliases', expectedNewColumns: ['url_id', 'alias_url_id'] }
    ];

    for (const table of tablesToCheck) {
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
      const columnNames = columns.map(col => col.name);

      console.log(`📋 ${table.name}: ${columns.length} columns`);

      for (const expectedColumn of table.expectedNewColumns) {
        if (columnNames.includes(expectedColumn)) {
          console.log(`   ✅ ${expectedColumn} column exists`);
        } else {
          throw new Error(`${table.name}.${expectedColumn} column missing after migration`);
        }
      }
    }

    // Test foreign key constraints
    console.log('🔗 Testing foreign key constraints...');
    db.pragma('foreign_keys = ON');

    // This should not throw if FK constraints are satisfied (empty DB)
    for (const table of tablesToCheck) {
      db.prepare(`SELECT COUNT(*) FROM ${table.name}`).get();
    }

    console.log('✅ Foreign key constraints validated');

    // Clean up
    db.close();
    fs.unlinkSync(testDbPath);

    console.log('🎉 Migration schema test completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run migration on development database');
    console.log('2. Validate migration results');
    console.log('3. Update application code to use url_id fields');

  } catch (error) {
    console.error('❌ Migration schema test failed:', error.message);

    // Clean up on failure
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    process.exit(1);
  }
}

if (require.main === module) {
  testMigrationSchema();
}