const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { ensureDb, ensureGazetteer } = require('./ensure_db');
const { Readable } = require('stream');

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
        title TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        nav_links_count INTEGER,
        article_links_count INTEGER,
        evidence TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_place_hubs_host ON place_hubs(host);
      CREATE INDEX IF NOT EXISTS idx_place_hubs_place ON place_hubs(place_slug);
    `);

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

  // Optional helpful indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_articles_crawled_at ON articles(crawled_at);
      CREATE INDEX IF NOT EXISTS idx_articles_canonical ON articles(canonical_url);
      CREATE INDEX IF NOT EXISTS idx_articles_sha ON articles(html_sha256);
    `);

    // Speed up lookups of the latest fetch per URL
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fetches_url_fetched ON fetches(url, fetched_at);
      CREATE INDEX IF NOT EXISTS idx_fetches_url_req_started ON fetches(url, request_started_at);
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
}

module.exports = NewsDatabase;
