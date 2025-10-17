'use strict';

const DEFAULT_LOGGER = console;
const MAX_BUSY_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 15;
const writersByDb = new WeakMap();

/**
 * Record a query execution for telemetry. Writes are batched and persisted
 * asynchronously to avoid blocking request paths or contending with long
 * running write transactions.
 */
function recordQuery(db, params = {}) {
  if (!db || !params || typeof params.queryType !== 'string' || typeof params.operation !== 'string' || typeof params.durationMs !== 'number') {
    return; // Silently skip invalid records (telemetry is non-critical)
  }

  // Do not record fast, simple queries
  const { durationMs, complexity } = params;
  if (durationMs <= 10 && complexity !== 'complex') {
    return;
  }

  const { logger: payloadLogger, ...payload } = params;
  const logger = payloadLogger || DEFAULT_LOGGER;

  const writer = getWriterForDb(db, logger);
  writer.enqueue(payload);
}

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

function getRecentQueries(db, queryType, limit = 50) {
  if (!db || typeof queryType !== 'string') return [];

  try {
    const stmt = db.prepare(`
      SELECT 
        id, query_type, operation, duration_ms, result_count,
        query_complexity, host, job_id
      FROM query_telemetry
      WHERE query_type = ?
      ORDER BY id DESC
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

module.exports = {
  recordQuery,
  getQueryStats,
  getRecentQueries,
  _getWriterForDb: getWriterForDb, // Exported for testing
};

function getWriterForDb(db, logger) {
  let writer = writersByDb.get(db);
  if (!writer) {
    writer = createTelemetryWriter(db, logger || DEFAULT_LOGGER);
    writersByDb.set(db, writer);
  } else if (logger) {
    writer.setLogger(logger);
  }
  return writer;
}

function createTelemetryWriter(db, initialLogger) {
  const insertStmt = db.prepare(`
    INSERT INTO query_telemetry (
      query_type, operation, duration_ms, result_count, query_complexity,
      host, job_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const runBatch = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run(...row);
    }
  });

  let queue = [];
  let isScheduled = false;
  let retryCount = 0;
  let logger = initialLogger || DEFAULT_LOGGER;
  let flushPromise = null;
  let resolveFlush = null;

  function scheduleFlush(delayMs = 0) {
    if (isScheduled) {
      return;
    }
    isScheduled = true;
    if (delayMs === 0 && process.env.NODE_ENV === 'test') {
      // For tests, run synchronously to avoid race conditions
      flushQueue();
    } else {
      setTimeout(flushQueue, delayMs);
    }
  }

  function flushQueue() {
    isScheduled = false;
    if (!queue.length) {
      retryCount = 0;
      if (resolveFlush) {
        resolveFlush();
        flushPromise = null;
        resolveFlush = null;
      }
      return;
    }

    const batch = queue;
    queue = [];

    try {
      runBatch(batch);
      retryCount = 0;
    } catch (err) {
      if (isBusyError(err)) {
        retryCount += 1;
        queue = batch.concat(queue);
        if (retryCount <= MAX_BUSY_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
          scheduleFlush(delay);
          return;
        }
        if (logger && typeof logger.warn === 'function') {
          logger.warn(
            `[queryTelemetry] dropping ${batch.length} telemetry entries after repeated SQLITE_BUSY`
          );
        }
        retryCount = 0;
      } else {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[queryTelemetry] Failed to record query telemetry:', err.message);
        }
      }
    }

    if (queue.length) {
      scheduleFlush();
    } else if (resolveFlush) {
      resolveFlush();
      flushPromise = null;
      resolveFlush = null;
    }
  }

  return {
    enqueue(payload) {
      const row = normalisePayload(payload);
      if (!row) {
        return;
      }
      queue.push(row);
      if (queue.length === 1) {
        scheduleFlush();
      }
    },
    setLogger(nextLogger) {
      if (nextLogger) {
        logger = nextLogger;
      }
    },
    flush() {
      if (!flushPromise) {
        flushPromise = new Promise(resolve => {
          resolveFlush = resolve;
        });
      }
      flushQueue();
      return flushPromise;
    },
  };
}

function normalisePayload(payload) {
  if (!payload) {
    return null;
  }

  const {
    queryType,
    operation,
    durationMs,
    resultCount = 0,
    complexity = 'simple',
    host = null,
    jobId = null
  } = payload;

  if (typeof queryType !== 'string' || typeof operation !== 'string' || typeof durationMs !== 'number') {
    return null;
  }

  return [
    queryType,
    operation,
    durationMs,
    resultCount,
    complexity,
    host,
    jobId
  ];
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return null;
  }
}

function isBusyError(err) {
  return Boolean(err && err.code === 'SQLITE_BUSY');
}
