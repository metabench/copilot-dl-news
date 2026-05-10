-- Migration: Add article-place matching system with confidence scoring
-- Version: 008
-- Description: Multi-layered article-place relationship matching with rule versioning

-- Article-Place Relationship Matching System
-- Supports multi-layered matching with confidence scoring and rule versioning

CREATE TABLE IF NOT EXISTS article_place_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,           -- References content_storage.id (the article)
  place_id INTEGER NOT NULL,             -- References places.id
  matching_rule_level INTEGER NOT NULL DEFAULT 0,  -- 0=none, 1=basic, 2=intermediate, 3=advanced
  confidence_score REAL NOT NULL,        -- 0.0 to 1.0 confidence in the match
  match_method TEXT NOT NULL,            -- 'exact_string', 'fuzzy_match', 'nlp_entity', 'context_analysis', etc.
  match_details TEXT,                    -- JSON with matching details (positions, context, etc.)
  evidence TEXT,                         -- What evidence led to this match
  false_positive_likelihood REAL DEFAULT 0.0, -- Estimated false positive probability
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (content_id) REFERENCES content_storage(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_article_place_matches_content ON article_place_matches(content_id);
CREATE INDEX IF NOT EXISTS idx_article_place_matches_place ON article_place_matches(place_id);
CREATE INDEX IF NOT EXISTS idx_article_place_matches_confidence ON article_place_matches(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_article_place_matches_rule_level ON article_place_matches(matching_rule_level);
CREATE INDEX IF NOT EXISTS idx_article_place_matches_method ON article_place_matches(match_method);

-- Track matching rule applications for audit trail
CREATE TABLE IF NOT EXISTS article_matching_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  rule_level INTEGER NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  matches_found INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  error_message TEXT,
  FOREIGN KEY (content_id) REFERENCES content_storage(id) ON DELETE CASCADE
);

-- Gazetteer place names for fast matching (materialized view of place names)
CREATE TABLE IF NOT EXISTS place_name_lookup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,         -- Lowercase, diacritics removed
  name_length INTEGER NOT NULL,          -- For prioritizing longer matches
  language TEXT,                         -- BCP-47 language tag
  is_canonical INTEGER DEFAULT 0,        -- 1 if this is the canonical name
  population_rank INTEGER,               -- For prioritizing populous places
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_place_name_lookup_normalized ON place_name_lookup(normalized_name);
CREATE INDEX IF NOT EXISTS idx_place_name_lookup_place ON place_name_lookup(place_id);
CREATE INDEX IF NOT EXISTS idx_place_name_lookup_length ON place_name_lookup(name_length DESC);
CREATE INDEX IF NOT EXISTS idx_place_name_lookup_population ON place_name_lookup(population_rank);

-- Configuration for matching rules
CREATE TABLE IF NOT EXISTS matching_rule_configs (
  rule_level INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  min_confidence REAL DEFAULT 0.0,
  max_false_positive_rate REAL DEFAULT 1.0,
  config_json TEXT,                      -- JSON configuration for the rule
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default rule configurations
INSERT OR IGNORE INTO matching_rule_configs (rule_level, name, description, min_confidence, max_false_positive_rate, config_json) VALUES
(0, 'No Matching', 'No place matching applied', 0.0, 1.0, '{}'),
(1, 'Basic String Match', 'Simple exact and fuzzy string matching', 0.3, 0.7, '{"exact_match_boost": 1.0, "fuzzy_match_boost": 0.8, "min_name_length": 3}'),
(2, 'Context Analysis', 'String matching with context and frequency analysis', 0.5, 0.4, '{"require_context": true, "frequency_boost": true, "position_weighting": true}'),
(3, 'NLP Enhanced', 'NLP-based entity recognition with disambiguation', 0.7, 0.2, '{"nlp_model": "wink-nlp", "entity_linking": true, "disambiguation": true}');