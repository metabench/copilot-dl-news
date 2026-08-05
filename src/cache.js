const { getDb } = require('./db');

// File-based cache removed

class ArticleCache {
  constructor({ db = null, dataDir, normalizeUrl } = {}) {
    this.db = db; // NewsDatabase instance or null
    if (!this.db) this.db = getDb();
    if (this.db && typeof this.db.getHandle === 'function') this.db = this.db.getHandle();

    this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : (u) => u;
    // Tiny positive memo to avoid repeated DB hits during rapid cache checking
    this._memo = new Map(); // url -> { html, crawledAt, source }
  }

  setDb(db) { this.db = db; }

  // Return { html, crawledAt, source } or null
  async get(url) {
    const norm = this.normalizeUrl(url) || url;
    const m = this._memo.get(norm);
    if (m) return m;
    // DB only
    if (this.db) {
      try {
        const row = (this.db.getArticleByUrlOrCanonical ? this.db.getArticleByUrlOrCanonical(norm) : this.db.getArticleByUrl(norm));
        if (row) {
          // Return cached content if available
          if (row.html && row.crawled_at) {
            const val = { html: row.html, crawledAt: row.crawled_at, source: 'db' };
            this._memo.set(norm, val);
            return val;
          }

          // Return special marker for known 404s (prevents wasteful re-fetches)
          if (row.http_status === 404 && row.fetched_at) {
            const val = {
              html: null,
              crawledAt: row.fetched_at,
              source: 'db-404',
              httpStatus: 404
            };
            this._memo.set(norm, val);
            return val;
          }
        }
      } catch (error) {
        // Loud (c200): this bare swallow hid the real failure while a test
        // chased a null — cache reads failing is information.
        console.warn('[ArticleCache] db read failed:', error?.message || error);
      }
    }
    return null;
  }
}

// shouldUseCache moved to news-crawler-itself/fetch-pipeline (cycle 178) —
// the pure predicate belongs to the engine; ArticleCache (DB-coupled) stays.

module.exports = { ArticleCache };
