'use strict';

/**
 * db-probe.check.js — diagnose SQLite open/read/write health of data/news.db
 * from THIS machine (Windows), with exact error codes. Read-focused; the only
 * write test is a BEGIN IMMEDIATE that is immediately rolled back.
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = process.argv[2] || path.join(REPO_ROOT, 'data', 'news.db');

for (const suffix of ['', '-wal', '-shm']) {
  const p = DB_PATH + suffix;
  try {
    const st = fs.statSync(p);
    console.log(`[probe] ${path.basename(p)}: ${st.size} bytes, mtime ${st.mtime.toISOString()}`);
  } catch (_) {
    console.log(`[probe] ${path.basename(p)}: (absent)`);
  }
}

let Database;
try {
  Database = require(require.resolve('better-sqlite3', {
    paths: [
      REPO_ROOT,
      path.join(REPO_ROOT, '..', 'news-crawler-db'),
      __dirname
    ]
  }));
} catch (err) {
  console.log(`[probe] cannot load better-sqlite3: ${err.message}`);
  process.exit(2);
}

function attempt(label, fn) {
  try {
    const value = fn();
    console.log(`[probe] ${label}: OK${value !== undefined ? ' → ' + JSON.stringify(value) : ''}`);
    return true;
  } catch (err) {
    console.log(`[probe] ${label}: FAIL → ${err.code || ''} ${err.message}`);
    return false;
  }
}

let db;
const openAndRead = (label) => {
  let ok = attempt(`${label}: open (rw, timeout 5s)`, () => { db = new Database(DB_PATH, { timeout: 5000 }); });
  if (!ok) return false;
  ok = attempt(`${label}: quick read (place_hubs count)`, () => db.prepare('SELECT COUNT(*) AS n FROM place_hubs').get().n);
  if (!ok) { try { db.close(); } catch (_) {} return false; }
  return true;
};

if (!openAndRead('pass1')) {
  // Likely a stale/incompatible -shm left by a previous session (its mtime
  // predates the db/wal above). Deleting it is safe ONLY if no process has
  // it open — unlink failure tells us something still holds a handle.
  const shm = `${DB_PATH}-shm`;
  const wal = `${DB_PATH}-wal`;
  attempt('unlink stale -shm', () => { fs.unlinkSync(shm); });
  try {
    const walSize = fs.existsSync(wal) ? fs.statSync(wal).size : -1;
    if (walSize === 0) attempt('unlink empty -wal', () => { fs.unlinkSync(wal); });
  } catch (_) {}
  openAndRead('pass2 (after cleanup)');
}

if (db && db.open) {
  attempt('journal_mode', () => db.pragma('journal_mode', { simple: true }));
  attempt('write lock (BEGIN IMMEDIATE + ROLLBACK)', () => { db.exec('BEGIN IMMEDIATE'); db.exec('ROLLBACK'); });
  attempt('wal checkpoint (PASSIVE)', () => db.pragma('wal_checkpoint(PASSIVE)'));
  try { db.close(); } catch (_) {}
}
console.log('[probe] done');
