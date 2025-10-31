#!/usr/bin/env node
/**
 * tools/compression/migrate-legacy-content.js
 *
 * DEPRECATED: Legacy content migration tool
 *
 * The articles table has been removed and all content has been migrated to the normalized schema.
 * This script is kept for historical reference but is no longer functional.
 */

console.log('ℹ️  Articles table has been removed. Content migration is complete.');
console.log('📊 All content is now stored in normalized schema: urls, http_responses, content_storage, content_analysis');
console.log('🗂️  Compression is handled automatically during content ingestion.');
process.exit(0);

COMPRESSION TIERS:
  Hot (< 7 days):         No compression
  Warm (7-30 days):       Brotli level 6
  Cold (30+ days):        Brotli level 11

This tool migrates content from the legacy articles table to the normalized content_storage
table with appropriate compression applied based on content age. The legacy table is not
modified. Use --fix to actually perform the migration.
`);
}

async function migrateLegacyContent() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = ensureDatabase(dbPath);

  console.log('='.repeat(80));
  console.log('LEGACY CONTENT MIGRATION TOOL');
  console.log('='.repeat(80));
  console.log(`Database: ${dbPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will apply changes)'}`);
  if (limit) console.log(`Limit: ${limit} items`);
  console.log('');

  try {
    // Check if legacy articles table exists and has uncompressed content
    const legacyTableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='articles'
    `).get();

    if (!legacyTableExists) {
      console.log('✓ No legacy articles table found - migration not needed');
      return;
    }

    // Check for uncompressed content in legacy table
    const uncompressedCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM articles
      WHERE content IS NOT NULL
        AND LENGTH(content) > 0
        AND (compression_type IS NULL OR compression_type = '')
    `).get()?.count || 0;

    console.log(`Found ${uncompressedCount} uncompressed articles in legacy table`);

    if (uncompressedCount === 0) {
      console.log('✓ No uncompressed content found - migration not needed');
      return;
    }

    // Get sample of uncompressed content for analysis
    const sampleQuery = `
      SELECT id, url, LENGTH(content) as content_length, created_at
      FROM articles
      WHERE content IS NOT NULL
        AND LENGTH(content) > 0
        AND (compression_type IS NULL OR compression_type = '')
      ORDER BY created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const uncompressedArticles = db.prepare(sampleQuery).all();

    console.log(`\nSample of ${uncompressedArticles.length} uncompressed articles:`);
    console.log('-'.repeat(80));

    let totalSize = 0;
    for (const article of uncompressedArticles) {
      console.log(`ID: ${article.id}`);
      console.log(`URL: ${article.url}`);
      console.log(`Size: ${article.content_length} bytes`);
      console.log(`Created: ${article.created_at}`);
      console.log('');
      totalSize += article.content_length;
    }

    console.log(`Total uncompressed size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

    if (dryRun) {
      console.log('\nDRY RUN COMPLETE');
      console.log(`Would migrate ${uncompressedArticles.length} articles`);
      console.log('Run with --fix to apply changes');
      return;
    }

    // Live migration
    console.log('\nStarting migration...');

    let migrated = 0;
    let errors = 0;

    for (const article of uncompressedArticles) {
      try {
        // Get full content
        const fullArticle = db.prepare('SELECT * FROM articles WHERE id = ?').get(article.id);

        if (!fullArticle.content) continue;

        // Compress and store using the new normalized schema
        await compressAndStore(db, {
          url: fullArticle.url,
          content: fullArticle.content,
          contentType: 'text/html', // Assume HTML for legacy content
          source: 'legacy-migration',
          compressionType: 'brotli_6' // Use warm tier compression for migrated content
        });

        migrated++;
        if (migrated % 10 === 0) {
          console.log(`Migrated ${migrated}/${uncompressedArticles.length} articles...`);
        }

      } catch (error) {
        console.error(`Error migrating article ${article.id}:`, error.message);
        errors++;
      }
    }

    console.log('\nMigration complete!');
    console.log(`✓ Migrated: ${migrated} articles`);
    if (errors > 0) {
      console.log(`⚠️ Errors: ${errors} articles`);
    }

    // Optional: Mark migrated articles in legacy table
    if (migrated > 0) {
      console.log('\nMarking migrated articles as processed...');
      // Note: We don't modify the legacy table to preserve data integrity
      console.log('Legacy table preserved for rollback if needed');
    }

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run if called directly
if (require.main === module) {
  migrateLegacyContent().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { migrateLegacyContent };