'use strict';

/**
 * Snapshot child for the Quality Dashboard.
 *
 * CLI: node snapshotChild.js --out <file> [--db-path <path>]
 *
 * Runs the three heavy dashboard aggregates (14-39s of synchronous
 * better-sqlite3 scans against the live db, census 2026-08-05) and the SSR
 * render in THIS process, then writes the finished HTML to --out. Spawned by
 * the htmlSnapshotCache in server.js so the dashboard's event loop never
 * blocks on them. Opens its own readonly handle — concurrent readers are
 * safe, same as the countryStats/hostHealth child tools.
 */

const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outFile = arg('--out');
if (!outFile) {
  console.error('usage: snapshotChild --out <file> [--db-path <path>]');
  process.exit(2);
}
const dbPath = arg('--db-path') || process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

const { openNewsCrawlerDb } = require('../../../db/openNewsCrawlerDb');
const { QualityMetricsService, renderDashboardPageHtml } = require('./server');

let db = null;
let exitCode = 0;
try {
  db = openNewsCrawlerDb(dbPath, { readonly: true });
  const html = renderDashboardPageHtml(new QualityMetricsService(db));
  fs.writeFileSync(outFile, html, 'utf8');
} catch (err) {
  console.error((err && err.stack) || String(err));
  exitCode = 1;
}
try {
  if (db) db.close();
} catch (_) {
  // ignore
}
process.exit(exitCode);
