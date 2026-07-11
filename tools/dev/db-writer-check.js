#!/usr/bin/env node
'use strict';

/**
 * db-writer-check — is anything writing to news.db right now?
 *
 * Three independent signals:
 *   1. WAL/SHM file mtimes, sampled twice over a short window — an active
 *      writer advances the -wal mtime between samples.
 *   2. A BEGIN IMMEDIATE probe (rolled back immediately) — fails with
 *      SQLITE_BUSY if another connection holds a write lock.
 *   3. Crawl bookkeeping tables — crawl_runs rows with status='running' and
 *      background_tasks rows with status in ('running','pending').
 *
 * Exit code 0 = no writer detected, 1 = writer detected/suspected, 2 = error.
 *
 * Usage:
 *   node tools/dev/db-writer-check.js [--db path/to/news.db] [--window-ms 5000]
 */

const fs = require('fs');
const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');

function statOrNull(p) {
  try { return fs.statSync(p); } catch (_) { return null; }
}

function sampleFiles(dbPath) {
  const out = {};
  for (const suffix of ['', '-wal', '-shm']) {
    const st = statOrNull(dbPath + suffix);
    out[suffix || 'db'] = st ? { mtimeMs: st.mtimeMs, size: st.size } : null;
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dbIndex = args.indexOf('--db');
  const dbPath = dbIndex !== -1 && args[dbIndex + 1]
    ? args[dbIndex + 1]
    : path.join(findProjectRoot(__dirname), 'data', 'news.db');
  const windowIndex = args.indexOf('--window-ms');
  const windowMs = windowIndex !== -1 ? Math.max(1000, Number(args[windowIndex + 1]) || 5000) : 5000;

  if (!fs.existsSync(dbPath)) {
    console.error(`[writer-check] Database not found: ${dbPath}`);
    process.exit(2);
  }

  console.log(`[writer-check] Database: ${dbPath}`);
  let suspicion = false;

  // Signal 1: WAL mtime movement across the sampling window.
  const before = sampleFiles(dbPath);
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const after = sampleFiles(dbPath);
  const walMoved = Boolean(before['-wal'] && after['-wal'] &&
    (before['-wal'].mtimeMs !== after['-wal'].mtimeMs || before['-wal'].size !== after['-wal'].size));
  const walAgeMin = after['-wal'] ? (Date.now() - after['-wal'].mtimeMs) / 60000 : null;
  console.log(`[writer-check] WAL moved during ${windowMs}ms window: ${walMoved}` +
    (walAgeMin != null ? ` (last WAL write ${walAgeMin.toFixed(1)} min ago)` : ' (no WAL file)'));
  if (walMoved) suspicion = true;

  // Signals 2 & 3 need a DB handle.
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (_) {
    try {
      const { resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
      resolveNewsCrawlerDbModule(); // ensures package exists; it bundles better-sqlite3
      Database = require(require.resolve('better-sqlite3', {
        paths: [path.resolve(__dirname, '..', '..', '..', 'news-crawler-db')]
      }));
    } catch (err) {
      console.error(`[writer-check] Cannot load better-sqlite3: ${err.message}`);
      process.exit(2);
    }
  }

  // Signal 2: write-lock probe.
  try {
    const db = new Database(dbPath, { timeout: 2000 });
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec('ROLLBACK');
      console.log('[writer-check] Write-lock probe: acquired (no writer holds the lock)');
    } catch (err) {
      if (/busy|locked/i.test(String(err.message))) {
        console.log('[writer-check] Write-lock probe: BUSY — another connection is writing');
        suspicion = true;
      } else {
        console.log(`[writer-check] Write-lock probe inconclusive: ${err.message}`);
      }
    } finally {
      db.close();
    }
  } catch (err) {
    console.log(`[writer-check] Could not open DB for probe: ${err.message}`);
  }

  // Signal 3: bookkeeping tables (read-only connection).
  try {
    const ro = new Database(dbPath, { readonly: true, timeout: 2000 });
    const safe = (sql) => { try { return ro.prepare(sql).all(); } catch (_) { return null; } };
    const runs = safe("SELECT id, target_domain, started_at FROM crawl_runs WHERE status = 'running' ORDER BY id DESC LIMIT 5");
    const tasks = safe("SELECT id, status, created_at FROM background_tasks WHERE status IN ('running','pending') ORDER BY id DESC LIMIT 5");
    if (runs) {
      console.log(`[writer-check] crawl_runs status='running': ${runs.length}`);
      if (runs.length) { console.log(runs); suspicion = true; }
    }
    if (tasks) {
      console.log(`[writer-check] background_tasks running/pending: ${tasks.length}`);
      if (tasks.length) { console.log(tasks); suspicion = true; }
    }
    ro.close();
  } catch (err) {
    console.log(`[writer-check] Bookkeeping check skipped: ${err.message}`);
  }

  console.log(suspicion
    ? '[writer-check] RESULT: writer detected or suspected — do NOT run migrations now'
    : '[writer-check] RESULT: no writer detected');
  process.exit(suspicion ? 1 : 0);
}

main().catch((err) => {
  console.error('[writer-check] Failed:', err.message);
  process.exit(2);
});
