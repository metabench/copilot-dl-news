const fs = require('fs').promises;
const { recordPlaceHubSeed } = require('./data/placeHubs');
const NewsWebsiteService = require('../../services/NewsWebsiteService');
const { safeCall } = require('./utils');
const { getDb } = require('../../data/db');

let NewsDatabase = null;

function loadNewsDatabase() {
  if (!NewsDatabase) {
    // Lazy require so environments without better-sqlite3 can still run
    // other parts of the crawler.
    // eslint-disable-next-line global-require
    NewsDatabase = require('../../data/db');
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
    this.newsWebsiteService = null; // Service facade for news website operations
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

  _callDb(methodName, fallback = null, ...args) {
    if (!this.db || typeof this.db[methodName] !== 'function') {
      return fallback;
    }
    return safeCall(() => this.db[methodName](...args), fallback);
  }

  _callNewsService(methodName, fallback = null, ...args) {
    if (!this.newsWebsiteService || typeof this.newsWebsiteService[methodName] !== 'function') {
      return fallback;
    }
    return safeCall(() => this.newsWebsiteService[methodName](...args), fallback);
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
      if (!this.dbPath) {
        this.db = getDb();
        this._log(`SQLite DB initialized via getDb() singleton`);
      } else {
        const DatabaseCtor = loadNewsDatabase();
        this.db = new DatabaseCtor(this.dbPath);
        this._log(`SQLite DB initialized at: ${this.dbPath}`);
      }

      // Initialize news website service for cache updates
      try {
        this.newsWebsiteService = new NewsWebsiteService(this.db);
      } catch (err) {
        this._log(`Failed to initialize NewsWebsiteService: ${err.message}`);
        this.newsWebsiteService = null;
      }

      if (this.cache && typeof this.cache.setDb === 'function') {
        safeCall(() => this.cache.setDb(this.db));
      }
      if (this.fastStart) {
        // this._log(`SQLite DB initialized at: ${this.dbPath} (fast-start)`); // Already logged above or irrelevant
      } else {
        // this._log(`SQLite DB initialized at: ${this.dbPath}`); // Already logged above
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
        safeCall(() => this.onFatalIssue({ kind: 'db-open-failed', message: err?.message || String(err) }));
      }
      if (this.emitProblem) {
        safeCall(() => this.emitProblem({
          kind: 'db-open-failed',
          scope: this.domain,
          message: 'SQLite unavailable',
          details: { error: err?.message || String(err) }
        }));
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
    return this._callDb('getArticleHeaders', null, url);
  }

  getArticleRowByUrl(url) {
    return this._callDb('getArticleRowByUrl', null, url);
  }

  getArticleByUrlOrCanonical(url) {
    return this._callDb('getArticleByUrlOrCanonical', null, url);
  }

  upsertArticle(article) {
    // Use service facade if available (handles cache updates)
    if (this.newsWebsiteService) {
      return this._callNewsService('upsertArticle', null, article);
    }
    // Fallback to direct DB access (no cache updates)
    return this._callDb('upsertArticle', null, article);
  }

  insertFetch(fetchRow) {
    // Use service facade if available (handles cache updates)
    if (this.newsWebsiteService) {
      return this._callNewsService('insertFetch', null, fetchRow);
    }
    // Fallback to direct DB access (no cache updates)
    return this._callDb('insertFetch', null, fetchRow);
  }

  insertLink(linkRow) {
    return this._callDb('insertLink', null, linkRow);
  }

  insertError(err) {
    return this._callDb('insertError', null, err);
  }

  insertHttpResponse(httpResponseData) {
    return this._callDb('insertHttpResponse', null, httpResponseData);
  }

  upsertUrl(url, canonical = null, analysis = null) {
    return this._callDb('upsertUrl', null, url, canonical, analysis);
  }

  upsertDomain(host, analysis = null) {
    return this._callDb('upsertDomain', null, host, analysis);
  }

  recordPlaceHubSeed({ host, url, evidence = null }) {
    if (!this.db) return false;
    return safeCall(() => !!recordPlaceHubSeed(this.db, { host, url, evidence }), false);
  }

  getTopCountrySlugs(limit = 50) {
    const slugs = this._callDb('getTopCountrySlugs', null, limit);
    return Array.isArray(slugs) ? slugs : null;
  }

  getArticleCount() {
    return this._callDb('getCount', 0);
  }

  close() {
    if (!this.db) return;
    safeCall(() => this.db.close());
    this.db = null;
  }
}

function createCrawlerDb(options) {
  return new CrawlerDb(options);
}

module.exports = {
  createCrawlerDb
};
