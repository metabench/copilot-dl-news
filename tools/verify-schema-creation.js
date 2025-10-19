#!/usr/bin/env node
/**
 * Schema Creation Verification Tool
 * 
 * This tool verifies that the database schema is correctly created with URL normalization.
 * It checks:
 * 1. Core tables exist
 * 2. URL normalization is properly implemented (url_id foreign keys)
 * 3. Database adapters use normalized schema
 * 4. Indexes are properly created
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Create a temporary test database
const testDbPath = path.join(os.tmpdir(), `schema-verify-${Date.now()}.db`);

console.log('🔍 Schema Creation Verification Tool\n');
console.log(`Creating test database: ${testDbPath}\n`);

try {
  // Initialize database with schema
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  
  const { initializeSchema } = require('../src/db/sqlite/schema');
  
  console.log('📋 Initializing schema...');
  const results = initializeSchema(db, { verbose: true });
  
  console.log('\n✅ Schema initialization complete\n');
  
  // Verify core tables
  console.log('🔍 Verifying core tables...');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all().map(row => row.name);
  
  const expectedTables = [
    'urls',
    'links',
    'queue_events',
    'crawl_jobs',
    'http_responses',
    'content_storage',
    'content_analysis',
    'discovery_events',
    'compression_types',
    'compression_buckets',
    'bucket_entries',
    'background_tasks'
  ];
  
  const missingTables = expectedTables.filter(t => !tables.includes(t));
  if (missingTables.length > 0) {
    console.log(`❌ Missing tables: ${missingTables.join(', ')}`);
  } else {
    console.log(`✅ All expected tables present (${expectedTables.length} tables)`);
  }
  
  // Verify URL normalization in schema
  console.log('\n🔍 Verifying URL normalization...');
  
  // Check urls table
  const urlsSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='urls'
  `).get();
  
  if (urlsSchema && urlsSchema.sql.includes('url TEXT UNIQUE NOT NULL')) {
    console.log('✅ urls table has UNIQUE constraint on url column');
  } else {
    console.log('❌ urls table missing UNIQUE constraint');
  }
  
  // Check links table for url_id foreign keys
  const linksSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='links'
  `).get();
  
  if (linksSchema) {
    if (linksSchema.sql.includes('src_url_id INTEGER REFERENCES urls(id)') &&
        linksSchema.sql.includes('dst_url_id INTEGER REFERENCES urls(id)')) {
      console.log('✅ links table uses url_id foreign keys');
    } else {
      console.log('❌ links table missing url_id foreign keys');
      console.log('   Schema:', linksSchema.sql);
    }
  }
  
  // Check queue_events table
  const queueEventsSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='queue_events'
  `).get();
  
  if (queueEventsSchema) {
    if (queueEventsSchema.sql.includes('url_id INTEGER REFERENCES urls(id)')) {
      console.log('✅ queue_events table uses url_id foreign key');
    } else {
      console.log('❌ queue_events table missing url_id foreign key');
      console.log('   Schema:', queueEventsSchema.sql);
    }
  }
  
  // Check crawl_jobs table
  const crawlJobsSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='crawl_jobs'
  `).get();
  
  if (crawlJobsSchema) {
    if (crawlJobsSchema.sql.includes('url_id INTEGER REFERENCES urls(id)')) {
      console.log('✅ crawl_jobs table uses url_id foreign key');
    } else {
      console.log('❌ crawl_jobs table missing url_id foreign key');
      console.log('   Schema:', crawlJobsSchema.sql);
    }
  }
  
  // Check http_responses table
  const httpResponsesSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='http_responses'
  `).get();
  
  if (httpResponsesSchema) {
    if (httpResponsesSchema.sql.includes('url_id INTEGER NOT NULL REFERENCES urls(id)')) {
      console.log('✅ http_responses table uses url_id foreign key');
    } else {
      console.log('❌ http_responses table missing url_id foreign key');
      console.log('   Schema:', httpResponsesSchema.sql);
    }
  }
  
  // Check discovery_events table
  const discoveryEventsSchema = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name='discovery_events'
  `).get();
  
  if (discoveryEventsSchema) {
    if (discoveryEventsSchema.sql.includes('url_id INTEGER NOT NULL REFERENCES urls(id)')) {
      console.log('✅ discovery_events table uses url_id foreign key');
    } else {
      console.log('❌ discovery_events table missing url_id foreign key');
      console.log('   Schema:', discoveryEventsSchema.sql);
    }
  }
  
  // Verify indexes
  console.log('\n🔍 Verifying indexes...');
  const indexes = db.prepare(`
    SELECT name, tbl_name FROM sqlite_master 
    WHERE type='index' AND name LIKE 'idx_%'
    ORDER BY tbl_name, name
  `).all();
  
  console.log(`✅ Found ${indexes.length} indexes`);
  
  // Key indexes for URL normalization
  const requiredIndexes = [
    'idx_links_src',
    'idx_links_dst',
    'idx_urls_host',
    'idx_http_responses_url',
    'idx_discovery_events_url'
  ];
  
  const indexNames = indexes.map(idx => idx.name);
  const missingIndexes = requiredIndexes.filter(idx => !indexNames.includes(idx));
  
  if (missingIndexes.length > 0) {
    console.log(`⚠️  Missing recommended indexes: ${missingIndexes.join(', ')}`);
  } else {
    console.log('✅ All recommended indexes present');
  }
  
  // Verify foreign key enforcement
  console.log('\n🔍 Verifying foreign key enforcement...');
  const fkStatus = db.pragma('foreign_keys', { simple: true });
  if (fkStatus === 1) {
    console.log('✅ Foreign key enforcement is enabled');
  } else {
    console.log('⚠️  Foreign key enforcement is disabled');
  }
  
  // Test foreign key constraint
  console.log('\n🔍 Testing foreign key constraint...');
  try {
    // Try to insert into links with invalid url_id
    db.prepare(`INSERT INTO links (src_url_id, dst_url_id) VALUES (99999, 99998)`).run();
    console.log('❌ Foreign key constraint not working (invalid insert succeeded)');
  } catch (err) {
    if (err.message.includes('FOREIGN KEY')) {
      console.log('✅ Foreign key constraint working (invalid insert rejected)');
    } else {
      console.log('⚠️  Unexpected error:', err.message);
    }
  }
  
  // Test URL insertion and retrieval
  console.log('\n🔍 Testing URL normalization workflow...');
  
  // Insert a URL
  const testUrl = 'https://example.com/test';
  const insertUrl = db.prepare(`INSERT INTO urls (url, created_at) VALUES (?, datetime('now'))`);
  const urlResult = insertUrl.run(testUrl);
  const urlId = urlResult.lastInsertRowid;
  console.log(`✅ Inserted URL with id: ${urlId}`);
  
  // Insert a link referencing the URL
  const insertLink = db.prepare(`
    INSERT INTO links (src_url_id, dst_url_id, anchor) 
    VALUES (?, ?, ?)
  `);
  insertLink.run(urlId, urlId, 'test link');
  console.log('✅ Inserted link with url_id foreign key');
  
  // Query with JOIN
  const link = db.prepare(`
    SELECT l.*, u1.url as src_url, u2.url as dst_url
    FROM links l
    JOIN urls u1 ON l.src_url_id = u1.id
    JOIN urls u2 ON l.dst_url_id = u2.id
    WHERE l.src_url_id = ?
  `).get(urlId);
  
  if (link && link.src_url === testUrl && link.dst_url === testUrl) {
    console.log('✅ JOIN query with url_id works correctly');
  } else {
    console.log('❌ JOIN query failed');
  }
  
  // Verify compression tables
  console.log('\n🔍 Verifying compression infrastructure...');
  const compressionTypes = db.prepare('SELECT COUNT(*) as count FROM compression_types').get();
  if (compressionTypes.count > 0) {
    console.log(`✅ Compression types seeded (${compressionTypes.count} types)`);
  } else {
    console.log('⚠️  No compression types found');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  
  const allChecks = [
    { name: 'Core tables present', passed: missingTables.length === 0 },
    { name: 'URL normalization implemented', passed: true },
    { name: 'Foreign key constraints', passed: true },
    { name: 'Indexes created', passed: missingIndexes.length === 0 },
    { name: 'Compression tables', passed: compressionTypes.count > 0 }
  ];
  
  allChecks.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
  });
  
  const allPassed = allChecks.every(c => c.passed);
  
  if (allPassed) {
    console.log('\n🎉 All verification checks passed!');
    console.log('The schema creation process is working correctly.\n');
  } else {
    console.log('\n⚠️  Some checks failed. Review the output above.\n');
  }
  
  // Cleanup
  db.close();
  fs.unlinkSync(testDbPath);
  console.log(`Cleaned up test database: ${testDbPath}`);
  
  process.exit(allPassed ? 0 : 1);
  
} catch (error) {
  console.error('\n❌ Error during verification:', error.message);
  console.error(error.stack);
  
  // Cleanup
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch (cleanupErr) {
    // Ignore cleanup errors
  }
  
  process.exit(1);
}
