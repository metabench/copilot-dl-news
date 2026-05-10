-- Migration: Add favicon storage to news_websites table
-- 
-- Adds columns to store favicon data directly in the table:
-- - favicon_data: Base64-encoded image data (data URL format)
-- - favicon_content_type: MIME type of the favicon (image/png, image/x-icon, etc.)
-- - favicon_updated_at: When the favicon was last fetched
-- - favicon_fetch_error: Error message if fetch failed (NULL if OK)

ALTER TABLE news_websites ADD COLUMN favicon_data TEXT;
ALTER TABLE news_websites ADD COLUMN favicon_content_type TEXT;
ALTER TABLE news_websites ADD COLUMN favicon_updated_at TEXT;
ALTER TABLE news_websites ADD COLUMN favicon_fetch_error TEXT;

CREATE INDEX IF NOT EXISTS idx_news_websites_favicon_updated ON news_websites(favicon_updated_at);
