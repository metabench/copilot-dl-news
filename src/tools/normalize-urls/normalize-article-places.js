#!/usr/bin/env node

/**
 * Database URL Normalization: article_places Migration
 *
 * Migrates the article_places table from storing article_url directly
 * to using article_url_id foreign key references to the urls table.
 *
 * This is the highest priority migration due to the large number of rows (9,808).
 */

const path = require('path');
const { ensureDb } = require('../../data/db/sqlite/ensureDb');
const { UrlResolver, chunkArray } = require('../../shared/utils/UrlResolver');
const { findProjectRoot } = require('../../shared/utils/project-root');

const BATCH_SIZE = 100;
const PROGRESS_INTERVAL = 500;

async function normalizeArticlePlaces(dbPath) {
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = dbPath || path.join(projectRoot, 'data', 'news.db');

  console.log('🔄 Starting article_places URL normalization...');
  console.log(`📁 Database: ${resolvedDbPath}`);

  const db = ensureDb(resolvedDbPath);
  const urlResolver = new UrlResolver(db);

  try {
    // Phase 1: Pre-migration validation
    console.log('\n📋 Phase 1: Pre-migration validation');

    // Check if article_places table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='article_places'
    `).get();

    if (!tableExists) {
      throw new Error('article_places table does not exist');
    }

    // Check if urls table exists
    const urlsTableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='urls'
    `).get();

    if (!urlsTableExists) {
      throw new Error('urls table does not exist - normalization infrastructure not ready');
    }

    // Short-circuit if the legacy column has already been removed
    const legacyColumnExists = db.prepare(`
      SELECT 1 FROM pragma_table_info('article_places')
      WHERE name = 'article_url'
    `).get();

    if (!legacyColumnExists) {
      console.log('🎉  article_places already normalized — legacy article_url column not found.');

      const normalizedStats = db.prepare(`
        SELECT
          COUNT(*) as total_rows,
          COUNT(CASE WHEN article_url_id IS NOT NULL THEN 1 END) as migrated,
          COUNT(CASE WHEN article_url_id IS NULL THEN 1 END) as missing_ids
        FROM article_places
      `).get();

      console.log(`📊 Current statistics:`);
      console.log(`   Total rows: ${normalizedStats.total_rows}`);
      console.log(`   Rows with article_url_id: ${normalizedStats.migrated}`);
      console.log(`   Rows missing article_url_id: ${normalizedStats.missing_ids}`);

      const indexExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_article_places_url_id'
      `).get();

      if (!indexExists) {
        console.log('🏗️  Creating idx_article_places_url_id index on article_url_id...');
        db.exec(`CREATE INDEX IF NOT EXISTS idx_article_places_url_id ON article_places(article_url_id)`);
      }

      return {
        success: normalizedStats.missing_ids === 0,
        migrated: normalizedStats.migrated,
        total: normalizedStats.total_rows,
        errors: normalizedStats.missing_ids,
        orphaned: 0
      };
    }

    // Check current state
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(article_url) as urls_present,
        COUNT(CASE WHEN article_url IS NOT NULL AND article_url != '' THEN 1 END) as valid_urls
      FROM article_places
    `).get();

    console.log(`📊 Table statistics:`);
    console.log(`   Total rows: ${stats.total_rows}`);
    console.log(`   URLs present: ${stats.urls_present}`);
    console.log(`   Valid URLs: ${stats.valid_urls}`);

    if (stats.valid_urls === 0) {
      console.log('⚠️  No valid URLs found in article_url column. Nothing to migrate.');
      return { skipped: true, reason: 'no urls to migrate' };
    }

    // Phase 2: Schema modification
    console.log('\n🔧 Phase 2: Schema modification');

    // Check if column already exists
    const columnExists = db.prepare(`
      SELECT 1 FROM pragma_table_info('article_places')
      WHERE name = 'article_url_id'
    `).get();

    if (!columnExists) {
      console.log('➕ Adding article_url_id column...');
      db.exec(`ALTER TABLE article_places ADD COLUMN article_url_id INTEGER REFERENCES urls(id)`);
      console.log('✅ Column added successfully');
    } else {
      console.log('ℹ️  article_url_id column already exists');
    }

    // Phase 3: Data migration
    console.log('\n🚀 Phase 3: Data migration');

    const rowsToMigrate = db.prepare(`
      SELECT id, article_url FROM article_places
      WHERE article_url_id IS NULL AND article_url IS NOT NULL
      ORDER BY id
    `).all();

    console.log(`📝 Rows to migrate: ${rowsToMigrate.length}`);

    if (rowsToMigrate.length === 0) {
      console.log('✅ No rows need migration');
      return { success: true, migrated: 0 };
    }

    let processed = 0;
    let errors = 0;
    const batches = chunkArray(rowsToMigrate, BATCH_SIZE);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = i + 1;
      const totalBatches = batches.length;

      try {
        // Extract URLs from this batch
        const urls = batch.map(row => row.article_url);

        // Resolve URLs to IDs
        const urlToIdMap = urlResolver.batchResolve(urls);

        // Update each row in the batch
        for (const row of batch) {
          const urlId = urlToIdMap.get(row.article_url);
          if (urlId) {
            db.prepare(`
              UPDATE article_places
              SET article_url_id = ?
              WHERE id = ?
            `).run(urlId, row.id);
          } else {
            console.warn(`⚠️  Failed to resolve URL ID for: ${row.article_url}`);
            errors++;
          }
        }

        processed += batch.length;

        // Progress reporting
        if (batchNumber % Math.max(1, Math.floor(totalBatches / 10)) === 0 || batchNumber === totalBatches) {
          const percent = Math.round((processed / rowsToMigrate.length) * 100);
          console.log(`📊 Progress: ${processed}/${rowsToMigrate.length} rows (${percent}%) - Batch ${batchNumber}/${totalBatches}`);
        }

      } catch (error) {
        console.error(`❌ Error processing batch ${batchNumber}:`, error.message);
        errors += batch.length;
      }
    }

    // Phase 4: Post-migration validation
    console.log('\n✅ Phase 4: Post-migration validation');

    const postStats = db.prepare(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(CASE WHEN article_url_id IS NOT NULL THEN 1 END) as migrated,
        COUNT(CASE WHEN article_url_id IS NULL AND article_url IS NOT NULL THEN 1 END) as unmigrated
      FROM article_places
    `).get();

    console.log(`📊 Post-migration statistics:`);
    console.log(`   Total rows: ${postStats.total_rows}`);
    console.log(`   Successfully migrated: ${postStats.migrated}`);
    console.log(`   Still unmigrated: ${postStats.unmigrated}`);

    // Phase 5: Index creation
    console.log('\n🔍 Phase 5: Index creation');

    // Check if index already exists
    const indexExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND name='idx_article_places_url_id'
    `).get();

    if (!indexExists) {
      console.log('🏗️  Creating idx_article_places_url_id index on article_url_id...');
      db.exec(`CREATE INDEX idx_article_places_url_id ON article_places(article_url_id)`);
      console.log('✅ Index created successfully');
    } else {
      console.log('ℹ️  Index already exists');
    }

    // Final validation
    const finalValidation = db.prepare(`
      SELECT
        COUNT(*) as total_urls,
        COUNT(DISTINCT article_url_id) as unique_url_ids,
        COUNT(CASE WHEN article_url_id NOT IN (SELECT id FROM urls) THEN 1 END) as orphaned_ids
      FROM article_places
      WHERE article_url_id IS NOT NULL
    `).get();

    console.log(`\n🎯 Final validation:`);
    console.log(`   URLs with IDs: ${finalValidation.total_urls}`);
    console.log(`   Unique URL IDs: ${finalValidation.unique_url_ids}`);
    console.log(`   Orphaned IDs: ${finalValidation.orphaned_ids}`);

    if (finalValidation.orphaned_ids > 0) {
      console.error(`❌ Found ${finalValidation.orphaned_ids} orphaned URL IDs!`);
      return { success: false, error: 'orphaned references found' };
    }

    const success = postStats.unmigrated === 0 && finalValidation.orphaned_ids === 0;

    console.log(`\n${success ? '🎉' : '⚠️'} Migration ${success ? 'completed successfully' : 'completed with issues'}`);

    return {
      success,
      migrated: postStats.migrated,
      total: postStats.total_rows,
      errors,
      orphaned: finalValidation.orphaned_ids
    };

  } finally {
    // Close database connection
    try {
      db.close();
    } catch (error) {
      console.warn('Warning: Error closing database connection:', error.message);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const dbPath = args[0]; // Optional database path

  try {
    const result = await normalizeArticlePlaces(dbPath);

    if (result.success) {
      console.log('\n✅ article_places URL normalization completed successfully!');
      if (result.migrated > 0) {
        console.log(`📊 Migrated ${result.migrated} rows`);
      }
      process.exit(0);
    } else {
      console.error('\n❌ article_places URL normalization failed!');
      console.error('Result:', result);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Fatal error during article_places normalization:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizeArticlePlaces
};