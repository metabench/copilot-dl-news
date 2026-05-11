const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * Merge Remote Database into Local Database
 * 
 * Usage: node tools/remote-crawl/merge-db.js <source_db_path> [target_db_path]
 */
const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../../src/shared/utils/project-root');
const { mergeRemoteCrawlServerDatabase } = require('news-crawler-db');

// Resolve paths
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node tools/remote-crawl/merge-db.js <source_db_path> [target_db_path]');
  process.exit(1);
}

const sourcePath = path.resolve(args[0]);
let targetPath = args[1];

if (!targetPath) {
  const root = findProjectRoot(__dirname);
  targetPath = path.join(root, 'data', 'news.db');
} else {
  targetPath = path.resolve(targetPath);
}

console.log(`Source: ${sourcePath}`);
console.log(`Target: ${targetPath}`);

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ Source database found at ${sourcePath}`);
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  console.error(`❌ Target database not found at ${targetPath}`);
  process.exit(1);
}

const db = openNewsCrawlerDb(targetPath);

try {
  console.log('Merging source database...');
  const result = mergeRemoteCrawlServerDatabase(db, sourcePath);
  console.log(`Local URLs before: ${result.beforeCount}`);

  const sourceStats = result.sourceStats;
  console.log(`Source DB: ${sourceStats.total} total URLs, ${sourceStats.done} crawled (status='done')`);

  console.log(`✅ URLs synced: ${result.urlsChanged} changes`);
  console.log(`✅ Responses synced: ${result.responsesChanged} new records`);
  console.log(`Local URLs after: ${result.afterCount}`);

} catch (err) {
  console.error('❌ Merge failed:', err.message);
} finally {
  db.close();
}
