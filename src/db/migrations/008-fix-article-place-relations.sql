-- Fix Article-Place Relations Foreign Key Migration
-- Version: 008-fix
-- Description: Update foreign key to reference http_responses instead of articles

-- Drop existing foreign key constraint and recreate with correct reference
-- SQLite doesn't support DROP CONSTRAINT directly, so we need to recreate the table

PRAGMA foreign_keys = OFF;

-- Create temporary table with correct schema
CREATE TABLE article_place_relations_temp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL CHECK(relation_type IN ('primary', 'secondary', 'mentioned', 'affected', 'origin')),
  confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
  matching_rule_level INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,              -- JSON: {rule, matches, context, metadata}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (article_id) REFERENCES http_responses(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  UNIQUE(article_id, place_id, matching_rule_level) -- Prevent duplicate matches at same rule level
);

-- Copy data from old table to temp table
INSERT INTO article_place_relations_temp
SELECT id, article_id, place_id, relation_type, confidence, matching_rule_level, evidence, created_at, updated_at
FROM article_place_relations;

-- Drop old table and rename temp table
DROP TABLE article_place_relations;
ALTER TABLE article_place_relations_temp RENAME TO article_place_relations;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_article_place_relations_article ON article_place_relations(article_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_place ON article_place_relations(place_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_confidence ON article_place_relations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_rule_level ON article_place_relations(matching_rule_level);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_created ON article_place_relations(created_at DESC);

PRAGMA foreign_keys = ON;

-- Insert migration record
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (8, '008-fix-article-place-relations-foreign-key', datetime('now'), 'Fix foreign key to reference http_responses instead of articles');