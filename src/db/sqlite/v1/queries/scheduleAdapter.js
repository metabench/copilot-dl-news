'use strict';

/**
 * Crawl Schedule Database Adapter
 * 
 * Manages crawl scheduling data for domains including:
 * - Next crawl times
 * - Update patterns and intervals
 * - Priority scoring for crawl ordering
 * 
 * @module scheduleAdapter
 */

const { safeStringify, safeParse, toNullableInt } = require('./common');

/**
 * Ensure the crawl_schedules table exists
 * @param {import('better-sqlite3').Database} db
 */
function ensureScheduleSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureScheduleSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS crawl_schedules (
      domain TEXT PRIMARY KEY,
      last_crawl_at TEXT,
      next_crawl_at TEXT,
      avg_update_interval_hours REAL,
      update_pattern TEXT,
      priority_score REAL DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      total_articles INTEGER DEFAULT 0,
      last_article_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_schedules_next_crawl 
      ON crawl_schedules(next_crawl_at);
    CREATE INDEX IF NOT EXISTS idx_crawl_schedules_priority 
      ON crawl_schedules(priority_score DESC);
  `);
}

/**
 * Normalize a schedule row from DB format to JS format
 * @param {Object} row - Database row
 * @returns {Object|null} Normalized schedule
 */
function normalizeScheduleRow(row) {
  if (!row) return null;
  return {
    domain: row.domain,
    lastCrawlAt: row.last_crawl_at,
    nextCrawlAt: row.next_crawl_at,
    avgUpdateIntervalHours: row.avg_update_interval_hours,
    updatePattern: safeParse(row.update_pattern),
    priorityScore: row.priority_score,
    successCount: row.success_count,
    failureCount: row.failure_count,
    totalArticles: row.total_articles,
    lastArticleCount: row.last_article_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Save or update a schedule
 * @param {import('better-sqlite3').Database} db
 * @param {Object} schedule - Schedule data
 * @param {string} schedule.domain - Domain (required)
 * @param {string} [schedule.lastCrawlAt] - Last crawl timestamp
 * @param {string} [schedule.nextCrawlAt] - Next crawl timestamp
 * @param {number} [schedule.avgUpdateIntervalHours] - Average hours between updates
 * @param {Object} [schedule.updatePattern] - Update pattern data
 * @param {number} [schedule.priorityScore] - Priority score
 * @param {number} [schedule.successCount] - Number of successful crawls
 * @param {number} [schedule.failureCount] - Number of failed crawls
 * @param {number} [schedule.totalArticles] - Total articles found
 * @param {number} [schedule.lastArticleCount] - Articles from last crawl
 * @returns {Object} Saved schedule
 */
function saveSchedule(db, schedule) {
  ensureScheduleSchema(db);

  if (!schedule || !schedule.domain) {
    throw new Error('saveSchedule requires domain');
  }

  const stmt = db.prepare(`
    INSERT INTO crawl_schedules (
      domain,
      last_crawl_at,
      next_crawl_at,
      avg_update_interval_hours,
      update_pattern,
      priority_score,
      success_count,
      failure_count,
      total_articles,
      last_article_count,
      updated_at
    ) VALUES (
      @domain,
      @last_crawl_at,
      @next_crawl_at,
      @avg_update_interval_hours,
      @update_pattern,
      @priority_score,
      @success_count,
      @failure_count,
      @total_articles,
      @last_article_count,
      @updated_at
    )
    ON CONFLICT(domain) DO UPDATE SET
      last_crawl_at = COALESCE(@last_crawl_at, last_crawl_at),
      next_crawl_at = COALESCE(@next_crawl_at, next_crawl_at),
      avg_update_interval_hours = COALESCE(@avg_update_interval_hours, avg_update_interval_hours),
      update_pattern = COALESCE(@update_pattern, update_pattern),
      priority_score = COALESCE(@priority_score, priority_score),
      success_count = COALESCE(@success_count, success_count),
      failure_count = COALESCE(@failure_count, failure_count),
      total_articles = COALESCE(@total_articles, total_articles),
      last_article_count = COALESCE(@last_article_count, last_article_count),
      updated_at = @updated_at
  `);

  const now = new Date().toISOString();
  const record = {
    domain: schedule.domain,
    last_crawl_at: schedule.lastCrawlAt ?? null,
    next_crawl_at: schedule.nextCrawlAt ?? null,
    avg_update_interval_hours: schedule.avgUpdateIntervalHours ?? null,
    update_pattern: safeStringify(schedule.updatePattern),
    priority_score: schedule.priorityScore ?? 0,
    success_count: toNullableInt(schedule.successCount) ?? 0,
    failure_count: toNullableInt(schedule.failureCount) ?? 0,
    total_articles: toNullableInt(schedule.totalArticles) ?? 0,
    last_article_count: toNullableInt(schedule.lastArticleCount),
    updated_at: now
  };

  stmt.run(record);
  return getSchedule(db, schedule.domain);
}

/**
 * Get a schedule by domain
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain to look up
 * @returns {Object|null} Schedule or null
 */
function getSchedule(db, domain) {
  ensureScheduleSchema(db);

  if (!domain) {
    throw new Error('getSchedule requires domain');
  }

  const stmt = db.prepare('SELECT * FROM crawl_schedules WHERE domain = ?');
  const row = stmt.get(domain);
  return normalizeScheduleRow(row);
}

/**
 * Get schedules that are overdue for crawling
 * @param {import('better-sqlite3').Database} db
 * @param {Object} [opts] - Options
 * @param {number} [opts.limit=50] - Maximum schedules to return
 * @param {string} [opts.asOf] - Reference time (defaults to now)
 * @returns {Object[]} List of overdue schedules ordered by priority
 */
function getOverdueSchedules(db, opts = {}) {
  ensureScheduleSchema(db);

  const limit = toNullableInt(opts.limit) || 50;
  const asOf = opts.asOf || new Date().toISOString();

  const stmt = db.prepare(`
    SELECT * FROM crawl_schedules
    WHERE next_crawl_at IS NOT NULL 
      AND next_crawl_at <= ?
    ORDER BY priority_score DESC, next_crawl_at ASC
    LIMIT ?
  `);

  const rows = stmt.all(asOf, limit);
  return rows.map(normalizeScheduleRow);
}

/**
 * Get a batch of schedules due for crawling, ordered by priority
 * @param {import('better-sqlite3').Database} db
 * @param {number} limit - Number of schedules to return
 * @param {Object} [opts] - Options
 * @param {string} [opts.asOf] - Reference time (defaults to now)
 * @returns {Object[]} List of schedules
 */
function getScheduleBatch(db, limit, opts = {}) {
  ensureScheduleSchema(db);

  const batchLimit = toNullableInt(limit) || 10;
  const asOf = opts.asOf || new Date().toISOString();

  const stmt = db.prepare(`
    SELECT * FROM crawl_schedules
    WHERE next_crawl_at IS NULL 
       OR next_crawl_at <= ?
    ORDER BY priority_score DESC, next_crawl_at ASC
    LIMIT ?
  `);

  const rows = stmt.all(asOf, batchLimit);
  return rows.map(normalizeScheduleRow);
}

/**
 * Get all schedules
 * @param {import('better-sqlite3').Database} db
 * @param {Object} [opts] - Options
 * @param {number} [opts.limit=100] - Maximum schedules to return
 * @param {number} [opts.offset=0] - Offset for pagination
 * @returns {Object[]} List of schedules
 */
function getAllSchedules(db, opts = {}) {
  ensureScheduleSchema(db);

  const limit = toNullableInt(opts.limit) || 100;
  const offset = toNullableInt(opts.offset) || 0;

  const stmt = db.prepare(`
    SELECT * FROM crawl_schedules
    ORDER BY priority_score DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset);
  return rows.map(normalizeScheduleRow);
}

/**
 * Delete a schedule
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain to delete
 * @returns {boolean} True if deleted
 */
function deleteSchedule(db, domain) {
  ensureScheduleSchema(db);

  if (!domain) {
    throw new Error('deleteSchedule requires domain');
  }

  const stmt = db.prepare('DELETE FROM crawl_schedules WHERE domain = ?');
  const result = stmt.run(domain);
  return result.changes > 0;
}

/**
 * Increment success or failure count
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain
 * @param {boolean} success - Whether crawl succeeded
 * @param {number} [articleCount=0] - Number of articles found
 * @returns {Object|null} Updated schedule
 */
function incrementCrawlCount(db, domain, success, articleCount = 0) {
  ensureScheduleSchema(db);

  if (!domain) {
    throw new Error('incrementCrawlCount requires domain');
  }

  const now = new Date().toISOString();

  // Use upsert to handle both existing and new domains
  const stmt = db.prepare(`
    INSERT INTO crawl_schedules (
      domain, 
      success_count, 
      failure_count, 
      last_crawl_at, 
      last_article_count, 
      total_articles,
      updated_at
    ) VALUES (
      @domain,
      @success_count,
      @failure_count,
      @last_crawl_at,
      @last_article_count,
      @total_articles,
      @updated_at
    )
    ON CONFLICT(domain) DO UPDATE SET
      success_count = success_count + @success_count,
      failure_count = failure_count + @failure_count,
      last_crawl_at = @last_crawl_at,
      last_article_count = @last_article_count,
      total_articles = total_articles + @total_articles,
      updated_at = @updated_at
  `);

  stmt.run({
    domain,
    success_count: success ? 1 : 0,
    failure_count: success ? 0 : 1,
    last_crawl_at: now,
    last_article_count: articleCount,
    total_articles: articleCount,
    updated_at: now
  });

  return getSchedule(db, domain);
}

/**
 * Get schedule statistics
 * @param {import('better-sqlite3').Database} db
 * @returns {Object} Statistics
 */
function getScheduleStats(db) {
  ensureScheduleSchema(db);

  const now = new Date().toISOString();

  const statsStmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN next_crawl_at IS NULL OR next_crawl_at <= ? THEN 1 ELSE 0 END) as due,
      SUM(success_count) as total_successes,
      SUM(failure_count) as total_failures,
      SUM(total_articles) as total_articles,
      AVG(priority_score) as avg_priority,
      AVG(avg_update_interval_hours) as avg_interval_hours
    FROM crawl_schedules
  `);

  const stats = statsStmt.get(now);

  return {
    totalDomains: stats.total || 0,
    dueDomains: stats.due || 0,
    totalSuccesses: stats.total_successes || 0,
    totalFailures: stats.total_failures || 0,
    totalArticles: stats.total_articles || 0,
    avgPriority: stats.avg_priority || 0,
    avgIntervalHours: stats.avg_interval_hours || 0
  };
}

/**
 * Update priority score for a domain
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain
 * @param {number} score - New priority score
 * @returns {Object|null} Updated schedule
 */
function updatePriorityScore(db, domain, score) {
  ensureScheduleSchema(db);

  if (!domain) {
    throw new Error('updatePriorityScore requires domain');
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE crawl_schedules
    SET priority_score = ?,
        updated_at = ?
    WHERE domain = ?
  `);

  stmt.run(score, now, domain);
  return getSchedule(db, domain);
}

/**
 * Prune schedules not crawled within a time period
 * @param {import('better-sqlite3').Database} db
 * @param {number} daysInactive - Days without crawl to consider inactive
 * @returns {number} Number of deleted records
 */
function pruneInactiveSchedules(db, daysInactive = 90) {
  ensureScheduleSchema(db);

  const stmt = db.prepare(`
    DELETE FROM crawl_schedules
    WHERE last_crawl_at IS NOT NULL
      AND last_crawl_at < datetime('now', '-' || ? || ' days')
  `);

  const result = stmt.run(daysInactive);
  return result.changes;
}

module.exports = {
  ensureScheduleSchema,
  normalizeScheduleRow,
  saveSchedule,
  getSchedule,
  getOverdueSchedules,
  getScheduleBatch,
  getAllSchedules,
  deleteSchedule,
  incrementCrawlCount,
  getScheduleStats,
  updatePriorityScore,
  pruneInactiveSchedules
};
