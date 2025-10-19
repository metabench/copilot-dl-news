-- URL Normalization Migration Schema
-- Phase 1: Add url_id columns to denormalized tables
-- This migration adds foreign key columns alongside existing TEXT URL fields
-- for zero-downtime migration

-- Links table: Add url_id columns for src_url and dst_url
ALTER TABLE links ADD COLUMN src_url_id INTEGER REFERENCES urls(id);
ALTER TABLE links ADD COLUMN dst_url_id INTEGER REFERENCES urls(id);

-- Queue events table: Add url_id column for url field
ALTER TABLE queue_events ADD COLUMN url_id INTEGER REFERENCES urls(id);

-- Crawl jobs table: Add url_id column for url field
ALTER TABLE crawl_jobs ADD COLUMN url_id INTEGER REFERENCES urls(id);

-- Errors table: Add url_id column for url field
ALTER TABLE errors ADD COLUMN url_id INTEGER REFERENCES urls(id);

-- URL aliases table: Add url_id columns for url and alias_url fields
ALTER TABLE url_aliases ADD COLUMN url_id INTEGER REFERENCES urls(id);
ALTER TABLE url_aliases ADD COLUMN alias_url_id INTEGER REFERENCES urls(id);

-- Create temporary indexes for migration performance
-- These will be replaced with optimized indexes after migration
CREATE INDEX IF NOT EXISTS idx_links_src_url_id_temp ON links(src_url_id);
CREATE INDEX IF NOT EXISTS idx_links_dst_url_id_temp ON links(dst_url_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_url_id_temp ON queue_events(url_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_url_id_temp ON crawl_jobs(url_id);
CREATE INDEX IF NOT EXISTS idx_errors_url_id_temp ON errors(url_id);
CREATE INDEX IF NOT EXISTS idx_url_aliases_url_id_temp ON url_aliases(url_id);
CREATE INDEX IF NOT EXISTS idx_url_aliases_alias_url_id_temp ON url_aliases(alias_url_id);