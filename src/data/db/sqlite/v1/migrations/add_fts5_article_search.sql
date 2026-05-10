-- Migration: Add FTS5 full-text search for articles
-- This migration adds:
--   1. body_text, byline, authors columns to content_analysis
--   2. articles_fts FTS5 virtual table for full-text search
--   3. Triggers to keep FTS index in sync

-- Step 1: Add new columns to content_analysis
ALTER TABLE content_analysis ADD COLUMN body_text TEXT;
ALTER TABLE content_analysis ADD COLUMN byline TEXT;
ALTER TABLE content_analysis ADD COLUMN authors TEXT; -- JSON array of author names

-- Step 2: Create FTS5 virtual table (contentless to avoid data duplication)
-- We use content='' for contentless FTS, but need explicit content sync
-- Tokenizer: porter for stemming + unicode61 for unicode normalization
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  body_text,
  byline,
  authors,
  content='content_analysis',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Step 3: Create triggers to keep FTS index in sync
-- Insert trigger: add new rows to FTS index
CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON content_analysis
BEGIN
  INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
  VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
END;

-- Update trigger: update FTS index when content_analysis changes
CREATE TRIGGER IF NOT EXISTS articles_fts_update AFTER UPDATE ON content_analysis
BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
  VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
  INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
  VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
END;

-- Delete trigger: remove deleted rows from FTS index
CREATE TRIGGER IF NOT EXISTS articles_fts_delete AFTER DELETE ON content_analysis
BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
  VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
END;

-- Step 4: Create indexes for faceted filtering
CREATE INDEX IF NOT EXISTS idx_content_analysis_date ON content_analysis(date);
CREATE INDEX IF NOT EXISTS idx_content_analysis_byline ON content_analysis(byline);
CREATE INDEX IF NOT EXISTS idx_content_analysis_analyzed_at ON content_analysis(analyzed_at);
