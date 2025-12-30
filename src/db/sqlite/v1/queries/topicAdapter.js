'use strict';

/**
 * Topic Database Adapter
 * 
 * Provides database access for topic modeling and story clustering:
 * - Topics (seed + discovered)
 * - Article-topic assignments
 * - Story clusters
 * - Topic trends
 * 
 * @module topicAdapter
 */

/**
 * Create topic adapter
 * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
 * @returns {Object} Topic adapter methods
 */
function createTopicAdapter(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createTopicAdapter requires a better-sqlite3 database handle');
  }
  
  // Ensure tables exist (idempotent)
  db.exec(`
    -- Topics table
    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      keywords TEXT NOT NULL,
      is_seed INTEGER DEFAULT 0,
      article_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Article-topic assignments
    CREATE TABLE IF NOT EXISTS article_topics (
      content_id INTEGER NOT NULL,
      topic_id INTEGER NOT NULL,
      probability REAL NOT NULL CHECK(probability >= 0 AND probability <= 1),
      assigned_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (content_id, topic_id)
    );

    -- Story clusters
    CREATE TABLE IF NOT EXISTS story_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headline TEXT NOT NULL,
      summary TEXT,
      article_ids TEXT NOT NULL,
      article_count INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT (datetime('now')),
      last_updated TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1,
      primary_topic_id INTEGER
    );

    -- Topic trends
    CREATE TABLE IF NOT EXISTS topic_trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      article_count INTEGER DEFAULT 0,
      avg_probability REAL DEFAULT 0,
      trend_score REAL DEFAULT 0,
      computed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(topic_id, date)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);
    CREATE INDEX IF NOT EXISTS idx_topics_is_seed ON topics(is_seed);
    CREATE INDEX IF NOT EXISTS idx_topics_article_count ON topics(article_count DESC);

    CREATE INDEX IF NOT EXISTS idx_article_topics_content ON article_topics(content_id);
    CREATE INDEX IF NOT EXISTS idx_article_topics_topic ON article_topics(topic_id);
    CREATE INDEX IF NOT EXISTS idx_article_topics_probability ON article_topics(probability DESC);

    CREATE INDEX IF NOT EXISTS idx_story_clusters_active ON story_clusters(is_active);
    CREATE INDEX IF NOT EXISTS idx_story_clusters_last_updated ON story_clusters(last_updated DESC);
    CREATE INDEX IF NOT EXISTS idx_story_clusters_article_count ON story_clusters(article_count DESC);

    CREATE INDEX IF NOT EXISTS idx_topic_trends_topic ON topic_trends(topic_id);
    CREATE INDEX IF NOT EXISTS idx_topic_trends_date ON topic_trends(date DESC);
    CREATE INDEX IF NOT EXISTS idx_topic_trends_score ON topic_trends(trend_score DESC);
  `);
  
  // Prepared statements
  const stmts = {
    // Topics
    saveTopic: db.prepare(`
      INSERT INTO topics (name, keywords, is_seed, article_count, created_at, updated_at)
      VALUES (@name, @keywords, @isSeed, 0, datetime('now'), datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        keywords = excluded.keywords,
        updated_at = datetime('now')
    `),
    
    getTopic: db.prepare(`
      SELECT id, name, keywords, is_seed, article_count, created_at, updated_at
      FROM topics WHERE id = ?
    `),
    
    getTopicByName: db.prepare(`
      SELECT id, name, keywords, is_seed, article_count, created_at, updated_at
      FROM topics WHERE name = ?
    `),
    
    getAllTopics: db.prepare(`
      SELECT id, name, keywords, is_seed, article_count, created_at, updated_at
      FROM topics
      ORDER BY article_count DESC
    `),
    
    getSeedTopics: db.prepare(`
      SELECT id, name, keywords, is_seed, article_count, created_at, updated_at
      FROM topics
      WHERE is_seed = 1
      ORDER BY name
    `),
    
    updateTopicCount: db.prepare(`
      UPDATE topics SET 
        article_count = (
          SELECT COUNT(DISTINCT content_id) 
          FROM article_topics 
          WHERE topic_id = topics.id
        ),
        updated_at = datetime('now')
      WHERE id = ?
    `),
    
    updateAllTopicCounts: db.prepare(`
      UPDATE topics SET 
        article_count = (
          SELECT COUNT(DISTINCT content_id) 
          FROM article_topics 
          WHERE topic_id = topics.id
        ),
        updated_at = datetime('now')
    `),
    
    deleteTopic: db.prepare(`
      DELETE FROM topics WHERE id = ?
    `),
    
    getRecentTopics: db.prepare(`
      SELECT id, name, keywords, is_seed, article_count, created_at, updated_at
      FROM topics
      WHERE created_at >= ? AND article_count >= ?
      ORDER BY article_count DESC
    `),
    
    // Article-topic assignments
    saveArticleTopic: db.prepare(`
      INSERT INTO article_topics (content_id, topic_id, probability, assigned_at)
      VALUES (@contentId, @topicId, @probability, datetime('now'))
      ON CONFLICT(content_id, topic_id) DO UPDATE SET
        probability = excluded.probability,
        assigned_at = datetime('now')
    `),
    
    getArticleTopics: db.prepare(`
      SELECT at.content_id, at.topic_id, at.probability, at.assigned_at,
             t.name as topic_name, t.keywords
      FROM article_topics at
      JOIN topics t ON t.id = at.topic_id
      WHERE at.content_id = ?
      ORDER BY at.probability DESC
    `),
    
    getTopicArticles: db.prepare(`
      SELECT at.content_id, at.probability, at.assigned_at
      FROM article_topics at
      WHERE at.topic_id = ?
      ORDER BY at.probability DESC
      LIMIT ? OFFSET ?
    `),
    
    countTopicArticles: db.prepare(`
      SELECT COUNT(*) as total FROM article_topics WHERE topic_id = ?
    `),
    
    deleteArticleTopics: db.prepare(`
      DELETE FROM article_topics WHERE content_id = ?
    `),
    
    getTopicDayCount: db.prepare(`
      SELECT COUNT(DISTINCT at.content_id) as article_count
      FROM article_topics at
      JOIN content_analysis ca ON ca.id = at.content_id
      WHERE at.topic_id = ?
        AND date(ca.created_at) = ?
    `),
    
    getTopicDailyCounts: db.prepare(`
      SELECT date(ca.created_at) as date, COUNT(DISTINCT at.content_id) as article_count
      FROM article_topics at
      JOIN content_analysis ca ON ca.id = at.content_id
      WHERE at.topic_id = ?
        AND date(ca.created_at) BETWEEN ? AND ?
      GROUP BY date(ca.created_at)
      ORDER BY date(ca.created_at)
    `),
    
    getTopicsWithRecentActivity: db.prepare(`
      SELECT t.id, t.name, COUNT(DISTINCT at.content_id) as recent_count
      FROM topics t
      JOIN article_topics at ON at.topic_id = t.id
      JOIN content_analysis ca ON ca.id = at.content_id
      WHERE ca.created_at >= datetime('now', '-' || ? || ' hours')
      GROUP BY t.id
      HAVING recent_count >= ?
      ORDER BY recent_count DESC
    `),
    
    // Story clusters
    saveStoryCluster: db.prepare(`
      INSERT INTO story_clusters (headline, summary, article_ids, article_count, 
                                  first_seen, last_updated, is_active, primary_topic_id)
      VALUES (@headline, @summary, @articleIds, @articleCount,
              datetime('now'), datetime('now'), 1, @primaryTopicId)
    `),
    
    getStoryCluster: db.prepare(`
      SELECT id, headline, summary, article_ids, article_count,
             first_seen, last_updated, is_active, primary_topic_id
      FROM story_clusters
      WHERE id = ?
    `),
    
    getStoryClusters: db.prepare(`
      SELECT id, headline, summary, article_ids, article_count,
             first_seen, last_updated, is_active, primary_topic_id
      FROM story_clusters
      WHERE (is_active = 1 OR @includeInactive = 1)
      ORDER BY last_updated DESC
      LIMIT ?
    `),
    
    getActiveClusters: db.prepare(`
      SELECT id, headline, summary, article_ids, article_count,
             first_seen, last_updated, is_active, primary_topic_id
      FROM story_clusters
      WHERE is_active = 1
      ORDER BY last_updated DESC
      LIMIT ?
    `),
    
    updateStoryCluster: db.prepare(`
      UPDATE story_clusters SET
        headline = COALESCE(@headline, headline),
        summary = COALESCE(@summary, summary),
        article_ids = @articleIds,
        article_count = @articleCount,
        last_updated = datetime('now'),
        primary_topic_id = COALESCE(@primaryTopicId, primary_topic_id)
      WHERE id = @id
    `),
    
    deactivateCluster: db.prepare(`
      UPDATE story_clusters SET is_active = 0, last_updated = datetime('now')
      WHERE id = ?
    `),
    
    deactivateOldClusters: db.prepare(`
      UPDATE story_clusters SET is_active = 0
      WHERE is_active = 1 AND last_updated < ?
    `),
    
    deleteStoryCluster: db.prepare(`
      DELETE FROM story_clusters WHERE id = ?
    `),
    
    countClusters: db.prepare(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
      FROM story_clusters
    `),
    
    // Topic trends
    saveTopicTrend: db.prepare(`
      INSERT INTO topic_trends (topic_id, date, article_count, avg_probability, trend_score, computed_at)
      VALUES (@topicId, @date, @articleCount, @avgProbability, @trendScore, datetime('now'))
      ON CONFLICT(topic_id, date) DO UPDATE SET
        article_count = excluded.article_count,
        avg_probability = excluded.avg_probability,
        trend_score = excluded.trend_score,
        computed_at = datetime('now')
    `),
    
    getTopicTrends: db.prepare(`
      SELECT id, topic_id, date, article_count, avg_probability, trend_score, computed_at
      FROM topic_trends
      WHERE topic_id = ? AND date BETWEEN ? AND ?
      ORDER BY date
    `),
    
    getTrendingTopics: db.prepare(`
      SELECT tt.topic_id, t.name as topic_name, tt.date, tt.article_count, tt.trend_score
      FROM topic_trends tt
      JOIN topics t ON t.id = tt.topic_id
      WHERE tt.date = ? AND tt.trend_score >= ?
      ORDER BY tt.trend_score DESC
      LIMIT ?
    `),
    
    getLatestTrends: db.prepare(`
      SELECT tt.topic_id, t.name as topic_name, tt.date, tt.article_count, tt.trend_score
      FROM topic_trends tt
      JOIN topics t ON t.id = tt.topic_id
      WHERE tt.date = (SELECT MAX(date) FROM topic_trends)
      ORDER BY tt.trend_score DESC
      LIMIT ?
    `),
    
    deleteOldTrends: db.prepare(`
      DELETE FROM topic_trends WHERE date < ?
    `)
  };
  
  return {
    // ==================== Topics ====================
    
    /**
     * Save or update a topic
     * @param {Object} topic - Topic data
     * @param {string} topic.name - Topic name
     * @param {string[]} topic.keywords - Topic keywords
     * @param {boolean} [topic.isSeed=false] - Is seed topic
     * @returns {{id: number}} Saved topic
     */
    saveTopic(topic) {
      const keywords = Array.isArray(topic.keywords) 
        ? JSON.stringify(topic.keywords) 
        : topic.keywords;
      
      const result = stmts.saveTopic.run({
        name: topic.name,
        keywords,
        isSeed: topic.isSeed ? 1 : 0
      });
      
      // Get the ID (either inserted or existing)
      if (result.changes > 0 && result.lastInsertRowid) {
        return { id: Number(result.lastInsertRowid) };
      }
      
      const existing = stmts.getTopicByName.get(topic.name);
      return { id: existing.id };
    },
    
    /**
     * Get topic by ID
     * @param {number} id - Topic ID
     * @returns {Object|null} Topic or null
     */
    getTopic(id) {
      return stmts.getTopic.get(id) || null;
    },
    
    /**
     * Get topic by name
     * @param {string} name - Topic name
     * @returns {Object|null} Topic or null
     */
    getTopicByName(name) {
      return stmts.getTopicByName.get(name) || null;
    },
    
    /**
     * Get all topics
     * @param {Object} [options] - Options
     * @param {boolean} [options.includeSeed=true] - Include seed topics
     * @returns {Array} Topics
     */
    getAllTopics(options = {}) {
      const { includeSeed = true } = options;
      
      if (includeSeed) {
        return stmts.getAllTopics.all();
      }
      
      return stmts.getAllTopics.all().filter(t => !t.is_seed);
    },
    
    /**
     * Get seed topics only
     * @returns {Array} Seed topics
     */
    getSeedTopics() {
      return stmts.getSeedTopics.all();
    },
    
    /**
     * Update article counts for all topics
     */
    updateTopicCounts() {
      stmts.updateAllTopicCounts.run();
    },
    
    /**
     * Update article count for single topic
     * @param {number} topicId - Topic ID
     */
    updateTopicCount(topicId) {
      stmts.updateTopicCount.run(topicId);
    },
    
    /**
     * Delete a topic
     * @param {number} id - Topic ID
     * @returns {{deleted: boolean}}
     */
    deleteTopic(id) {
      const result = stmts.deleteTopic.run(id);
      return { deleted: result.changes > 0 };
    },
    
    /**
     * Get recently created topics with activity
     * @param {Object} options - Options
     * @param {string} options.sinceDate - Date to look back from
     * @param {number} [options.minArticles=1] - Minimum articles
     * @returns {Array} Recent topics
     */
    getRecentTopics(options) {
      return stmts.getRecentTopics.all(options.sinceDate, options.minArticles || 1);
    },
    
    // ==================== Article-Topic Assignments ====================
    
    /**
     * Save article-topic assignment
     * @param {Object} assignment - Assignment data
     * @param {number} assignment.contentId - Content ID
     * @param {number} assignment.topicId - Topic ID
     * @param {number} assignment.probability - Assignment probability
     */
    saveArticleTopic(assignment) {
      stmts.saveArticleTopic.run({
        contentId: assignment.contentId,
        topicId: assignment.topicId,
        probability: assignment.probability
      });
    },
    
    /**
     * Get topics for an article
     * @param {number} contentId - Content ID
     * @returns {Array} Article topics with probabilities
     */
    getArticleTopics(contentId) {
      return stmts.getArticleTopics.all(contentId);
    },
    
    /**
     * Get articles for a topic
     * @param {Object} options - Options
     * @param {number} options.topicId - Topic ID
     * @param {number} [options.limit=20] - Max results
     * @param {number} [options.offset=0] - Offset
     * @returns {Array} Articles with probabilities
     */
    getTopicArticles(options) {
      const { topicId, limit = 20, offset = 0 } = options;
      return stmts.getTopicArticles.all(topicId, limit, offset);
    },
    
    /**
     * Count articles for a topic
     * @param {number} topicId - Topic ID
     * @returns {number} Article count
     */
    countTopicArticles(topicId) {
      const result = stmts.countTopicArticles.get(topicId);
      return result ? result.total : 0;
    },
    
    /**
     * Delete all topic assignments for an article
     * @param {number} contentId - Content ID
     */
    deleteArticleTopics(contentId) {
      stmts.deleteArticleTopics.run(contentId);
    },
    
    /**
     * Get article count for topic on a specific day
     * @param {Object} options - Options
     * @param {number} options.topicId - Topic ID
     * @param {string} options.date - Date (YYYY-MM-DD)
     * @returns {number} Article count
     */
    getTopicDayCount(options) {
      const result = stmts.getTopicDayCount.get(options.topicId, options.date);
      return result ? result.article_count : 0;
    },
    
    /**
     * Get daily article counts for topic
     * @param {Object} options - Options
     * @param {number} options.topicId - Topic ID
     * @param {string} options.startDate - Start date
     * @param {string} options.endDate - End date
     * @returns {Array} Daily counts
     */
    getTopicDailyCounts(options) {
      return stmts.getTopicDailyCounts.all(
        options.topicId, 
        options.startDate, 
        options.endDate
      );
    },
    
    /**
     * Get topics with recent activity
     * @param {Object} options - Options
     * @param {number} options.hours - Hours to look back
     * @param {number} [options.minArticles=1] - Minimum articles
     * @returns {Array} Topics with recent counts
     */
    getTopicsWithRecentActivity(options) {
      return stmts.getTopicsWithRecentActivity.all(
        options.hours,
        options.minArticles || 1
      );
    },
    
    // ==================== Story Clusters ====================
    
    /**
     * Save a new story cluster
     * @param {Object} cluster - Cluster data
     * @param {string} cluster.headline - Cluster headline
     * @param {string} [cluster.summary] - Cluster summary
     * @param {number[]} cluster.articleIds - Article IDs
     * @param {number} [cluster.articleCount] - Article count
     * @param {number} [cluster.primaryTopicId] - Primary topic
     * @returns {{id: number}} Created cluster
     */
    saveStoryCluster(cluster) {
      const result = stmts.saveStoryCluster.run({
        headline: cluster.headline,
        summary: cluster.summary || null,
        articleIds: JSON.stringify(cluster.articleIds),
        articleCount: cluster.articleCount || cluster.articleIds.length,
        primaryTopicId: cluster.primaryTopicId || null
      });
      
      return { id: Number(result.lastInsertRowid) };
    },
    
    /**
     * Get story cluster by ID
     * @param {number} id - Cluster ID
     * @returns {Object|null} Cluster or null
     */
    getStoryCluster(id) {
      return stmts.getStoryCluster.get(id) || null;
    },
    
    /**
     * Get story clusters
     * @param {Object} [options] - Options
     * @param {boolean} [options.activeOnly=true] - Only active clusters
     * @param {number} [options.limit=20] - Max results
     * @returns {Array} Clusters
     */
    getStoryClusters(options = {}) {
      const { activeOnly = true, limit = 20 } = options;
      
      if (activeOnly) {
        return stmts.getActiveClusters.all(limit);
      }
      
      return stmts.getStoryClusters.all({ includeInactive: 1 }, limit);
    },
    
    /**
     * Update a story cluster
     * @param {number} id - Cluster ID
     * @param {Object} updates - Updates
     */
    updateStoryCluster(id, updates) {
      const articleIds = updates.articleIds 
        ? (Array.isArray(updates.articleIds) ? JSON.stringify(updates.articleIds) : updates.articleIds)
        : null;
      
      stmts.updateStoryCluster.run({
        id,
        headline: updates.headline || null,
        summary: updates.summary || null,
        articleIds,
        articleCount: updates.articleCount || 0,
        primaryTopicId: updates.primaryTopicId || null
      });
    },
    
    /**
     * Deactivate a cluster
     * @param {number} id - Cluster ID
     */
    deactivateCluster(id) {
      stmts.deactivateCluster.run(id);
    },
    
    /**
     * Deactivate clusters older than date
     * @param {string} beforeDate - ISO date string
     * @returns {number} Clusters deactivated
     */
    deactivateOldClusters(beforeDate) {
      const result = stmts.deactivateOldClusters.run(beforeDate);
      return result.changes;
    },
    
    /**
     * Delete a cluster
     * @param {number} id - Cluster ID
     * @returns {{deleted: boolean}}
     */
    deleteStoryCluster(id) {
      const result = stmts.deleteStoryCluster.run(id);
      return { deleted: result.changes > 0 };
    },
    
    /**
     * Get cluster statistics
     * @returns {{total: number, active: number}}
     */
    getClusterStats() {
      const result = stmts.countClusters.get();
      return { total: result.total, active: result.active };
    },
    
    // ==================== Topic Trends ====================
    
    /**
     * Save topic trend data
     * @param {Object} trend - Trend data
     * @param {number} trend.topicId - Topic ID
     * @param {string} trend.date - Date (YYYY-MM-DD)
     * @param {number} trend.articleCount - Article count
     * @param {number} [trend.avgProbability=0] - Average probability
     * @param {number} [trend.trendScore=0] - Trend score
     */
    saveTopicTrend(trend) {
      stmts.saveTopicTrend.run({
        topicId: trend.topicId,
        date: trend.date,
        articleCount: trend.articleCount,
        avgProbability: trend.avgProbability || 0,
        trendScore: trend.trendScore || 0
      });
    },
    
    /**
     * Get trend history for a topic
     * @param {Object} options - Options
     * @param {number} options.topicId - Topic ID
     * @param {string} options.startDate - Start date
     * @param {string} options.endDate - End date
     * @returns {Array} Trend history
     */
    getTopicTrends(options) {
      return stmts.getTopicTrends.all(
        options.topicId,
        options.startDate,
        options.endDate
      );
    },
    
    /**
     * Get trending topics for a date
     * @param {Object} options - Options
     * @param {string} options.date - Date to check
     * @param {number} [options.minScore=2.0] - Minimum trend score
     * @param {number} [options.limit=20] - Max results
     * @returns {Array} Trending topics
     */
    getTrendingTopics(options) {
      return stmts.getTrendingTopics.all(
        options.date,
        options.minScore || 2.0,
        options.limit || 20
      );
    },
    
    /**
     * Get latest trends (most recent date)
     * @param {number} [limit=20] - Max results
     * @returns {Array} Latest trends
     */
    getLatestTrends(limit = 20) {
      return stmts.getLatestTrends.all(limit);
    },
    
    /**
     * Delete old trend data
     * @param {string} beforeDate - Delete before this date
     * @returns {number} Rows deleted
     */
    deleteOldTrends(beforeDate) {
      const result = stmts.deleteOldTrends.run(beforeDate);
      return result.changes;
    },
    
    // ==================== Utilities ====================
    
    /**
     * Get comprehensive statistics
     * @returns {Object} Statistics
     */
    getStats() {
      const topicCount = stmts.getAllTopics.all().length;
      const clusterStats = stmts.countClusters.get();
      
      return {
        topics: {
          total: topicCount,
          seed: stmts.getSeedTopics.all().length
        },
        clusters: {
          total: clusterStats.total,
          active: clusterStats.active
        }
      };
    }
  };
}

module.exports = { createTopicAdapter };
