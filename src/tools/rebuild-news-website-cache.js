#!/usr/bin/env node
/**
 * rebuild-news-website-cache.js
 * CLI tool to rebuild statistics cache for news websites
 * 
 * Usage:
 *   node src/tools/rebuild-news-website-cache.js           # Rebuild all
 *   node src/tools/rebuild-news-website-cache.js --id 5    # Rebuild specific website
 */

const { withNewsDb } = require('../data/db/dbAccess');
const NewsWebsiteService = require('../services/NewsWebsiteService');

async function main() {
  const args = process.argv.slice(2);
  const idIndex = args.indexOf('--id');
  const targetId = idIndex >= 0 && args[idIndex + 1] ? parseInt(args[idIndex + 1], 10) : null;

  await withNewsDb(async (db) => {
    const service = new NewsWebsiteService(db);

    if (targetId) {
      console.log(`Rebuilding cache for news website ID ${targetId}...`);
      const start = Date.now();
      
      try {
        service.rebuildCache(targetId);
        const elapsed = Date.now() - start;
        
        console.log(`✓ Cache rebuilt successfully in ${elapsed}ms`);
        
        // Show cache stats
        const stats = service.statsCache.getCachedStats(targetId);
        if (stats) {
          console.log('\nCache Statistics:');
          console.log(`  Articles: ${stats.article_count || 0}`);
          console.log(`  Fetches: ${stats.fetch_count || 0} (${stats.fetch_ok_count || 0} OK, ${stats.fetch_error_count || 0} errors)`);
          console.log(`  HTTP 200: ${stats.status_200_count || 0}`);
          console.log(`  Avg fetch time: ${stats.avg_fetch_time_ms ? Math.round(stats.avg_fetch_time_ms) + 'ms' : 'n/a'}`);
        }
      } catch (err) {
        console.error(`✗ Failed to rebuild cache: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.log('Rebuilding cache for all news websites...');
      const start = Date.now();
      
      try {
        const result = service.rebuildAllCaches();
        const elapsed = Date.now() - start;
        
        console.log(`✓ Rebuilt ${result.rebuilt} caches successfully in ${elapsed}ms`);
        console.log(`  Total websites: ${result.total}`);
        console.log(`  Rebuilt: ${result.rebuilt}`);
        console.log(`  Failed: ${result.failed}`);
        
        if (result.errors && result.errors.length > 0) {
          console.log('\nErrors:');
          result.errors.forEach(err => {
            console.log(`  - Website ${err.websiteId}: ${err.error}`);
          });
        }
      } catch (err) {
        console.error(`✗ Failed to rebuild caches: ${err.message}`);
        process.exit(1);
      }
    }
  });
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
