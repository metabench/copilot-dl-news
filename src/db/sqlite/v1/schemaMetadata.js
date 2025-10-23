'use strict';

const CURRENT_SCHEMA_FINGERPRINT = 'v1-2025-10-21';
const METADATA_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    details JSON
  );
`;
const CRITICAL_TABLES = [
  'urls',
  'http_responses',
  'content_storage',
  'content_analysis',
  'crawl_jobs',
  'crawl_types',
  'queue_events'
];

function ensureSchemaMetadataTable(db) {
  db.exec(METADATA_TABLE_SQL);
}

function getMetadataValue(db, key) {
  ensureSchemaMetadataTable(db);
  const row = db.prepare('SELECT value FROM schema_metadata WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMetadataValue(db, key, value, details = null) {
  ensureSchemaMetadataTable(db);
  const stmt = db.prepare(`
    INSERT INTO schema_metadata (key, value, updated_at, details)
    VALUES (@key, @value, datetime('now'), @details)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now'),
      details = excluded.details
  `);
  stmt.run({ key, value, details: details ? JSON.stringify(details) : null });
}

function removeMetadataValue(db, key) {
  ensureSchemaMetadataTable(db);
  db.prepare('DELETE FROM schema_metadata WHERE key = ?').run(key);
}

function getSchemaFingerprint(db) {
  return getMetadataValue(db, 'schema_fingerprint');
}

function recordSchemaFingerprint(db, { fingerprint = CURRENT_SCHEMA_FINGERPRINT, details = null } = {}) {
  setMetadataValue(db, 'schema_fingerprint', fingerprint, details);
}

function verifyCriticalTables(db) {
  const missing = [];
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?");
  for (const tableName of CRITICAL_TABLES) {
    const row = stmt.get(tableName);
    if (!row) {
      missing.push(tableName);
    }
  }
  return { ok: missing.length === 0, missing };
}

function shouldUseFastPath(db, { fingerprint = CURRENT_SCHEMA_FINGERPRINT } = {}) {
  ensureSchemaMetadataTable(db);
  const recorded = getSchemaFingerprint(db);
  if (!recorded) {
    return { useFastPath: false, reason: 'no fingerprint recorded' };
  }
  if (recorded !== fingerprint) {
    return { useFastPath: false, reason: `fingerprint mismatch (expected ${fingerprint}, found ${recorded})` };
  }
  const { ok, missing } = verifyCriticalTables(db);
  if (!ok) {
    return { useFastPath: false, reason: `missing critical tables: ${missing.join(', ')}` };
  }
  return { useFastPath: true };
}

module.exports = {
  CURRENT_SCHEMA_FINGERPRINT,
  ensureSchemaMetadataTable,
  getSchemaFingerprint,
  recordSchemaFingerprint,
  shouldUseFastPath,
  verifyCriticalTables,
  removeMetadataValue
};
