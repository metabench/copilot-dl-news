-- Migration 007: Content Access Logging
-- Created: 2025-10-15
-- Purpose: Add table for tracking article access patterns to enable intelligent compression decisions

-- Content access log for intelligent compression
CREATE TABLE IF NOT EXISTS content_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,                 -- 'api', 'ui', 'background-task', etc.
  user_agent TEXT,                      -- User agent string (optional)
  ip_address TEXT,                      -- IP address (optional)
  metadata TEXT,                        -- JSON additional metadata (optional)
  FOREIGN KEY (article_id) REFERENCES urls(id) ON DELETE CASCADE
);

-- Indexes for efficient access pattern queries
CREATE INDEX IF NOT EXISTS idx_content_access_log_article ON content_access_log(article_id);
CREATE INDEX IF NOT EXISTS idx_content_access_log_accessed_at ON content_access_log(accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_access_log_source ON content_access_log(source);