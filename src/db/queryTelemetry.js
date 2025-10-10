'use strict';

/**
 * Query Telemetry Recorder: Record database query performance metrics
 * for GOFAI cost estimation in intelligent planning.
 * 
 * Usage:
 *   const { recordQuery, getQueryStats } = require('./db/queryTelemetry');
 * 
 *   // In database operation:
 *   const start = Date.now();
 *   const results = db.prepare('SELECT * FROM articles WHERE domain = ?').all(domain);
 *   recordQuery(db, {
 *     queryType: 'fetch_articles',
 *     operation: 'SELECT',
 *     durationMs: Date.now() - start,
 *     resultCount: results.length,
 *     complexity: 'simple',
 *     host: domain,
 *     metadata: { table: 'articles', filters: ['domain'] }
 *   });
 */

/**
 * Record a query execution for telemetry.
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} params
 * @param {string} params.queryType - Type of query (e.g., 'fetch_articles')
 * @param {string} params.operation - SQL operation (SELECT, INSERT, UPDATE, DELETE)
 * @param {number} params.durationMs - Query execution time in milliseconds
 * @param {number} [params.resultCount=0] - Number of rows returned or affected
 * @param {string} [params.complexity='simple'] - 'simple' | 'moderate' | 'complex'
 * @param {string} [params.host] - Domain being queried (optional)
 * @param {string} [params.jobId] - Crawl job ID (optional)
 * @param {Object} [params.metadata] - Additional metadata (will be JSON-encoded)
 */
function recordQuery(db, {
  queryType,
  operation,
  durationMs,
  resultCount = 0,
  complexity = 'simple',
  host = null,
  jobId = null,
  metadata = null
}) {
  if (!db || typeof queryType !== 'string' || typeof operation !== 'string' || typeof durationMs !== 'number') {
    return; // Silently skip invalid records (telemetry is non-critical)
  }

  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    const stmt = db.prepare(`
      INSERT INTO query_telemetry (
        query_type, operation, duration_ms, result_count, query_complexity,
        host, job_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      queryType,
      operation,
      durationMs,
      resultCount,
      complexity,
      host,
      jobId,
      metadataJson
    );
  } catch (err) {
    // Telemetry recording should never crash application
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[queryTelemetry] Failed to record query:', err.message);
    }
  }
}

/**
 * Get aggregated query statistics for cost estimation.
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} options
 * @param {string} [options.queryType] - Filter by specific query type
 * @param {string} [options.complexity] - Filter by complexity level
 * @param {number} [options.limit=100] - Max rows to fetch
 * @returns {Array<Object>} Array of query telemetry records
 */
function getQueryStats(db, { queryType = null, complexity = null, limit = 100 } = {}) {
  if (!db) return [];

  try {
    let sql = `
      SELECT 
        query_type,
        operation,
        AVG(duration_ms) as avg_duration_ms,
        MIN(duration_ms) as min_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        AVG(result_count) as avg_result_count,
        COUNT(*) as sample_count,
        query_complexity
      FROM query_telemetry
      WHERE 1=1
    `;

    const params = [];
    if (queryType) {
      sql += ' AND query_type = ?';
      params.push(queryType);
    }
    if (complexity) {
      sql += ' AND query_complexity = ?';
      params.push(complexity);
    }

    sql += `
      GROUP BY query_type, operation, query_complexity
      ORDER BY avg_duration_ms DESC
      LIMIT ?
    `;
    params.push(limit);

    return db.prepare(sql).all(...params);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[queryTelemetry] Failed to fetch stats:', err.message);
    }
    return [];
  }
}

/**
 * Get recent query telemetry for a specific query type.
 * @param {Object} db - better-sqlite3 database instance
 * @param {string} queryType - Query type to fetch
 * @param {number} [limit=50] - Max records to fetch
 * @returns {Array<Object>} Array of telemetry records
 */
function getRecentQueries(db, queryType, limit = 50) {
  if (!db || typeof queryType !== 'string') return [];

  try {
    const stmt = db.prepare(`
      SELECT 
        id, query_type, operation, duration_ms, result_count,
        query_complexity, host, job_id, timestamp, metadata
      FROM query_telemetry
      WHERE query_type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(queryType, limit);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[queryTelemetry] Failed to fetch recent queries:', err.message);
    }
    return [];
  }
}

/**
 * Clear old telemetry data (retention policy).
 * @param {Object} db - better-sqlite3 database instance
 * @param {number} [retentionDays=30] - Keep data from last N days
 * @returns {number} Number of deleted records
 */
function pruneOldTelemetry(db, retentionDays = 30) {
  if (!db || typeof retentionDays !== 'number') return 0;

  try {
    const stmt = db.prepare(`
      DELETE FROM query_telemetry
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);

    const info = stmt.run(retentionDays);
    return info.changes || 0;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[queryTelemetry] Failed to prune telemetry:', err.message);
    }
    return 0;
  }
}

module.exports = {
  recordQuery,
  getQueryStats,
  getRecentQueries,
  pruneOldTelemetry
};
