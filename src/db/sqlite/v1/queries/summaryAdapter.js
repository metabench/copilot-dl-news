'use strict';

/**
 * Summary Database Adapter
 * 
 * Provides database access for article summaries:
 * - Save generated summaries
 * - Retrieve cached summaries
 * - Invalidate cache on article update
 * 
 * @module summaryAdapter
 */

/**
 * Create summary adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Summary adapter methods
 */
function createSummaryAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createSummaryAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure table exists (idempotent)
  db.exec(`
    -- Article Summaries (extractive summaries using TextRank)
    CREATE TABLE IF NOT EXISTS article_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      length_type TEXT NOT NULL CHECK(length_type IN ('brief', 'short', 'full', 'bullets')),
      summary_text TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'textrank',
      sentence_count INTEGER,
      word_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(content_id) REFERENCES content_analysis(id) ON DELETE CASCADE,
      UNIQUE(content_id, length_type)
    );

    -- Indexes for efficient lookups
    CREATE INDEX IF NOT EXISTS idx_article_summaries_content ON article_summaries(content_id);
    CREATE INDEX IF NOT EXISTS idx_article_summaries_length_type ON article_summaries(length_type);
    CREATE INDEX IF NOT EXISTS idx_article_summaries_method ON article_summaries(method);
    CREATE INDEX IF NOT EXISTS idx_article_summaries_created ON article_summaries(created_at);
  `);
  
  // Prepared statements
  const stmts = {
    saveSummary: db.prepare(`
      INSERT OR REPLACE INTO article_summaries 
        (content_id, length_type, summary_text, method, sentence_count, word_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `),
    
    getSummary: db.prepare(`
      SELECT 
        id,
        content_id,
        length_type,
        summary_text,
        method,
        sentence_count,
        word_count,
        created_at
      FROM article_summaries
      WHERE content_id = ? AND length_type = ?
    `),
    
    getAllSummaries: db.prepare(`
      SELECT 
        id,
        content_id,
        length_type,
        summary_text,
        method,
        sentence_count,
        word_count,
        created_at
      FROM article_summaries
      WHERE content_id = ?
      ORDER BY 
        CASE length_type 
          WHEN 'brief' THEN 1 
          WHEN 'short' THEN 2 
          WHEN 'full' THEN 3 
          WHEN 'bullets' THEN 4 
        END
    `),
    
    deleteSummary: db.prepare(`
      DELETE FROM article_summaries 
      WHERE content_id = ? AND length_type = ?
    `),
    
    deleteAllSummaries: db.prepare(`
      DELETE FROM article_summaries 
      WHERE content_id = ?
    `),
    
    hasSummary: db.prepare(`
      SELECT 1 FROM article_summaries 
      WHERE content_id = ? AND length_type = ?
      LIMIT 1
    `),
    
    getStats: db.prepare(`
      SELECT 
        COUNT(*) as total_summaries,
        COUNT(DISTINCT content_id) as articles_with_summaries,
        AVG(word_count) as avg_word_count,
        AVG(sentence_count) as avg_sentence_count
      FROM article_summaries
    `),
    
    getStatsByLength: db.prepare(`
      SELECT 
        length_type,
        COUNT(*) as count,
        AVG(word_count) as avg_word_count,
        AVG(sentence_count) as avg_sentence_count
      FROM article_summaries
      GROUP BY length_type
      ORDER BY 
        CASE length_type 
          WHEN 'brief' THEN 1 
          WHEN 'short' THEN 2 
          WHEN 'full' THEN 3 
          WHEN 'bullets' THEN 4 
        END
    `),
    
    getRecentSummaries: db.prepare(`
      SELECT 
        s.id,
        s.content_id,
        s.length_type,
        s.summary_text,
        s.method,
        s.sentence_count,
        s.word_count,
        s.created_at,
        ca.title as article_title
      FROM article_summaries s
      LEFT JOIN content_analysis ca ON ca.id = s.content_id
      ORDER BY s.created_at DESC
      LIMIT ?
    `),
    
    getArticlesWithoutSummaries: db.prepare(`
      SELECT 
        ca.id as content_id,
        ca.title,
        LENGTH(ca.body_text) as text_length
      FROM content_analysis ca
      LEFT JOIN article_summaries s ON s.content_id = ca.id AND s.length_type = ?
      WHERE s.id IS NULL
        AND ca.body_text IS NOT NULL
        AND LENGTH(ca.body_text) > 200
      ORDER BY ca.id DESC
      LIMIT ? OFFSET ?
    `),
    
    countArticlesWithoutSummaries: db.prepare(`
      SELECT COUNT(*) as total
      FROM content_analysis ca
      LEFT JOIN article_summaries s ON s.content_id = ca.id AND s.length_type = ?
      WHERE s.id IS NULL
        AND ca.body_text IS NOT NULL
        AND LENGTH(ca.body_text) > 200
    `)
  };
  
  return {
    /**
     * Save a summary
     * @param {Object} summary - Summary data
     * @param {number} summary.contentId - Content ID
     * @param {string} summary.lengthType - Length type (brief|short|full|bullets)
     * @param {string} summary.summaryText - Summary text
     * @param {string} [summary.method='textrank'] - Summarization method
     * @param {number} [summary.sentenceCount] - Number of sentences
     * @param {number} [summary.wordCount] - Word count
     * @returns {{changes: number}}
     */
    saveSummary({ contentId, lengthType, summaryText, method = 'textrank', sentenceCount = null, wordCount = null }) {
      const result = stmts.saveSummary.run(
        contentId,
        lengthType,
        summaryText,
        method,
        sentenceCount,
        wordCount
      );
      return { changes: result.changes };
    },
    
    /**
     * Get a summary by content ID and length type
     * @param {number} contentId - Content ID
     * @param {string} lengthType - Length type
     * @returns {Object|null} Summary or null if not found
     */
    getSummary(contentId, lengthType) {
      const row = stmts.getSummary.get(contentId, lengthType);
      if (!row) return null;
      
      return {
        id: row.id,
        contentId: row.content_id,
        length: row.length_type,
        summary: row.summary_text,
        method: row.method,
        sentenceCount: row.sentence_count,
        wordCount: row.word_count,
        createdAt: row.created_at
      };
    },
    
    /**
     * Get all summaries for an article
     * @param {number} contentId - Content ID
     * @returns {Object[]} Array of summaries
     */
    getAllSummaries(contentId) {
      const rows = stmts.getAllSummaries.all(contentId);
      return rows.map(row => ({
        id: row.id,
        contentId: row.content_id,
        length: row.length_type,
        summary: row.summary_text,
        method: row.method,
        sentenceCount: row.sentence_count,
        wordCount: row.word_count,
        createdAt: row.created_at
      }));
    },
    
    /**
     * Check if summary exists
     * @param {number} contentId - Content ID
     * @param {string} lengthType - Length type
     * @returns {boolean}
     */
    hasSummary(contentId, lengthType) {
      return !!stmts.hasSummary.get(contentId, lengthType);
    },
    
    /**
     * Delete summaries for an article
     * @param {number} contentId - Content ID
     * @param {string} [lengthType] - Specific length type or null for all
     * @returns {{deleted: number}}
     */
    deleteSummaries(contentId, lengthType = null) {
      if (lengthType) {
        const result = stmts.deleteSummary.run(contentId, lengthType);
        return { deleted: result.changes };
      } else {
        const result = stmts.deleteAllSummaries.run(contentId);
        return { deleted: result.changes };
      }
    },
    
    /**
     * Bulk save summaries in a transaction
     * @param {Object[]} summaries - Array of summary objects
     * @returns {{saved: number}}
     */
    bulkSaveSummaries(summaries) {
      const saveMany = db.transaction((items) => {
        let saved = 0;
        for (const summary of items) {
          stmts.saveSummary.run(
            summary.contentId,
            summary.lengthType,
            summary.summaryText,
            summary.method || 'textrank',
            summary.sentenceCount || null,
            summary.wordCount || null
          );
          saved++;
        }
        return saved;
      });
      
      const saved = saveMany(summaries);
      return { saved };
    },
    
    /**
     * Get summary statistics
     * @returns {Object}
     */
    getStats() {
      const overall = stmts.getStats.get();
      const byLength = stmts.getStatsByLength.all();
      
      return {
        totalSummaries: overall.total_summaries || 0,
        articlesWithSummaries: overall.articles_with_summaries || 0,
        avgWordCount: Math.round((overall.avg_word_count || 0) * 10) / 10,
        avgSentenceCount: Math.round((overall.avg_sentence_count || 0) * 10) / 10,
        byLengthType: byLength.map(row => ({
          lengthType: row.length_type,
          count: row.count,
          avgWordCount: Math.round((row.avg_word_count || 0) * 10) / 10,
          avgSentenceCount: Math.round((row.avg_sentence_count || 0) * 10) / 10
        }))
      };
    },
    
    /**
     * Get recent summaries with article titles
     * @param {number} [limit=20] - Max results
     * @returns {Object[]}
     */
    getRecentSummaries(limit = 20) {
      const rows = stmts.getRecentSummaries.all(limit);
      return rows.map(row => ({
        id: row.id,
        contentId: row.content_id,
        length: row.length_type,
        summary: row.summary_text,
        method: row.method,
        sentenceCount: row.sentence_count,
        wordCount: row.word_count,
        createdAt: row.created_at,
        articleTitle: row.article_title
      }));
    },
    
    /**
     * Get articles without summaries (for batch processing)
     * @param {string} [lengthType='short'] - Length type to check
     * @param {Object} [options] - Pagination options
     * @returns {Object[]}
     */
    getArticlesWithoutSummaries(lengthType = 'short', { limit = 100, offset = 0 } = {}) {
      const rows = stmts.getArticlesWithoutSummaries.all(lengthType, limit, offset);
      return rows.map(row => ({
        contentId: row.content_id,
        title: row.title,
        textLength: row.text_length
      }));
    },
    
    /**
     * Count articles without summaries
     * @param {string} [lengthType='short'] - Length type to check
     * @returns {number}
     */
    countArticlesWithoutSummaries(lengthType = 'short') {
      return stmts.countArticlesWithoutSummaries.get(lengthType).total;
    }
  };
}

module.exports = {
  createSummaryAdapter
};
