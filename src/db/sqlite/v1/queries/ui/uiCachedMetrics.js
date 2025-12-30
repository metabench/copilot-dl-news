'use strict';

const fs = require('fs');
const path = require('path');

function resolveDbHandle(dbOrWrapper) {
  if (!dbOrWrapper) return null;
  if (typeof dbOrWrapper.prepare === 'function' && typeof dbOrWrapper.exec === 'function') return dbOrWrapper;
  if (dbOrWrapper.db && typeof dbOrWrapper.db.prepare === 'function') return dbOrWrapper.db;
  return null;
}

function ensureUiCachedMetricsTable(dbOrWrapper) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return false;

  try {
    const migrationPath = path.join(__dirname, '..', '..', 'migrations', 'add_ui_cached_metrics_table.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(sql);
    return true;
  } catch (_) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ui_cached_metrics (
          stat_key TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          source_window TEXT,
          duration_ms INTEGER,
          max_age_ms INTEGER,
          error TEXT,
          metadata JSON
        );
        CREATE INDEX IF NOT EXISTS idx_ui_cached_metrics_generated_at
          ON ui_cached_metrics (generated_at DESC);
      `);
      return true;
    } catch (error) {
      return false;
    }
  }
}

function selectMetricRow(dbOrWrapper, statKey) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) return null;

  const stmt = db.prepare(`
    SELECT stat_key AS statKey,
           payload,
           generated_at AS generatedAt,
           source_window AS sourceWindow,
           duration_ms AS durationMs,
           max_age_ms AS maxAgeMs,
           error,
           metadata
    FROM ui_cached_metrics
    WHERE stat_key = ?
  `);

  return stmt.get(statKey) || null;
}

function upsertCachedMetricRow(dbOrWrapper, entry) {
  const db = resolveDbHandle(dbOrWrapper);
  if (!db) throw new Error('db_not_available');

  const stmt = db.prepare(`
    INSERT INTO ui_cached_metrics (
      stat_key, payload, generated_at, source_window,
      duration_ms, max_age_ms, error, metadata
    ) VALUES (
      @statKey, @payload, @generatedAt, @sourceWindow,
      @durationMs, @maxAgeMs, @error, @metadata
    )
    ON CONFLICT(stat_key) DO UPDATE SET
      payload = excluded.payload,
      generated_at = excluded.generated_at,
      source_window = excluded.source_window,
      duration_ms = excluded.duration_ms,
      max_age_ms = excluded.max_age_ms,
      error = excluded.error,
      metadata = excluded.metadata
  `);

  return stmt.run(entry);
}

module.exports = {
  resolveDbHandle,
  ensureUiCachedMetricsTable,
  selectMetricRow,
  upsertCachedMetricRow
};
