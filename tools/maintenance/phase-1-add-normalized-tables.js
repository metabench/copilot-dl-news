#!/usr/bin/env node

/**
 * Phase 1 Implementation: Add Normalized Tables
 *
 * This script adds normalized tables alongside existing schema without breaking changes.
 * Creates: http_responses, content_analysis, discovery_events, place_provenance, place_attributes
 * Records as schema version 2.
 */

const { ensureDb } = require('../src/data/db/sqlite/v1/ensureDb');
const { SchemaVersionManager } = require('../src/data/db/migration/schema-versions');

function createNormalizedTables(db) {
  console.log('Creating normalized tables...');

  // HTTP Protocol Layer
  db.exec(`
    CREATE TABLE IF NOT EXISTS http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      request_started_at TEXT NOT NULL,
      fetched_at TEXT,
      http_status INTEGER,
      content_type TEXT,
      content_encoding TEXT,
      etag TEXT,
      last_modified TEXT,
      redirect_chain TEXT,
      ttfb_ms INTEGER,
      download_ms INTEGER,
      total_ms INTEGER,
      bytes_downloaded INTEGER,
      transfer_kbps REAL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_http_responses_url ON http_responses(url_id, fetched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_http_responses_status ON http_responses(http_status);
    CREATE INDEX IF NOT EXISTS idx_http_responses_fetched ON http_responses(fetched_at);
  `);

  // Content Analysis Layer
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL REFERENCES content_storage(id),
      analysis_version INTEGER NOT NULL DEFAULT 1,
      classification TEXT,
      title TEXT,
      date TEXT,
      section TEXT,
      word_count INTEGER,
      language TEXT,
      article_xpath TEXT,
      nav_links_count INTEGER,
      article_links_count INTEGER,
      analysis_json TEXT,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_content_analysis_content ON content_analysis(content_id);
    CREATE INDEX IF NOT EXISTS idx_content_analysis_classification ON content_analysis(classification);
    CREATE INDEX IF NOT EXISTS idx_content_analysis_version ON content_analysis(analysis_version);
  `);

  // Discovery Metadata Layer
  db.exec(`
    CREATE TABLE IF NOT EXISTS discovery_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      discovered_at TEXT NOT NULL,
      referrer_url TEXT,
      crawl_depth INTEGER,
      discovery_method TEXT,
      crawl_job_id TEXT REFERENCES crawl_jobs(id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_discovery_url ON discovery_events(url_id, discovered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_discovery_job ON discovery_events(crawl_job_id);
    CREATE INDEX IF NOT EXISTS idx_discovery_events_url ON discovery_events(url_id);
  `);

  // Place Provenance Layer
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id),
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      fetched_at INTEGER,
      raw_data TEXT,
      UNIQUE(place_id, source, external_id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_place_provenance_place ON place_provenance(place_id);
    CREATE INDEX IF NOT EXISTS idx_place_provenance_source ON place_provenance(source);
    CREATE INDEX IF NOT EXISTS idx_place_provenance_external ON place_provenance(external_id);
  `);

  // Place Attributes Layer
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL REFERENCES places(id),
      attribute_kind TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at INTEGER,
      confidence REAL,
      metadata TEXT,
      UNIQUE(place_id, attribute_kind, source)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_place_attributes_place ON place_attributes(place_id);
    CREATE INDEX IF NOT EXISTS idx_place_attributes_kind ON place_attributes(attribute_kind);
    CREATE INDEX IF NOT EXISTS idx_place_attributes_source ON place_attributes(source);
  `);

  console.log('✓ All normalized tables created');
}

function recordSchemaVersion2(db) {
  console.log('Recording schema version 2...');

  const versionManager = new SchemaVersionManager(db);
  versionManager.recordMigration(
    2,
    'add_normalized_tables',
    'Add normalized tables: http_responses, content_analysis, discovery_events, place_provenance, place_attributes'
  );

  console.log('✓ Schema version 2 recorded');
}

function verifyTablesExist(db) {
  console.log('Verifying tables exist...');

  const expectedTables = [
    'http_responses',
    'content_analysis',
    'discovery_events',
    'place_provenance',
    'place_attributes'
  ];

  for (const tableName of expectedTables) {
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(tableName);

    if (!result) {
      throw new Error(`Table '${tableName}' was not created`);
    }
    console.log(`✓ ${tableName} exists`);
  }
}

async function main() {
  console.log('Phase 1: Add Normalized Tables');
  console.log('================================');

  try {
    const db = ensureDb();

    // Create all normalized tables
    createNormalizedTables(db);

    // Verify they were created
    verifyTablesExist(db);

    // Record as schema version 2
    recordSchemaVersion2(db);

    console.log('\n🎉 Phase 1 Complete!');
    console.log('Normalized tables added successfully');
    console.log('Schema version: 2 (add_normalized_tables)');
    console.log('Ready for Phase 2: Dual-write implementation');

    db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Phase 1 failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createNormalizedTables, recordSchemaVersion2, verifyTablesExist };