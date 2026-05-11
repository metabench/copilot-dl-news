#!/usr/bin/env node
"use strict";

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const fs = require('fs');
const path = require('path');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

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
  return getDbApi('ensureRedactedExportFetchesTable')(db);
}

function ensureErrorsUrlColumn(db) {
  const result = getDbApi('ensureRedactedExportErrorsUrlColumn')(db);
  if (result.error) {
    console.warn('Unable to add url column to errors table:', result.error);
  }
  return result;
}

function ensureCrawlJobsUrl(db) {
  const result = getDbApi('ensureRedactedExportCrawlJobsUrlColumn')(db);
  if (result.error) {
    console.warn('Unable to add url column to crawl_jobs table:', result.error);
  }
  return result;
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
  const db = openNewsCrawlerDb(dest);
  try {
    getDbApi('prepareRedactedExportSnapshotDb')(db, { sampleLimit: 50 });
    console.log('Snapshot ready:', dest);
  } finally {
    db.close();
  }
}

if (require.main === module) main();
