/**
 * @fileoverview SQL schema definitions
 * This file contains the actual SQL CREATE TABLE statements.
 */

'use strict';

const ALL_TABLES_SCHEMA = `
-- Main articles table
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    host TEXT,
    title TEXT,
    date TEXT,
    section TEXT,
    html TEXT,
    crawled_at TEXT NOT NULL,
    canonical_url TEXT,
    referrer_url TEXT,
    discovered_at TEXT,
    crawl_depth INTEGER,
    fetched_at TEXT,
    request_started_at TEXT,
    http_status INTEGER,
    content_type TEXT,
    content_length INTEGER,
    etag TEXT,
    last_modified TEXT,
    redirect_chain TEXT,
    ttfb_ms INTEGER,
    download_ms INTEGER,
    total_ms INTEGER,
    bytes_downloaded INTEGER,
    transfer_kbps REAL,
    html_sha256 TEXT,
    text TEXT,
    word_count INTEGER,
    language TEXT,
    article_xpath TEXT,
    analysis TEXT,
    analysis_version INTEGER,
    -- Compression related columns
    compressed_html BLOB,
    compression_type_id INTEGER,
    compression_bucket_id INTEGER,
    compression_bucket_key TEXT,
    original_size INTEGER,
    compressed_size INTEGER,
    compression_ratio REAL
);
CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
CREATE INDEX IF NOT EXISTS idx_articles_section ON articles(section);
CREATE INDEX IF NOT EXISTS idx_articles_canonical ON articles(canonical_url);
CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);

-- Fetches table for all HTTP requests
CREATE TABLE IF NOT EXISTS fetches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    request_started_at TEXT,
    fetched_at TEXT,
    http_status INTEGER,
    content_type TEXT,
    content_length INTEGER,
    content_encoding TEXT,
    bytes_downloaded INTEGER,
    transfer_kbps REAL,
    ttfb_ms INTEGER,
    download_ms INTEGER,
    total_ms INTEGER,
    saved_to_db INTEGER,
    saved_to_file INTEGER,
    file_path TEXT,
    file_size INTEGER,
    classification TEXT,
    nav_links_count INTEGER,
    article_links_count INTEGER,
    word_count INTEGER,
    analysis TEXT,
    host TEXT
);
CREATE INDEX IF NOT EXISTS idx_fetches_url ON fetches(url);
CREATE INDEX IF NOT EXISTS idx_fetches_status ON fetches(http_status);
CREATE INDEX IF NOT EXISTS idx_fetches_classification ON fetches(classification);

-- Latest fetch per URL (denormalized for performance)
CREATE TABLE IF NOT EXISTS latest_fetch (
    url TEXT PRIMARY KEY,
    ts TEXT,
    http_status INTEGER,
    classification TEXT,
    word_count INTEGER
);
CREATE INDEX IF NOT EXISTS idx_latest_fetch_classification ON latest_fetch(classification);
CREATE INDEX IF NOT EXISTS idx_latest_fetch_status ON latest_fetch(http_status);

-- Links between pages
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src_url TEXT,
    dst_url TEXT,
    anchor TEXT,
    rel TEXT,
    type TEXT,
    depth INTEGER,
    on_domain INTEGER,
    discovered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_url);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_url);

-- URL metadata
CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    created_at TEXT,
    last_seen_at TEXT,
    analysis TEXT,
    host TEXT
);

-- Domain metadata
CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT UNIQUE NOT NULL,
    tld TEXT,
    created_at TEXT,
    last_seen_at TEXT,
    analysis TEXT
);

-- Categorization tables
CREATE TABLE IF NOT EXISTS domain_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS domain_category_map (
    domain_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (domain_id, category_id),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES domain_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS url_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS url_category_map (
    url_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (url_id, category_id),
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES url_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS page_category_map (
    fetch_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (fetch_id, category_id),
    FOREIGN KEY (fetch_id) REFERENCES fetches(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES page_categories(id) ON DELETE CASCADE
);

-- URL Aliases
CREATE TABLE IF NOT EXISTS url_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  alias_url TEXT NOT NULL,
  classification TEXT,
  reason TEXT,
  url_exists INTEGER,
  checked_at TEXT,
  metadata TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_url_alias ON url_aliases(url, alias_url);

-- Crawler settings
CREATE TABLE IF NOT EXISTS crawler_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- Crawl job management
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id TEXT PRIMARY KEY,
  url TEXT,
  args TEXT,
  pid INTEGER,
  started_at TEXT,
  ended_at TEXT,
  status TEXT,
  crawl_type_id INTEGER REFERENCES crawl_types(id)
);

CREATE TABLE IF NOT EXISTS crawl_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  declaration TEXT
);

-- Crawl telemetry
CREATE TABLE IF NOT EXISTS queue_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  action TEXT,
  url TEXT,
  depth INTEGER,
  host TEXT,
  reason TEXT,
  queue_size INTEGER,
  alias TEXT,
  queue_origin TEXT,
  queue_role TEXT,
  queue_depth_bucket TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_events_job ON queue_events(job_id);

CREATE TABLE IF NOT EXISTS crawl_problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  kind TEXT,
  scope TEXT,
  target TEXT,
  message TEXT,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_crawl_problems_job ON crawl_problems(job_id);

CREATE TABLE IF NOT EXISTS crawl_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  kind TEXT,
  scope TEXT,
  target TEXT,
  message TEXT,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_crawl_milestones_job ON crawl_milestones(job_id);

CREATE TABLE IF NOT EXISTS planner_stage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  stage TEXT,
  status TEXT,
  sequence INTEGER,
  duration_ms REAL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_planner_stage_events_job ON planner_stage_events(job_id);

-- Crawl task queue
CREATE TABLE IF NOT EXISTS crawl_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  host TEXT,
  kind TEXT,
  status TEXT,
  url TEXT,
  payload TEXT,
  note TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_crawl_tasks_job_status ON crawl_tasks(job_id, status);

-- Error logging
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT,
  host TEXT,
  kind TEXT,
  code INTEGER,
  message TEXT,
  details TEXT,
  at TEXT
);

-- News websites registry
CREATE TABLE IF NOT EXISTS news_websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  label TEXT,
  parent_domain TEXT NOT NULL,
  url_pattern TEXT NOT NULL,
  website_type TEXT NOT NULL,
  added_at TEXT NOT NULL,
  added_by TEXT,
  enabled INTEGER DEFAULT 1,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS news_websites_stats_cache (
  website_id INTEGER PRIMARY KEY,
  article_count INTEGER,
  fetch_count INTEGER,
  fetch_ok_count INTEGER,
  fetch_error_count INTEGER,
  fetch_last_at TEXT,
  article_latest_date TEXT,
  last_updated_at TEXT,
  FOREIGN KEY (website_id) REFERENCES news_websites(id) ON DELETE CASCADE
);
`;

module.exports = { ALL_TABLES_SCHEMA };
