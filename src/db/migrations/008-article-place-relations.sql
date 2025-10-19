-- Article-Place Relations Migration
-- Version: 008
-- Description: Add article-place relations with confidence scoring and rule versioning

-- Create article_place_relations table
CREATE TABLE IF NOT EXISTS article_place_relations (
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_article_place_relations_article ON article_place_relations(article_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_place ON article_place_relations(place_id);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_confidence ON article_place_relations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_rule_level ON article_place_relations(matching_rule_level);
CREATE INDEX IF NOT EXISTS idx_article_place_relations_created ON article_place_relations(created_at DESC);

-- Insert migration record
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (8, '008-article-place-relations', datetime('now'), 'Add article-place relations with confidence scoring and rule versioning');