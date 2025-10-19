-- Article-Place Relationship Matching System
-- Supports multi-layered matching with confidence scoring and rule versioning

CREATE TABLE article_place_matches (
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
CREATE INDEX idx_article_place_matches_content ON article_place_matches(content_id);
CREATE INDEX idx_article_place_matches_place ON article_place_matches(place_id);
CREATE INDEX idx_article_place_matches_confidence ON article_place_matches(confidence_score DESC);
CREATE INDEX idx_article_place_matches_rule_level ON article_place_matches(matching_rule_level);
CREATE INDEX idx_article_place_matches_method ON article_place_matches(match_method);

-- Track matching rule applications for audit trail
CREATE TABLE article_matching_runs (
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
CREATE TABLE place_name_lookup (
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

CREATE INDEX idx_place_name_lookup_normalized ON place_name_lookup(normalized_name);
CREATE INDEX idx_place_name_lookup_place ON place_name_lookup(place_id);
CREATE INDEX idx_place_name_lookup_length ON place_name_lookup(name_length DESC);
CREATE INDEX idx_place_name_lookup_population ON place_name_lookup(population_rank);

-- Configuration for matching rules
CREATE TABLE matching_rule_configs (
  rule_level INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  min_confidence REAL DEFAULT 0.0,
  max_false_positive_rate REAL DEFAULT 1.0,
  config_json TEXT,                      -- JSON configuration for the rule
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);