const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

class NewsDatabase {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath || path.join(process.cwd(), 'data', 'news.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbFilePath);
    this._init();
  }

  _init() {
    // Pragmas for safety/performance sensible defaults
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

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

    // Optional helpful indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_articles_canonical ON articles(canonical_url);
      CREATE INDEX IF NOT EXISTS idx_articles_sha ON articles(html_sha256);
    `);

    // Prepared statements
    this.insertArticleStmt = this.db.prepare(`
      INSERT INTO articles (
        url, title, date, section, html, crawled_at,
        canonical_url, referrer_url, discovered_at, crawl_depth,
        fetched_at, request_started_at, http_status, content_type, content_length,
        etag, last_modified, redirect_chain, ttfb_ms, download_ms, total_ms,
        bytes_downloaded, transfer_kbps, html_sha256,
        text, word_count, language
      ) VALUES (
        @url, @title, @date, @section, @html, @crawled_at,
        @canonical_url, @referrer_url, @discovered_at, @crawl_depth,
        @fetched_at, @request_started_at, @http_status, @content_type, @content_length,
        @etag, @last_modified, @redirect_chain, @ttfb_ms, @download_ms, @total_ms,
        @bytes_downloaded, @transfer_kbps, @html_sha256,
        @text, @word_count, @language
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
        language=COALESCE(excluded.language, articles.language)
    `);

    this.selectByUrlStmt = this.db.prepare(`SELECT * FROM articles WHERE url = ?`);
    this.countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM articles`);

    // Links prepared statements
    this.insertLinkStmt = this.db.prepare(`
      INSERT OR IGNORE INTO links (src_url, dst_url, anchor, rel, type, depth, on_domain, discovered_at)
      VALUES (@src_url, @dst_url, @anchor, @rel, @type, @depth, @on_domain, @discovered_at)
    `);
    this.linkCountStmt = this.db.prepare(`SELECT COUNT(*) as count FROM links`);
  }

  upsertArticle(article) {
    // article: { url, title, date, section, html, crawled_at }
    return this.insertArticleStmt.run(article);
  }

  getArticleByUrl(url) {
    return this.selectByUrlStmt.get(url);
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

  close() {
    this.db.close();
  }
}

module.exports = NewsDatabase;
