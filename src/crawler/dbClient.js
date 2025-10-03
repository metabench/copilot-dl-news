const fs = require('fs').promises;
const { recordPlaceHubSeed } = require('./data/placeHubs');

let NewsDatabase = null;

function loadNewsDatabase() {
  if (!NewsDatabase) {
    // Lazy require so environments without better-sqlite3 can still run
    // other parts of the crawler.
    // eslint-disable-next-line global-require
    NewsDatabase = require('../db');
  }
  return NewsDatabase;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.00 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

class CrawlerDb {
  constructor({ dbPath, fastStart = false, cache = null, domain = null, logger = console, emitProblem = null, onFatalIssue = null } = {}) {
    this.dbPath = dbPath;
    this.fastStart = !!fastStart;
    this.cache = cache;
    this.domain = domain;
    this.logger = logger || console;
    this.emitProblem = typeof emitProblem === 'function' ? emitProblem : null;
    this.onFatalIssue = typeof onFatalIssue === 'function' ? onFatalIssue : null;
    this.db = null;
    this._stats = null;
  }

  _log(message) {
    try {
      if (this.logger && typeof this.logger.log === 'function') {
        this.logger.log(message);
      } else {
        console.log(message); // fallback
      }
    } catch (_) {
      // Ignore logging failures
    }
  }

  async _collectStats() {
    try {
      const stat = await fs.stat(this.dbPath).catch(() => null);
      const sizeBytes = stat?.size || 0;
      const fetchCount = this.db?.getFetchCount?.() || 0;
      const articleFetchCount = this.db?.getArticleClassifiedFetchCount?.() || 0;
      return {
        sizeBytes,
        sizeHuman: formatSize(sizeBytes),
        fetchCount,
        articleFetchCount
      };
    } catch (_) {
      return null;
    }
  }

  async init() {
    if (this.db) {
      return { db: this.db, stats: this._stats };
    }
    try {
      const DatabaseCtor = loadNewsDatabase();
      this.db = new DatabaseCtor(this.dbPath);
      if (this.cache && typeof this.cache.setDb === 'function') {
        try { this.cache.setDb(this.db); } catch (_) {}
      }
      if (this.fastStart) {
        this._log(`SQLite DB initialized at: ${this.dbPath} (fast-start)`);
      } else {
        this._log(`SQLite DB initialized at: ${this.dbPath}`);
        this._stats = await this._collectStats();
        if (this._stats) {
          this._log(`Database size: ${this._stats.sizeHuman} — stored pages: ${this._stats.fetchCount}, articles detected: ${this._stats.articleFetchCount}`);
        }
      }
      return { db: this.db, stats: this._stats };
    } catch (err) {
      this._log(`SQLite not available, continuing without DB: ${err?.message || err}`);
      this.db = null;
      if (this.onFatalIssue) {
        try { this.onFatalIssue({ kind: 'db-open-failed', message: err?.message || String(err) }); } catch (_) {}
      }
      if (this.emitProblem) {
        try {
          this.emitProblem({
            kind: 'db-open-failed',
            scope: this.domain,
            message: 'SQLite unavailable',
            details: { error: err?.message || String(err) }
          });
        } catch (_) {}
      }
      return null;
    }
  }

  isEnabled() {
    return !!this.db;
  }

  getDb() {
    return this.db || null;
  }

  getStats() {
    return this._stats;
  }

  getArticleHeaders(url) {
    if (!this.db || typeof this.db.getArticleHeaders !== 'function') return null;
    try { return this.db.getArticleHeaders(url); } catch (_) { return null; }
  }

  getArticleRowByUrl(url) {
    if (!this.db || typeof this.db.getArticleRowByUrl !== 'function') return null;
    try { return this.db.getArticleRowByUrl(url); } catch (_) { return null; }
  }

  getArticleByUrlOrCanonical(url) {
    if (!this.db || typeof this.db.getArticleByUrlOrCanonical !== 'function') return null;
    try { return this.db.getArticleByUrlOrCanonical(url); } catch (_) { return null; }
  }

  upsertArticle(article) {
    if (!this.db || typeof this.db.upsertArticle !== 'function') return null;
    try { return this.db.upsertArticle(article); } catch (_) { return null; }
  }

  insertFetch(fetchRow) {
    if (!this.db || typeof this.db.insertFetch !== 'function') return null;
    try { return this.db.insertFetch(fetchRow); } catch (_) { return null; }
  }

  insertLink(linkRow) {
    if (!this.db || typeof this.db.insertLink !== 'function') return null;
    try { return this.db.insertLink(linkRow); } catch (_) { return null; }
  }

  insertError(err) {
    if (!this.db || typeof this.db.insertError !== 'function') return null;
    try { return this.db.insertError(err); } catch (_) { return null; }
  }

  upsertUrl(url, canonical = null, analysis = null) {
    if (!this.db || typeof this.db.upsertUrl !== 'function') return null;
    try { return this.db.upsertUrl(url, canonical, analysis); } catch (_) { return null; }
  }

  upsertDomain(host, analysis = null) {
    if (!this.db || typeof this.db.upsertDomain !== 'function') return null;
    try { return this.db.upsertDomain(host, analysis); } catch (_) { return null; }
  }

  recordPlaceHubSeed({ host, url, evidence = null }) {
    if (!this.db) return false;
    try {
      return !!recordPlaceHubSeed(this.db, { host, url, evidence });
    } catch (_) {
      return false;
    }
  }

  getTopCountrySlugs(limit = 50) {
    if (!this.db || typeof this.db.getTopCountrySlugs !== 'function') return null;
    try {
      const slugs = this.db.getTopCountrySlugs(limit);
      return Array.isArray(slugs) ? slugs : null;
    } catch (_) {
      return null;
    }
  }

  getArticleCount() {
    if (!this.db || typeof this.db.getCount !== 'function') return 0;
    try { return this.db.getCount(); } catch (_) { return 0; }
  }

  close() {
    if (!this.db) return;
    try { this.db.close(); } catch (_) {}
    this.db = null;
  }
}

function createCrawlerDb(options) {
  return new CrawlerDb(options);
}

module.exports = {
  createCrawlerDb
};
