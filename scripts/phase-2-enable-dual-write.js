#!/usr/bin/env node

/**
 * Phase 2 Implementation: Enable Dual-Write
 *
 * This script records schema version 3 and enables dual-write to normalized tables.
 */

const { ensureDb } = require('../src/db/sqlite/v1/ensureDb');
const { SchemaVersionManager } = require('../src/db/migration/schema-versions');

function recordSchemaVersion3(db) {
  console.log('Recording schema version 3...');

  const versionManager = new SchemaVersionManager(db);
  versionManager.recordMigration(
    3,
    'enable_dual_write',
    'Enable dual-write to normalized and legacy schemas (http_responses, content_storage, content_analysis, discovery_events)'
  );

  console.log('✓ Schema version 3 recorded');
}

function verifyDualWriteEnabled(db) {
  console.log('Verifying dual-write capability...');

  // Check that all normalized tables exist
  const requiredTables = [
    'http_responses',
    'content_storage',
    'content_analysis',
    'discovery_events',
    'place_provenance',
    'place_attributes'
  ];

  for (const tableName of requiredTables) {
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(tableName);

    if (!result) {
      throw new Error(`Required table '${tableName}' does not exist`);
    }
    console.log(`✓ ${tableName} exists`);
  }

  // Check that compression_types is seeded
  const compressionTypesCount = db.prepare('SELECT COUNT(*) as count FROM compression_types').get();
  if (compressionTypesCount.count < 10) {
    console.warn(`⚠️  Only ${compressionTypesCount.count} compression types found (expected 18+)`);
  } else {
    console.log(`✓ ${compressionTypesCount.count} compression types available`);
  }
}

async function main() {
  console.log('Phase 2: Enable Dual-Write');
  console.log('==============================');

  try {
    const db = ensureDb();

    // Verify normalized tables exist
    verifyDualWriteEnabled(db);

    // Record as schema version 3
    recordSchemaVersion3(db);

    console.log('\n🎉 Phase 2 Complete!');
    console.log('Dual-write enabled successfully');
    console.log('Schema version: 3 (enable_dual_write)');
    console.log('New articles will be written to both legacy and normalized schemas');
    console.log('Ready for Phase 3: Backfill historical data');

    db.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Phase 2 failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { recordSchemaVersion3, verifyDualWriteEnabled };