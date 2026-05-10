/**
 * Topic Keywords Queries
 *
 * Database access layer for querying topic keywords for content analysis.
 */

/**
 * Get all topic terms for a specific language as a Set for fast lookup
 * @param {import('better-sqlite3').Database} db
 * @param {string} lang - Language code (e.g., 'en', 'es', 'fr')
 * @returns {Set<string>} Set of normalized topic terms
 */
function getTopicTermsForLanguage(db, lang) {
  try {
    const terms = db.prepare(`
      SELECT DISTINCT normalized
      FROM topic_keywords
      WHERE lang = ? AND normalized IS NOT NULL AND normalized != ''
    `).all(lang);

    return new Set(terms.map(row => row.normalized));
  } catch (err) {
    console.error('[topicKeywords] Error fetching topic terms:', err.message);
    return new Set();
  }
}

/**
 * Get all topic terms across all languages as a Set
 * @param {import('better-sqlite3').Database} db
 * @returns {Set<string>} Set of normalized topic terms
 */
function getAllTopicTerms(db) {
  try {
    const terms = db.prepare(`
      SELECT DISTINCT normalized
      FROM topic_keywords
      WHERE normalized IS NOT NULL AND normalized != ''
    `).all();

    return new Set(terms.map(row => row.normalized));
  } catch (err) {
    console.error('[topicKeywords] Error fetching topic terms:', err.message);
    return new Set();
  }
}

module.exports = {
  getTopicTermsForLanguage,
  getAllTopicTerms
};