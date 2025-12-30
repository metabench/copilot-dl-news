-- =============================================================================
-- init-db.sql - PostgreSQL Initialization Script
-- =============================================================================
-- Run on first container start to set up database schema
-- This script is idempotent (safe to run multiple times)
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- =============================================================================
-- Queue Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS crawl_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    domain TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    depth INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    visible_after TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    locked_by TEXT,
    locked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Queue indexes
CREATE INDEX IF NOT EXISTS idx_queue_status ON crawl_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON crawl_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_domain ON crawl_queue(domain);
CREATE INDEX IF NOT EXISTS idx_queue_visible ON crawl_queue(visible_after) WHERE status = 'pending';

-- =============================================================================
-- URLs Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS urls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    title TEXT,
    content_type TEXT,
    content_hash TEXT,
    status_code INTEGER,
    fetch_count INTEGER DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_fetched_at TIMESTAMP WITH TIME ZONE,
    last_modified_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- URL indexes
CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain);
CREATE INDEX IF NOT EXISTS idx_urls_last_fetched ON urls(last_fetched_at);
CREATE INDEX IF NOT EXISTS idx_urls_content_hash ON urls(content_hash);

-- =============================================================================
-- Fetches Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS fetches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url_id UUID REFERENCES urls(id),
    url TEXT NOT NULL,
    status_code INTEGER,
    content_type TEXT,
    content_length INTEGER,
    response_time_ms INTEGER,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    headers JSONB,
    error TEXT,
    crawler_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Fetch indexes
CREATE INDEX IF NOT EXISTS idx_fetches_url_id ON fetches(url_id);
CREATE INDEX IF NOT EXISTS idx_fetches_fetched_at ON fetches(fetched_at);
CREATE INDEX IF NOT EXISTS idx_fetches_crawler_id ON fetches(crawler_id);

-- =============================================================================
-- Task Events Table (Telemetry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS task_events (
    seq BIGSERIAL PRIMARY KEY,
    task_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    scope TEXT,
    event_type TEXT NOT NULL,
    message TEXT,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event indexes
CREATE INDEX IF NOT EXISTS idx_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_events_task_type ON task_events(task_type);
CREATE INDEX IF NOT EXISTS idx_events_category ON task_events(category);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON task_events(created_at);

-- =============================================================================
-- Crawler State Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS crawler_state (
    crawler_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'paused', 'stopping', 'stopped')),
    started_at TIMESTAMP WITH TIME ZONE,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    pages_crawled INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    current_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- Functions
-- =============================================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to queue table
DROP TRIGGER IF EXISTS trigger_queue_updated_at ON crawl_queue;
CREATE TRIGGER trigger_queue_updated_at
    BEFORE UPDATE ON crawl_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Initial Data
-- =============================================================================
-- No initial data needed - populated by crawler

-- =============================================================================
-- Grants (if using separate roles)
-- =============================================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crawler_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crawler_role;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database initialization complete';
END $$;
