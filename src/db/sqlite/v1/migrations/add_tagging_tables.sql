-- Migration: Add Content Tagging Tables
-- Date: 2025-12-26
-- Purpose: Support content categorization, keyword extraction, and entity recognition (Phase 8 Item 4)

-- Article Keywords (TF-IDF extracted)
CREATE TABLE IF NOT EXISTS article_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  score REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
  UNIQUE(content_id, keyword)
);

-- Article Categories (Rule-based classification)
CREATE TABLE IF NOT EXISTS article_categories (
  content_id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  secondary_category TEXT,
  secondary_confidence REAL,
  classified_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE
);

-- Article Entities (Named Entity Recognition)
CREATE TABLE IF NOT EXISTS article_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  entity_text TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('PERSON', 'ORG', 'GPE')),
  confidence REAL DEFAULT 1.0,
  start_offset INTEGER,
  end_offset INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
  UNIQUE(content_id, entity_text, entity_type, start_offset)
);

-- Document Frequencies (for TF-IDF calculation)
CREATE TABLE IF NOT EXISTS document_frequencies (
  term TEXT PRIMARY KEY,
  doc_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_article_keywords_content ON article_keywords(content_id);
CREATE INDEX IF NOT EXISTS idx_article_keywords_keyword ON article_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_article_keywords_score ON article_keywords(score DESC);

CREATE INDEX IF NOT EXISTS idx_article_categories_category ON article_categories(category);
CREATE INDEX IF NOT EXISTS idx_article_categories_confidence ON article_categories(confidence DESC);

CREATE INDEX IF NOT EXISTS idx_article_entities_content ON article_entities(content_id);
CREATE INDEX IF NOT EXISTS idx_article_entities_type ON article_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_article_entities_text ON article_entities(entity_text);

CREATE INDEX IF NOT EXISTS idx_document_frequencies_count ON document_frequencies(doc_count DESC);
