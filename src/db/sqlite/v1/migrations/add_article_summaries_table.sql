-- Migration: Add article_summaries table for storing generated summaries
-- Phase 9 Item 2: Automatic Summarization

-- Article Summaries table (extractive summaries using TextRank)
CREATE TABLE IF NOT EXISTS article_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL,
  length_type TEXT NOT NULL CHECK(length_type IN ('brief', 'short', 'full', 'bullets')),
  summary_text TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'textrank',
  sentence_count INTEGER,
  word_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
  UNIQUE(content_id, length_type)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_article_summaries_content ON article_summaries(content_id);
CREATE INDEX IF NOT EXISTS idx_article_summaries_length_type ON article_summaries(length_type);
CREATE INDEX IF NOT EXISTS idx_article_summaries_method ON article_summaries(method);
CREATE INDEX IF NOT EXISTS idx_article_summaries_created ON article_summaries(created_at);
