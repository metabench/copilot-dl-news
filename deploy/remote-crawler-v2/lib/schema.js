'use strict';

const SCHEMA_VERSION = 4;

function initSchema(db) {
  db.exec(`
    PRAGMA user_version = ${SCHEMA_VERSION};

    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      host TEXT,
      path TEXT,
      status TEXT DEFAULT 'pending',
      http_status INTEGER,
      content_type TEXT,
      content_length INTEGER,
      title TEXT,
      word_count INTEGER,
      links_found INTEGER DEFAULT 0,
      depth INTEGER DEFAULT 0,
      discovered_from TEXT,
      classification TEXT,
      fetched_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_msg TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_urls_status ON urls(status);
    CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host);
    CREATE INDEX IF NOT EXISTS idx_urls_updated ON urls(updated_at);

    CREATE TABLE IF NOT EXISTS http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      request_started_at DATETIME,
      fetched_at DATETIME,
      http_status INTEGER,
      content_type TEXT,
      content_encoding TEXT,
      redirect_chain TEXT,
      ttfb_ms INTEGER,
      download_ms INTEGER,
      total_ms INTEGER,
      bytes_downloaded INTEGER,
      transfer_kbps REAL,
      request_method TEXT DEFAULT 'GET',
      FOREIGN KEY (url_id) REFERENCES urls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_http_responses_url_id ON http_responses(url_id);
    CREATE INDEX IF NOT EXISTS idx_http_responses_fetched_at ON http_responses(fetched_at);

    CREATE TABLE IF NOT EXISTS content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER NOT NULL,
      storage_type TEXT DEFAULT 'gzip',
      content_blob BLOB,
      content_sha256 TEXT,
      uncompressed_size INTEGER,
      compressed_size INTEGER,
      compression_ratio REAL,
      content_category TEXT,
      content_subtype TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (http_response_id) REFERENCES http_responses(id)
    );

    CREATE INDEX IF NOT EXISTS idx_content_storage_response ON content_storage(http_response_id);
    CREATE INDEX IF NOT EXISTS idx_content_storage_sha ON content_storage(content_sha256);

    CREATE TABLE IF NOT EXISTS discovered_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url_id INTEGER,
      target_url TEXT,
      link_text TEXT,
      is_nav_link INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_url_id) REFERENCES urls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_discovered_links_source ON discovered_links(source_url_id);

    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_domain TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      total_fetched INTEGER DEFAULT 0,
      total_errors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS crawl_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      level TEXT,
      message TEXT,
      data TEXT,
      ts DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER,
      host TEXT,
      kind TEXT,
      code TEXT,
      message TEXT,
      at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_errors_at ON errors(at);
    CREATE INDEX IF NOT EXISTS idx_errors_host ON errors(host);

    CREATE TABLE IF NOT EXISTS crawl_wal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getSchemaVersion(db) {
  const row = db.pragma('user_version', { simple: true });
  return row || SCHEMA_VERSION;
}

module.exports = {
  SCHEMA_VERSION,
  getSchemaVersion,
  initSchema,
};
