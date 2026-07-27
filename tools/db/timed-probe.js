#!/usr/bin/env node
'use strict';

/**
 * timed-probe.js — run a read-only SQL probe against news.db under a HARD
 * external watchdog. The only safe way to time a possibly-slow query.
 *
 *   node tools/db/timed-probe.js --sql "SELECT ..." [--params "a,b"]
 *        [--timeout-ms 30000] [--db data/news.db] [--limit-guard 500]
 *
 * Why this exists (incident 2026-07-20): an unbounded ORDER BY
 * COALESCE(...) probe was run inline against the live 29GB DB. Three
 * compounding facts turned that into a machine-wide problem:
 *   1. better-sqlite3 is SYNCHRONOUS native code — once a query starts, no
 *      JS timer, signal handler, or Promise timeout in the same process can
 *      interrupt it. In-process watchdogs are dead code while the thread is
 *      inside SQLite.
 *   2. The Bash-tool timeout killed the SHELL but not the spawned node
 *      grandchild (Windows), so the query ran on as an orphan for 25+ min.
 *   3. A long-lived READER pins the WAL snapshot: the app's concurrent
 *      writes couldn't checkpoint-truncate and news.db-wal grew to 870MB.
 * The fix shape is the one the codebase already uses for slow frontier
 * reads (frontier-stats.js): put the query in a CHILD process and hard-kill
 * from the parent. This tool packages that so ad-hoc probes get it for free.
 *
 * Output: EXPLAIN QUERY PLAN lines FIRST (cheap — you get the diagnostic
 * even if the timing run is killed), then row count + elapsed, or KILLED.
 */

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
};

const IS_CHILD = argv.includes('--child');
const SQL = getArg('--sql', null);
const PARAMS = (getArg('--params', '') || '').split(',').filter(Boolean);
const TIMEOUT_MS = Number(getArg('--timeout-ms', 30000));
const DB_PATH = path.resolve(ROOT, getArg('--db', path.join('data', 'news.db')));
// Guard: refuse obviously-unbounded probes unless explicitly overridden —
// a probe without LIMIT against the live DB is exactly the incident shape.
const NO_LIMIT_OK = argv.includes('--no-limit-guard');
// Print every returned row (default prints only the first). Safe because the
// LIMIT guard still bounds the row count; useful for headline/report queries.
const PRINT_ALL = argv.includes('--print-all');

if (!SQL) {
  console.error('usage: timed-probe.js --sql "SELECT ..." [--params a,b] [--timeout-ms 30000] [--db path] [--no-limit-guard]');
  process.exit(2);
}

if (IS_CHILD) {
  const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    for (const row of db.prepare('EXPLAIN QUERY PLAN ' + SQL).all(...PARAMS)) {
      console.log('plan:', row.detail);
    }
    const t0 = Date.now();
    const rows = db.prepare(SQL).all(...PARAMS);
    console.log(`rows: ${rows.length}  elapsed: ${Date.now() - t0}ms`);
    if (rows.length) {
      if (PRINT_ALL) {
        rows.forEach((r, i) => console.log(`row[${i}]:`, JSON.stringify(r)));
      } else {
        console.log('first row:', JSON.stringify(rows[0]).slice(0, 300));
      }
    }
  } finally {
    db.close();
  }
} else {
  if (!/\blimit\b/i.test(SQL) && !NO_LIMIT_OK) {
    console.error('REFUSED: no LIMIT in probe SQL. Add one, or pass --no-limit-guard if the scan is genuinely intended.');
    process.exit(3);
  }
  const child = spawn(process.execPath, [__filename, '--child', ...argv.filter((a) => a !== '--child')], {
    cwd: ROOT, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit']
  });
  const killer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch (_) {}
    console.error(`\nKILLED after ${TIMEOUT_MS}ms — the query did not finish. The plan lines above tell you why.`);
    console.error('(A killed READER also releases its WAL pin — no 870MB-wal repeat.)');
    process.exitCode = 124;
  }, TIMEOUT_MS);
  child.on('exit', (code) => {
    clearTimeout(killer);
    if (process.exitCode !== 124) process.exitCode = code || 0;
  });
}
