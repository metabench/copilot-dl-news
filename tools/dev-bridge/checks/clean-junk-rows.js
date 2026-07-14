'use strict';

/**
 * clean-junk-rows.js — remove known junk from the live news.db:
 *   - place_hub_candidates rows with domain 'city' (arg-order bug legacy)
 *   - place_hubs rows for test hosts (example.com, test1/test2.example.com)
 * Prints counts before/after; runs in one transaction. Pass --apply to
 * actually delete (default is a dry-run report).
 */

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'news.db');
const APPLY = process.argv.includes('--apply');

const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db')]
}));

const db = new Database(DB_PATH, { timeout: 10000 });
const TEST_HOSTS = ['example.com', 'test1.example.com', 'test2.example.com'];

const cityCount = db.prepare("SELECT COUNT(*) n FROM place_hub_candidates WHERE domain = 'city'").get().n;
const testHubCount = db.prepare(
  `SELECT COUNT(*) n FROM place_hubs WHERE host IN (${TEST_HOSTS.map(() => '?').join(',')})`
).all ? db.prepare(`SELECT COUNT(*) n FROM place_hubs WHERE host IN (${TEST_HOSTS.map(() => '?').join(',')})`).get(...TEST_HOSTS).n : 0;

console.log(`[junk] place_hub_candidates domain='city': ${cityCount}`);
console.log(`[junk] place_hubs test hosts: ${testHubCount}`);

if (!APPLY) {
  console.log('[junk] dry run — pass --apply to delete');
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  const a = db.prepare("DELETE FROM place_hub_candidates WHERE domain = 'city'").run().changes;
  const b = db.prepare(
    `DELETE FROM place_hubs WHERE host IN (${TEST_HOSTS.map(() => '?').join(',')})`
  ).run(...TEST_HOSTS).changes;
  return { a, b };
});
const { a, b } = tx();
console.log(`[junk] deleted ${a} candidate rows, ${b} test hub rows`);
db.close();
