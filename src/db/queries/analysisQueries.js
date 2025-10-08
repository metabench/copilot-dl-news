/**
 * Database queries for analysis operations
 * Separated from UI and business logic for modularity
 */

/**
 * Count articles that need analysis based on version
 * @param {Database} db - SQLite database instance
 * @param {number} analysisVersion - Target analysis version
 * @returns {number} Count of articles needing analysis
 */
function countArticlesNeedingAnalysis(db, analysisVersion = 1) {
  if (!db) throw new Error('countArticlesNeedingAnalysis requires db');
  
  const stmt = db.prepare(`
    SELECT COUNT(*) as count
      FROM articles a
     WHERE (
       a.analysis IS NULL
       OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) IS NULL
       OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) < ?
     )
  `);
  
  const result = stmt.get(analysisVersion);
  return result ? (result.count || 0) : 0;
}

/**
 * Count articles by analysis status for dashboard metrics
 * @param {Database} db - SQLite database instance
 * @returns {Object} Object with analyzed, pending, total counts
 */
function getAnalysisStatusCounts(db) {
  if (!db) throw new Error('getAnalysisStatusCounts requires db');
  
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM articles');
  const analyzedStmt = db.prepare(`
    SELECT COUNT(*) as count
      FROM articles
     WHERE analysis IS NOT NULL
  `);
  
  const total = totalStmt.get();
  const analyzed = analyzedStmt.get();
  
  return {
    total: total ? (total.count || 0) : 0,
    analyzed: analyzed ? (analyzed.count || 0) : 0,
    pending: (total ? (total.count || 0) : 0) - (analyzed ? (analyzed.count || 0) : 0)
  };
}

/**
 * Get articles eligible for analysis with pagination
 * @param {Database} db - SQLite database instance
 * @param {Object} options - Query options
 * @param {number} options.analysisVersion - Target analysis version
 * @param {number} options.limit - Max results to return
 * @param {number} options.offset - Results offset
 * @returns {Array} Array of article objects needing analysis
 */
function getArticlesNeedingAnalysis(db, { analysisVersion = 1, limit = 100, offset = 0 } = {}) {
  if (!db) throw new Error('getArticlesNeedingAnalysis requires db');
  
  const stmt = db.prepare(`
    SELECT a.url AS url,
           a.title AS title,
           a.analysis AS analysis_json,
           lf.ts AS last_ts
      FROM articles a
 LEFT JOIN latest_fetch lf ON lf.url = a.url
     WHERE (
       a.analysis IS NULL
       OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) IS NULL
       OR CAST(json_extract(a.analysis, '$.analysis_version') AS INTEGER) < ?
     )
  ORDER BY (last_ts IS NULL) ASC, last_ts DESC
     LIMIT ? OFFSET ?
  `);
  
  return stmt.all(analysisVersion, limit, offset);
}

module.exports = {
  countArticlesNeedingAnalysis,
  getAnalysisStatusCounts,
  getArticlesNeedingAnalysis
};
