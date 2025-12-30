'use strict';

/**
 * Healing Events Database Adapter
 * 
 * Persists self-healing events for crawler error recovery.
 * Tracks diagnoses, remediations, and their outcomes.
 * 
 * @module healingAdapter
 */

const { safeStringify, safeParse, toNullableInt } = require('./common');

/**
 * Ensure the healing_events table exists
 * @param {import('better-sqlite3').Database} db
 */
function ensureHealingSchema(db) {
  if (!db || typeof db.exec !== 'function') {
    throw new Error('ensureHealingSchema requires a better-sqlite3 Database');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS healing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      failure_type TEXT NOT NULL,
      diagnosis TEXT,
      remediation TEXT,
      success INTEGER DEFAULT 0,
      confidence REAL,
      evidence TEXT,
      context TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_healing_events_domain ON healing_events(domain);
    CREATE INDEX IF NOT EXISTS idx_healing_events_failure_type ON healing_events(failure_type);
    CREATE INDEX IF NOT EXISTS idx_healing_events_created_at ON healing_events(created_at);
  `);
}

/**
 * Normalize a healing event row from DB format to JS format
 * @param {Object} row - Database row
 * @returns {Object|null} Normalized healing event
 */
function normalizeHealingEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    domain: row.domain,
    failureType: row.failure_type,
    diagnosis: safeParse(row.diagnosis),
    remediation: safeParse(row.remediation),
    success: row.success === 1,
    confidence: row.confidence,
    evidence: safeParse(row.evidence),
    context: safeParse(row.context),
    createdAt: row.created_at
  };
}

/**
 * Record a healing event
 * @param {import('better-sqlite3').Database} db
 * @param {Object} event - Healing event data
 * @param {string} event.domain - Domain affected
 * @param {string} event.failureType - Type of failure (STALE_PROXY, LAYOUT_CHANGE, etc.)
 * @param {Object} [event.diagnosis] - Diagnosis details
 * @param {Object} [event.remediation] - Remediation applied
 * @param {boolean} [event.success=false] - Whether remediation succeeded
 * @param {number} [event.confidence] - Diagnosis confidence (0-1)
 * @param {Object} [event.evidence] - Supporting evidence
 * @param {Object} [event.context] - Additional context
 * @returns {Object} Created healing event
 */
function recordHealingEvent(db, event) {
  ensureHealingSchema(db);

  if (!event || !event.domain || !event.failureType) {
    throw new Error('recordHealingEvent requires domain and failureType');
  }

  const stmt = db.prepare(`
    INSERT INTO healing_events (
      domain,
      failure_type,
      diagnosis,
      remediation,
      success,
      confidence,
      evidence,
      context,
      created_at
    ) VALUES (
      @domain,
      @failure_type,
      @diagnosis,
      @remediation,
      @success,
      @confidence,
      @evidence,
      @context,
      @created_at
    )
  `);

  const now = new Date().toISOString();
  const record = {
    domain: event.domain,
    failure_type: event.failureType,
    diagnosis: safeStringify(event.diagnosis),
    remediation: safeStringify(event.remediation),
    success: event.success ? 1 : 0,
    confidence: event.confidence ?? null,
    evidence: safeStringify(event.evidence),
    context: safeStringify(event.context),
    created_at: event.createdAt || now
  };

  const result = stmt.run(record);
  const inserted = db.prepare('SELECT * FROM healing_events WHERE id = ?').get(result.lastInsertRowid);
  return normalizeHealingEventRow(inserted);
}

/**
 * Get recent healing events
 * @param {import('better-sqlite3').Database} db
 * @param {number} [limit=50] - Maximum events to return
 * @returns {Object[]} List of healing events
 */
function getRecentHealingEvents(db, limit = 50) {
  ensureHealingSchema(db);

  const stmt = db.prepare(`
    SELECT * FROM healing_events
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(toNullableInt(limit) || 50);
  return rows.map(normalizeHealingEventRow);
}

/**
 * Get healing events for a specific domain
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain to query
 * @param {number} [limit=50] - Maximum events to return
 * @returns {Object[]} List of healing events for the domain
 */
function getHealingEventsByDomain(db, domain, limit = 50) {
  ensureHealingSchema(db);

  if (!domain) {
    throw new Error('getHealingEventsByDomain requires domain');
  }

  const stmt = db.prepare(`
    SELECT * FROM healing_events
    WHERE domain = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(domain, toNullableInt(limit) || 50);
  return rows.map(normalizeHealingEventRow);
}

/**
 * Get healing events by failure type
 * @param {import('better-sqlite3').Database} db
 * @param {string} failureType - Failure type to query
 * @param {number} [limit=50] - Maximum events to return
 * @returns {Object[]} List of healing events for the failure type
 */
function getHealingEventsByType(db, failureType, limit = 50) {
  ensureHealingSchema(db);

  if (!failureType) {
    throw new Error('getHealingEventsByType requires failureType');
  }

  const stmt = db.prepare(`
    SELECT * FROM healing_events
    WHERE failure_type = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(failureType, toNullableInt(limit) || 50);
  return rows.map(normalizeHealingEventRow);
}

/**
 * Get healing statistics
 * @param {import('better-sqlite3').Database} db
 * @param {Object} [opts] - Options
 * @param {string} [opts.domain] - Filter by domain
 * @param {string} [opts.since] - ISO timestamp to filter from
 * @returns {Object} Statistics object
 */
function getHealingStats(db, opts = {}) {
  ensureHealingSchema(db);

  let whereClause = '1=1';
  const params = [];

  if (opts.domain) {
    whereClause += ' AND domain = ?';
    params.push(opts.domain);
  }

  if (opts.since) {
    whereClause += ' AND created_at >= ?';
    params.push(opts.since);
  }

  const totalStmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
    FROM healing_events
    WHERE ${whereClause}
  `);

  const total = totalStmt.get(...params);

  const byTypeStmt = db.prepare(`
    SELECT 
      failure_type,
      COUNT(*) as count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
      AVG(confidence) as avg_confidence
    FROM healing_events
    WHERE ${whereClause}
    GROUP BY failure_type
    ORDER BY count DESC
  `);

  const byType = byTypeStmt.all(...params);

  const byDomainStmt = db.prepare(`
    SELECT 
      domain,
      COUNT(*) as count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
    FROM healing_events
    WHERE ${whereClause}
    GROUP BY domain
    ORDER BY count DESC
    LIMIT 20
  `);

  const byDomain = byDomainStmt.all(...params);

  return {
    total: total.total || 0,
    successful: total.successful || 0,
    failed: total.failed || 0,
    successRate: total.total > 0 ? (total.successful / total.total) : 0,
    byFailureType: byType.map(row => ({
      failureType: row.failure_type,
      count: row.count,
      successful: row.successful,
      avgConfidence: row.avg_confidence
    })),
    topDomains: byDomain.map(row => ({
      domain: row.domain,
      count: row.count,
      successful: row.successful
    }))
  };
}

/**
 * Clear old healing events
 * @param {import('better-sqlite3').Database} db
 * @param {number} daysToKeep - Number of days to retain
 * @returns {number} Number of deleted records
 */
function pruneHealingEvents(db, daysToKeep = 30) {
  ensureHealingSchema(db);

  const stmt = db.prepare(`
    DELETE FROM healing_events
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `);

  const result = stmt.run(daysToKeep);
  return result.changes;
}

/**
 * Get the count of recent failures for a domain within a time window
 * @param {import('better-sqlite3').Database} db
 * @param {string} domain - Domain to check
 * @param {string} failureType - Type of failure
 * @param {number} windowMinutes - Time window in minutes
 * @returns {number} Count of failures
 */
function getRecentFailureCount(db, domain, failureType, windowMinutes = 60) {
  ensureHealingSchema(db);

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM healing_events
    WHERE domain = ?
      AND failure_type = ?
      AND success = 0
      AND created_at >= datetime('now', '-' || ? || ' minutes')
  `);

  const result = stmt.get(domain, failureType, windowMinutes);
  return result?.count || 0;
}

module.exports = {
  ensureHealingSchema,
  normalizeHealingEventRow,
  recordHealingEvent,
  getRecentHealingEvents,
  getHealingEventsByDomain,
  getHealingEventsByType,
  getHealingStats,
  pruneHealingEvents,
  getRecentFailureCount
};
