const fs = require('fs').promises;
const path = require('path');

function getArticleFilePathFromUrl(dataDir, url) {
  const u = new URL(url);
  const pathParts = u.pathname.split('/').filter(Boolean);
  const filename = pathParts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
  return path.join(dataDir, filename);
}

class ArticleCache {
  constructor({ db = null, dataDir, normalizeUrl }) {
    this.db = db; // NewsDatabase instance or null
    this.dataDir = dataDir;
    this.normalizeUrl = typeof normalizeUrl === 'function' ? normalizeUrl : (u) => u;
  }

  setDb(db) { this.db = db; }

  // Return { html, crawledAt, source } or null
  async get(url) {
    const norm = this.normalizeUrl(url) || url;
    // DB first
    if (this.db) {
      try {
        const row = (this.db.getArticleByUrlOrCanonical ? this.db.getArticleByUrlOrCanonical(norm) : this.db.getArticleByUrl(norm));
        if (row && row.html && row.crawled_at) {
          return { html: row.html, crawledAt: row.crawled_at, source: 'db' };
        }
      } catch (_) {}
    }
    // File fallback
    try {
      const filePath = getArticleFilePathFromUrl(this.dataDir, norm);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.html && parsed.crawledAt) {
        return { html: parsed.html, crawledAt: parsed.crawledAt, source: 'file' };
      }
    } catch (_) {}
    return null;
  }
}

function shouldUseCache({ preferCache = false, maxAgeMs, crawledAt }) {
  const ts = crawledAt ? new Date(crawledAt).getTime() : 0;
  const ageMs = ts ? (Date.now() - ts) : Number.POSITIVE_INFINITY;
  if (preferCache) return { use: true, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
  if (typeof maxAgeMs === 'number' && maxAgeMs > 0) {
    const ok = ageMs <= maxAgeMs;
    return { use: ok, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
  }
  return { use: false, ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null };
}

module.exports = { ArticleCache, getArticleFilePathFromUrl, shouldUseCache };
