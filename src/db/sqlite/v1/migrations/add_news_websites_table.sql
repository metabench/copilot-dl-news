-- Migration: Add news_websites table for manually curated news sites
-- 
-- This table stores news websites that can be:
-- - Full domains (theguardian.com)
-- - Subdomains (news.sky.com with parent sky.com)
-- - Path-based (bbc.com/news with parent bbc.com)

CREATE TABLE IF NOT EXISTS news_websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,           -- Full URL pattern: https://news.sky.com/ or https://bbc.com/news
  label TEXT,                          -- Display name (optional)
  parent_domain TEXT,                  -- Base domain: sky.com, bbc.com
  url_pattern TEXT NOT NULL,           -- Pattern for matching: https://news.sky.com/% or https://bbc.com/news/%
  website_type TEXT NOT NULL,          -- 'subdomain', 'path', or 'domain'
  added_at TEXT NOT NULL,              -- ISO timestamp
  added_by TEXT,                       -- User/source that added it
  enabled INTEGER DEFAULT 1,           -- 1 = active, 0 = disabled
  metadata TEXT                        -- JSON for extensibility
);

CREATE INDEX IF NOT EXISTS idx_news_websites_enabled ON news_websites(enabled);
CREATE INDEX IF NOT EXISTS idx_news_websites_parent ON news_websites(parent_domain);
CREATE INDEX IF NOT EXISTS idx_news_websites_type ON news_websites(website_type);
