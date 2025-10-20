/**
 * @fileoverview SQL schema definitions
 * This file contains the actual SQL CREATE TABLE statements.
 */

'use strict';

const ALL_TABLES_SCHEMA = `
-- Links between pages
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src_url_id INTEGER REFERENCES urls(id),
    dst_url_id INTEGER REFERENCES urls(id),
    anchor TEXT,
    rel TEXT,
    type TEXT,
    depth INTEGER,
    on_domain INTEGER,
    discovered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_url_id);
CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_url_id);

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
CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host);
CREATE INDEX IF NOT EXISTS idx_urls_canonical ON urls(canonical_url);

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
  url_id INTEGER NOT NULL REFERENCES urls(id),
  alias_url_id INTEGER NOT NULL REFERENCES urls(id),
  classification TEXT,
  reason TEXT,
  url_exists INTEGER,
  checked_at TEXT,
  metadata TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_url_alias ON url_aliases(url_id, alias_url_id);

-- Crawler settings
CREATE TABLE IF NOT EXISTS crawler_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- Crawl job management
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id TEXT PRIMARY KEY,
  url_id INTEGER REFERENCES urls(id),
  args TEXT,
  pid INTEGER,
  started_at TEXT,
  ended_at TEXT,
  status TEXT,
  crawl_type_id INTEGER REFERENCES crawl_types(id)
);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_timeline ON crawl_jobs(ended_at DESC, started_at DESC);

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
  url_id INTEGER REFERENCES urls(id),
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
CREATE INDEX IF NOT EXISTS idx_queue_events_job_ts ON queue_events(job_id, ts DESC);

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
  url_id INTEGER REFERENCES urls(id),
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

-- Legacy fetches table for backward compatibility
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

-- Normalized schema tables (Phase 1)

-- HTTP Protocol Layer
CREATE TABLE IF NOT EXISTS http_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL REFERENCES urls(id),
  request_started_at TEXT NOT NULL,
  fetched_at TEXT,
  http_status INTEGER,
  content_type TEXT,
  content_encoding TEXT,
  etag TEXT,
  last_modified TEXT,
  redirect_chain TEXT,
  ttfb_ms INTEGER,
  download_ms INTEGER,
  total_ms INTEGER,
  bytes_downloaded INTEGER,
  transfer_kbps REAL
);
CREATE INDEX IF NOT EXISTS idx_http_responses_url ON http_responses(url_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_http_responses_status ON http_responses(http_status);
CREATE INDEX IF NOT EXISTS idx_http_responses_fetched ON http_responses(fetched_at);

-- Content Analysis Layer
CREATE TABLE IF NOT EXISTS content_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES content_storage(id),
  analysis_version INTEGER NOT NULL DEFAULT 1,
  classification TEXT,
  title TEXT,
  date TEXT,
  section TEXT,
  word_count INTEGER,
  language TEXT,
  article_xpath TEXT,
  nav_links_count INTEGER,
  article_links_count INTEGER,
  analysis_json TEXT,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_content_analysis_content ON content_analysis(content_id);
CREATE INDEX IF NOT EXISTS idx_content_analysis_classification ON content_analysis(classification);
CREATE INDEX IF NOT EXISTS idx_content_analysis_version ON content_analysis(analysis_version);

-- Discovery Metadata Layer
CREATE TABLE IF NOT EXISTS discovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER NOT NULL REFERENCES urls(id),
  discovered_at TEXT NOT NULL,
  referrer_url TEXT,
  crawl_depth INTEGER,
  discovery_method TEXT,
  crawl_job_id TEXT REFERENCES crawl_jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_discovery_url ON discovery_events(url_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_job ON discovery_events(crawl_job_id);
CREATE INDEX IF NOT EXISTS idx_discovery_events_url ON discovery_events(url_id);

-- Place Provenance Layer
CREATE TABLE IF NOT EXISTS place_provenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  fetched_at INTEGER,
  raw_data TEXT,
  UNIQUE(place_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_place_provenance_place ON place_provenance(place_id);
CREATE INDEX IF NOT EXISTS idx_place_provenance_source ON place_provenance(source);
CREATE INDEX IF NOT EXISTS idx_place_provenance_external ON place_provenance(external_id);

-- Place Attributes Layer
CREATE TABLE IF NOT EXISTS place_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  attribute_kind TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at INTEGER,
  confidence REAL,
  metadata TEXT,
  UNIQUE(place_id, attribute_kind, source)
);
CREATE INDEX IF NOT EXISTS idx_place_attributes_place ON place_attributes(place_id);
CREATE INDEX IF NOT EXISTS idx_place_attributes_kind ON place_attributes(attribute_kind);
CREATE INDEX IF NOT EXISTS idx_place_attributes_source ON place_attributes(source);

-- Content Storage Layer (from schema.js)
CREATE TABLE IF NOT EXISTS content_storage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_type TEXT NOT NULL,
  http_response_id INTEGER REFERENCES http_responses(id),
  compression_type_id INTEGER REFERENCES compression_types(id),
  compression_bucket_id INTEGER REFERENCES compression_buckets(id),
  bucket_entry_key TEXT,
  content_blob BLOB,
  content_sha256 TEXT,
  uncompressed_size INTEGER,
  compressed_size INTEGER,
  compression_ratio REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_content_storage_bucket ON content_storage(compression_bucket_id);
CREATE INDEX IF NOT EXISTS idx_content_storage_sha256 ON content_storage(content_sha256);
CREATE INDEX IF NOT EXISTS idx_content_storage_type ON content_storage(storage_type);
CREATE INDEX IF NOT EXISTS idx_content_storage_http_response ON content_storage(http_response_id);

-- Compression infrastructure
CREATE TABLE IF NOT EXISTS compression_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  algorithm TEXT NOT NULL,
  level INTEGER NOT NULL,
  mime_type TEXT,
  extension TEXT,
  memory_mb INTEGER NOT NULL DEFAULT 0,
  window_bits INTEGER,
  block_bits INTEGER,
  description TEXT
);

CREATE TABLE IF NOT EXISTS compression_buckets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  compression_type_id INTEGER NOT NULL REFERENCES compression_types(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_entries INTEGER NOT NULL DEFAULT 0,
  total_uncompressed_bytes INTEGER NOT NULL DEFAULT 0,
  total_compressed_bytes INTEGER NOT NULL DEFAULT 0,
  compression_ratio REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'sealed', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_compression_buckets_status ON compression_buckets(status);

CREATE TABLE IF NOT EXISTS bucket_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_id INTEGER NOT NULL REFERENCES compression_buckets(id),
  entry_key TEXT NOT NULL,
  uncompressed_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bucket_id, entry_key)
);
CREATE INDEX IF NOT EXISTS idx_bucket_entries_bucket ON bucket_entries(bucket_id);
CREATE INDEX IF NOT EXISTS idx_bucket_entries_key ON bucket_entries(entry_key);

-- Query telemetry for performance monitoring
CREATE TABLE IF NOT EXISTS query_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  result_count INTEGER DEFAULT 0,
  query_complexity TEXT DEFAULT 'simple',
  host TEXT,
  job_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_query_telemetry_type ON query_telemetry(query_type);
CREATE INDEX IF NOT EXISTS idx_query_telemetry_operation ON query_telemetry(operation);
CREATE INDEX IF NOT EXISTS idx_query_telemetry_created ON query_telemetry(created_at);

-- Legacy compatibility table for latest_fetch (maintained by triggers)
CREATE TABLE IF NOT EXISTS latest_fetch (
  url TEXT PRIMARY KEY,
  ts TEXT,
  http_status INTEGER,
  classification TEXT,
  word_count INTEGER
);
CREATE INDEX IF NOT EXISTS idx_latest_fetch_classification ON latest_fetch(classification);
CREATE INDEX IF NOT EXISTS idx_latest_fetch_status ON latest_fetch(http_status);

`;

module.exports = { ALL_TABLES_SCHEMA };
