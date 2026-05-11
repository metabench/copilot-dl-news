/**
 * Topic Keywords Queries
 *
 * Database access layer for querying topic keywords for content analysis.
 */

const {
  getTopicTermsForLanguage: getTopicTermsForLanguageFromDb,
  getAllTopicTerms: getAllTopicTermsFromDb
} = require('news-crawler-db');

/**
 * Get all topic terms for a specific language as a Set for fast lookup
 * @param {import('better-sqlite3').Database} db
 * @param {string} lang - Language code (e.g., 'en', 'es', 'fr')
 * @returns {Set<string>} Set of normalized topic terms
 */
function getTopicTermsForLanguage(db, lang) {
  try {
    return getTopicTermsForLanguageFromDb(db, lang);
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
    return getAllTopicTermsFromDb(db);
  } catch (err) {
    console.error('[topicKeywords] Error fetching topic terms:', err.message);
    return new Set();
  }
}

module.exports = {
  getTopicTermsForLanguage,
  getAllTopicTerms
};
