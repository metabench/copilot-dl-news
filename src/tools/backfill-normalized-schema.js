#!/usr/bin/env node

/**
 * Backfill Normalized Schema
 *
 * Migrates existing articles from the legacy articles table to the normalized schema.
 * This script is part of Phase 3 of the database normalization plan.
 *
 * Usage:
 *   node src/tools/backfill-normalized-schema.js              # Full backfill
 *   node src/tools/backfill-normalized-schema.js --limit 100  # Test with first 100 articles
 *   node src/tools/backfill-normalized-schema.js --dry-run     # Show what would be migrated
 *   node src/tools/backfill-normalized-schema.js --resume      # Resume from last checkpoint
 */

const path = require('path');
const { ensureDb } = require('../db/sqlite/v1/ensureDb');
const SQLiteNewsDatabase = require('../db/sqlite/v1/SQLiteNewsDatabase');

class BackfillNormalizedSchema {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.newsDb = null;
    this.limit = null;
    this.dryRun = false;
    this.resume = false;
    this.checkpointFile = path.join(__dirname, 'backfill-checkpoint.json');
  }

  async run() {
    try {
      console.log('🔄 Starting normalized schema backfill...');
      console.log(`📁 Database: ${this.dbPath}`);
      console.log(`📊 Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE'}`);
      if (this.limit) console.log(`🔢 Limit: ${this.limit} articles`);
      if (this.resume) console.log('⏯️  Resume: Enabled');

      // Connect to database
      this.db = ensureDb(this.dbPath);
      this.newsDb = new SQLiteNewsDatabase(this.db);

      // Get total count and process in batches
      const totalCount = this.db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
      console.log(`📊 Total articles in legacy table: ${totalCount}`);

      const batchSize = 100; // Smaller batches for migration
      let totalProcessed = 0;
      let totalMigrated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      // Process articles in batches
      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const currentBatchSize = Math.min(batchSize, totalCount - offset);
        console.log(`\n� Processing batch ${Math.floor(offset/batchSize) + 1} (${offset + currentBatchSize}/${totalCount})...`);

        // Get batch of articles
        const batch = this.db.prepare(`
          SELECT id, url, title, date, section, html, crawled_at, canonical_url,
                 referrer_url, discovered_at, crawl_depth, fetched_at, request_started_at,
                 http_status, content_type, content_length, etag, last_modified,
                 redirect_chain, ttfb_ms, download_ms, total_ms, bytes_downloaded,
                 transfer_kbps, html_sha256, text, word_count, language,
                 article_xpath, analysis
          FROM articles
          ORDER BY id ASC
          LIMIT ? OFFSET ?
        `).all(currentBatchSize, offset);

        // Filter out already migrated articles in this batch
        const articlesToMigrate = [];
        for (const article of batch) {
          if (!this.isArticleMigrated(article.url)) {
            articlesToMigrate.push(article);
          } else {
            totalSkipped++;
          }
        }

        console.log(`📋 Batch: ${batch.length} articles, ${articlesToMigrate.length} need migration`);

        // Migrate articles in this batch
        for (let i = 0; i < articlesToMigrate.length; i++) {
          const article = articlesToMigrate[i];
          try {
            if (!this.dryRun) {
              await this.migrateSingleArticle(article);
            }
            totalMigrated++;

            // Progress indicator every 10 articles
            if ((totalMigrated + totalSkipped) % 10 === 0) {
              console.log(`✅ Migrated: ${totalMigrated}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
            }
          } catch (error) {
            console.error(`❌ Error migrating article ${article.id} (${article.url}):`, error.message);
            totalErrors++;
          }
        }

        totalProcessed += batch.length;

        // Save checkpoint after each batch
        if (!this.dryRun) {
          this.saveCheckpoint(totalProcessed, totalMigrated, totalSkipped, totalErrors);
        }

        // Apply limit if specified
        if (this.limit && totalProcessed >= this.limit) {
          console.log(`\n🛑 Reached limit of ${this.limit} articles`);
          break;
        }
      }

      console.log('\n🎉 Migration complete!');
      console.log(`📊 Total processed: ${totalProcessed}`);
      console.log(`✅ Successfully migrated: ${totalMigrated}`);
      console.log(`⏭️  Skipped (already migrated): ${totalSkipped}`);
      console.log(`❌ Errors: ${totalErrors}`);

      if (!this.dryRun) {
        console.log('\n💡 Next steps:');
        console.log('1. Verify data integrity in normalized tables');
        console.log('2. Test application functionality');
        console.log('3. Consider dropping legacy articles table after validation');
      }

    } catch (error) {
      console.error('❌ Backfill failed:', error);
      process.exit(1);
    } finally {
      if (this.db) this.db.close();
    }
  }

  async getArticlesToMigrate() {
    console.log('🔍 Finding articles to migrate...');

    // Get total count first
    const totalCount = this.db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
    console.log(`📊 Total articles in legacy table: ${totalCount}`);

    // Process in batches to avoid memory issues
    const batchSize = 1000;
    let alreadyMigrated = 0;
    let needMigration = 0;
    const articlesToMigrate = [];

    for (let offset = 0; offset < totalCount; offset += batchSize) {
      const batch = this.db.prepare(`
        SELECT id, url
        FROM articles
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      `).all(batchSize, offset);

      console.log(`� Checking batch ${Math.floor(offset/batchSize) + 1} (${offset + batch.length}/${totalCount})...`);

      for (const article of batch) {
        const migrated = this.isArticleMigrated(article.url);
        if (migrated) {
          alreadyMigrated++;
        } else {
          needMigration++;
          // Only store IDs and URLs for now to save memory
          articlesToMigrate.push({ id: article.id, url: article.url });
        }
      }

      // Apply limit if specified
      if (this.limit && articlesToMigrate.length >= this.limit) {
        articlesToMigrate.splice(this.limit);
        break;
      }
    }

    console.log(`✅ Already migrated: ${alreadyMigrated}`);
    console.log(`📋 Need migration: ${needMigration}`);

    // Now load full article data only for articles that need migration
    const fullArticles = [];
    for (let i = 0; i < articlesToMigrate.length; i += batchSize) {
      const batch = articlesToMigrate.slice(i, i + batchSize);
      const ids = batch.map(a => a.id);

      const articles = this.db.prepare(`
        SELECT id, url, title, date, section, html, crawled_at, canonical_url,
               referrer_url, discovered_at, crawl_depth, fetched_at, request_started_at,
               http_status, content_type, content_length, etag, last_modified,
               redirect_chain, ttfb_ms, download_ms, total_ms, bytes_downloaded,
               transfer_kbps, html_sha256, text, word_count, language,
               article_xpath, analysis
        FROM articles
        WHERE id IN (${ids.map(() => '?').join(',')})
        ORDER BY id ASC
      `).all(...ids);

      fullArticles.push(...articles);
    }

    return fullArticles;
  }

  isArticleMigrated(url) {
    try {
      // Check if URL exists in urls table and has corresponding normalized data
      const urlRow = this.db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
      if (!urlRow) return false;

      // Check if there's HTTP response data (indicates migration)
      const httpResponse = this.db.prepare('SELECT id FROM http_responses WHERE url_id = ?').get(urlRow.id);
      return !!httpResponse;
    } catch (error) {
      console.warn(`⚠️  Error checking migration status for ${url}:`, error.message);
      return false;
    }
  }

  async migrateArticles(articles) {
    console.log(`🚀 Starting migration of ${articles.length} articles...`);

    const results = {
      total: articles.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    let lastCheckpoint = this.resume ? this.loadCheckpoint() : 0;

    for (let i = lastCheckpoint; i < articles.length; i++) {
      const article = articles[i];

      try {
        if (!this.dryRun) {
          // Use the dual-write logic to migrate this article
          await this.migrateSingleArticle(article);
        }

        results.successful++;

        // Progress reporting
        if ((i + 1) % 100 === 0 || i === articles.length - 1) {
          const percent = Math.round(((i + 1) / articles.length) * 100);
          console.log(`📊 Progress: ${i + 1}/${articles.length} (${percent}%) - ${results.successful} successful, ${results.failed} failed`);

          // Save checkpoint
          if (!this.dryRun) {
            this.saveCheckpoint(i + 1);
          }
        }

      } catch (error) {
        results.failed++;
        results.errors.push({
          articleId: article.id,
          url: article.url,
          error: error.message
        });

        console.warn(`⚠️  Failed to migrate article ${article.id} (${article.url}): ${error.message}`);

        // Continue with next article
      }
    }

    return results;
  }

  async migrateSingleArticle(article) {
    // Convert legacy article format to the format expected by dual-write
    const normalizedArticle = {
      url: article.url,
      title: article.title,
      date: article.date,
      section: article.section,
      html: article.html,
      crawled_at: article.crawled_at,
      canonical_url: article.canonical_url,
      referrer_url: article.referrer_url,
      discovered_at: article.discovered_at,
      crawl_depth: article.crawl_depth,
      fetched_at: article.fetched_at,
      request_started_at: article.request_started_at,
      http_status: article.http_status,
      content_type: article.content_type,
      content_length: article.content_length,
      etag: article.etag,
      last_modified: article.last_modified,
      redirect_chain: article.redirect_chain,
      ttfb_ms: article.ttfb_ms,
      download_ms: article.download_ms,
      total_ms: article.total_ms,
      bytes_downloaded: article.bytes_downloaded,
      transfer_kbps: article.transfer_kbps,
      html_sha256: article.html_sha256,
      text: article.text,
      word_count: article.word_count,
      language: article.language,
      article_xpath: article.article_xpath,
      analysis: article.analysis
    };

    // Use the dual-write method directly
    this.newsDb._writeToNormalizedSchema(normalizedArticle);
  }

  loadCheckpoint() {
    try {
      const fs = require('fs');
      if (fs.existsSync(this.checkpointFile)) {
        const data = JSON.parse(fs.readFileSync(this.checkpointFile, 'utf8'));
        console.log(`⏯️  Resuming from checkpoint: ${data.lastProcessedIndex} articles processed`);
        return data.lastProcessedIndex;
      }
    } catch (error) {
      console.warn('⚠️  Could not load checkpoint:', error.message);
    }
    return 0;
  }

  saveCheckpoint(totalProcessed, totalMigrated, totalSkipped, totalErrors) {
    try {
      const fs = require('fs');
      const data = {
        totalProcessed,
        totalMigrated,
        totalSkipped,
        totalErrors,
        timestamp: new Date().toISOString(),
        totalArticles: this.limit || 'unlimited'
      };
      fs.writeFileSync(this.checkpointFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️  Could not save checkpoint:', error.message);
    }
  }

  reportResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL RESULTS');
    console.log('='.repeat(60));
    console.log(`Total articles processed: ${results.total}`);
    console.log(`Successfully migrated: ${results.successful}`);
    console.log(`Failed to migrate: ${results.failed}`);
    console.log(`Success rate: ${results.total > 0 ? Math.round((results.successful / results.total) * 100) : 0}%`);

    if (results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      results.errors.slice(0, 10).forEach((error, index) => {
        console.log(`  ${index + 1}. Article ${error.articleId}: ${error.error}`);
      });

      if (results.errors.length > 10) {
        console.log(`  ... and ${results.errors.length - 10} more errors`);
      }
    }

    if (this.dryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made');
      console.log('Run without --dry-run to perform actual migration');
    } else {
      console.log('\n✅ Migration complete!');
      if (results.failed === 0) {
        console.log('🎉 All articles migrated successfully');
      } else {
        console.log('⚠️  Some articles failed to migrate - check errors above');
      }
    }
  }

  // Static method to parse command line arguments
  static parseArgs() {
    const args = process.argv.slice(2);
    const options = {
      limit: null,
      dryRun: false,
      resume: false,
      dbPath: null
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '--limit':
          options.limit = parseInt(args[i + 1]);
          i++;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--resume':
          options.resume = true;
          break;
        case '--db':
          options.dbPath = args[i + 1];
          i++;
          break;
        default:
          if (arg.startsWith('--')) {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
          } else {
            options.dbPath = arg;
          }
      }
    }

    return options;
  }
}

// Main execution
if (require.main === module) {
  const options = BackfillNormalizedSchema.parseArgs();

  const backfill = new BackfillNormalizedSchema(options.dbPath);
  backfill.limit = options.limit;
  backfill.dryRun = options.dryRun;
  backfill.resume = options.resume;

  backfill.run().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = BackfillNormalizedSchema;