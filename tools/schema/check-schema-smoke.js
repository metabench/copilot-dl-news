// Smoke test: create a temporary DB with ensureDatabase and list tables/views
const path = require('path');
const os = require('os');
const fs = require('fs');

const { ensureDatabase } = require('../src/data/db/sqlite/v1/connection');

const tmp = path.join(os.tmpdir(), `nc-smoke-${Date.now()}.db`);
console.log('Creating temp DB:', tmp);
try {
  const db = ensureDatabase(tmp, { verbose: false });
  const rows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all();
  console.log('FOUND_ROWS_COUNT=' + rows.length);
  for (const r of rows) {
    console.log(`${r.type}\t${r.name}`);
  }
  try { db.close(); } catch (e) {}
} catch (err) {
  console.error('SMOKE_ERROR:', err && err.stack ? err.stack : err);
  process.exitCode = 2;
} finally {
  try { fs.unlinkSync(tmp); } catch (_) {}
}
