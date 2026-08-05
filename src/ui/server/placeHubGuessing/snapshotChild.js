'use strict';

/**
 * Snapshot child for the Place Hub Guessing coverage matrix.
 *
 * CLI: node snapshotChild.js --out <file> --options <json> [--db-path <path>]
 *
 * Renders the matrix page for the given (already normalized) route options
 * and writes the HTML to --out. Spawned by the htmlSnapshotCache in
 * server.js so the ~6-9s synchronous jsgui3 render of the ~8.5MB page
 * happens off the dashboard's event loop. Requires renderMatrixPage.js
 * directly — NOT server.js — to skip the crawler stack's ~18s require chain.
 * Opens its own readonly handle; concurrent readers are safe.
 */

const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outFile = arg('--out');
const optionsJson = arg('--options');
if (!outFile || !optionsJson) {
  console.error('usage: snapshotChild --out <file> --options <json> [--db-path <path>]');
  process.exit(2);
}
const dbPath = arg('--db-path') || process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');
const { renderPlaceHubGuessingMatrixHtml } = require('./renderMatrixPage');

let resolved = null;
let exitCode = 0;
try {
  const options = JSON.parse(optionsJson);
  resolved = resolveBetterSqliteHandle({ dbPath, readonly: true });
  const html = renderPlaceHubGuessingMatrixHtml({ dbHandle: resolved.dbHandle, ...options });
  fs.writeFileSync(outFile, html, 'utf8');
} catch (err) {
  console.error((err && err.stack) || String(err));
  exitCode = 1;
}
try {
  if (resolved) resolved.close();
} catch (_) {
  // ignore
}
process.exit(exitCode);
