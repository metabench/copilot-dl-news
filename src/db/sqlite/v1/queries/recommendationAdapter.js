'use strict';

/**
 * Recommendation Database Adapter
 * 
 * Provides database access for article recommendations:
 * - Trending scores (view-based with decay)
 * - Cached recommendations (precomputed)
 * - View tracking integration
 * 
 * @module recommendationAdapter
 */

/**
 * Create recommendation adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Recommendation adapter methods
 */
function createRecommendationAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createRecommendationAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure tables exist (idempotent)
  db.exec(`
    -- Article Trending (view-based scoring with decay)
    CREATE TABLE IF NOT EXISTS article_trending (
      content_id INTEGER PRIMARY KEY,
      view_count INTEGER NOT NULL DEFAULT 0,
      last_view_at TEXT,
      trend_score REAL NOT NULL DEFAULT 0.0,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_storage(id) ON DELETE CASCADE
    );

    -- Cached Recommendations (precomputed)
    CREATE TABLE IF NOT EXISTS article_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      score REAL NOT NULL,
      strategy TEXT NOT NULL DEFAULT 'hybrid',
      reasons TEXT,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(source_id) REFERENCES content_storage(id) ON DELETE CASCADE,
      FOREIGN KEY(target_id) REFERENCES content_storage(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, strategy)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_article_trending_score ON article_trending(trend_score DESC);
    CREATE INDEX IF NOT EXISTS idx_article_trending_computed ON article_trending(computed_at);
    
    CREATE INDEX IF NOT EXISTS idx_article_recommendations_source ON article_recommendations(source_id);
    CREATE INDEX IF NOT EXISTS idx_article_recommendations_score ON article_recommendations(score DESC);
    CREATE INDEX IF NOT EXISTS idx_article_recommendations_strategy ON article_recommendations(strategy);
  `);
  
  // Prepared statements
  const stmts = {
    // =================== Trending ===================
    
    // Get trending score for article
    getTrending: db.prepare(`
      SELECT content_id, view_count, last_view_at, trend_score, computed_at
      FROM article_trending
      WHERE content_id = ?
    `),
    
    // Save/update trending data
    saveTrending: db.prepare(`
      INSERT OR REPLACE INTO article_trending 
        (content_id, view_count, last_view_at, trend_score, computed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `),
    
    // Get top trending articles
    getTopTrending: db.prepare(`
      SELECT 
        at.content_id,
        at.view_count,
        at.last_view_at,
        at.trend_score,
        ca.title,
        u.host
      FROM article_trending at
      INNER JOIN content_storage cs ON cs.id = at.content_id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE at.trend_score > 0
      ORDER BY at.trend_score DESC
      LIMIT ?
    `),
    
    // Get trending by category
    getTopTrendingByCategory: db.prepare(`
      SELECT 
        at.content_id,
        at.view_count,
        at.trend_score,
        ca.title,
        u.host,
        ac.category
      FROM article_trending at
      INNER JOIN content_storage cs ON cs.id = at.content_id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      LEFT JOIN article_categories ac ON ac.content_id = cs.id
      WHERE ac.category = ? AND at.trend_score > 0
      ORDER BY at.trend_score DESC
      LIMIT ?
    `),
    
    // Increment view count
    incrementViews: db.prepare(`
      INSERT INTO article_trending (content_id, view_count, last_view_at, trend_score, computed_at)
      VALUES (?, 1, datetime('now'), 0, datetime('now'))
      ON CONFLICT(content_id) DO UPDATE SET 
        view_count = view_count + 1,
        last_view_at = datetime('now')
    `),
    
    // Get all articles for trending recomputation
    getArticlesForTrendingUpdate: db.prepare(`
      SELECT content_id, view_count, last_view_at
      FROM article_trending
      WHERE view_count > 0
    `),
    
    // Count trending articles
    countTrending: db.prepare(`
      SELECT COUNT(*) as total FROM article_trending WHERE trend_score > 0
    `),
    
    // =================== Recommendations ===================
    
    // Get cached recommendations for article
    getRecommendations: db.prepare(`
      SELECT 
        ar.target_id,
        ar.score,
        ar.strategy,
        ar.reasons,
        ar.computed_at,
        ca.title,
        u.host,
        u.url
      FROM article_recommendations ar
      INNER JOIN content_storage cs ON cs.id = ar.target_id
      INNER JOIN http_responses hr ON hr.id = cs.http_response_id
      INNER JOIN urls u ON u.id = hr.url_id
      INNER JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE ar.source_id = ? AND ar.strategy = ?
      ORDER BY ar.score DESC
      LIMIT ?
    `),
    
    // Check if recommendations exist for article
    hasRecommendations: db.prepare(`
      SELECT COUNT(*) as count FROM article_recommendations
      WHERE source_id = ? AND strategy = ?
    `),
    
    // Save a recommendation
    saveRecommendation: db.prepare(`
      INSERT OR REPLACE INTO article_recommendations 
        (source_id, target_id, score, strategy, reasons, computed_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `),
    
    // Delete recommendations for article (before recomputing)
    deleteRecommendations: db.prepare(`
      DELETE FROM article_recommendations WHERE source_id = ? AND strategy = ?
    `),
    
    // Delete all recommendations for article
    deleteAllRecommendations: db.prepare(`
      DELETE FROM article_recommendations WHERE source_id = ?
    `),
    
    // Get articles needing recommendation refresh
    getStaleRecommendations: db.prepare(`
      SELECT DISTINCT source_id, computed_at
      FROM article_recommendations
      WHERE computed_at < datetime('now', '-1 day')
      ORDER BY computed_at ASC
      LIMIT ?
    `),
    
    // Count cached recommendations
    countRecommendations: db.prepare(`
      SELECT COUNT(DISTINCT source_id) as sources, COUNT(*) as total FROM article_recommendations
    `),
    
    // =================== Stats ===================
    
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM article_trending WHERE trend_score > 0) as trending_articles,
        (SELECT AVG(trend_score) FROM article_trending WHERE trend_score > 0) as avg_trend_score,
        (SELECT MAX(view_count) FROM article_trending) as max_views,
        (SELECT COUNT(DISTINCT source_id) FROM article_recommendations) as cached_sources,
        (SELECT COUNT(*) FROM article_recommendations) as total_recommendations
    `)
  };
  
  /**
   * Normalize trending row from database
   */
  function normalizeTrending(row) {
    if (!row) return null;
    return {
      contentId: row.content_id,
      viewCount: row.view_count,
      lastViewAt: row.last_view_at,
      trendScore: row.trend_score,
      computedAt: row.computed_at
    };
  }
  
  /**
   * Normalize recommendation row from database
   */
  function normalizeRecommendation(row) {
    if (!row) return null;
    return {
      targetId: row.target_id,
      score: row.score,
      strategy: row.strategy,
      reasons: row.reasons ? JSON.parse(row.reasons) : [],
      computedAt: row.computed_at,
      title: row.title,
      host: row.host,
      url: row.url
    };
  }
  
  return {
    // =================== Trending ===================
    
    /**
     * Get trending data for an article
     * @param {number} contentId - Content ID
     * @returns {Object|null}
     */
    getTrending(contentId) {
      const row = stmts.getTrending.get(contentId);
      return normalizeTrending(row);
    },
    
    /**
     * Save trending data for an article
     * @param {Object} data - Trending data
     * @param {number} data.contentId - Content ID
     * @param {number} data.viewCount - View count
     * @param {string} [data.lastViewAt] - Last view timestamp
     * @param {number} data.trendScore - Computed trend score
     * @returns {{changes: number}}
     */
    saveTrending({ contentId, viewCount, lastViewAt = null, trendScore }) {
      const result = stmts.saveTrending.run(contentId, viewCount, lastViewAt, trendScore);
      return { changes: result.changes };
    },
    
    /**
     * Bulk save trending data (for batch updates)
     * @param {Array<Object>} items - Array of trending data
     * @returns {{saved: number}}
     */
    bulkSaveTrending(items) {
      const insertMany = db.transaction((data) => {
        let saved = 0;
        for (const item of data) {
          stmts.saveTrending.run(
            item.contentId,
            item.viewCount,
            item.lastViewAt || null,
            item.trendScore
          );
          saved++;
        }
        return saved;
      });
      
      const saved = insertMany(items);
      return { saved };
    },
    
    /**
     * Get top trending articles
     * @param {Object} [options] - Options
     * @param {number} [options.limit=20] - Max articles
     * @param {string} [options.category] - Filter by category
     * @returns {Array<Object>}
     */
    getTopTrending({ limit = 20, category = null } = {}) {
      const rows = category
        ? stmts.getTopTrendingByCategory.all(category, limit)
        : stmts.getTopTrending.all(limit);
      
      return rows.map(row => ({
        contentId: row.content_id,
        viewCount: row.view_count,
        trendScore: row.trend_score,
        title: row.title,
        host: row.host,
        category: row.category
      }));
    },
    
    /**
     * Increment view count for an article
     * @param {number} contentId - Content ID
     * @returns {{changes: number}}
     */
    incrementViews(contentId) {
      const result = stmts.incrementViews.run(contentId);
      return { changes: result.changes };
    },
    
    /**
     * Get all articles for trending score recomputation
     * @returns {Array<{contentId: number, viewCount: number, lastViewAt: string}>}
     */
    getArticlesForTrendingUpdate() {
      const rows = stmts.getArticlesForTrendingUpdate.all();
      return rows.map(r => ({
        contentId: r.content_id,
        viewCount: r.view_count,
        lastViewAt: r.last_view_at
      }));
    },
    
    // =================== Recommendations ===================
    
    /**
     * Get cached recommendations for an article
     * @param {number} sourceId - Source article content ID
     * @param {Object} [options] - Options
     * @param {string} [options.strategy='hybrid'] - Recommendation strategy
     * @param {number} [options.limit=10] - Max recommendations
     * @returns {Array<Object>}
     */
    getRecommendations(sourceId, { strategy = 'hybrid', limit = 10 } = {}) {
      const rows = stmts.getRecommendations.all(sourceId, strategy, limit);
      return rows.map(normalizeRecommendation);
    },
    
    /**
     * Check if recommendations are cached for an article
     * @param {number} sourceId - Source article content ID
     * @param {string} [strategy='hybrid'] - Strategy
     * @returns {boolean}
     */
    hasRecommendations(sourceId, strategy = 'hybrid') {
      const row = stmts.hasRecommendations.get(sourceId, strategy);
      return row.count > 0;
    },
    
    /**
     * Save recommendations for an article
     * @param {number} sourceId - Source article content ID
     * @param {Array<Object>} recommendations - Recommendations to save
     * @param {string} [strategy='hybrid'] - Strategy used
     * @returns {{saved: number}}
     */
    saveRecommendations(sourceId, recommendations, strategy = 'hybrid') {
      const saveMany = db.transaction((recs) => {
        // Clear existing recommendations first
        stmts.deleteRecommendations.run(sourceId, strategy);
        
        let saved = 0;
        for (const rec of recs) {
          const reasons = Array.isArray(rec.reasons) ? JSON.stringify(rec.reasons) : null;
          stmts.saveRecommendation.run(
            sourceId,
            rec.targetId,
            rec.score,
            strategy,
            reasons
          );
          saved++;
        }
        return saved;
      });
      
      const saved = saveMany(recommendations);
      return { saved };
    },
    
    /**
     * Delete cached recommendations for an article
     * @param {number} sourceId - Source article content ID
     * @param {string} [strategy] - Strategy (null for all)
     * @returns {{changes: number}}
     */
    deleteRecommendations(sourceId, strategy = null) {
      const result = strategy
        ? stmts.deleteRecommendations.run(sourceId, strategy)
        : stmts.deleteAllRecommendations.run(sourceId);
      return { changes: result.changes };
    },
    
    /**
     * Get articles with stale recommendations
     * @param {number} [limit=100] - Max articles
     * @returns {Array<{sourceId: number, computedAt: string}>}
     */
    getStaleRecommendations(limit = 100) {
      const rows = stmts.getStaleRecommendations.all(limit);
      return rows.map(r => ({
        sourceId: r.source_id,
        computedAt: r.computed_at
      }));
    },
    
    // =================== Stats ===================
    
    /**
     * Get recommendation system statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        trendingArticles: row.trending_articles,
        avgTrendScore: Math.round((row.avg_trend_score || 0) * 1000) / 1000,
        maxViews: row.max_views || 0,
        cachedSources: row.cached_sources,
        totalRecommendations: row.total_recommendations
      };
    }
  };
}

module.exports = {
  createRecommendationAdapter
};
