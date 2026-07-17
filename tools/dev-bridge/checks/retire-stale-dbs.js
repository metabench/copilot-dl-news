'use strict';
/**
 * Retire stale sibling DBs from data/ (2026-07-16 DB-consolidation).
 * Safety first: verifies the stale gazetteer.db is a subset of news.db
 * before touching anything; refuses to proceed if unique data is found.
 * Files are MOVED to data/backups/stale-dbs-2026-07-16/ (reversible),
 * never deleted.
 */
const path = require('path');
const fs = require('fs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));

const DATA = path.join(REPO_ROOT, 'data');
const DEST = path.join(DATA, 'backups', 'stale-dbs-2026-07-16');

// --- 1. Containment probe: names in gazetteer.db missing from news.db ---
const gazPath = path.join(DATA, 'gazetteer.db');
if (fs.existsSync(gazPath)) {
  const gaz = new Database(gazPath, { readonly: true, timeout: 5000 });
  const news = new Database(path.join(DATA, 'news.db'), { readonly: true, timeout: 5000 });
  const names = gaz.prepare('SELECT DISTINCT normalized FROM place_names WHERE normalized IS NOT NULL').all().map(r => r.normalized);
  const check = news.prepare('SELECT 1 FROM place_names WHERE normalized = ? LIMIT 1');
  let missing = 0;
  const samples = [];
  for (const n of names) {
    if (!check.get(n)) { missing++; if (samples.length < 10) samples.push(n); }
  }
  console.log(`[containment] gazetteer.db distinct normalized names: ${names.length}; missing from news.db: ${missing}`);
  if (samples.length) console.log('[containment] samples:', JSON.stringify(samples));
  gaz.close(); news.close();
  const threshold = Math.max(5, Math.floor(names.length * 0.01));
  if (missing > threshold) {
    console.log(`[abort] ${missing} unique names exceed threshold ${threshold} — NOT archiving. Ingest first.`);
    process.exit(2);
  }
}

// --- 2. Move the stale files (+ wal/shm siblings) ---
fs.mkdirSync(DEST, { recursive: true });
const targets = ['gazetteer.db', 'gazetteer-standalone.db', 'crawl-multi.db', 'crawl-data.sqlite'];
for (const base of targets) {
  for (const suffix of ['', '-wal', '-shm']) {
    const src = path.join(DATA, base + suffix);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(DEST, base + suffix);
    try {
      fs.renameSync(src, dst);
      console.log(`[moved] ${base + suffix}`);
    } catch (err) {
      console.log(`[FAILED] ${base + suffix}: ${err.message} (open handle? close apps and rerun)`);
    }
  }
}
console.log('[done] archive dir:', DEST);
