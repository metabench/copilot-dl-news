/**
 * @fileoverview Database queries for topic keywords (multi-lingual support).
 * 
 * Topic keywords are stored in the database to support internationalization.
 * Each topic can have multiple terms in different languages (en, fr, es, etc.).
 * 
 * Table: topic_keywords
 * Columns: id, topic, lang, term, normalized, source, metadata
 */
'use strict';

/**
 * Get all topic terms for a specific language
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} lang - BCP-47 language code (e.g., 'en', 'fr', 'es')
 * @returns {Set<string>} Set of normalized topic terms
 */
function getTopicTermsForLanguage(db, lang = 'en') {
  const stmt = db.prepare(`
    SELECT DISTINCT normalized
    FROM topic_keywords
    WHERE lang = ?
    ORDER BY normalized
  `);
  
  const rows = stmt.all(lang);
  return new Set(rows.map(row => row.normalized));
}

/**
 * Get all topics with their terms grouped by language
 * @param {Database} db - better-sqlite3 database instance
 * @returns {Map<string, Map<string, string[]>>} topic -> lang -> [terms]
 */
function getAllTopicsGrouped(db) {
  const stmt = db.prepare(`
    SELECT topic, lang, term, normalized
    FROM topic_keywords
    ORDER BY topic, lang, term
  `);
  
  const rows = stmt.all();
  const result = new Map();
  
  for (const row of rows) {
    if (!result.has(row.topic)) {
      result.set(row.topic, new Map());
    }
    const topicMap = result.get(row.topic);
    if (!topicMap.has(row.lang)) {
      topicMap.set(row.lang, []);
    }
    topicMap.get(row.lang).push(row.term);
  }
  
  return result;
}

/**
 * Check if a term is a known topic keyword
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} term - Term to check (will be normalized)
 * @param {string} lang - BCP-47 language code
 * @returns {boolean} True if term is a recognized topic
 */
function isTopicKeyword(db, term, lang = 'en') {
  const normalized = normalizeTerm(term);
  if (!normalized) return false;
  
  const stmt = db.prepare(`
    SELECT 1
    FROM topic_keywords
    WHERE lang = ? AND normalized = ?
    LIMIT 1
  `);
  
  return stmt.get(lang, normalized) !== undefined;
}

/**
 * Get the canonical topic identifier for a term
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} term - Term to look up
 * @param {string} lang - BCP-47 language code
 * @returns {string|null} Topic identifier or null if not found
 */
function getTopicForTerm(db, term, lang = 'en') {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  
  const stmt = db.prepare(`
    SELECT topic
    FROM topic_keywords
    WHERE lang = ? AND normalized = ?
    LIMIT 1
  `);
  
  const row = stmt.get(lang, normalized);
  return row ? row.topic : null;
}

/**
 * Seed default English topic keywords
 * @param {Database} db - better-sqlite3 database instance
 * @param {string} source - Source identifier for provenance
 */
function seedDefaultTopics(db, source = 'system-default') {
  const topics = {
    'politics': ['politics', 'political', 'government', 'parliament', 'congress'],
    'sport': ['sport', 'sports', 'athletics', 'football', 'cricket', 'rugby', 'tennis', 'boxing', 'racing'],
    'business': ['business', 'economy', 'markets', 'finance', 'money', 'careers'],
    'technology': ['technology', 'tech', 'digital', 'computing', 'internet'],
    'science': ['science', 'research', 'scientific', 'study'],
    'environment': ['environment', 'climate', 'sustainability', 'ecology'],
    'culture': ['culture', 'books', 'music', 'film', 'tv', 'television', 'art', 'design', 'stage', 'classical', 'photography', 'architecture'],
    'lifestyle': ['lifestyle', 'food', 'fashion', 'travel', 'health', 'lifeandstyle', 'games', 'gaming'],
    'education': ['education', 'schools', 'universities', 'learning'],
    'media': ['media', 'journalism', 'news', 'press'],
    'society': ['society', 'social', 'community'],
    'law': ['law', 'legal', 'justice', 'courts'],
    'opinion': ['opinion', 'commentisfree', 'comment', 'editorial', 'analysis']
  };
  
  const stmt = db.prepare(`
    INSERT INTO topic_keywords(topic, lang, term, normalized, source, metadata)
    VALUES (@topic, @lang, @term, @normalized, @source, @metadata)
    ON CONFLICT(topic, lang, normalized)
    DO UPDATE SET term = excluded.term, source = excluded.source
  `);
  
  const insert = db.transaction((topicsMap) => {
    for (const [topic, terms] of Object.entries(topicsMap)) {
      for (const term of terms) {
        const normalized = normalizeTerm(term);
        if (!normalized) continue;
        
        stmt.run({
          topic,
          lang: 'en',
          term,
          normalized,
          source,
          metadata: JSON.stringify({ default: true })
        });
      }
    }
  });
  
  insert(topics);
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
  getTopicTermsForLanguage,
  getAllTopicsGrouped,
  isTopicKeyword,
  getTopicForTerm,
  seedDefaultTopics,
  normalizeTerm
};
