-- Migration: Add ui_cached_metrics table for cached UI aggregates
--
-- Stores serialized stat payloads plus freshness metadata so UI views can
-- render fast cards without recomputing heavy queries on every request.

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
