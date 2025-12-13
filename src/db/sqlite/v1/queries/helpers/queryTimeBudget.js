"use strict";

/**
 * Query Time Budget - Simple instrumentation for database query timing.
 *
 * This module provides a lightweight wrapper to measure query execution time
 * and log warnings when queries exceed a configurable threshold.
 *
 * Usage:
 *   const { timedQuery } = require("./queryTimeBudget");
 *   const results = timedQuery(() => db.prepare(sql).all(...params), {
 *     label: "selectUrlPage",
 *     thresholdMs: 100
 *   });
 */

const DEFAULT_THRESHOLD_MS = 200;

/**
 * Execute a function and measure its duration.
 * Logs a warning if execution exceeds the threshold.
 *
 * @param {Function} fn - The function to execute
 * @param {Object} [options]
 * @param {string} [options.label] - Label for logging
 * @param {number} [options.thresholdMs] - Warning threshold in milliseconds
 * @param {Function} [options.onSlow] - Custom handler for slow queries
 * @returns {*} The result of the function
 */
function timedQuery(fn, options = {}) {
  const label = options.label || "query";
  const threshold = Number.isFinite(options.thresholdMs) ? options.thresholdMs : DEFAULT_THRESHOLD_MS;
  const onSlow = typeof options.onSlow === "function" ? options.onSlow : null;

  const start = process.hrtime.bigint();
  const result = fn();
  const end = process.hrtime.bigint();

  const durationNs = Number(end - start);
  const durationMs = durationNs / 1e6;

  if (durationMs > threshold) {
    const warning = {
      label,
      durationMs: Math.round(durationMs * 100) / 100,
      thresholdMs: threshold,
      exceeded: true
    };
    if (onSlow) {
      onSlow(warning);
    } else {
      console.warn(`[query-time-budget] SLOW QUERY: ${label} took ${warning.durationMs}ms (threshold: ${threshold}ms)`);
    }
  }

  return result;
}

/**
 * Wrap a statement's .all() method with timing instrumentation.
 *
 * @param {Object} stmt - better-sqlite3 prepared statement
 * @param {string} label - Label for logging
 * @param {Object} [options]
 * @param {number} [options.thresholdMs] - Warning threshold
 * @param {Function} [options.onSlow] - Custom slow query handler
 * @returns {Object} Wrapped statement with instrumented .all() and .get()
 */
function instrumentStatement(stmt, label, options = {}) {
  const threshold = options.thresholdMs || DEFAULT_THRESHOLD_MS;
  const onSlow = options.onSlow;

  return {
    all: (...args) => timedQuery(() => stmt.all(...args), { label: `${label}.all`, thresholdMs: threshold, onSlow }),
    get: (...args) => timedQuery(() => stmt.get(...args), { label: `${label}.get`, thresholdMs: threshold, onSlow }),
    run: (...args) => timedQuery(() => stmt.run(...args), { label: `${label}.run`, thresholdMs: threshold, onSlow }),
    bind: (...args) => stmt.bind(...args)
  };
}

/**
 * Create a timing-aware database wrapper.
 *
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} [options]
 * @param {number} [options.thresholdMs] - Default threshold for all queries
 * @param {Function} [options.onSlow] - Custom slow query handler
 * @returns {Object} Wrapped database with .timedPrepare() method
 */
function createTimedDb(db, options = {}) {
  const threshold = options.thresholdMs || DEFAULT_THRESHOLD_MS;
  const onSlow = options.onSlow;

  return {
    ...db,
    timedPrepare: (sql, label) => {
      const stmt = db.prepare(sql);
      return instrumentStatement(stmt, label, { thresholdMs: threshold, onSlow });
    },
    prepare: db.prepare.bind(db)
  };
}

module.exports = {
  timedQuery,
  instrumentStatement,
  createTimedDb,
  DEFAULT_THRESHOLD_MS
};
