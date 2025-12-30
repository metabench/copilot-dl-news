'use strict';

/**
 * Sentiment Database Adapter
 * 
 * Provides database access for article sentiment analysis:
 * - Save sentiment analysis results
 * - Retrieve cached sentiment
 * - Entity-level sentiment storage
 * - Sentiment statistics and queries
 * 
 * @module sentimentAdapter
 */

/**
 * Create sentiment adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Sentiment adapter methods
 */
function createSentimentAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createSentimentAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure tables exist (idempotent)
  db.exec(`
    -- Article Sentiment Analysis Results
    CREATE TABLE IF NOT EXISTS article_sentiment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL UNIQUE,
      overall_score REAL NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.0,
      positive_pct REAL DEFAULT 0.0,
      negative_pct REAL DEFAULT 0.0,
      neutral_pct REAL DEFAULT 0.0,
      entity_sentiments TEXT,
      method TEXT NOT NULL DEFAULT 'lexicon',
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_article_sentiment_content ON article_sentiment(content_id);
    CREATE INDEX IF NOT EXISTS idx_article_sentiment_score ON article_sentiment(overall_score);
    CREATE INDEX IF NOT EXISTS idx_article_sentiment_confidence ON article_sentiment(confidence DESC);
    CREATE INDEX IF NOT EXISTS idx_article_sentiment_analyzed ON article_sentiment(analyzed_at);
  `);
  
  // Prepared statements
  const stmts = {
    saveSentiment: db.prepare(`
      INSERT OR REPLACE INTO article_sentiment 
        (content_id, overall_score, confidence, positive_pct, negative_pct, neutral_pct, entity_sentiments, method, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getSentiment: db.prepare(`
      SELECT 
        id,
        content_id,
        overall_score,
        confidence,
        positive_pct,
        negative_pct,
        neutral_pct,
        entity_sentiments,
        method,
        analyzed_at
      FROM article_sentiment
      WHERE content_id = ?
    `),
    
    deleteSentiment: db.prepare(`
      DELETE FROM article_sentiment 
      WHERE content_id = ?
    `),
    
    hasSentiment: db.prepare(`
      SELECT 1 FROM article_sentiment 
      WHERE content_id = ?
      LIMIT 1
    `),
    
    getStats: db.prepare(`
      SELECT 
        COUNT(*) as total_analyzed,
        AVG(overall_score) as avg_score,
        AVG(confidence) as avg_confidence,
        MIN(overall_score) as min_score,
        MAX(overall_score) as max_score,
        SUM(CASE WHEN overall_score > 0.1 THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN overall_score < -0.1 THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN overall_score >= -0.1 AND overall_score <= 0.1 THEN 1 ELSE 0 END) as neutral_count
      FROM article_sentiment
    `),
    
    getStatsByDateRange: db.prepare(`
      SELECT 
        COUNT(*) as total_analyzed,
        AVG(overall_score) as avg_score,
        AVG(confidence) as avg_confidence,
        MIN(overall_score) as min_score,
        MAX(overall_score) as max_score
      FROM article_sentiment
      WHERE analyzed_at >= ? AND analyzed_at <= ?
    `),
    
    getRecentSentiments: db.prepare(`
      SELECT 
        s.id,
        s.content_id,
        s.overall_score,
        s.confidence,
        s.positive_pct,
        s.negative_pct,
        s.analyzed_at,
        ca.title as article_title
      FROM article_sentiment s
      LEFT JOIN content_analysis ca ON ca.id = s.content_id
      ORDER BY s.analyzed_at DESC
      LIMIT ?
    `),
    
    getPositiveArticles: db.prepare(`
      SELECT 
        s.content_id,
        s.overall_score,
        s.confidence,
        ca.title
      FROM article_sentiment s
      LEFT JOIN content_analysis ca ON ca.id = s.content_id
      WHERE s.overall_score > ?
      ORDER BY s.overall_score DESC
      LIMIT ? OFFSET ?
    `),
    
    getNegativeArticles: db.prepare(`
      SELECT 
        s.content_id,
        s.overall_score,
        s.confidence,
        ca.title
      FROM article_sentiment s
      LEFT JOIN content_analysis ca ON ca.id = s.content_id
      WHERE s.overall_score < ?
      ORDER BY s.overall_score ASC
      LIMIT ? OFFSET ?
    `),
    
    getArticlesWithoutSentiment: db.prepare(`
      SELECT 
        ca.id as content_id,
        ca.title,
        LENGTH(ca.body_text) as text_length
      FROM content_analysis ca
      LEFT JOIN article_sentiment s ON s.content_id = ca.id
      WHERE s.id IS NULL
        AND ca.body_text IS NOT NULL
        AND LENGTH(ca.body_text) > 200
      ORDER BY ca.id DESC
      LIMIT ? OFFSET ?
    `),
    
    countArticlesWithoutSentiment: db.prepare(`
      SELECT COUNT(*) as total
      FROM content_analysis ca
      LEFT JOIN article_sentiment s ON s.content_id = ca.id
      WHERE s.id IS NULL
        AND ca.body_text IS NOT NULL
        AND LENGTH(ca.body_text) > 200
    `),
    
    getScoreDistribution: db.prepare(`
      SELECT 
        CASE 
          WHEN overall_score < -0.6 THEN 'very_negative'
          WHEN overall_score < -0.2 THEN 'negative'
          WHEN overall_score <= 0.2 THEN 'neutral'
          WHEN overall_score <= 0.6 THEN 'positive'
          ELSE 'very_positive'
        END as sentiment_band,
        COUNT(*) as count
      FROM article_sentiment
      GROUP BY sentiment_band
      ORDER BY 
        CASE sentiment_band
          WHEN 'very_negative' THEN 1
          WHEN 'negative' THEN 2
          WHEN 'neutral' THEN 3
          WHEN 'positive' THEN 4
          WHEN 'very_positive' THEN 5
        END
    `),
    
    getSentimentTimeSeries: db.prepare(`
      SELECT 
        date(analyzed_at) as date,
        COUNT(*) as count,
        AVG(overall_score) as avg_score,
        AVG(confidence) as avg_confidence
      FROM article_sentiment
      WHERE analyzed_at >= ?
      GROUP BY date(analyzed_at)
      ORDER BY date
    `),
    
    getEntitySentimentAggregates: db.prepare(`
      SELECT 
        content_id,
        entity_sentiments
      FROM article_sentiment
      WHERE entity_sentiments IS NOT NULL
        AND entity_sentiments != '[]'
        AND entity_sentiments != 'null'
      ORDER BY analyzed_at DESC
      LIMIT ?
    `)
  };
  
  return {
    /**
     * Save sentiment analysis result
     * @param {Object} sentiment - Sentiment data
     * @param {number} sentiment.contentId - Content ID
     * @param {number} sentiment.overallScore - Overall sentiment score (-1 to +1)
     * @param {number} sentiment.confidence - Confidence score (0 to 1)
     * @param {number} [sentiment.positivePct] - Positive word percentage
     * @param {number} [sentiment.negativePct] - Negative word percentage
     * @param {Array} [sentiment.entitySentiments] - Entity-level sentiments
     * @param {string} [sentiment.method='lexicon'] - Analysis method
     * @returns {{changes: number}}
     */
    saveSentiment({
      contentId,
      overallScore,
      confidence,
      positivePct = 0,
      negativePct = 0,
      entitySentiments = null,
      method = 'lexicon'
    }) {
      const neutralPct = 1 - positivePct - negativePct;
      const entityJson = entitySentiments ? JSON.stringify(entitySentiments) : null;
      
      const result = stmts.saveSentiment.run(
        contentId,
        overallScore,
        confidence,
        positivePct,
        negativePct,
        neutralPct,
        entityJson,
        method
      );
      return { changes: result.changes };
    },
    
    /**
     * Get sentiment for an article
     * @param {number} contentId - Content ID
     * @returns {Object|null} Sentiment result or null if not found
     */
    getSentiment(contentId) {
      const row = stmts.getSentiment.get(contentId);
      if (!row) return null;
      
      return {
        id: row.id,
        contentId: row.content_id,
        overallScore: row.overall_score,
        confidence: row.confidence,
        breakdown: {
          positive: row.positive_pct,
          negative: row.negative_pct,
          neutral: row.neutral_pct
        },
        entitySentiments: row.entity_sentiments ? JSON.parse(row.entity_sentiments) : [],
        method: row.method,
        analyzedAt: row.analyzed_at
      };
    },
    
    /**
     * Check if sentiment exists for an article
     * @param {number} contentId - Content ID
     * @returns {boolean}
     */
    hasSentiment(contentId) {
      return !!stmts.hasSentiment.get(contentId);
    },
    
    /**
     * Delete sentiment for an article
     * @param {number} contentId - Content ID
     * @returns {{deleted: number}}
     */
    deleteSentiment(contentId) {
      const result = stmts.deleteSentiment.run(contentId);
      return { deleted: result.changes };
    },
    
    /**
     * Bulk save sentiments in a transaction
     * @param {Object[]} sentiments - Array of sentiment objects
     * @returns {{saved: number}}
     */
    bulkSaveSentiments(sentiments) {
      const saveMany = db.transaction((items) => {
        let saved = 0;
        for (const sentiment of items) {
          const neutralPct = 1 - (sentiment.positivePct || 0) - (sentiment.negativePct || 0);
          const entityJson = sentiment.entitySentiments ? JSON.stringify(sentiment.entitySentiments) : null;
          
          stmts.saveSentiment.run(
            sentiment.contentId,
            sentiment.overallScore,
            sentiment.confidence || 0,
            sentiment.positivePct || 0,
            sentiment.negativePct || 0,
            neutralPct,
            entityJson,
            sentiment.method || 'lexicon'
          );
          saved++;
        }
        return saved;
      });
      
      const saved = saveMany(sentiments);
      return { saved };
    },
    
    /**
     * Get sentiment statistics
     * @returns {Object}
     */
    getStats() {
      const overall = stmts.getStats.get();
      const distribution = stmts.getScoreDistribution.all();
      
      return {
        totalAnalyzed: overall.total_analyzed || 0,
        avgScore: Math.round((overall.avg_score || 0) * 1000) / 1000,
        avgConfidence: Math.round((overall.avg_confidence || 0) * 1000) / 1000,
        minScore: overall.min_score || 0,
        maxScore: overall.max_score || 0,
        counts: {
          positive: overall.positive_count || 0,
          negative: overall.negative_count || 0,
          neutral: overall.neutral_count || 0
        },
        distribution: distribution.map(row => ({
          band: row.sentiment_band,
          count: row.count
        }))
      };
    },
    
    /**
     * Get statistics for a date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Object}
     */
    getStatsByDateRange(startDate, endDate) {
      const row = stmts.getStatsByDateRange.get(startDate, endDate);
      
      return {
        totalAnalyzed: row.total_analyzed || 0,
        avgScore: Math.round((row.avg_score || 0) * 1000) / 1000,
        avgConfidence: Math.round((row.avg_confidence || 0) * 1000) / 1000,
        minScore: row.min_score || 0,
        maxScore: row.max_score || 0
      };
    },
    
    /**
     * Get recent sentiment analyses
     * @param {number} [limit=20] - Max results
     * @returns {Object[]}
     */
    getRecentSentiments(limit = 20) {
      const rows = stmts.getRecentSentiments.all(limit);
      return rows.map(row => ({
        id: row.id,
        contentId: row.content_id,
        overallScore: row.overall_score,
        confidence: row.confidence,
        positivePct: row.positive_pct,
        negativePct: row.negative_pct,
        analyzedAt: row.analyzed_at,
        articleTitle: row.article_title
      }));
    },
    
    /**
     * Get most positive articles
     * @param {Object} [options] - Options
     * @param {number} [options.minScore=0.3] - Minimum score threshold
     * @param {number} [options.limit=20] - Max results
     * @param {number} [options.offset=0] - Offset for pagination
     * @returns {Object[]}
     */
    getPositiveArticles({ minScore = 0.3, limit = 20, offset = 0 } = {}) {
      const rows = stmts.getPositiveArticles.all(minScore, limit, offset);
      return rows.map(row => ({
        contentId: row.content_id,
        score: row.overall_score,
        confidence: row.confidence,
        title: row.title
      }));
    },
    
    /**
     * Get most negative articles
     * @param {Object} [options] - Options
     * @param {number} [options.maxScore=-0.3] - Maximum score threshold
     * @param {number} [options.limit=20] - Max results
     * @param {number} [options.offset=0] - Offset for pagination
     * @returns {Object[]}
     */
    getNegativeArticles({ maxScore = -0.3, limit = 20, offset = 0 } = {}) {
      const rows = stmts.getNegativeArticles.all(maxScore, limit, offset);
      return rows.map(row => ({
        contentId: row.content_id,
        score: row.overall_score,
        confidence: row.confidence,
        title: row.title
      }));
    },
    
    /**
     * Get articles without sentiment analysis (for batch processing)
     * @param {Object} [options] - Pagination options
     * @returns {Object[]}
     */
    getArticlesWithoutSentiment({ limit = 100, offset = 0 } = {}) {
      const rows = stmts.getArticlesWithoutSentiment.all(limit, offset);
      return rows.map(row => ({
        contentId: row.content_id,
        title: row.title,
        textLength: row.text_length
      }));
    },
    
    /**
     * Count articles without sentiment
     * @returns {number}
     */
    countArticlesWithoutSentiment() {
      return stmts.countArticlesWithoutSentiment.get().total;
    },
    
    /**
     * Get sentiment time series
     * @param {string} sinceDate - Start date (YYYY-MM-DD)
     * @returns {Object[]}
     */
    getSentimentTimeSeries(sinceDate) {
      const rows = stmts.getSentimentTimeSeries.all(sinceDate);
      return rows.map(row => ({
        date: row.date,
        count: row.count,
        avgScore: Math.round((row.avg_score || 0) * 1000) / 1000,
        avgConfidence: Math.round((row.avg_confidence || 0) * 1000) / 1000
      }));
    },
    
    /**
     * Get aggregated entity sentiments across articles
     * @param {number} [limit=100] - Max articles to analyze
     * @returns {Object} Aggregated entity sentiment map
     */
    getEntitySentimentAggregates(limit = 100) {
      const rows = stmts.getEntitySentimentAggregates.all(limit);
      const entityMap = new Map();
      
      for (const row of rows) {
        try {
          const entities = JSON.parse(row.entity_sentiments);
          
          for (const entity of entities) {
            const key = `${entity.entity}|${entity.type}`;
            
            if (!entityMap.has(key)) {
              entityMap.set(key, {
                entity: entity.entity,
                type: entity.type,
                scores: [],
                totalMentions: 0
              });
            }
            
            const agg = entityMap.get(key);
            agg.scores.push(entity.score);
            agg.totalMentions += entity.mentions || 1;
          }
        } catch (err) {
          // Skip malformed JSON
        }
      }
      
      // Calculate averages
      const results = [];
      for (const [, agg] of entityMap) {
        const avgScore = agg.scores.reduce((sum, s) => sum + s, 0) / agg.scores.length;
        results.push({
          entity: agg.entity,
          type: agg.type,
          avgScore: Math.round(avgScore * 1000) / 1000,
          articleCount: agg.scores.length,
          totalMentions: agg.totalMentions
        });
      }
      
      // Sort by absolute score
      results.sort((a, b) => Math.abs(b.avgScore) - Math.abs(a.avgScore));
      
      return results;
    }
  };
}

module.exports = {
  createSentimentAdapter
};
