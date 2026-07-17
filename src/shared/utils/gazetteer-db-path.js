'use strict';

/**
 * Single source of truth for where gazetteer (geographic) data lives.
 *
 * History: the gazetteer once shipped as a separate data/gazetteer.db.
 * That copy went stale (508 places / 14.8k names) while the live data
 * moved into data/news.db (13.7k places / 737k place_names) — yet a
 * dozen modules still defaulted to the old file. As of 2026-07-16 the
 * stale sibling DBs are archived (data/backups/stale-dbs-2026-07-16/)
 * and EVERY geographic lookup must resolve through this module.
 *
 * Override order:
 *   1. explicit argument (CLI --db flags keep working)
 *   2. GAZETTEER_DB_PATH env var
 *   3. data/news.db under the project root
 */

const path = require('path');
const { findProjectRoot } = require('./project-root');

function resolveGazetteerDbPath(explicitPath) {
  if (explicitPath && typeof explicitPath === 'string') return path.resolve(explicitPath);
  if (process.env.GAZETTEER_DB_PATH) return path.resolve(process.env.GAZETTEER_DB_PATH);
  const root = findProjectRoot(__dirname);
  return path.join(root, 'data', 'news.db');
}

module.exports = { resolveGazetteerDbPath };
