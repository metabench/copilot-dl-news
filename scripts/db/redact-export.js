#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case '--source':
        args.source = argv[++i];
        break;
      case '--snapshot':
        args.snapshot = argv[++i];
        break;
      case '--rows':
        args.rows = Number(argv[++i]) || 10000;
        break;
    }
  }
  return args;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDb(source, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
}

function ensureFetchesTable(db) {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fetches'").all();
  if (has.length) return;
  // Create a minimal fetches table so domain stats can use it
  db.exec(`CREATE TABLE fetches (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, url_id INTEGER, fetched_at DATETIME, crawled_at DATETIME, classification TEXT, host TEXT)`);
  const urls = db.prepare('SELECT url FROM urls LIMIT 50').all();
  const insert = db.prepare('INSERT INTO fetches (url, fetched_at, crawled_at, classification, host) VALUES (?, datetime("now"), datetime("now"), "article", ?)');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      try {
        const host = new URL(r.url).host;
        insert.run(r.url, host);
      } catch (e) {
        insert.run(r.url, null);
      }
    }
  });
  tx(urls);
}

function ensureErrorsUrlColumn(db) {
  const cols = db.prepare("PRAGMA table_info(errors)").all();
  const hasUrl = cols.some(c => c.name === 'url');
  if (hasUrl) return;
  try {
    db.exec(`ALTER TABLE errors ADD COLUMN url TEXT`);
  } catch (e) {
    console.warn('Unable to add url column to errors table:', e.message);
  }
}

function ensureCrawlJobsUrl(db) {
  const cols = db.prepare("PRAGMA table_info(crawl_jobs)").all();
  const hasUrl = cols.some(c => c.name === 'url');
  if (hasUrl) return;
  try {
    db.exec(`ALTER TABLE crawl_jobs ADD COLUMN url TEXT`);
    // Populate with the start_url for older rows if available
    // no-op if not
  } catch (e) {
    console.warn('Unable to add url column to crawl_jobs table:', e.message);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..', '..');
  const source = args.source || path.join(repoRoot, 'data', 'news.db');
  const snapshot = args.snapshot || 'mini';
  const destDir = path.join(repoRoot, 'data', 'perf-snapshots', snapshot);
  const dest = path.join(destDir, 'news.db');
  if (!fs.existsSync(source)) {
    console.error('Source DB not found:', source);
    process.exit(1);
  }
  console.log(`Copying ${source} -> ${dest}`);
  copyDb(source, dest);
  const db = new Database(dest);
  try {
    ensureFetchesTable(db);
    ensureErrorsUrlColumn(db);
    ensureCrawlJobsUrl(db);
    console.log('Snapshot ready:', dest);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
