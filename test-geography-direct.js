/**
 * Direct test of geography crawl initialization
 * Runs crawl.js directly (not via server/child process) to see actual console output
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Setup temp DB
const tmpDir = path.join(os.tmpdir(), 'geography-direct-test');
fs.mkdirSync(tmpDir, { recursive: true });
const dbPath = path.join(tmpDir, 'test.db');

console.log('[test] Starting direct geography crawl test');
console.log('[test] DB path:', dbPath);

// Initialize database
const { ensureDb } = require('./src/db/sqlite/ensureDb');
const db = ensureDb(dbPath);
console.log('[test] Database initialized');

// Create crawler
const NewsCrawler = require('./src/crawl');

const crawler = new NewsCrawler('https://example.com', {
  dbPath,
  dataDir: path.join(tmpDir, 'data'),
  mode: 'gazetteer',
  gazetteerVariant: 'geography',
  preferCache: true,
  verbose: true
});

console.log('[test] Crawler created, starting initialization...');

// Run with timeout
Promise.race([
  crawler.crawlConcurrent({
    maxPages: 1,
    concurrency: 1,
    depth: 1
  }),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout after 10 seconds')), 10000)
  )
])
.then(() => {
  console.log('[test] Crawl completed successfully');
  process.exit(0);
})
.catch(err => {
  console.error('[test] Crawl failed:', err.message);
  console.error('[test] Stack:', err.stack);
  process.exit(1);
});
