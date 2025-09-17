// File-based cache removed

class ArticleCache {
  constructor({ db = null, dataDir, normalizeUrl }) {
    this.db = db; // NewsDatabase instance or null
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
        if (row && row.html && row.crawled_at) {
      const val = { html: row.html, crawledAt: row.crawled_at, source: 'db' };
      this._memo.set(norm, val);
      return val;
        }
      } catch (_) {}
    }
    return null;
  }
}

function shouldUseCache({ preferCache = false, maxAgeMs, crawledAt }) {
  const ts = crawledAt ? new Date(crawledAt).getTime() : 0;
  const ageMs = ts ? (Date.now() - ts) : Number.POSITIVE_INFINITY;
  // Respect maxAgeMs (>=0) over preferCache; 0 => always refetch
  if (typeof maxAgeMs === 'number' && maxAgeMs >= 0) {
    const ok = ageMs <= maxAgeMs;
    return { use: ok, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
  }
  if (preferCache) return { use: true, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
  return { use: false, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
}

module.exports = { ArticleCache, shouldUseCache };
