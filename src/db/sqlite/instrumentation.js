'use strict';

const { recordQuery } = require('../queryTelemetry');

/**
 * Wrap database instance with query telemetry tracking
 * 
 * This is OPTIONAL - only use when you need cost estimation.
 * Most code should use unwrapped DB instance.
 * 
 * The wrapped database records all queries to the query_telemetry table,
 * which can be used by QueryCostEstimatorPlugin for planning decisions.
 * 
 * @param {Database} db - better-sqlite3 Database instance
 * @param {Object} options - Instrumentation options
 * @param {boolean} [options.trackQueries=true] - Enable/disable tracking
 * @param {Object} [options.logger=console] - Logger for errors
 * @returns {Database} Instrumented database instance (or original if disabled)
 */
function wrapWithTelemetry(db, options = {}) {
  const { trackQueries = true, logger = console } = options;
  
  if (!trackQueries || !db) {
    return db;  // Passthrough if tracking disabled or no DB
  }
  
  // Wrap prepare() to instrument all statements
  const originalPrepare = db.prepare.bind(db);
  
  db.prepare = function(sql) {
    const stmt = originalPrepare(sql);
    
    // Infer query type from SQL
    const queryType = inferQueryType(sql);
    const operation = inferOperation(sql);
    const complexity = inferComplexity(sql);
    
    // Wrap run(), all(), get() methods
    const originalRun = stmt.run.bind(stmt);
    const originalAll = stmt.all.bind(stmt);
    const originalGet = stmt.get.bind(stmt);
    
    stmt.run = function(...args) {
      const start = Date.now();
      try {
        const result = originalRun(...args);
        const durationMs = Date.now() - start;
        
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType,
                operation,
                durationMs,
                resultCount: result.changes || 0,
                complexity,
              });
            } catch (err) {
              // Silently fail telemetry recording to avoid breaking queries
              if (logger && typeof logger.warn === 'function') {
                logger.warn('[instrumentation] Failed to record query telemetry:', err.message);
              }
            }
          });
        }
        
        return result;
      } catch (error) {
        // Record error timing too
        const durationMs = Date.now() - start;
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType: `${queryType}_error`,
                operation,
                durationMs,
                resultCount: 0,
                complexity,
                metadata: {
                  error: error.message
                }
              });
            } catch (_) {
              // Ignore telemetry errors
            }
          });
        }
        throw error;
      }
    };
    
    stmt.all = function(...args) {
      const start = Date.now();
      try {
        const results = originalAll(...args);
        const durationMs = Date.now() - start;
        
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType,
                operation,
                durationMs,
                resultCount: results.length,
                complexity,
              });
            } catch (err) {
              if (logger && typeof logger.warn === 'function') {
                logger.warn('[instrumentation] Failed to record query telemetry:', err.message);
              }
            }
          });
        }
        
        return results;
      } catch (error) {
        const durationMs = Date.now() - start;
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType: `${queryType}_error`,
                operation,
                durationMs,
                resultCount: 0,
                complexity,
                metadata: {
                  error: error.message
                }
              });
            } catch (_) {}
          });
        }
        throw error;
      }
    };
    
    stmt.get = function(...args) {
      const start = Date.now();
      try {
        const result = originalGet(...args);
        const durationMs = Date.now() - start;
        
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType,
                operation,
                durationMs,
                resultCount: result ? 1 : 0,
                complexity,
              });
            } catch (err) {
              if (logger && typeof logger.warn === 'function') {
                logger.warn('[instrumentation] Failed to record query telemetry:', err.message);
              }
            }
          });
        }
        
        return result;
      } catch (error) {
        const durationMs = Date.now() - start;
        if (durationMs > 10 || complexity === 'complex') {
          setImmediate(() => {
            try {
              recordQuery(db, {
                queryType: `${queryType}_error`,
                operation,
                durationMs,
                resultCount: 0,
                complexity,
                metadata: {
                  error: error.message
                }
              });
            } catch (_) {}
          });
        }
        throw error;
      }
    };
    
    return stmt;
  };
  
  return db;
}

/**
 * Infer query type from SQL statement
 * @param {string} sql - SQL statement
 * @returns {string} Query type identifier
 */
function inferQueryType(sql) {
  const normalized = sql.trim().toLowerCase();
  
  // SELECT queries
  if (normalized.startsWith('select')) {
    if (normalized.includes('from articles')) return 'select_articles';
    if (normalized.includes('from places')) return 'select_places';
    if (normalized.includes('from place_names')) return 'select_place_names';
    if (normalized.includes('from place_attributes')) return 'select_place_attributes';
    if (normalized.includes('from place_sources')) return 'select_place_sources';
    if (normalized.includes('from place_external_ids')) return 'select_place_external_ids';
    if (normalized.includes('from background_tasks')) return 'select_background_tasks';
    if (normalized.includes('from crawl_queue')) return 'select_crawl_queue';
    if (normalized.includes('from crawl_types')) return 'select_crawl_types';
    if (normalized.includes('from query_telemetry')) return 'select_query_telemetry';
    if (normalized.includes('from analysis_runs')) return 'select_analysis_runs';
    if (normalized.includes(' join ')) return 'select_join';
    return 'select_other';
  }
  
  // INSERT queries
  if (normalized.startsWith('insert')) {
    if (normalized.includes('into articles')) return 'insert_articles';
    if (normalized.includes('into places')) return 'insert_places';
    if (normalized.includes('into place_names')) return 'insert_place_names';
    if (normalized.includes('into place_attributes')) return 'insert_place_attributes';
    if (normalized.includes('into place_sources')) return 'insert_place_sources';
    if (normalized.includes('into place_external_ids')) return 'insert_place_external_ids';
    if (normalized.includes('into background_tasks')) return 'insert_background_tasks';
    if (normalized.includes('into crawl_queue')) return 'insert_crawl_queue';
    if (normalized.includes('into query_telemetry')) return 'insert_query_telemetry';
    if (normalized.includes('into analysis_runs')) return 'insert_analysis_runs';
    return 'insert_other';
  }
  
  // UPDATE queries
  if (normalized.startsWith('update')) {
    if (normalized.includes('articles')) return 'update_articles';
    if (normalized.includes('places')) return 'update_places';
    if (normalized.includes('background_tasks')) return 'update_background_tasks';
    if (normalized.includes('crawl_queue')) return 'update_crawl_queue';
    if (normalized.includes('analysis_runs')) return 'update_analysis_runs';
    return 'update_other';
  }
  
  // DELETE queries
  if (normalized.startsWith('delete')) {
    if (normalized.includes('from articles')) return 'delete_articles';
    if (normalized.includes('from places')) return 'delete_places';
    if (normalized.includes('from background_tasks')) return 'delete_background_tasks';
    if (normalized.includes('from crawl_queue')) return 'delete_crawl_queue';
    if (normalized.includes('from query_telemetry')) return 'delete_query_telemetry';
    return 'delete_other';
  }
  
  // CREATE/ALTER/DROP
  if (normalized.startsWith('create')) return 'ddl_create';
  if (normalized.startsWith('alter')) return 'ddl_alter';
  if (normalized.startsWith('drop')) return 'ddl_drop';
  
  // PRAGMA
  if (normalized.startsWith('pragma')) return 'pragma';
  
  return 'other';
}

/**
 * Infer SQL operation type
 * @param {string} sql - SQL statement
 * @returns {string} Operation type (SELECT, INSERT, UPDATE, DELETE, etc.)
 */
function inferOperation(sql) {
  const normalized = sql.trim().toLowerCase();
  
  if (normalized.startsWith('select')) return 'SELECT';
  if (normalized.startsWith('insert')) return 'INSERT';
  if (normalized.startsWith('update')) return 'UPDATE';
  if (normalized.startsWith('delete')) return 'DELETE';
  if (normalized.startsWith('create')) return 'CREATE';
  if (normalized.startsWith('alter')) return 'ALTER';
  if (normalized.startsWith('drop')) return 'DROP';
  if (normalized.startsWith('pragma')) return 'PRAGMA';
  
  return 'OTHER';
}

/**
 * Infer query complexity heuristically
 * @param {string} sql - SQL statement
 * @returns {string} Complexity level (simple, moderate, complex)
 */
function inferComplexity(sql) {
  const normalized = sql.trim().toLowerCase();
  
  // Simple: Basic CRUD with no joins
  if (!normalized.includes('join') && 
      !normalized.includes('subquery') && 
      !normalized.includes('group by') &&
      !normalized.includes('order by') &&
      normalized.split('where').length <= 2) {
    return 'simple';
  }
  
  // Complex: Multiple joins, subqueries, aggregations
  if (normalized.includes('join') && 
      (normalized.split('join').length > 2 ||
       normalized.includes('group by') ||
       normalized.includes('having') ||
       normalized.includes('union'))) {
    return 'complex';
  }
  
  // Moderate: Everything else
  return 'moderate';
}

module.exports = { wrapWithTelemetry };
