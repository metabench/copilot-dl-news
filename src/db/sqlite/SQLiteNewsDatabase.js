const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { is_array, tof } = require('lang-tools');
const { ensureDb, ensureGazetteer } = require('./ensureDb');
const { Readable } = require('stream');

function slugifyCountryName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

class NewsDatabase {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath || path.join(process.cwd(), 'data', 'news.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

  // Use shared ensureDb to open and initialize
  this.db = ensureDb(this.dbFilePath);
    this._init();

  // Prepare category helpers
  this._ensureUrlCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO url_categories(name, description) VALUES (?, NULL)`);
  this._getUrlCategoryIdStmt = this.db.prepare(`SELECT id FROM url_categories WHERE name = ?`);
  this._mapUrlCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO url_category_map(url_id, category_id) VALUES (?, ?)`);
  this._getUrlIdStmt = this.db.prepare(`SELECT id FROM urls WHERE url = ?`);

  this._ensurePageCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO page_categories(name, description) VALUES (?, NULL)`);
  this._getPageCategoryIdStmt = this.db.prepare(`SELECT id FROM page_categories WHERE name = ?`);
  this._mapPageCategoryStmt = this.db.prepare(`INSERT OR IGNORE INTO page_category_map(fetch_id, category_id) VALUES (?, ?)`);

  this._selectCountryNamesStmt = this.db.prepare(`
    SELECT name FROM place_names
    WHERE id IN (
      SELECT canonical_name_id FROM places WHERE kind='country'
    )
    ORDER BY name
    LIMIT ?
  `);

  this._getSettingStmt = this.db.prepare(`SELECT value FROM crawler_settings WHERE key = ?`);
  this._setSettingStmt = this.db.prepare(`INSERT INTO crawler_settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`);
  this._insertCrawlJobStmt = this.db.prepare(`INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, status) VALUES (@id, @url, @args, @pid, @startedAt, @status)`);
  this._updateCrawlJobStmt = this.db.prepare(`UPDATE crawl_jobs SET ended_at = @endedAt, status = @status WHERE id = @id`);
  this._insertQueueEventStmt = this.db.prepare(`INSERT INTO queue_events(job_id, ts, action, url, depth, host, reason, queue_size, alias, queue_origin, queue_role, queue_depth_bucket) VALUES (@jobId, @ts, @action, @url, @depth, @host, @reason, @queueSize, @alias, @queueOrigin, @queueRole, @queueDepthBucket)`);
  this._insertProblemStmt = this.db.prepare(`INSERT INTO crawl_problems(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);
  this._insertMilestoneStmt = this.db.prepare(`INSERT INTO crawl_milestones(job_id, ts, kind, scope, target, message, details) VALUES (@jobId, @ts, @kind, @scope, @target, @message, @details)`);
  this._insertPlannerStageStmt = this.db.prepare(`INSERT INTO planner_stage_events(job_id, ts, stage, status, sequence, duration_ms, details) VALUES (@jobId, @ts, @stage, @status, @sequence, @durationMs, @details)`);
  this._countActiveTasksByJobStmt = this.db.prepare(`SELECT COUNT(*) AS c FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed')`);
  this._selectOldActiveTasksStmt = this.db.prepare(`SELECT id FROM crawl_tasks WHERE job_id = ? AND status NOT IN ('completed','failed') ORDER BY created_at ASC, id ASC LIMIT ?`);
  this._deleteTaskByIdStmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE id = ?`);
  this._insertTaskStmt = this.db.prepare(`INSERT INTO crawl_tasks (job_id, host, kind, status, url, payload, note, created_at, updated_at) VALUES (@job_id, @host, @kind, @status, @url, @payload, @note, datetime('now'), datetime('now'))`);
  this._updateTaskStatusStmt = this.db.prepare(`UPDATE crawl_tasks SET status = @status, note = COALESCE(@note, note), updated_at = datetime('now') WHERE id = @id`);
  this._clearTasksByJobStmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE job_id = ?`);
  this._getTaskByIdStmt = this.db.prepare(`SELECT id, job_id AS jobId, host, kind, status, url, payload, note, created_at AS createdAt, updated_at AS updatedAt FROM crawl_tasks WHERE id = ?`);
  }

  _init() {
    // Pragmas for safety/performance sensible defaults; allow opt-out via env
    const pragmasOff = String(process.env.SQLITE_TUNE_OFF || '0') === '1';
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  // Allow some time to wait on locks when multiple processes write concurrently
  try { this.db.pragma('busy_timeout = 5000'); } catch(_) {}
    if (!pragmasOff) {
      try { this.db.pragma('synchronous = NORMAL'); } catch(_) {}
      try { this.db.pragma('temp_store = MEMORY'); } catch(_) {}
      try { this.db.pragma('cache_size = -64000'); } catch(_) {} // ~64MB page cache for faster lookups
    }

  // Schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT,
        date TEXT,
        section TEXT,
        html TEXT,
  crawled_at TEXT NOT NULL
      );

  CREATE INDEX IF NOT EXISTS idx_articles_section ON articles(section);
  CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);

      -- Links graph: edges between pages
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        src_url TEXT NOT NULL,
        dst_url TEXT NOT NULL,
        anchor TEXT,
        rel TEXT,
        type TEXT,          -- 'nav' | 'article'
        depth INTEGER,
        on_domain INTEGER,  -- 1 if dst_url is on the same domain
        discovered_at TEXT NOT NULL,
        UNIQUE(src_url, dst_url, type)
      );
      CREATE INDEX IF NOT EXISTS idx_links_src ON links(src_url);
      CREATE INDEX IF NOT EXISTS idx_links_dst ON links(dst_url);
    `);

    // Domains and normalized categories for domains
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host TEXT NOT NULL UNIQUE,
        tld TEXT,
        created_at TEXT,
        last_seen_at TEXT,
        analysis TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_domains_host ON domains(host);
      CREATE INDEX IF NOT EXISTS idx_domains_last_seen ON domains(last_seen_at);

      CREATE TABLE IF NOT EXISTS domain_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS domain_category_map (
        domain_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (domain_id, category_id),
        FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES domain_categories(id) ON DELETE CASCADE
      );
    `);
    // Per-download fetch records
    this.db.exec(`
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
        classification TEXT, -- 'article' | 'nav' | 'other'
        nav_links_count INTEGER,
        article_links_count INTEGER,
        word_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_fetches_url ON fetches(url);
      CREATE INDEX IF NOT EXISTS idx_fetches_time ON fetches(fetched_at);
    `);

    // Errors table for HTTP/network/save failures
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        host TEXT,
        kind TEXT,           -- 'http' | 'network' | 'save' | 'other'
        code INTEGER,        -- http status or errno-like code
        message TEXT,
        details TEXT,        -- JSON or text
        at TEXT              -- ISO timestamp
      );
      CREATE INDEX IF NOT EXISTS idx_errors_time ON errors(at);
      CREATE INDEX IF NOT EXISTS idx_errors_host ON errors(host);
      CREATE INDEX IF NOT EXISTS idx_errors_kind ON errors(kind);
      CREATE INDEX IF NOT EXISTS idx_errors_code ON errors(code);
    `);

    // Materialized view of latest fetch per URL for fast filtering/sorting
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS latest_fetch (
        url TEXT PRIMARY KEY,
        ts TEXT,               -- COALESCE(fetched_at, request_started_at)
        http_status INTEGER,
        classification TEXT,
        word_count INTEGER
      );
  CREATE INDEX IF NOT EXISTS idx_latest_fetch_ts ON latest_fetch(ts);
  CREATE INDEX IF NOT EXISTS idx_latest_fetch_ts_url ON latest_fetch(ts, url);
      CREATE INDEX IF NOT EXISTS idx_latest_fetch_class ON latest_fetch(classification);
      CREATE INDEX IF NOT EXISTS idx_latest_fetch_status ON latest_fetch(http_status);
      CREATE INDEX IF NOT EXISTS idx_latest_fetch_word ON latest_fetch(word_count);
    `);

    // Normalized URLs table (create table and minimal index first)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        host TEXT,
        canonical_url TEXT,
        created_at TEXT,
        last_seen_at TEXT,
        analysis TEXT
      );
    `);
    // Always safe index on url
    try { this.db.exec(`CREATE INDEX IF NOT EXISTS idx_urls_url ON urls(url);`); } catch (_) {}
    // Ensure 'host' column exists for older DBs, then create host index
    try {
      let urlCols = this.db.prepare('PRAGMA table_info(urls)').all().map(r => r.name);
      if (!urlCols.includes('host')) {
        this.db.exec(`ALTER TABLE urls ADD COLUMN host TEXT`);
        // refresh cols
        urlCols = this.db.prepare('PRAGMA table_info(urls)').all().map(r => r.name);
      }
      // Now it's safe to create the host index
      try { this.db.exec(`CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host);`); } catch (_) {}
    } catch (_) { /* ignore migration errors */ }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS url_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        alias_url TEXT NOT NULL,
        classification TEXT,
        reason TEXT,
        "exists" INTEGER,
        checked_at TEXT NOT NULL,
        metadata TEXT,
        UNIQUE(url, alias_url)
      );
      CREATE INDEX IF NOT EXISTS idx_url_aliases_url ON url_aliases(url);
      CREATE INDEX IF NOT EXISTS idx_url_aliases_alias ON url_aliases(alias_url);
    `);

    // Category tables (normalized)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS url_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS page_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );
      -- Mapping tables (many-to-many)
      CREATE TABLE IF NOT EXISTS url_category_map (
        url_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (url_id, category_id),
        FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES url_categories(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS page_category_map (
        fetch_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        PRIMARY KEY (fetch_id, category_id),
        FOREIGN KEY (fetch_id) REFERENCES fetches(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES page_categories(id) ON DELETE CASCADE
      );
    `);

    // Optional table for "place hub" pages (location/topic hub pages)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS place_hubs (
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
      CREATE INDEX IF NOT EXISTS idx_place_hubs_host ON place_hubs(host);
      CREATE INDEX IF NOT EXISTS idx_place_hubs_place ON place_hubs(place_slug);
      CREATE INDEX IF NOT EXISTS idx_place_hubs_topic ON place_hubs(topic_slug);
    `);

    try {
      const placeHubCols = this.db.prepare('PRAGMA table_info(place_hubs)').all().map(r => r.name);
      const ensurePlaceHubCol = (name, ddl) => {
        if (!placeHubCols.includes(name)) {
          this.db.exec(`ALTER TABLE place_hubs ADD COLUMN ${name} ${ddl}`);
          placeHubCols.push(name);
        }
      };
      ensurePlaceHubCol('place_kind', 'TEXT');
      ensurePlaceHubCol('topic_slug', 'TEXT');
      ensurePlaceHubCol('topic_label', 'TEXT');
      ensurePlaceHubCol('topic_kind', 'TEXT');
    } catch (_) {}

    // Index of places mentioned in articles (normalized for fast lookups)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS article_places (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_url TEXT NOT NULL,
        place TEXT NOT NULL,
        place_kind TEXT,      -- country | region | city | other
        method TEXT,          -- gazetteer | heuristic | other
        source TEXT,          -- title | text | metadata
        offset_start INTEGER,
        offset_end INTEGER,
        context TEXT,
        first_seen_at TEXT,
        UNIQUE(article_url, place, source, offset_start, offset_end)
      );
      CREATE INDEX IF NOT EXISTS idx_article_places_place ON article_places(place);
      CREATE INDEX IF NOT EXISTS idx_article_places_url ON article_places(article_url);
    `);

    // News websites registry (manually curated news sites)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        label TEXT,
        parent_domain TEXT,
        url_pattern TEXT NOT NULL,
        website_type TEXT NOT NULL,
        added_at TEXT NOT NULL,
        added_by TEXT,
        enabled INTEGER DEFAULT 1,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_news_websites_enabled ON news_websites(enabled);
      CREATE INDEX IF NOT EXISTS idx_news_websites_parent ON news_websites(parent_domain);
      CREATE INDEX IF NOT EXISTS idx_news_websites_type ON news_websites(website_type);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id TEXT PRIMARY KEY,
        url TEXT,
        args TEXT,
        pid INTEGER,
        started_at TEXT,
        ended_at TEXT,
        status TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_active ON crawl_jobs(status, ended_at, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_started_desc ON crawl_jobs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_end_started_desc ON crawl_jobs(ended_at, started_at DESC);
    `);
    try {
      const crawlJobCols = this.db.prepare('PRAGMA table_info(crawl_jobs)').all().map((r) => r.name);
      if (!crawlJobCols.includes('pid')) {
        this.db.exec('ALTER TABLE crawl_jobs ADD COLUMN pid INTEGER');
      }
      if (!crawlJobCols.includes('args')) {
        this.db.exec('ALTER TABLE crawl_jobs ADD COLUMN args TEXT');
      }
      if (!crawlJobCols.includes('started_at')) {
        this.db.exec('ALTER TABLE crawl_jobs ADD COLUMN started_at TEXT');
      }
      if (!crawlJobCols.includes('ended_at')) {
        this.db.exec('ALTER TABLE crawl_jobs ADD COLUMN ended_at TEXT');
      }
      if (!crawlJobCols.includes('status')) {
        this.db.exec("ALTER TABLE crawl_jobs ADD COLUMN status TEXT");
      }
    } catch (_) {}
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_crawl_jobs_sort_key ON crawl_jobs((COALESCE(ended_at, started_at)) DESC);`);
    } catch (_) {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        action TEXT NOT NULL,
        url TEXT,
        depth INTEGER,
        host TEXT,
        reason TEXT,
        queue_size INTEGER,
        alias TEXT,
        queue_origin TEXT,
        queue_role TEXT,
        queue_depth_bucket TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_queue_events_job_ts ON queue_events(job_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_queue_events_job_id_desc ON queue_events(job_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_queue_events_job_action_id_desc ON queue_events(job_id, action, id DESC);
      CREATE INDEX IF NOT EXISTS idx_queue_events_action ON queue_events(action);
      CREATE INDEX IF NOT EXISTS idx_queue_events_host ON queue_events(host);
    `);

    try {
      const queueCols = this.db.prepare('PRAGMA table_info(queue_events)').all().map((r) => r.name);
      if (!queueCols.includes('alias')) {
        this.db.exec('ALTER TABLE queue_events ADD COLUMN alias TEXT');
      }
      if (!queueCols.includes('queue_origin')) {
        this.db.exec('ALTER TABLE queue_events ADD COLUMN queue_origin TEXT');
      }
      if (!queueCols.includes('queue_role')) {
        this.db.exec('ALTER TABLE queue_events ADD COLUMN queue_role TEXT');
      }
      if (!queueCols.includes('queue_depth_bucket')) {
        this.db.exec('ALTER TABLE queue_events ADD COLUMN queue_depth_bucket TEXT');
      }
    } catch (_) {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT,
        target TEXT,
        message TEXT,
        details TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_problems_job_ts ON crawl_problems(job_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_problems_kind ON crawl_problems(kind);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT,
        target TEXT,
        message TEXT,
        details TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_milestones_job_ts ON crawl_milestones(job_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_milestones_kind ON crawl_milestones(kind);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS planner_stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        sequence INTEGER,
        duration_ms INTEGER,
        details TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_planner_stage_job_ts ON planner_stage_events(job_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_planner_stage_stage ON planner_stage_events(stage, status);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        declaration TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawler_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crawl_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        host TEXT,
        kind TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        url TEXT,
        payload TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        stage TEXT,
        analysis_version INTEGER,
        page_limit INTEGER,
        domain_limit INTEGER,
        skip_pages INTEGER,
        skip_domains INTEGER,
        dry_run INTEGER,
        verbose INTEGER,
        summary TEXT,
        last_progress TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_runs_started_at ON analysis_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status, started_at DESC);

      CREATE TABLE IF NOT EXISTS analysis_run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        stage TEXT,
        message TEXT,
        details TEXT,
        FOREIGN KEY(run_id) REFERENCES analysis_runs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_run_events_run_ts ON analysis_run_events(run_id, ts DESC);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_crawl_tasks_job_status ON crawl_tasks(job_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crawl_tasks_status ON crawl_tasks(status, created_at DESC);
    `);

  // Gazetteer tables ensured via shared helper
  try { ensureGazetteer(this.db); } catch (_) {}

    // Idempotent migration for fetches extra columns
    let fetchCols = this.db.prepare('PRAGMA table_info(fetches)').all().map(r => r.name);
    const addFetchCol = (name, ddl) => {
      if (!fetchCols.includes(name)) {
        this.db.exec(`ALTER TABLE fetches ADD COLUMN ${name} ${ddl}`);
        fetchCols.push(name);
      }
    };
  addFetchCol('word_count', 'INTEGER');
  addFetchCol('analysis', 'TEXT');

    // Idempotent schema migration: add columns if missing
    let cols = this.db.prepare("PRAGMA table_info(articles)").all().map(r => r.name);

    // If a previous faulty migration created a column literally named "TEXT",
    // rename it to the intended "text" column so our code and indexes work cleanly.
    if (cols.includes('TEXT') && !cols.includes('text')) {
      try {
        this.db.exec('ALTER TABLE articles RENAME COLUMN "TEXT" TO text');
      } catch (e) {
        // If RENAME COLUMN is not supported or fails, continue; SQLite identifiers are case-insensitive
        // so inserts using "text" will still target the existing "TEXT" column.
      }
      // Refresh columns after attempted rename
      cols = this.db.prepare("PRAGMA table_info(articles)").all().map(r => r.name);
    }

    const addCol = (name, ddl) => {
      if (!cols.includes(name)) {
        this.db.exec(`ALTER TABLE articles ADD COLUMN ${name} ${ddl}`);
        cols.push(name);
      }
    };
    addCol('canonical_url', 'TEXT');
    addCol('referrer_url', 'TEXT');
    addCol('discovered_at', 'TEXT');
    addCol('crawl_depth', 'INTEGER');
    addCol('fetched_at', 'TEXT');
  addCol('request_started_at', 'TEXT');
    addCol('http_status', 'INTEGER');
    addCol('content_type', 'TEXT');
    addCol('content_length', 'INTEGER');
    addCol('etag', 'TEXT');
    addCol('last_modified', 'TEXT');
    addCol('redirect_chain', 'TEXT');
  addCol('ttfb_ms', 'INTEGER');
  addCol('download_ms', 'INTEGER');
  addCol('total_ms', 'INTEGER');
  addCol('bytes_downloaded', 'INTEGER');
  addCol('transfer_kbps', 'REAL');
    addCol('html_sha256', 'TEXT');
    addCol('text', 'TEXT');
    addCol('word_count', 'INTEGER');
  addCol('language', 'TEXT');
  addCol('article_xpath', 'TEXT');
  addCol('analysis', 'TEXT');
  
  // Compression columns for background compression task
  // Individual compression (stores blob directly)
  addCol('compressed_html', 'BLOB');
  addCol('compression_type_id', 'INTEGER');
  // Bucket compression (stores reference to bucket)
  addCol('compression_bucket_id', 'INTEGER');
  addCol('compression_bucket_key', 'TEXT');  // Key within the bucket
  // Compression statistics (shared by both methods)
  addCol('original_size', 'INTEGER');
  addCol('compressed_size', 'INTEGER');
  addCol('compression_ratio', 'REAL');

  // Optional helpful indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_articles_crawled_at ON articles(crawled_at);
      CREATE INDEX IF NOT EXISTS idx_articles_canonical ON articles(canonical_url);
      CREATE INDEX IF NOT EXISTS idx_articles_sha ON articles(html_sha256);
      CREATE INDEX IF NOT EXISTS idx_articles_analysis_progress
        ON articles((analysis IS NULL), CAST(json_extract(analysis, '$.analysis_version') AS INTEGER));
      CREATE INDEX IF NOT EXISTS idx_articles_compressed ON articles((compressed_html IS NULL) AND (compression_bucket_id IS NULL));
      CREATE INDEX IF NOT EXISTS idx_articles_bucket ON articles(compression_bucket_id);
    `);

    // Speed up lookups of the latest fetch per URL
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fetches_url_fetched ON fetches(url, fetched_at);
      CREATE INDEX IF NOT EXISTS idx_fetches_url_req_started ON fetches(url, request_started_at);
      CREATE INDEX IF NOT EXISTS idx_latest_fetch_ts_desc ON latest_fetch(ts DESC, url);
    `);

    // Trigger to maintain latest_fetch on insert
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_latest_fetch_upsert
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
    `);

    // Backfill latest_fetch from existing rows (idempotent best-effort)
    try {
      this.db.exec(`
        INSERT INTO latest_fetch(url, ts, http_status, classification, word_count)
        SELECT f.url,
               MAX(COALESCE(f.fetched_at, f.request_started_at)) AS ts,
               (SELECT http_status FROM fetches f2 WHERE f2.url = f.url ORDER BY COALESCE(f2.fetched_at, f2.request_started_at) DESC LIMIT 1) AS http_status,
               (SELECT classification FROM fetches f2 WHERE f2.url = f.url ORDER BY COALESCE(f2.fetched_at, f2.request_started_at) DESC LIMIT 1) AS classification,
               (SELECT word_count FROM fetches f2 WHERE f2.url = f.url ORDER BY COALESCE(f2.fetched_at, f2.request_started_at) DESC LIMIT 1) AS word_count
        FROM fetches f
        GROUP BY f.url
        ON CONFLICT(url) DO NOTHING;
      `);
    } catch (_) { /* ignore backfill errors */ }

  // Help planner choose indexes after schema changes
  try { this.db.exec('ANALYZE'); } catch (_) {}

    // Triggers to keep urls table in sync with articles and fetches
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_urls_from_articles_insert
      AFTER INSERT ON articles
      BEGIN
        INSERT OR IGNORE INTO urls(url, canonical_url, created_at, last_seen_at)
        VALUES (NEW.url, NEW.canonical_url, COALESCE(NEW.crawled_at, datetime('now')), COALESCE(NEW.crawled_at, datetime('now')));
        UPDATE urls SET last_seen_at = COALESCE(NEW.crawled_at, datetime('now')) WHERE url = NEW.url;
        UPDATE urls SET canonical_url = COALESCE(NEW.canonical_url, canonical_url) WHERE url = NEW.url;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_urls_from_articles_update
      AFTER UPDATE OF crawled_at, canonical_url ON articles
      BEGIN
        UPDATE urls SET last_seen_at = COALESCE(NEW.crawled_at, datetime('now')) WHERE url = NEW.url;
        UPDATE urls SET canonical_url = COALESCE(NEW.canonical_url, canonical_url) WHERE url = NEW.url;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_urls_from_fetches_insert
      AFTER INSERT ON fetches
      BEGIN
        INSERT OR IGNORE INTO urls(url, created_at, last_seen_at)
        VALUES (NEW.url, COALESCE(NEW.fetched_at, datetime('now')), COALESCE(NEW.fetched_at, datetime('now')));
        UPDATE urls SET last_seen_at = COALESCE(NEW.fetched_at, datetime('now')) WHERE url = NEW.url;
      END;
    `);

    // Backfill urls from existing articles (idempotent)
    try {
      this.db.exec(`
        INSERT OR IGNORE INTO urls(url, created_at, last_seen_at)
        SELECT url,
               COALESCE(MIN(crawled_at), datetime('now')) AS created_at,
               COALESCE(MAX(crawled_at), datetime('now')) AS last_seen_at
        FROM articles;
      `);
    } catch (e) {
      // Best-effort backfill; ignore failures
    }

    // Prepared statements
  this.insertArticleStmt = this.db.prepare(`
      INSERT INTO articles (
    url, title, date, section, html, crawled_at,
        canonical_url, referrer_url, discovered_at, crawl_depth,
        fetched_at, request_started_at, http_status, content_type, content_length,
        etag, last_modified, redirect_chain, ttfb_ms, download_ms, total_ms,
    bytes_downloaded, transfer_kbps, html_sha256,
  text, word_count, language, article_xpath, analysis
      ) VALUES (
    @url, @title, @date, @section, @html, @crawled_at,
        @canonical_url, @referrer_url, @discovered_at, @crawl_depth,
        @fetched_at, @request_started_at, @http_status, @content_type, @content_length,
        @etag, @last_modified, @redirect_chain, @ttfb_ms, @download_ms, @total_ms,
    @bytes_downloaded, @transfer_kbps, @html_sha256,
  @text, @word_count, @language, @article_xpath, @analysis
      )
      ON CONFLICT(url) DO UPDATE SET
        title=excluded.title,
        date=excluded.date,
        section=excluded.section,
        html=excluded.html,
        crawled_at=excluded.crawled_at,
        canonical_url=COALESCE(excluded.canonical_url, articles.canonical_url),
        referrer_url=COALESCE(excluded.referrer_url, articles.referrer_url),
        discovered_at=COALESCE(excluded.discovered_at, articles.discovered_at),
        crawl_depth=COALESCE(excluded.crawl_depth, articles.crawl_depth),
        fetched_at=COALESCE(excluded.fetched_at, articles.fetched_at),
        request_started_at=COALESCE(excluded.request_started_at, articles.request_started_at),
        http_status=COALESCE(excluded.http_status, articles.http_status),
        content_type=COALESCE(excluded.content_type, articles.content_type),
        content_length=COALESCE(excluded.content_length, articles.content_length),
        etag=COALESCE(excluded.etag, articles.etag),
        last_modified=COALESCE(excluded.last_modified, articles.last_modified),
        redirect_chain=COALESCE(excluded.redirect_chain, articles.redirect_chain),
        ttfb_ms=COALESCE(excluded.ttfb_ms, articles.ttfb_ms),
        download_ms=COALESCE(excluded.download_ms, articles.download_ms),
        total_ms=COALESCE(excluded.total_ms, articles.total_ms),
        bytes_downloaded=COALESCE(excluded.bytes_downloaded, articles.bytes_downloaded),
        transfer_kbps=COALESCE(excluded.transfer_kbps, articles.transfer_kbps),
        html_sha256=COALESCE(excluded.html_sha256, articles.html_sha256),
        text=COALESCE(excluded.text, articles.text),
        word_count=COALESCE(excluded.word_count, articles.word_count),
  language=COALESCE(excluded.language, articles.language),
  article_xpath=COALESCE(excluded.article_xpath, articles.article_xpath),
  analysis=COALESCE(excluded.analysis, articles.analysis)
    `);
    // Backfill host column on urls if missing (best-effort, bounded)
    try {
      const rows = this.db.prepare(`SELECT url FROM urls WHERE host IS NULL OR host = '' LIMIT 100000`).all();
      if (rows && rows.length) {
        const upd = this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`);
        const escHost = (h) => (h || '').toLowerCase();
        const txn = this.db.transaction((items) => {
          for (const r of items) {
            try {
              const u = new URL(r.url);
              upd.run(escHost(u.hostname), r.url);
            } catch (_) { /* ignore bad urls */ }
          }
        });
        txn(rows);
      }
    } catch (_) { /* ignore backfill errors */ }

  this.selectByUrlStmt = this.db.prepare(`SELECT * FROM articles WHERE url = ?`);
  this.selectArticleHeadersStmt = this.db.prepare(`
      SELECT url, canonical_url, etag, last_modified, fetched_at, crawled_at
      FROM articles
      WHERE url = ? OR canonical_url = ?
      ORDER BY COALESCE(fetched_at, crawled_at) DESC
      LIMIT 1
    `);
  // Prepared variant for url OR canonical lookup to avoid re-prepare on hot path
  this.selectByUrlOrCanonicalStmt = this.db.prepare('SELECT url, title, date, section, html, crawled_at FROM articles WHERE url = ? OR canonical_url = ?');
    this.countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM articles`);

    // Links prepared statements
    this.insertLinkStmt = this.db.prepare(`
      INSERT OR IGNORE INTO links (src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at)
      VALUES (@src_url, @dst_url, @anchor, @rel, @type, @depth, @on_domain, @discovered_at)
    `);
    this.linkCountStmt = this.db.prepare(`SELECT COUNT(*) as count FROM links`);

    // Fetches prepared statements
  this.insertFetchStmt = this.db.prepare(`
      INSERT INTO fetches (
        url, request_started_at, fetched_at, http_status, content_type, content_length, content_encoding,
        bytes_downloaded, transfer_kbps, ttfb_ms, download_ms, total_ms,
    saved_to_db, saved_to_file, file_path, file_size, classification, nav_links_count, article_links_count, word_count, analysis
      ) VALUES (
        @url, @request_started_at, @fetched_at, @http_status, @content_type, @content_length, @content_encoding,
        @bytes_downloaded, @transfer_kbps, @ttfb_ms, @download_ms, @total_ms,
    @saved_to_db, @saved_to_file, @file_path, @file_size, @classification, @nav_links_count, @article_links_count, @word_count, @analysis
      )
    `);

    // Prepared statements for errors
    this.insertErrorStmt = this.db.prepare(`
      INSERT INTO errors(url, host, kind, code, message, details, at)
      VALUES (@url, @host, @kind, @code, @message, @details, @at)
    `);

    this.insertUrlMinimalStmt = this.db.prepare(`
      INSERT OR IGNORE INTO urls (url, host, created_at, last_seen_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `);
    this.touchUrlStmt = this.db.prepare(`
      UPDATE urls SET last_seen_at = datetime('now') WHERE url = ?
    `);
    this.insertUrlAliasStmt = this.db.prepare(`
      INSERT INTO url_aliases (url, alias_url, classification, reason, "exists", checked_at, metadata)
      VALUES (@url, @alias_url, @classification, @reason, @exists, @checked_at, @metadata)
      ON CONFLICT(url, alias_url) DO UPDATE SET
        classification = excluded.classification,
        reason = excluded.reason,
        "exists" = excluded."exists",
        checked_at = excluded.checked_at,
        metadata = excluded.metadata
    `);
    
    // Seed default crawl types
    this.ensureCrawlTypesSeeded();
  }

  upsertArticle(article) {
    // article: { url, title, date, section, html, crawled_at }
  const withDefaults = { article_xpath: null, analysis: null, ...article };
  const res = this.insertArticleStmt.run(withDefaults);
  // Upsert domain row based on URL host
  try {
    const u = new URL(withDefaults.url);
    this.upsertDomain(u.hostname);
  // Ensure urls.host is populated for this url
  try { this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(u.hostname.toLowerCase(), withDefaults.url); } catch (_) {}
  } catch (_) {}
  return res;
  }

  getArticleByUrl(url) {
    return this.selectByUrlStmt.get(url);
  }

  // Try to find an article row by exact URL or by canonical_url
  getArticleByUrlOrCanonical(url) {
    return this.selectByUrlOrCanonicalStmt.get(url, url);
  }

  getArticleHeaders(url) {
    return this.selectArticleHeadersStmt.get(url, url);
  }

  getCount() {
    const row = this.countStmt.get();
    return row?.count || 0;
  }

  insertLink(link) {
    // link: { src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at }
    return this.insertLinkStmt.run(link);
  }

  getLinkCount() {
    const row = this.linkCountStmt.get();
    return row?.count || 0;
  }

  insertFetch(fetchRow) {
  const withDefaults = { analysis: null, ...fetchRow };
    const res = this.insertFetchStmt.run(withDefaults);
    // Upsert domain row based on URL host
    try {
      const u = new URL(withDefaults.url);
      this.upsertDomain(u.hostname);
  // Ensure urls.host is populated for this url
  try { this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(u.hostname.toLowerCase(), withDefaults.url); } catch (_) {}
    } catch (_) {}
    return res;
  }

  _ensureUrlRow(url) {
    if (!url) return;
    try {
      const u = new URL(url);
      const host = (u.hostname || '').toLowerCase() || null;
      this.insertUrlMinimalStmt.run(url, host);
    } catch (_) {
      try { this.insertUrlMinimalStmt.run(url, null); } catch (_) {}
    }
    try { this.touchUrlStmt.run(url); } catch (_) {}
  }

  hasUrl(url) {
    if (!url) return false;
    try {
      const row = this._getUrlIdStmt.get(url);
      if (row && row.id != null) return true;
    } catch (_) {}
    try {
      const f = this.db.prepare('SELECT 1 FROM fetches WHERE url = ? LIMIT 1').get(url);
      if (f) return true;
    } catch (_) {}
    try {
      const a = this.db.prepare('SELECT 1 FROM articles WHERE url = ? LIMIT 1').get(url);
      if (a) return true;
    } catch (_) {}
    return false;
  }

  recordUrlAlias({ url, aliasUrl, classification = null, reason = null, exists = false, metadata = null }) {
    if (!url || !aliasUrl) return false;
    const nowIso = new Date().toISOString();
    this._ensureUrlRow(url);
    this._ensureUrlRow(aliasUrl);
    try {
      const payload = {
        url,
        alias_url: aliasUrl,
        classification,
        reason,
        exists: exists ? 1 : 0,
        checked_at: nowIso,
        metadata: metadata ? JSON.stringify(metadata) : null
      };
      this.insertUrlAliasStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  getFetchesByUrl(url, limit = 100) {
    return this.db.prepare('SELECT * FROM fetches WHERE url = ? ORDER BY fetched_at DESC LIMIT ?').all(url, limit);
  }

  // Aggregate counts for crawler telemetry
  getFetchCount() {
    try {
      const r = this.db.prepare('SELECT COUNT(*) AS c FROM fetches').get();
      return r?.c || 0;
    } catch (_) { return 0; }
  }
  getArticleClassifiedFetchCount() {
    try {
      const r = this.db.prepare("SELECT COUNT(*) AS c FROM fetches WHERE classification = 'article'").get();
      return r?.c || 0;
    } catch (_) { return 0; }
  }

  getTopCountrySlugs(limit = 50) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    try {
      const rows = this._selectCountryNamesStmt.all(safeLimit);
      const unique = new Set();
      const slugs = [];
      for (const entry of rows) {
        const slug = slugifyCountryName(entry?.name);
        if (slug && !unique.has(slug)) {
          unique.add(slug);
          slugs.push(slug);
        }
      }
      return slugs;
    } catch (_) {
      return [];
    }
  }

  getArticleRowByUrl(url) {
    return this.db.prepare('SELECT * FROM articles WHERE url = ?').get(url);
  }

  // Stream article URLs from the database as a Node.js Readable (objectMode=true).
  // Yields strings (URLs) in no particular order.
  streamArticleUrls() {
    const stmt = this.db.prepare('SELECT url FROM articles');
    const iterator = stmt.iterate(); // efficient, low-memory iterator
    const readable = new Readable({
      objectMode: true,
      read() {
        try {
          while (true) {
            const { value, done } = iterator.next();
            if (done) {
              this.push(null);
              return;
            }
            if (!this.push(value.url)) {
              return; // respect backpressure
            }
          }
        } catch (e) {
          // Defer error to avoid synchronous throw inside read
          process.nextTick(() => this.destroy(e));
        }
      }
    });
    return readable;
  }

  close() {
    this.db.close();
  }

  // URL helpers
  upsertUrl(url, canonical = null, analysis = null) {
    const now = new Date().toISOString();
    this.db.exec(`
      INSERT OR IGNORE INTO urls(url, canonical_url, created_at, last_seen_at, analysis)
      VALUES ('${url.replace(/'/g, "''")}', ${canonical ? `'${canonical.replace(/'/g, "''")}'` : 'NULL'}, '${now}', '${now}', ${analysis ? `'${analysis.replace(/'/g, "''")}'` : 'NULL'});
      UPDATE urls SET last_seen_at='${now}' WHERE url='${url.replace(/'/g, "''")}';
      UPDATE urls SET canonical_url=COALESCE(${canonical ? `'${canonical.replace(/'/g, "''")}'` : 'NULL'}, canonical_url) WHERE url='${url.replace(/'/g, "''")}';
      UPDATE urls SET analysis=COALESCE(${analysis ? `'${analysis.replace(/'/g, "''")}'` : 'NULL'}, analysis) WHERE url='${url.replace(/'/g, "''")}';
    `);
    try {
      const u = new URL(url);
      this.db.prepare(`UPDATE urls SET host = ? WHERE url = ?`).run(u.hostname.toLowerCase(), url);
    } catch (_) {}
  }

  // Domain helpers
  upsertDomain(host, analysis = null) {
    if (!host) return;
    const now = new Date().toISOString();
    const esc = (s) => s.replace(/'/g, "''");
    const tld = host.includes('.') ? host.split('.').slice(-1)[0] : host;
    this.db.exec(`
      INSERT OR IGNORE INTO domains(host, tld, created_at, last_seen_at, analysis)
      VALUES ('${esc(host)}', '${esc(tld)}', '${now}', '${now}', ${analysis ? `'${esc(analysis)}'` : 'NULL'});
      UPDATE domains SET last_seen_at='${now}' WHERE host='${esc(host)}';
      UPDATE domains SET analysis=COALESCE(${analysis ? `'${esc(analysis)}'` : 'NULL'}, analysis) WHERE host='${esc(host)}';
    `);
  }

  ensureDomainCategory(name) {
    this.db.prepare(`INSERT OR IGNORE INTO domain_categories(name, description) VALUES (?, NULL)`).run(name);
    const row = this.db.prepare(`SELECT id FROM domain_categories WHERE name = ?`).get(name);
    return row?.id || null;
  }

  tagDomainWithCategory(host, categoryName) {
    if (!host || !categoryName) return null;
    const row = this.db.prepare(`SELECT id FROM domains WHERE host = ?`).get(host);
    if (!row) return null;
    const cid = this.ensureDomainCategory(categoryName);
    if (!cid) return null;
    this.db.prepare(`INSERT OR IGNORE INTO domain_category_map(domain_id, category_id) VALUES (?, ?)`).run(row.id, cid);
    return { domain_id: row.id, category_id: cid };
  }

  ensureUrlCategory(name) {
    this._ensureUrlCategoryStmt.run(name);
    const row = this._getUrlCategoryIdStmt.get(name);
    return row?.id || null;
  }

  ensurePageCategory(name) {
    this._ensurePageCategoryStmt.run(name);
    const row = this._getPageCategoryIdStmt.get(name);
    return row?.id || null;
  }

  tagUrlWithCategory(url, categoryName) {
    const urlRow = this._getUrlIdStmt.get(url);
    if (!urlRow) return null;
    const cid = this.ensureUrlCategory(categoryName);
    if (!cid) return null;
    this._mapUrlCategoryStmt.run(urlRow.id, cid);
    return { url_id: urlRow.id, category_id: cid };
  }

  tagFetchWithCategory(fetchId, categoryName) {
    const cid = this.ensurePageCategory(categoryName);
    if (!cid) return null;
    this._mapPageCategoryStmt.run(fetchId, cid);
    return { fetch_id: fetchId, category_id: cid };
  }

  _safeParseJson(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }

  _hydrateTask(row) {
    if (!row) return null;
    return {
      id: row.id,
      jobId: row.jobId,
      host: row.host,
      kind: row.kind,
      status: row.status,
      url: row.url,
      payload: this._safeParseJson(row.payload),
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  getSetting(key, fallback = null) {
    if (!key) return fallback;
    try {
      const row = this._getSettingStmt.get(key);
      return row && row.value !== undefined ? row.value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  setSetting(key, value) {
    if (!key) return false;
    try {
      this._setSettingStmt.run(key, value != null ? String(value) : null);
      return true;
    } catch (_) {
      return false;
    }
  }

  getTaskQueueLimit(defaultLimit = 100) {
    const fallback = Math.max(10, parseInt(defaultLimit, 10) || 100);
    try {
      const row = this._getSettingStmt.get('taskQueueLimit');
      if (!row || row.value == null) {
        this._setSettingStmt.run('taskQueueLimit', String(fallback));
        return fallback;
      }
      const n = parseInt(row.value, 10);
      if (!Number.isFinite(n)) return fallback;
      const safe = Math.max(10, n);
      if (safe !== n) {
        this._setSettingStmt.run('taskQueueLimit', String(safe));
      }
      return safe;
    } catch (_) {
      return fallback;
    }
  }

  setTaskQueueLimit(limit) {
    const safe = Math.max(10, parseInt(limit, 10) || 10);
    this._setSettingStmt.run('taskQueueLimit', String(safe));
    return safe;
  }

  getActiveTaskCount(jobId) {
    if (!jobId) return 0;
    try {
      const row = this._countActiveTasksByJobStmt.get(jobId);
      return row?.c || 0;
    } catch (_) {
      return 0;
    }
  }

  _pruneActiveTasks(jobId, overflow) {
    if (!jobId || !overflow || overflow <= 0) return;
    try {
      const victims = this._selectOldActiveTasksStmt.all(jobId, overflow);
      for (const v of victims) {
        try { this._deleteTaskByIdStmt.run(v.id); } catch (_) {}
      }
    } catch (_) {}
  }

  createTask(task) {
    if (!task || !task.jobId) throw new Error('createTask requires jobId');
    const limit = this.getTaskQueueLimit();
    const record = {
      job_id: task.jobId,
      host: task.host || (() => {
        try { if (task.url) return new URL(task.url).hostname.toLowerCase(); } catch (_) {}
        return null;
      })(),
      kind: task.kind || null,
      status: task.status || 'pending',
      url: task.url || null,
      payload: (() => {
        if (task.payload === null || task.payload === undefined) return null;
        if (typeof task.payload === 'string') return task.payload;
        try { return JSON.stringify(task.payload); } catch (_) { return String(task.payload); }
      })(),
      note: task.note || null
    };

    const runInsert = this.db.transaction((data) => {
      const activeCount = this._countActiveTasksByJobStmt.get(data.job_id)?.c || 0;
      const overflow = Math.max(0, (activeCount + 1) - limit);
      if (overflow > 0) {
        this._pruneActiveTasks(data.job_id, overflow);
      }
      const info = this._insertTaskStmt.run(data);
      return info.lastInsertRowid;
    });

    const id = runInsert(record);
    return this.getTaskById(id);
  }

  getTaskById(id) {
    if (!id) return null;
    try {
      const row = this._getTaskByIdStmt.get(id);
      return this._hydrateTask(row);
    } catch (_) {
      return null;
    }
  }

  listTasks({ jobId = null, statuses = null, limit = 200 } = {}) {
    const clauses = [];
    const params = [];
    if (jobId) {
      clauses.push('job_id = ?');
      params.push(jobId);
    }
    if (is_array(statuses) && statuses.length) {
      const placeholders = statuses.map(() => '?').join(',');
      clauses.push(`status IN (${placeholders})`);
      params.push(...statuses);
    }
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 200));
    const sql = `
      SELECT id, job_id AS jobId, host, kind, status, url, payload, note,
             created_at AS createdAt, updated_at AS updatedAt
      FROM crawl_tasks
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params, safeLimit);
    return rows.map((row) => this._hydrateTask(row));
  }

  getTasksForJob(jobId, options = {}) {
    return this.listTasks({ jobId, ...options });
  }

  updateTaskStatus(id, status, note = null) {
    if (!id || !status) return false;
    try {
      const info = this._updateTaskStatusStmt.run({ id, status, note });
      return (info?.changes || 0) > 0;
    } catch (_) {
      return false;
    }
  }

  clearTasksForJob(jobId, { statuses = null } = {}) {
    if (!jobId) return 0;
    if (is_array(statuses) && statuses.length) {
      const placeholders = statuses.map(() => '?').join(',');
      const stmt = this.db.prepare(`DELETE FROM crawl_tasks WHERE job_id = ? AND status IN (${placeholders})`);
      const info = stmt.run(jobId, ...statuses);
      return info?.changes || 0;
    }
    const info = this._clearTasksByJobStmt.run(jobId);
    return info?.changes || 0;
  }

  insertError(err) {
    // err: { url?, kind, code?, message?, details? }
    const at = new Date().toISOString();
    let host = null;
    try { if (err.url) host = new URL(err.url).hostname.toLowerCase(); } catch (_) {}
    return this.insertErrorStmt.run({
      url: err.url || null,
      host: host || null,
      kind: err.kind || 'other',
      code: typeof err.code === 'number' ? err.code : null,
      message: err.message || null,
      details: err.details != null ? (typeof err.details === 'string' ? err.details : JSON.stringify(err.details)) : null,
      at
    });
  }

  getHandle() {
    return this.db;
  }

  ensureCrawlTypesSeeded() {
    if (this._crawlTypesSeeded) return;
    const defaults = [
      { name: 'basic', description: 'Follow links only (no sitemap)', declaration: { crawlType: 'basic', useSitemap: false, sitemapOnly: false } },
      { name: 'sitemap-only', description: 'Use only the sitemap to discover pages', declaration: { crawlType: 'sitemap-only', useSitemap: true, sitemapOnly: true } },
      { name: 'basic-with-sitemap', description: 'Follow links and also use the sitemap', declaration: { crawlType: 'basic-with-sitemap', useSitemap: true, sitemapOnly: false } },
      { name: 'intelligent', description: 'Intelligent planning (hubs + sitemap + heuristics)', declaration: { crawlType: 'intelligent', useSitemap: true, sitemapOnly: false } },
  { name: 'discover-structure', description: 'Map site structure without downloading articles', declaration: { crawlType: 'discover-structure', useSitemap: true, sitemapOnly: false } },
  { name: 'gazetteer', description: 'Legacy alias for geography gazetteer crawl', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } },
  { name: 'wikidata', description: 'Only ingest gazetteer data from Wikidata', declaration: { crawlType: 'wikidata', useSitemap: false, sitemapOnly: false } },
  { name: 'geography', description: 'Aggregate gazetteer data from Wikidata plus OpenStreetMap boundaries', declaration: { crawlType: 'geography', useSitemap: false, sitemapOnly: false } }
    ];
    const stmt = this.db.prepare(`
      INSERT INTO crawl_types(name, description, declaration)
      VALUES (@name, @description, @declaration)
      ON CONFLICT(name) DO UPDATE SET description = excluded.description, declaration = excluded.declaration
    `);
    const txn = this.db.transaction((rows) => {
      for (const row of rows) {
        stmt.run({
          name: row.name,
          description: row.description,
          declaration: JSON.stringify(row.declaration)
        });
      }
    });
    try {
      txn(defaults);
      this._crawlTypesSeeded = true;
    } catch (_) {
      // Ignore seeding errors but avoid retry loop
      this._crawlTypesSeeded = true;
    }
  }

  recordCrawlJobStart({ id, url = null, args = null, pid = null, startedAt = null, status = 'running' }) {
    if (!id) return false;
    const payload = {
      id,
      url,
      args: args != null ? (tof(args) === 'string' ? args : JSON.stringify(args)) : null,
      pid: pid != null ? pid : null,
      startedAt: startedAt || new Date().toISOString(),
      status: status || 'running'
    };
    try {
      this._insertCrawlJobStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  markCrawlJobStatus({ id, endedAt = null, status = 'done' }) {
    if (!id) return false;
    const payload = {
      id,
      endedAt: endedAt || new Date().toISOString(),
      status: status || 'done'
    };
    try {
      const info = this._updateCrawlJobStmt.run(payload);
      return (info?.changes || 0) > 0;
    } catch (_) {
      return false;
    }
  }

  insertQueueEvent(event) {
    if (!event || !event.jobId) return false;
    const payload = {
      jobId: event.jobId,
      ts: event.ts || new Date().toISOString(),
      action: event.action || 'unknown',
      url: event.url || null,
      depth: Number.isFinite(event.depth) ? event.depth : null,
      host: event.host || null,
      reason: event.reason || null,
      queueSize: Number.isFinite(event.queueSize) ? event.queueSize : null,
      alias: event.alias || null,
      queueOrigin: event.queueOrigin || null,
      queueRole: event.queueRole || null,
      queueDepthBucket: event.queueDepthBucket || null
    };
    try {
      this._insertQueueEventStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertProblem(problem) {
    if (!problem || !problem.jobId) return false;
    const payload = {
      jobId: problem.jobId,
      ts: problem.ts || new Date().toISOString(),
      kind: problem.kind || 'unknown',
      scope: problem.scope || null,
      target: problem.target || null,
      message: problem.message || null,
      details: problem.details != null ? (typeof problem.details === 'string' ? problem.details : JSON.stringify(problem.details)) : null
    };
    try {
      this._insertProblemStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertMilestone(milestone) {
    if (!milestone || !milestone.jobId) return false;
    const payload = {
      jobId: milestone.jobId,
      ts: milestone.ts || new Date().toISOString(),
      kind: milestone.kind || 'unknown',
      scope: milestone.scope || null,
      target: milestone.target || null,
      message: milestone.message || null,
      details: milestone.details != null ? (typeof milestone.details === 'string' ? milestone.details : JSON.stringify(milestone.details)) : null
    };
    try {
      this._insertMilestoneStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  insertPlannerStageEvent(event) {
    if (!event || !event.jobId) return false;
    const payload = {
      jobId: event.jobId,
      ts: event.ts || new Date().toISOString(),
      stage: event.stage || 'unknown',
      status: event.status || 'unknown',
      sequence: Number.isFinite(event.sequence) ? event.sequence : null,
      durationMs: Number.isFinite(event.durationMs) ? event.durationMs : null,
      details: event.details != null ? (typeof event.details === 'string' ? event.details : JSON.stringify(event.details)) : null
    };
    try {
      this._insertPlannerStageStmt.run(payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  listQueues(limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    try {
      const rows = this.db.prepare(`
        SELECT j.id, j.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
               (SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id) AS events,
               (SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id) AS lastEventAt
        FROM crawl_jobs j
        ORDER BY COALESCE(j.ended_at, j.started_at) DESC
        LIMIT ?
      `).all(safeLimit);
      return rows;
    } catch (_) {
      return [];
    }
  }

  getCrawlJob(id) {
    if (!id) return null;
    try {
      return this.db.prepare(`
        SELECT id, url, pid, started_at AS startedAt, ended_at AS endedAt, status
        FROM crawl_jobs
        WHERE id = ?
      `).get(id);
    } catch (_) {
      return null;
    }
  }

  listQueueEvents({ jobId, action = null, limit = 200, before = null, after = null } = {}) {
    if (!jobId) return { items: [], cursors: {}, stats: null };
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 200));
    const clauses = ['job_id = ?'];
    const params = [jobId];
    if (action) {
      clauses.push('action = ?');
      params.push(action);
    }
    let order = 'DESC';
    if (before != null) {
      clauses.push('id < ?');
      params.push(before);
    } else if (after != null) {
      clauses.push('id > ?');
      params.push(after);
      order = 'ASC';
    }
    const sql = `
      SELECT id, ts, action, url, depth, host, reason, queue_size AS queueSize, alias
      FROM queue_events
      WHERE ${clauses.join(' AND ')}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      let stats = null;
      try {
        stats = action
          ? this.db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ? AND action = ?').get(jobId, action)
          : this.db.prepare('SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ?').get(jobId);
      } catch (_) {}
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors, stats };
    } catch (_) {
      return { items: [], cursors: {}, stats: null };
    }
  }

  listProblems({ job = null, kind = null, scope = null, limit = 100, before = null, after = null } = {}) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const clauses = [];
    const params = [];
    if (job) { clauses.push('job_id = ?'); params.push(job); }
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (scope) { clauses.push('scope = ?'); params.push(scope); }
    let order = 'DESC';
    if (before != null) { clauses.push('id < ?'); params.push(before); }
    else if (after != null) { clauses.push('id > ?'); params.push(after); order = 'ASC'; }
    const sql = `
      SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
      FROM crawl_problems
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors };
    } catch (_) {
      return { items: [], cursors: {} };
    }
  }

  listMilestones({ job = null, kind = null, scope = null, limit = 100, before = null, after = null } = {}) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const clauses = [];
    const params = [];
    if (job) { clauses.push('job_id = ?'); params.push(job); }
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (scope) { clauses.push('scope = ?'); params.push(scope); }
    let order = 'DESC';
    if (before != null) { clauses.push('id < ?'); params.push(before); }
    else if (after != null) { clauses.push('id > ?'); params.push(after); order = 'ASC'; }
    const sql = `
      SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
      FROM crawl_milestones
      ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
      ORDER BY id ${order}
      LIMIT ?
    `;
    try {
      let rows = this.db.prepare(sql).all(...params, safeLimit);
      if (order === 'ASC') rows = rows.reverse();
      const cursors = rows.length ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id } : {};
      return { items: rows, cursors };
    } catch (_) {
      return { items: [], cursors: {} };
    }
  }

  listCrawlTypes() {
    try {
      const rows = this.db.prepare('SELECT name, description, declaration FROM crawl_types ORDER BY name ASC').all();
      return rows.map((row) => ({
        name: row.name,
        description: row.description,
        declaration: this._safeParseJson(row.declaration)
      }));
    } catch (_) {
      return [];
    }
  }
  
  /**
   * Get compressed HTML for an article (supports both individual and bucket compression)
   * 
   * @param {number} articleId - Article ID
   * @returns {Object|null} { html: Buffer|string, compressionType: string, method: 'individual'|'bucket' }
   */
  getCompressedHtml(articleId) {
    try {
      const article = this.db.prepare(`
        SELECT 
          compressed_html,
          compression_type_id,
          compression_bucket_id,
          compression_bucket_key,
          html
        FROM articles
        WHERE id = ?
      `).get(articleId);
      
      if (!article) {
        return null;
      }
      
      // Check if stored in bucket
      if (article.compression_bucket_id && article.compression_bucket_key) {
        // Bucket storage - would retrieve from bucket here
        // For now, return metadata indicating bucket storage
        return {
          method: 'bucket',
          bucketId: article.compression_bucket_id,
          bucketKey: article.compression_bucket_key,
          compressionTypeId: article.compression_type_id,
          // Note: Actual decompression would happen via compressionBuckets.retrieveFromBucket()
          html: null
        };
      }
      
      // Check if stored individually
      if (article.compressed_html) {
        return {
          method: 'individual',
          html: article.compressed_html,
          compressionTypeId: article.compression_type_id
          // Note: Caller would need to decompress using compression.decompress()
        };
      }
      
      // Not compressed, return original HTML
      return {
        method: 'uncompressed',
        html: article.html,
        compressionTypeId: null
      };
      
    } catch (error) {
      console.error('[NewsDatabase] Error getting compressed HTML:', error);
      return null;
    }
  }
  
  /**
   * Get compression statistics
   * 
   * @returns {Object} Statistics about compressed articles
   */
  getCompressionStats() {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_articles,
          COUNT(CASE WHEN compressed_html IS NOT NULL THEN 1 END) as individually_compressed,
          COUNT(CASE WHEN compression_bucket_id IS NOT NULL THEN 1 END) as bucket_compressed,
          COUNT(CASE WHEN compressed_html IS NULL AND compression_bucket_id IS NULL AND html IS NOT NULL THEN 1 END) as uncompressed,
          SUM(CASE WHEN original_size IS NOT NULL THEN original_size ELSE 0 END) as total_original_size,
          SUM(CASE WHEN compressed_size IS NOT NULL THEN compressed_size ELSE 0 END) as total_compressed_size,
          AVG(CASE WHEN compression_ratio IS NOT NULL THEN compression_ratio ELSE NULL END) as avg_compression_ratio
        FROM articles
        WHERE html IS NOT NULL
      `).get();
      
      return {
        totalArticles: stats.total_articles || 0,
        individuallyCompressed: stats.individually_compressed || 0,
        bucketCompressed: stats.bucket_compressed || 0,
        uncompressed: stats.uncompressed || 0,
        totalOriginalSize: stats.total_original_size || 0,
        totalCompressedSize: stats.total_compressed_size || 0,
        avgCompressionRatio: stats.avg_compression_ratio || null,
        spaceSavedBytes: (stats.total_original_size || 0) - (stats.total_compressed_size || 0),
        spaceSavedPercent: stats.total_original_size > 0 
          ? (1 - (stats.total_compressed_size / stats.total_original_size)) * 100
          : 0
      };
    } catch (error) {
      console.error('[NewsDatabase] Error getting compression stats:', error);
      return {
        totalArticles: 0,
        individuallyCompressed: 0,
        bucketCompressed: 0,
        uncompressed: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        avgCompressionRatio: null,
        spaceSavedBytes: 0,
        spaceSavedPercent: 0
      };
    }
  }

  // News Websites Management
  
  /**
   * Add a news website to the registry
   * @param {Object} website
   * @param {string} website.url - Full URL (e.g., 'https://news.sky.com/')
   * @param {string} [website.label] - Display name
   * @param {string} website.parent_domain - Base domain (e.g., 'sky.com')
   * @param {string} website.url_pattern - SQL LIKE pattern (e.g., 'https://news.sky.com/%')
   * @param {string} website.website_type - 'subdomain', 'path', or 'domain'
   * @param {string} [website.added_by] - User/source
   * @param {Object} [website.metadata] - Additional data
   * @returns {number} - ID of inserted row
   */
  addNewsWebsite({ url, label = null, parent_domain, url_pattern, website_type, added_by = 'manual', metadata = null }) {
    const added_at = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO news_websites (url, label, parent_domain, url_pattern, website_type, added_at, added_by, enabled, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const result = stmt.run(
      url,
      label,
      parent_domain,
      url_pattern,
      website_type,
      added_at,
      added_by,
      metadata ? JSON.stringify(metadata) : null
    );
    return result.lastInsertRowid;
  }

  /**
   * Remove a news website from the registry
   * @param {number} id - Website ID
   * @returns {boolean} - True if deleted
   */
  removeNewsWebsite(id) {
    const stmt = this.db.prepare('DELETE FROM news_websites WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all news websites
   * @param {boolean} [enabledOnly=true] - Only return enabled websites
   * @returns {Array<Object>} - List of news websites
   */
  getNewsWebsites(enabledOnly = true) {
    const query = enabledOnly
      ? 'SELECT * FROM news_websites WHERE enabled = 1 ORDER BY url'
      : 'SELECT * FROM news_websites ORDER BY url';
    return this.db.prepare(query).all();
  }

  /**
   * Get a single news website by ID
   * @param {number} id - Website ID
   * @returns {Object|null} - Website object or null
   */
  getNewsWebsite(id) {
    return this.db.prepare('SELECT * FROM news_websites WHERE id = ?').get(id);
  }

  /**
   * Update news website enabled status
   * @param {number} id - Website ID
   * @param {boolean} enabled - Enabled status
   * @returns {boolean} - True if updated
   */
  setNewsWebsiteEnabled(id, enabled) {
    const stmt = this.db.prepare('UPDATE news_websites SET enabled = ? WHERE id = ?');
    const result = stmt.run(enabled ? 1 : 0, id);
    return result.changes > 0;
  }

  /**
   * Get stats for a news website (article count, fetches, etc.)
   * @param {number} id - Website ID
   * @returns {Object} - Statistics object
   */
  getNewsWebsiteStats(id) {
    const website = this.getNewsWebsite(id);
    if (!website) return null;

    const pattern = website.url_pattern;
    
    // Count articles matching the pattern
    const articlesCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM articles WHERE url LIKE ?
    `).get(pattern);

    // Count fetches matching the pattern
    const fetchesCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM fetches WHERE url LIKE ?
    `).get(pattern);

    // Get recent articles
    const recentArticles = this.db.prepare(`
      SELECT url, title, date, crawled_at 
      FROM articles 
      WHERE url LIKE ? 
      ORDER BY crawled_at DESC 
      LIMIT 10
    `).all(pattern);

    // Get fetch stats
    const fetchStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as err_count,
        MAX(fetched_at) as last_fetch_at
      FROM fetches 
      WHERE url LIKE ?
    `).get(pattern);

    return {
      website,
      articles: {
        total: articlesCount.count,
        recent: recentArticles
      },
      fetches: fetchStats
    };
  }

  /**
   * Get enhanced stats for a news website (uses cache if available)
   * @param {number} id - Website ID
   * @param {boolean} [useCache=true] - Use cached stats if available
   * @returns {Object} - Enhanced statistics object
   */
  getNewsWebsiteEnhancedStats(id, useCache = true) {
    const website = this.getNewsWebsite(id);
    if (!website) return null;

    // Try to get cached stats first
    let stats = null;
    if (useCache) {
      stats = this.db.prepare(`
        SELECT * FROM news_websites_stats_cache WHERE website_id = ?
      `).get(id);
    }

    // If no cache, compute on-demand
    if (!stats) {
      const pattern = website.url_pattern;
      stats = this._computeBasicStats(pattern);
    }

    // Get recent articles (always fresh, small query)
    const recentArticles = this.db.prepare(`
      SELECT url, title, date, crawled_at 
      FROM articles 
      WHERE url LIKE ? 
      ORDER BY crawled_at DESC 
      LIMIT 10
    `).all(website.url_pattern);

    // Get domain breakdown
    const domainBreakdown = this.db.prepare(`
      SELECT 
        SUBSTR(url, 1, INSTR(SUBSTR(url, 9), '/') + 8) as domain,
        COUNT(*) as count
      FROM articles
      WHERE url LIKE ?
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 5
    `).all(website.url_pattern);

    return {
      website,
      stats,
      recentArticles,
      domainBreakdown,
      cacheAge: stats.last_updated_at ? this._getCacheAge(stats.last_updated_at) : null
    };
  }

  /**
   * Compute basic stats for a pattern (lighter than full stats)
   * @param {string} pattern - URL pattern
   * @returns {Object} - Basic statistics
   * @private
   */
  _computeBasicStats(pattern) {
    const articleCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM articles WHERE url LIKE ?
    `).get(pattern);

    const fetchCount = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN http_status >= 200 AND http_status < 300 THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) as error_count,
        MAX(fetched_at) as last_at
      FROM fetches 
      WHERE url LIKE ?
    `).get(pattern);

    return {
      article_count: articleCount.count || 0,
      fetch_count: fetchCount.total || 0,
      fetch_ok_count: fetchCount.ok_count || 0,
      fetch_error_count: fetchCount.error_count || 0,
      fetch_last_at: fetchCount.last_at || null
    };
  }

  /**
   * Get cache age in seconds
   * @param {string} timestamp - ISO timestamp
   * @returns {number} - Age in seconds
   * @private
   */
  _getCacheAge(timestamp) {
    const updated = new Date(timestamp);
    const now = new Date();
    return Math.floor((now - updated) / 1000);
  }

  /**
   * Get all news websites with their cached stats (very fast)
   * @param {boolean} [enabledOnly=true] - Only return enabled websites
   * @returns {Array<Object>} - Websites with stats
   */
  getNewsWebsitesWithStats(enabledOnly = true) {
    const query = enabledOnly
      ? `SELECT 
           w.*,
           s.article_count,
           s.fetch_count,
           s.fetch_ok_count,
           s.fetch_error_count,
           s.fetch_last_at,
           s.article_latest_date,
           s.last_updated_at as stats_updated_at
         FROM news_websites w
         LEFT JOIN news_websites_stats_cache s ON w.id = s.website_id
         WHERE w.enabled = 1
         ORDER BY w.url`
      : `SELECT 
           w.*,
           s.article_count,
           s.fetch_count,
           s.fetch_ok_count,
           s.fetch_error_count,
           s.fetch_last_at,
           s.article_latest_date,
           s.last_updated_at as stats_updated_at
         FROM news_websites w
         LEFT JOIN news_websites_stats_cache s ON w.id = s.website_id
         ORDER BY w.url`;
    
    return this.db.prepare(query).all();
  }
}

module.exports = NewsDatabase;
