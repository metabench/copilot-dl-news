'use strict';

/**
 * Story Coverage Database Adapter
 * 
 * Stores per-article coverage analysis for multi-source aggregation:
 * - Tone analysis (critical/neutral/supportive)
 * - Focus keywords
 * - Prominent entities
 * - Extracted facts (quotes, stats, dates, claims)
 * 
 * @module coverageAdapter
 */

/**
 * Create coverage adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Coverage adapter methods
 */
function createCoverageAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createCoverageAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure table exists (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_coverage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      content_id INTEGER NOT NULL,
      host TEXT,
      tone TEXT CHECK(tone IN ('critical', 'neutral', 'supportive')),
      tone_score REAL,
      tone_confidence REAL,
      focus_keywords TEXT,
      prominent_entities TEXT,
      facts_json TEXT,
      analyzed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(story_id, content_id)
    );

    CREATE INDEX IF NOT EXISTS idx_story_coverage_story ON story_coverage(story_id);
    CREATE INDEX IF NOT EXISTS idx_story_coverage_content ON story_coverage(content_id);
    CREATE INDEX IF NOT EXISTS idx_story_coverage_host ON story_coverage(host);
    CREATE INDEX IF NOT EXISTS idx_story_coverage_tone ON story_coverage(tone);
  `);
  
  // Prepared statements
  const stmts = {
    saveCoverage: db.prepare(`
      INSERT INTO story_coverage (
        story_id, content_id, host, tone, tone_score, tone_confidence,
        focus_keywords, prominent_entities, facts_json, analyzed_at
      )
      VALUES (
        @storyId, @contentId, @host, @tone, @toneScore, @toneConfidence,
        @focusKeywords, @prominentEntities, @factsJson, datetime('now')
      )
      ON CONFLICT(story_id, content_id) DO UPDATE SET
        host = excluded.host,
        tone = excluded.tone,
        tone_score = excluded.tone_score,
        tone_confidence = excluded.tone_confidence,
        focus_keywords = excluded.focus_keywords,
        prominent_entities = excluded.prominent_entities,
        facts_json = excluded.facts_json,
        analyzed_at = datetime('now')
    `),
    
    getCoverage: db.prepare(`
      SELECT id, story_id, content_id, host, tone, tone_score, tone_confidence,
             focus_keywords, prominent_entities, facts_json, analyzed_at
      FROM story_coverage
      WHERE story_id = ? AND content_id = ?
    `),
    
    getStoryCoverage: db.prepare(`
      SELECT id, story_id, content_id, host, tone, tone_score, tone_confidence,
             focus_keywords, prominent_entities, facts_json, analyzed_at
      FROM story_coverage
      WHERE story_id = ?
      ORDER BY analyzed_at DESC
    `),
    
    getArticleCoverage: db.prepare(`
      SELECT id, story_id, content_id, host, tone, tone_score, tone_confidence,
             focus_keywords, prominent_entities, facts_json, analyzed_at
      FROM story_coverage
      WHERE content_id = ?
    `),
    
    deleteCoverage: db.prepare(`
      DELETE FROM story_coverage WHERE story_id = ? AND content_id = ?
    `),
    
    deleteStoryCoverage: db.prepare(`
      DELETE FROM story_coverage WHERE story_id = ?
    `),
    
    countByStory: db.prepare(`
      SELECT COUNT(*) as count FROM story_coverage WHERE story_id = ?
    `),
    
    getToneDistribution: db.prepare(`
      SELECT tone, COUNT(*) as count
      FROM story_coverage
      WHERE story_id = ?
      GROUP BY tone
    `),
    
    getStats: db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT story_id) as stories,
        COUNT(DISTINCT content_id) as articles,
        COUNT(DISTINCT host) as hosts
      FROM story_coverage
    `)
  };
  
  /**
   * Normalize row from database
   */
  function normalizeRow(row) {
    if (!row) return null;
    
    return {
      id: row.id,
      storyId: row.story_id,
      contentId: row.content_id,
      host: row.host,
      tone: row.tone,
      toneScore: row.tone_score,
      toneConfidence: row.tone_confidence,
      focusKeywords: row.focus_keywords ? JSON.parse(row.focus_keywords) : [],
      prominentEntities: row.prominent_entities ? JSON.parse(row.prominent_entities) : [],
      facts: row.facts_json ? JSON.parse(row.facts_json) : null,
      analyzedAt: row.analyzed_at
    };
  }
  
  return {
    /**
     * Save coverage analysis for an article in a story
     * 
     * @param {Object} coverage - Coverage data
     * @param {number} coverage.storyId - Story cluster ID
     * @param {number} coverage.contentId - Article content ID
     * @param {string} [coverage.host] - Source host/domain
     * @param {string} [coverage.tone] - Tone: critical/neutral/supportive
     * @param {number} [coverage.toneScore] - Tone score (-1 to 1)
     * @param {number} [coverage.toneConfidence] - Confidence (0 to 1)
     * @param {string[]} [coverage.focusKeywords] - Focus keywords
     * @param {Array} [coverage.prominentEntities] - Prominent entities
     * @param {Object} [coverage.facts] - Extracted facts
     * @returns {{changes: number}}
     */
    saveCoverage(coverage) {
      const result = stmts.saveCoverage.run({
        storyId: coverage.storyId,
        contentId: coverage.contentId,
        host: coverage.host || null,
        tone: coverage.tone || null,
        toneScore: coverage.toneScore != null ? coverage.toneScore : null,
        toneConfidence: coverage.toneConfidence != null ? coverage.toneConfidence : null,
        focusKeywords: coverage.focusKeywords 
          ? JSON.stringify(coverage.focusKeywords) 
          : null,
        prominentEntities: coverage.prominentEntities 
          ? JSON.stringify(coverage.prominentEntities) 
          : null,
        factsJson: coverage.facts 
          ? JSON.stringify(coverage.facts) 
          : null
      });
      
      return { changes: result.changes };
    },
    
    /**
     * Get coverage for a specific article in a story
     * 
     * @param {number} storyId - Story cluster ID
     * @param {number} contentId - Article content ID
     * @returns {Object|null} Coverage or null
     */
    getCoverage(storyId, contentId) {
      const row = stmts.getCoverage.get(storyId, contentId);
      return normalizeRow(row);
    },
    
    /**
     * Get all coverage entries for a story
     * 
     * @param {number} storyId - Story cluster ID
     * @returns {Array} Coverage entries
     */
    getStoryCoverage(storyId) {
      const rows = stmts.getStoryCoverage.all(storyId);
      return rows.map(normalizeRow);
    },
    
    /**
     * Get coverage for an article (may be in multiple stories)
     * 
     * @param {number} contentId - Article content ID
     * @returns {Array} Coverage entries
     */
    getArticleCoverage(contentId) {
      const rows = stmts.getArticleCoverage.all(contentId);
      return rows.map(normalizeRow);
    },
    
    /**
     * Delete coverage for an article in a story
     * 
     * @param {number} storyId - Story cluster ID
     * @param {number} contentId - Article content ID
     * @returns {{deleted: boolean}}
     */
    deleteCoverage(storyId, contentId) {
      const result = stmts.deleteCoverage.run(storyId, contentId);
      return { deleted: result.changes > 0 };
    },
    
    /**
     * Delete all coverage for a story
     * 
     * @param {number} storyId - Story cluster ID
     * @returns {{deleted: number}}
     */
    deleteStoryCoverage(storyId) {
      const result = stmts.deleteStoryCoverage.run(storyId);
      return { deleted: result.changes };
    },
    
    /**
     * Count coverage entries for a story
     * 
     * @param {number} storyId - Story cluster ID
     * @returns {number}
     */
    countByStory(storyId) {
      const row = stmts.countByStory.get(storyId);
      return row ? row.count : 0;
    },
    
    /**
     * Get tone distribution for a story
     * 
     * @param {number} storyId - Story cluster ID
     * @returns {{critical: number, neutral: number, supportive: number}}
     */
    getToneDistribution(storyId) {
      const rows = stmts.getToneDistribution.all(storyId);
      const dist = { critical: 0, neutral: 0, supportive: 0 };
      
      for (const row of rows) {
        if (row.tone && dist.hasOwnProperty(row.tone)) {
          dist[row.tone] = row.count;
        }
      }
      
      return dist;
    },
    
    /**
     * Bulk save coverage entries
     * 
     * @param {Array<Object>} coverages - Coverage entries
     * @returns {{saved: number}}
     */
    bulkSave(coverages) {
      const insert = db.transaction((items) => {
        let saved = 0;
        for (const coverage of items) {
          try {
            stmts.saveCoverage.run({
              storyId: coverage.storyId,
              contentId: coverage.contentId,
              host: coverage.host || null,
              tone: coverage.tone || null,
              toneScore: coverage.toneScore != null ? coverage.toneScore : null,
              toneConfidence: coverage.toneConfidence != null ? coverage.toneConfidence : null,
              focusKeywords: coverage.focusKeywords 
                ? JSON.stringify(coverage.focusKeywords) 
                : null,
              prominentEntities: coverage.prominentEntities 
                ? JSON.stringify(coverage.prominentEntities) 
                : null,
              factsJson: coverage.facts 
                ? JSON.stringify(coverage.facts) 
                : null
            });
            saved++;
          } catch (err) {
            // Skip invalid entries
          }
        }
        return saved;
      });
      
      return { saved: insert(coverages) };
    },
    
    /**
     * Get adapter statistics
     * @returns {Object}
     */
    getStats() {
      const row = stmts.getStats.get();
      return {
        totalCoverage: row.total,
        uniqueStories: row.stories,
        uniqueArticles: row.articles,
        uniqueHosts: row.hosts
      };
    }
  };
}

module.exports = { createCoverageAdapter };
