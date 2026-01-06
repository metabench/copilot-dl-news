const { getDb } = require('../db');
const { slugify } = require('../tools/slugify');

function resolvePatternLearningQueries(db) {
  if (!db) return null;
  if (typeof db.createPatternLearningQueries === 'function') {
    return db.createPatternLearningQueries();
  }
  const raw = db.db && typeof db.db.prepare === 'function' ? db.db : db;
  if (raw && typeof raw.prepare === 'function') {
    const { createPatternLearningQueries } = require('../db/sqlite/v1/queries/patternLearning');
    return createPatternLearningQueries(raw);
  }
  return null;
}

class PatternLearner {
  /**
   * @param {Object} [db] - NewsDatabase wrapper or better-sqlite3 handle
   * @param {Object} [logger=console] - Logger instance
   * @param {Object} [queries] - Pattern learning query helpers
   */
  constructor(db, logger = console, queries = null) {
    this.db = db || getDb();
    this.logger = logger;
    this.queries = queries || resolvePatternLearningQueries(this.db);
  }

  /**
   * Learn patterns from crawled URLs for a given domain.
   * Scans the 'urls' table for the domain, matches against known places,
   * and derives common URL structures.
   * 
   * @param {string} domain 
   * @param {Object} options 
   * @returns {Object} patterns
   */
  learnPatterns(domain, options = {}) {
    const minConfidence = options.minConfidence || 2; // Min occurrences
    
    // 1. Get all URLs for the domain
    const urlRows = this.queries?.getUrlsForDomain(domain) || [];
    const urls = urlRows.map((row) => row.url).filter(Boolean);

    if (!urls.length) {
      this.logger.warn(`No URLs found for domain ${domain}`);
      return [];
    }

    // 2. Get top places (countries, major cities) to match against
    // We can't match against ALL places efficiently in JS loop if the gazetteer is huge.
    // Instead, we can fetch all Country names and Capital cities first.
    
    // Fetch countries
    const countries = this.queries?.getPreferredPlacesByKind('country') || [];

    // Prepare map of slug -> place info
    const placeMap = new Map();
    countries.forEach(c => {
      const slug = slugify(c.name);
      if (slug.length > 2) { // Avoid short noise
        placeMap.set(slug, { kind: 'country', ...c });
      }
      if (c.country_code) {
         // Also match specific codes? Maybe not strict active probes, but helpful.
      }
    });

    // 3. Scan URLs
    const patternCounts = new Map(); // pattern -> count
    
    for (const row of urls) {
      try {
        const urlObj = new URL(row.url);
        const path = urlObj.pathname;
        if (path.length < 2) continue;

        // Naive tokenization by slash
        const parts = path.split('/').filter(Boolean);
        
        // Check if any part matches a place slug
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (placeMap.has(part)) {
            const place = placeMap.get(part);
            
            // Construct pattern
            // Replace the matching part with {slug}
            // Keep other parts as literals
            const patternParts = [...parts];
            patternParts[i] = `{${place.kind}_slug}`; // e.g. {country_slug}
            
            const pattern = '/' + patternParts.join('/');
            
            const key = `${pattern}::${place.kind}`; // Differentiate by kind
            patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
          }
        }
      } catch (e) {
        // ignore invalid urls
      }
    }

    // 4. Sort and filter
    const results = [];
    for (const [key, count] of patternCounts.entries()) {
      if (count >= minConfidence) {
        const [pattern, kind] = key.split('::');
        results.push({ pattern, kind, count });
      }
    }

    results.sort((a, b) => b.count - a.count);
    return results;
  }
}

module.exports = { PatternLearner };
