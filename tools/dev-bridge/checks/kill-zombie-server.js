'use strict';

/**
 * kill-zombie-server.check.js — terminate the stale unifiedApp server that
 * has held news.db's -shm since before the schema migration (poisoning all
 * new connections with SQLITE_IOERR_SHORT_READ), then remove the stale
 * -shm/empty -wal and verify the database opens and reads cleanly.
 *
 * argv[0] = pid to kill (required, explicit on purpose).
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'news.db');
const pid = Number(process.argv[2]);

if (!Number.isFinite(pid) || pid <= 0) {
  console.log('[kill] pass the zombie pid as argv, e.g. argv: ["155820"]');
  process.exit(1);
}
if (pid === process.pid || pid === process.ppid) {
  console.log('[kill] refusing to kill self/bridge');
  process.exit(1);
}

try {
  execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' });
  console.log(`[kill] killed pid ${pid}`);
} catch (err) {
  console.log(`[kill] taskkill: ${err.message.split('\n')[0]}`);
}

// Give Windows a moment to release handles.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await delay(2000);

  for (const suffix of ['-shm', '-wal']) {
    const p = DB_PATH + suffix;
    try {
      const size = fs.existsSync(p) ? fs.statSync(p).size : -1;
      if (suffix === '-wal' && size > 0) {
        console.log(`[cleanup] keeping non-empty -wal (${size} bytes)`);
        continue;
      }
      fs.unlinkSync(p);
      console.log(`[cleanup] removed ${path.basename(p)}`);
    } catch (err) {
      console.log(`[cleanup] ${path.basename(p)}: ${err.code || err.message}`);
    }
  }

  const Database = require(require.resolve('better-sqlite3', {
    paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db')]
  }));
  try {
    const db = new Database(DB_PATH, { timeout: 5000 });
    const n = db.prepare('SELECT COUNT(*) AS n FROM place_hubs').get().n;
    const mode = db.pragma('journal_mode', { simple: true });
    db.exec('BEGIN IMMEDIATE'); db.exec('ROLLBACK');
    db.close();
    console.log(`[verify] OK — journal_mode=${mode}, place_hubs=${n}, write lock acquired`);
    process.exit(0);
  } catch (err) {
    console.log(`[verify] still failing: ${err.code || ''} ${err.message}`);
    process.exit(1);
  }
})();
