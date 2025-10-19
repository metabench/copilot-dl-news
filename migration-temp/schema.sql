CREATE INDEX idx_articles_canonical ON articles(canonical_url);

CREATE INDEX idx_articles_date ON articles(date);

CREATE INDEX idx_articles_fetched_at ON articles(fetched_at);

CREATE INDEX idx_articles_host ON articles(host);

CREATE INDEX idx_articles_section ON articles(section);

CREATE INDEX idx_articles_url ON articles(url);

CREATE INDEX idx_background_tasks_created ON background_tasks(created_at DESC);

CREATE INDEX idx_background_tasks_status ON background_tasks(status);

CREATE INDEX idx_background_tasks_type ON background_tasks(task_type);

CREATE INDEX idx_compression_buckets_domain 
      ON compression_buckets(domain_pattern);

CREATE INDEX idx_compression_buckets_finalized 
      ON compression_buckets(finalized_at);

CREATE INDEX idx_compression_buckets_type 
      ON compression_buckets(bucket_type);

CREATE INDEX idx_content_storage_bucket 
      ON content_storage(compression_bucket_id);

CREATE INDEX idx_content_storage_sha256 
      ON content_storage(content_sha256);

CREATE INDEX idx_content_storage_type 
      ON content_storage(storage_type);

CREATE INDEX idx_content_access_log_article 
      ON content_access_log(article_id);

CREATE INDEX idx_content_access_log_accessed_at 
      ON content_access_log(accessed_at DESC);

CREATE INDEX idx_content_access_log_source 
      ON content_access_log(source);

CREATE INDEX idx_crawl_jobs_timeline ON crawl_jobs(ended_at DESC, started_at DESC);

CREATE INDEX idx_crawl_milestones_job ON crawl_milestones(job_id);

CREATE INDEX idx_crawl_problems_job ON crawl_problems(job_id);

CREATE INDEX idx_crawl_skip_terms_reason ON crawl_skip_terms(reason);

CREATE INDEX idx_crawl_state_stage ON gazetteer_crawl_state(stage);

CREATE INDEX idx_crawl_state_status ON gazetteer_crawl_state(status);

CREATE INDEX idx_crawl_tasks_job_status ON crawl_tasks(job_id, status);

CREATE INDEX idx_fetches_classification ON fetches(classification);

CREATE INDEX idx_fetches_host ON fetches(host);

CREATE INDEX idx_fetches_status ON fetches(http_status);

CREATE INDEX idx_fetches_url ON fetches(url);

CREATE INDEX idx_ingestion_runs_completed ON ingestion_runs(completed_at);

CREATE INDEX idx_ingestion_runs_source_status ON ingestion_runs(source, status);

CREATE INDEX idx_latest_fetch_classification ON latest_fetch(classification);

CREATE INDEX idx_latest_fetch_status ON latest_fetch(http_status);

CREATE INDEX idx_links_dst ON links(dst_url);

CREATE INDEX idx_links_src ON links(src_url);

CREATE INDEX idx_place_attr_attr ON place_attribute_values(attr);

CREATE INDEX idx_place_attr_source ON place_attribute_values(source);

CREATE INDEX idx_place_external_place ON place_external_ids(place_id);

CREATE INDEX idx_place_hierarchy_child ON place_hierarchy(child_id);

CREATE INDEX idx_place_hierarchy_parent ON place_hierarchy(parent_id);

CREATE INDEX idx_place_hierarchy_relation ON place_hierarchy(relation);

CREATE INDEX idx_place_hubs_host ON place_hubs(host);

CREATE INDEX idx_place_hubs_place ON place_hubs(place_slug);

CREATE INDEX idx_place_hubs_topic ON place_hubs(topic_slug);

CREATE INDEX idx_place_names_lang ON place_names(lang);

CREATE INDEX idx_place_names_name ON place_names(name);

CREATE INDEX idx_place_names_norm ON place_names(normalized);

CREATE INDEX idx_place_names_place ON place_names(place_id);

CREATE INDEX idx_places_adm1 ON places(adm1_code);

CREATE INDEX idx_places_adm2 ON places(adm2_code);

CREATE INDEX idx_places_canonical_name ON places(canonical_name_id);

CREATE INDEX idx_places_country ON places(country_code);

CREATE INDEX idx_places_crawl_depth ON places(crawl_depth);

CREATE INDEX idx_places_kind ON places(kind);

CREATE INDEX idx_places_kind_country ON places(kind, country_code);

CREATE INDEX idx_places_osm ON places(osm_type, osm_id);

CREATE INDEX idx_places_population ON places(population);

CREATE INDEX idx_places_priority_score ON places(priority_score);

CREATE INDEX idx_places_status ON places(status);

CREATE INDEX idx_places_wikidata_qid ON places(wikidata_qid);

CREATE INDEX idx_planner_stage_events_job ON planner_stage_events(job_id);

CREATE INDEX idx_query_telemetry_complexity ON query_telemetry(query_complexity);

CREATE INDEX idx_query_telemetry_duration ON query_telemetry(duration_ms);

CREATE INDEX idx_query_telemetry_host ON query_telemetry(host);

CREATE INDEX idx_query_telemetry_type ON query_telemetry(query_type);

CREATE INDEX idx_queue_events_job ON queue_events(job_id);

CREATE INDEX idx_queue_events_job_ts ON queue_events(job_id, ts DESC);

CREATE INDEX idx_topic_keywords_lang ON topic_keywords(lang);

CREATE INDEX idx_unknown_terms_host ON place_hub_unknown_terms(host);

CREATE INDEX idx_unknown_terms_slug ON place_hub_unknown_terms(term_slug);

CREATE INDEX idx_urls_host ON urls(host);

CREATE UNIQUE INDEX uniq_country_places ON places(country_code) WHERE kind='country' AND country_code IS NOT NULL;

CREATE UNIQUE INDEX uniq_crawl_skip_terms ON crawl_skip_terms(lang, normalized);

CREATE UNIQUE INDEX uniq_place_names ON place_names(place_id, normalized, lang, name_kind);

CREATE UNIQUE INDEX uniq_place_sources ON place_sources(name, version, url, license);

CREATE UNIQUE INDEX uniq_region_places ON places(country_code, adm1_code) WHERE kind='region' AND country_code IS NOT NULL AND adm1_code IS NOT NULL;

CREATE UNIQUE INDEX uniq_topic_keywords ON topic_keywords(topic, lang, normalized);

CREATE UNIQUE INDEX uniq_url_alias ON url_aliases(url, alias_url);

CREATE TABLE articles (
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

CREATE TABLE background_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'resuming', 'running', 'paused', 'completed', 'failed', 'cancelled')),
      progress_current INTEGER DEFAULT 0,
      progress_total INTEGER DEFAULT 0,
      progress_message TEXT,
      config TEXT, -- JSON configuration
      metadata TEXT, -- JSON metadata
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      resume_started_at TEXT
    );

CREATE TABLE compression_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_type TEXT NOT NULL,
      domain_pattern TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finalized_at TEXT,
      content_count INTEGER DEFAULT 0,
      uncompressed_size INTEGER DEFAULT 0,
      compressed_size INTEGER DEFAULT 0,
      compression_ratio REAL,
      compression_type_id INTEGER REFERENCES compression_types(id),
      bucket_blob BLOB,
      index_json TEXT
    );

CREATE TABLE compression_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      algorithm TEXT NOT NULL,
      level INTEGER NOT NULL,
      mime_type TEXT,
      extension TEXT,
      memory_mb INTEGER DEFAULT 0,
      window_bits INTEGER,
      block_bits INTEGER,
      description TEXT
    );

CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      storage_type TEXT NOT NULL,
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

CREATE TABLE content_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      source TEXT NOT NULL,                 -- 'api', 'ui', 'background-task', etc.
      user_agent TEXT,                      -- User agent string (optional)
      ip_address TEXT,                      -- IP address (optional)
      metadata TEXT,                        -- JSON additional metadata (optional)
      FOREIGN KEY (article_id) REFERENCES urls(id) ON DELETE CASCADE
    );

CREATE TABLE crawl_jobs (
  id TEXT PRIMARY KEY,
  url TEXT,
  args TEXT,
  pid INTEGER,
  started_at TEXT,
  ended_at TEXT,
  status TEXT,
  crawl_type_id INTEGER REFERENCES crawl_types(id)
);

CREATE TABLE crawl_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  kind TEXT,
  scope TEXT,
  target TEXT,
  message TEXT,
  details TEXT
);

CREATE TABLE crawl_problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  kind TEXT,
  scope TEXT,
  target TEXT,
  message TEXT,
  details TEXT
);

CREATE TABLE crawl_skip_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      reason TEXT,
      source TEXT,
      metadata JSON
    );

CREATE TABLE crawl_tasks (
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

CREATE TABLE crawl_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  declaration TEXT
);

CREATE TABLE crawler_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE domain_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE domain_category_map (
    domain_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (domain_id, category_id),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES domain_categories(id) ON DELETE CASCADE
);

CREATE TABLE domain_locales (
      host TEXT PRIMARY KEY,
      country_code TEXT,
      primary_langs TEXT,                  -- CSV or JSON of language tags
      confidence REAL,
      source TEXT,
      updated_at TEXT
    );

CREATE TABLE domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT UNIQUE NOT NULL,
    tld TEXT,
    created_at TEXT,
    last_seen_at TEXT,
    analysis TEXT
);

CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT,
  host TEXT,
  kind TEXT,
  code INTEGER,
  message TEXT,
  details TEXT,
  at TEXT
);

CREATE TABLE fetches (
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

CREATE TABLE gazetteer_crawl_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage TEXT NOT NULL,                 -- countries | adm1 | adm2 | cities | osm_boundaries
      status TEXT NOT NULL,                -- pending | in_progress | completed | failed
      started_at INTEGER,
      completed_at INTEGER,
      records_total INTEGER DEFAULT 0,
      records_processed INTEGER DEFAULT 0,
      records_upserted INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      error_message TEXT,
      metadata JSON
    );

CREATE TABLE ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,                -- Source name (restcountries, wikidata, osm, etc.)
      source_version TEXT,                 -- Source version (v3.1, latest, etc.)
      started_at INTEGER NOT NULL,         -- Unix timestamp
      completed_at INTEGER,                -- Unix timestamp
      status TEXT DEFAULT 'running',       -- running | completed | failed
      countries_processed INTEGER,
      places_created INTEGER,
      places_updated INTEGER,
      names_added INTEGER,
      error_message TEXT,
      metadata JSON                        -- Additional run metadata
    );

CREATE TABLE latest_fetch (
    url TEXT PRIMARY KEY,
    ts TEXT,
    http_status INTEGER,
    classification TEXT,
    word_count INTEGER
);

CREATE TABLE links (
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

CREATE TABLE news_websites (
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

CREATE TABLE news_websites_stats_cache (
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

CREATE TABLE page_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE page_category_map (
    fetch_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (fetch_id, category_id),
    FOREIGN KEY (fetch_id) REFERENCES fetches(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES page_categories(id) ON DELETE CASCADE
);

CREATE TABLE place_attribute_values (
      place_id INTEGER NOT NULL,
      attr TEXT NOT NULL,
      source TEXT NOT NULL,
      value_json TEXT,
      confidence REAL,
      fetched_at INTEGER,
      metadata JSON,
      PRIMARY KEY (place_id, attr, source),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE TABLE place_external_ids (
      source TEXT NOT NULL,
      ext_id TEXT NOT NULL,
      place_id INTEGER NOT NULL,
      PRIMARY KEY (source, ext_id),
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE TABLE place_hierarchy (
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      relation TEXT,                       -- admin_parent | contains | member_of | capital_of
      depth INTEGER,
      metadata JSON,                       -- Optional metadata (e.g., for capital_of: { role: 'administrative' })
      PRIMARY KEY (parent_id, child_id, relation),
      FOREIGN KEY (parent_id) REFERENCES places(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE TABLE place_hub_unknown_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL,
        url TEXT NOT NULL,
        canonical_url TEXT,
        term_slug TEXT NOT NULL,
        term_label TEXT,
        source TEXT,
        reason TEXT,
        confidence TEXT,
        evidence TEXT,
        occurrences INTEGER NOT NULL DEFAULT 1,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(host, canonical_url, term_slug)
      );

CREATE TABLE place_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      place_slug TEXT,
      place_kind TEXT,
      topic_slug TEXT,
      topic_label TEXT,
      topic_kind TEXT,
      title TEXT,
      first_seen_at TEXT,
      last_seen_at TEXT,
      nav_links_count INTEGER,
      article_links_count INTEGER,
      evidence TEXT
    );

CREATE TABLE place_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized TEXT,                     -- lowercased/diacritics-free for matching
      lang TEXT,                           -- BCP-47 (e.g., en, fr, zh-Hans)
      script TEXT,                         -- optional ISO 15924
      name_kind TEXT,                      -- endonym | exonym | alias | abbrev | official | common | demonym
      is_preferred INTEGER,                -- 0/1
      is_official INTEGER,                 -- 0/1
      source TEXT,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

CREATE TABLE place_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      version TEXT,
      url TEXT,
      license TEXT
    );

CREATE TABLE places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                  -- country | region | city | poi | supranational
      country_code TEXT,                   -- ISO-3166 alpha-2 when applicable
      adm1_code TEXT,                      -- first-level admin code when applicable
      adm2_code TEXT,                      -- second-level admin code when applicable
      population INTEGER,
      timezone TEXT,
      lat REAL,
      lng REAL,
      bbox TEXT,                           -- JSON [west,south,east,north] when available
      canonical_name_id INTEGER,           -- references place_names.id (optional)
      source TEXT,                         -- provenance (e.g., restcountries@v3)
      extra JSON,                          -- JSON blob for source-specific data
      wikidata_qid TEXT,                   -- Wikidata QID (e.g., Q30 for USA)
      osm_type TEXT,                       -- OpenStreetMap type (node, way, relation)
      osm_id TEXT,                         -- OpenStreetMap ID
      area REAL,                           -- Area in square kilometers
      gdp_usd REAL,                        -- GDP in USD (for countries/regions)
  wikidata_admin_level INTEGER,        -- Wikidata administrative level (P2959)
      wikidata_props JSON,                 -- Comprehensive Wikidata properties
      osm_tags JSON,                       -- OpenStreetMap tags
      crawl_depth INTEGER DEFAULT 0,       -- 0=country, 1=ADM1, 2=ADM2, 3=city
      priority_score REAL,                 -- For breadth-first scheduling
      last_crawled_at INTEGER              -- Timestamp of last data fetch
    , status TEXT DEFAULT 'current', valid_from TEXT, valid_to TEXT);

CREATE TABLE planner_stage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  ts TEXT,
  stage TEXT,
  status TEXT,
  sequence INTEGER,
  duration_ms REAL,
  details TEXT
);

CREATE TABLE query_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_type TEXT NOT NULL,           -- e.g., 'fetch_articles', 'lookup_place', 'analyze_domain'
      operation TEXT NOT NULL,            -- e.g., 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
      duration_ms REAL NOT NULL,          -- Query execution time in milliseconds
      result_count INTEGER DEFAULT 0,     -- Number of rows returned or affected
      query_complexity TEXT,              -- 'simple' | 'moderate' | 'complex' (based on query structure)
      host TEXT,                          -- Domain being queried (if applicable)
      job_id TEXT                         -- Crawl job ID (if applicable)
    );

CREATE TABLE queue_events (
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

CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      description TEXT,
      rollback_sql TEXT
    );

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE topic_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      lang TEXT NOT NULL,
      term TEXT NOT NULL,
      normalized TEXT NOT NULL,
      source TEXT,
      metadata JSON
    );

CREATE TABLE url_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  alias_url TEXT NOT NULL,
  classification TEXT,
  reason TEXT,
  url_exists INTEGER,
  checked_at TEXT,
  metadata TEXT
);

CREATE TABLE url_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE url_category_map (
    url_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (url_id, category_id),
    FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES url_categories(id) ON DELETE CASCADE
);

CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    canonical_url TEXT,
    created_at TEXT,
    last_seen_at TEXT,
    analysis TEXT,
    host TEXT
);

CREATE TRIGGER trg_latest_fetch_upsert
    AFTER INSERT ON fetches
    BEGIN
      INSERT INTO latest_fetch(url, ts, http_status, classification, word_count)
      VALUES (NEW.url, COALESCE(NEW.fetched_at, NEW.request_started_at), NEW.http_status, NEW.classification, NEW.word_count)
      ON CONFLICT(url) DO UPDATE SET
        ts = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) > COALESCE(latest_fetch.ts, '') THEN COALESCE(NEW.fetched_at, NEW.request_started_at) ELSE latest_fetch.ts END,
        http_status = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.http_status ELSE latest_fetch.http_status END,
        classification = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.classification ELSE latest_fetch.classification END,
        word_count = CASE WHEN COALESCE(NEW.fetched_at, NEW.request_started_at) >= COALESCE(latest_fetch.ts, '') THEN NEW.word_count ELSE latest_fetch.word_count END;
    END;

CREATE TRIGGER trg_place_hierarchy_no_cycle_ins
      BEFORE INSERT ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy insertion would create a cycle'); END;

CREATE TRIGGER trg_place_hierarchy_no_cycle_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN EXISTS (
        WITH RECURSIVE reach(parent, child) AS (
          SELECT parent_id, child_id FROM place_hierarchy
          UNION ALL
          SELECT ph.parent_id, reach.child FROM place_hierarchy ph JOIN reach ON ph.child_id = reach.parent
        )
        SELECT 1 FROM reach WHERE parent = NEW.child_id AND child = NEW.parent_id
      )
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy update would create a cycle'); END;

CREATE TRIGGER trg_place_hierarchy_no_self_ins
      BEFORE INSERT ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;

CREATE TRIGGER trg_place_hierarchy_no_self_upd
      BEFORE UPDATE ON place_hierarchy
      WHEN NEW.parent_id = NEW.child_id
      BEGIN SELECT RAISE(ABORT, 'place_hierarchy parent_id equals child_id'); END;

CREATE TRIGGER trg_place_names_delete_clear_canonical
      AFTER DELETE ON place_names
      BEGIN
        UPDATE places SET canonical_name_id = NULL WHERE canonical_name_id = OLD.id;
      END;

CREATE TRIGGER trg_place_names_nonempty_ins
      BEFORE INSERT ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;

CREATE TRIGGER trg_place_names_nonempty_upd
      BEFORE UPDATE ON place_names
      WHEN TRIM(NEW.name) = ''
      BEGIN SELECT RAISE(ABORT, 'place_names.name must be non-empty'); END;

CREATE TRIGGER trg_places_canon_ins
      AFTER INSERT ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;

CREATE TRIGGER trg_places_canon_upd
      AFTER UPDATE ON places
      WHEN NEW.canonical_name_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM place_names pn WHERE pn.id = NEW.canonical_name_id AND pn.place_id = NEW.id
      )
      BEGIN SELECT RAISE(ABORT, 'places.canonical_name_id must reference a name belonging to this place'); END;

CREATE TRIGGER trg_places_country_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;

CREATE TRIGGER trg_places_country_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='country' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR LENGTH(TRIM(NEW.country_code)) <> 2)
      BEGIN SELECT RAISE(ABORT, 'current country rows require 2-letter country_code'); END;

CREATE TRIGGER trg_places_country_upper_ins
      BEFORE INSERT ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;

CREATE TRIGGER trg_places_country_upper_upd
      BEFORE UPDATE ON places
      WHEN NEW.country_code IS NOT NULL AND NEW.country_code <> UPPER(NEW.country_code)
      BEGIN SELECT RAISE(ABORT, 'places.country_code must be uppercase'); END;

CREATE TRIGGER trg_places_kind_check_ins
      BEFORE INSERT ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;

CREATE TRIGGER trg_places_kind_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind NOT IN ('country','region','city','poi','supranational')
      BEGIN SELECT RAISE(ABORT, 'places.kind invalid'); END;

CREATE TRIGGER trg_places_latlng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;

CREATE TRIGGER trg_places_latlng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lat IS NOT NULL AND (NEW.lat < -90 OR NEW.lat > 90)
      BEGIN SELECT RAISE(ABORT, 'places.lat out of range'); END;

CREATE TRIGGER trg_places_lng_check_ins
      BEFORE INSERT ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;

CREATE TRIGGER trg_places_lng_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.lng IS NOT NULL AND (NEW.lng < -180 OR NEW.lng > 180)
      BEGIN SELECT RAISE(ABORT, 'places.lng out of range'); END;

CREATE TRIGGER trg_places_population_check_ins
      BEFORE INSERT ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;

CREATE TRIGGER trg_places_population_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.population IS NOT NULL AND NEW.population < 0
      BEGIN SELECT RAISE(ABORT, 'places.population must be >= 0'); END;

CREATE TRIGGER trg_places_region_require_ins
      BEFORE INSERT ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;

CREATE TRIGGER trg_places_region_require_upd
      BEFORE UPDATE ON places
      WHEN NEW.kind='region' AND COALESCE(NEW.status,'current') <> 'historical' AND (NEW.country_code IS NULL OR TRIM(NEW.country_code) = '' OR NEW.adm1_code IS NULL OR TRIM(NEW.adm1_code) = '')
      BEGIN SELECT RAISE(ABORT, 'current region rows require country_code and adm1_code'); END;

CREATE TRIGGER trg_places_status_check_ins
      BEFORE INSERT ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;

CREATE TRIGGER trg_places_status_check_upd
      BEFORE UPDATE ON places
      WHEN NEW.status IS NOT NULL AND NEW.status NOT IN ('current','historical')
      BEGIN SELECT RAISE(ABORT, 'places.status invalid'); END;

CREATE TRIGGER trg_urls_from_fetches_insert
    AFTER INSERT ON fetches
    BEGIN
      INSERT OR IGNORE INTO urls(url, created_at, last_seen_at)
      VALUES (NEW.url, COALESCE(NEW.fetched_at, datetime('now')), COALESCE(NEW.fetched_at, datetime('now')));
      UPDATE urls SET last_seen_at = COALESCE(NEW.fetched_at, datetime('now')) WHERE url = NEW.url;
    END;