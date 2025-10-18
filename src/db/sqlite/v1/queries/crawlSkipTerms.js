/**
 * @fileoverview Database queries for crawl skip terms (multi-lingual support).
 * 
 * Skip terms are words/phrases that should be excluded during crawling.
 * Common examples: people's names, breaking news indicators, non-hub content.
 * 
 * Table: crawl_skip_terms
 * Columns: id, lang, term, normalized, reason, source, metadata
 */
'use strict';

/**
 * Get all skip terms for a specific language
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} lang - BCP-47 language code (e.g., 'en', 'fr', 'es')
 * @returns {Set<string>} Set of normalized skip terms
 */
function getSkipTermsForLanguage(db, lang = 'en') {
  const stmt = db.prepare(`
    SELECT DISTINCT normalized
    FROM crawl_skip_terms
    WHERE lang = ?
    ORDER BY normalized
  `);
  
  const rows = stmt.all(lang);
  return new Set(rows.map(row => row.normalized));
}

/**
 * Get skip terms grouped by reason
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} lang - BCP-47 language code
 * @returns {Map<string, string[]>} reason -> [terms]
 */
function getSkipTermsByReason(db, lang = 'en') {
  const stmt = db.prepare(`
    SELECT reason, term, normalized
    FROM crawl_skip_terms
    WHERE lang = ?
    ORDER BY reason, term
  `);
  
  const rows = stmt.all(lang);
  const result = new Map();
  
  for (const row of rows) {
    const reason = row.reason || 'unknown';
    if (!result.has(reason)) {
      result.set(reason, []);
    }
    result.get(reason).push(row.term);
  }
  
  return result;
}

/**
 * Check if a term should be skipped during crawling
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} term - Term to check (will be normalized)
 * @param {string} lang - BCP-47 language code
 * @returns {boolean} True if term should be skipped
 */
function shouldSkipTerm(db, term, lang = 'en') {
  const normalized = normalizeTerm(term);
  if (!normalized) return false;
  
  const stmt = db.prepare(`
    SELECT 1
    FROM crawl_skip_terms
    WHERE lang = ? AND normalized = ?
    LIMIT 1
  `);
  
  return stmt.get(lang, normalized) !== undefined;
}

/**
 * Get the reason why a term should be skipped
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} term - Term to look up
 * @param {string} lang - BCP-47 language code
 * @returns {string|null} Reason or null if not a skip term
 */
function getSkipReason(db, term, lang = 'en') {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  
  const stmt = db.prepare(`
    SELECT reason
    FROM crawl_skip_terms
    WHERE lang = ? AND normalized = ?
    LIMIT 1
  `);
  
  const row = stmt.get(lang, normalized);
  return row ? row.reason : null;
}

/**
 * Seed default English skip terms
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} source - Source identifier for provenance
 */
function seedDefaultSkipTerms(db, source = 'system-default') {
  const skipTermsByReason = {
    'news-indicator': [
      'breaking', 'live', 'latest', 'update', 'report', 'story', 'article',
      'analysis', 'editorial', 'commentary', 'exclusive', 'investigation',
      'interview', 'profile', 'review', 'recap'
    ],
    'media-type': [
      'newsletter', 'podcast', 'video', 'gallery', 'interactive', 'slideshow'
    ],
    'common-person-name': [
      'trump', 'biden', 'harris', 'obama', 'clinton', 'bush',
      'johnson', 'may', 'cameron', 'starmer', 'sunak', 'truss',
      'macron', 'merkel', 'putin', 'xi', 'modi',
      'newsom', 'desantis', 'pence', 'pelosi', 'mcconnell',
      'gavin', 'donald', 'joe', 'kamala', 'barack', 'hillary',
      'epstein', 'redford', 'pirro', 'huckabee', 'navalnaya'
    ]
  };
  
  const stmt = db.prepare(`
    INSERT INTO crawl_skip_terms(lang, term, normalized, reason, source, metadata)
    VALUES (@lang, @term, @normalized, @reason, @source, @metadata)
    ON CONFLICT(lang, normalized)
    DO UPDATE SET term = excluded.term, reason = excluded.reason, source = excluded.source
  `);
  
  const insert = db.transaction((termsMap) => {
    for (const [reason, terms] of Object.entries(termsMap)) {
      for (const term of terms) {
        const normalized = normalizeTerm(term);
        if (!normalized) continue;
        
        stmt.run({
          lang: 'en',
          term,
          normalized,
          reason,
          source,
          metadata: JSON.stringify({ default: true })
        });
      }
    }
  });
  
  insert(skipTermsByReason);
}

/**
 * Normalize a term for matching (lowercase, trim, etc.)
 * @param {string} term - Term to normalize
 * @returns {string} Normalized term
 */
function normalizeTerm(term) {
  if (!term || typeof term !== 'string') return '';
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

module.exports = {
  getSkipTermsForLanguage,
  getSkipTermsByReason,
  shouldSkipTerm,
  getSkipReason,
  seedDefaultSkipTerms,
  normalizeTerm
};
