/**
 * Merge Remote Database into Local Database
 * 
 * Usage: node tools/remote-crawl/merge-db.js <source_db_path> [target_db_path]
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { findProjectRoot } = require('../../src/shared/utils/project-root');

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

const db = new Database(targetPath);

try {
  // Attach source database
  console.log('Attaching source database...');
  db.prepare(`ATTACH DATABASE ? AS source`).run(sourcePath);

  // Check stats before
  const beforeCount = db.prepare('SELECT COUNT(*) as c FROM main.urls').get().c;
  console.log(`Local URLs before: ${beforeCount}`);

  // Get source stats
  const sourceStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done
    FROM source.urls
  `).get();
  console.log(`Source DB: ${sourceStats.total} total URLs, ${sourceStats.done} crawled (status='done')`);

  // 1. Insert/Update URLs
  console.log('Syncing URLs table...');
  const urlsResult = db.prepare(`
    INSERT INTO main.urls (url, host, created_at, last_seen_at)
    SELECT url, host, created_at, fetched_at
    FROM source.urls
    WHERE status = 'done'
    ON CONFLICT(url) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
  `).run();
  console.log(`✅ URLs synced: ${urlsResult.changes} changes`);

  // 2. Insert HTTP Responses
  // We need to link by URL since IDs are different
  console.log('Syncing HTTP responses...');
  const responsesResult = db.prepare(`
    INSERT INTO main.http_responses (
      url_id, request_started_at, fetched_at, http_status, 
      content_type, bytes_downloaded, total_ms
    )
    SELECT 
      u.id, 
      s.fetched_at, -- using fetched_at as start time approx
      s.fetched_at, 
      s.http_status, 
      s.content_type, 
      s.content_length,
      0 -- placeholder for timing
    FROM source.urls s
    JOIN main.urls u ON s.url = u.url
    WHERE s.status = 'done'
      AND NOT EXISTS (
        SELECT 1 FROM main.http_responses r 
        WHERE r.url_id = u.id AND r.fetched_at = s.fetched_at
      )
  `).run();
  console.log(`✅ Responses synced: ${responsesResult.changes} new records`);

  // Check stats after
  const afterCount = db.prepare('SELECT COUNT(*) as c FROM main.urls').get().c;
  console.log(`Local URLs after: ${afterCount}`);

  // Detach
  db.prepare('DETACH DATABASE source').run();

} catch (err) {
  console.error('❌ Merge failed:', err.message);
} finally {
  db.close();
}
