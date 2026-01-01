'use strict';

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * UI-focused query helpers for Crawl Observer.
 * All SQL for Crawl Observer should live here (or other db-layer modules).
 */
function createCrawlObserverUiQueries(db) {
  if (!db) throw new Error('createCrawlObserverUiQueries(db) requires a db handle');

  function listTasks({ taskType = null, limit = 50 } = {}) {
    const safeLimit = clampInt(limit, 50, 1, 500);

    let sql = `
      SELECT 
        task_type,
        task_id,
        COUNT(*) as event_count,
        MIN(ts) as first_ts,
        MAX(ts) as last_ts,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count
      FROM task_events
    `;
    const params = [];
    if (taskType) {
      sql += ' WHERE task_type = ?';
      params.push(taskType);
    }
    sql += ' GROUP BY task_id ORDER BY MAX(ts) DESC LIMIT ?';
    params.push(safeLimit);

    return db.prepare(sql).all(...params);
  }

  function getTaskSummary(taskId) {
    return db.prepare(`
      SELECT 
        COUNT(*) as total_events,
        MAX(seq) as max_seq,
        MIN(ts) as first_ts,
        MAX(ts) as last_ts,
        task_type,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count,
        COUNT(DISTINCT scope) as unique_scopes
      FROM task_events WHERE task_id = ?
    `).get(taskId);
  }

  function getTaskProblems(taskId, { limit = 50 } = {}) {
    const safeLimit = clampInt(limit, 50, 1, 500);
    return db.prepare(`
      SELECT seq, ts, event_type, severity, scope, target, payload
      FROM task_events 
      WHERE task_id = ? AND severity IN ('error', 'warn')
      ORDER BY seq
      LIMIT ?
    `).all(taskId, safeLimit);
  }

  function getTaskTimeline(taskId) {
    return db.prepare(`
      SELECT seq, ts, event_type, scope, duration_ms
      FROM task_events 
      WHERE task_id = ? AND event_category = 'lifecycle'
      ORDER BY seq
    `).all(taskId);
  }

  function getTaskEventsPage(taskId, { limit = 200, afterSeq = null, beforeSeq = null } = {}) {
    const safeLimit = clampInt(limit, 200, 1, 500);

    const eventCols = 'seq, ts, event_type, event_category, severity, scope, target, duration_ms';

    let events;
    if (isFiniteNumber(afterSeq)) {
      events = db.prepare(`
        SELECT ${eventCols}
        FROM task_events
        WHERE task_id = ? AND seq > ?
        ORDER BY seq
        LIMIT ?
      `).all(taskId, afterSeq, safeLimit);
    } else if (isFiniteNumber(beforeSeq)) {
      events = db.prepare(`
        SELECT ${eventCols}
        FROM task_events
        WHERE task_id = ? AND seq < ?
        ORDER BY seq DESC
        LIMIT ?
      `).all(taskId, beforeSeq, safeLimit).reverse();
    } else {
      // Default to tail for large tasks
      events = db.prepare(`
        SELECT ${eventCols}
        FROM task_events
        WHERE task_id = ?
        ORDER BY seq DESC
        LIMIT ?
      `).all(taskId, safeLimit).reverse();
    }

    const minSeq = events.length ? Number(events[0].seq) : null;
    const maxSeq = events.length ? Number(events[events.length - 1].seq) : null;

    const hasOlder = events.length
      ? !!db.prepare('SELECT 1 FROM task_events WHERE task_id = ? AND seq < ? LIMIT 1').get(taskId, minSeq)
      : false;
    const hasNewer = events.length
      ? !!db.prepare('SELECT 1 FROM task_events WHERE task_id = ? AND seq > ? LIMIT 1').get(taskId, maxSeq)
      : false;

    return {
      events,
      pageInfo: { limit: safeLimit, minSeq, maxSeq, hasOlder, hasNewer }
    };
  }

  function getTaskApiBundle(taskId, { limit = 500, sinceSeq = null, includePayload = false } = {}) {
    const safeLimit = clampInt(limit, 500, 1, 1000);

    const cols = includePayload
      ? 'seq, ts, event_type, event_category, severity, scope, target, payload, duration_ms, http_status, item_count'
      : 'seq, ts, event_type, event_category, severity, scope, target, duration_ms, http_status, item_count';

    const events = db.prepare(`
      SELECT ${cols}
      FROM task_events
      WHERE task_id = ?
        AND (? IS NULL OR seq > ?)
      ORDER BY seq
      LIMIT ?
    `).all(taskId, isFiniteNumber(sinceSeq) ? sinceSeq : null, isFiniteNumber(sinceSeq) ? sinceSeq : null, safeLimit);

    const summary = getTaskSummary(taskId);
    const problems = getTaskProblems(taskId, { limit: 100 });
    const timeline = getTaskTimeline(taskId);

    return { taskId, summary, problems, timeline, events };
  }

  function getIncrementalEvents(taskId, options = {}) {
    const {
      limit = 200,
      sinceSeq = null,
      eventType,
      category,
      severity,
      scope,
      includePayload = false
    } = options;

    const safeLimit = clampInt(limit, 200, 1, 1000);

    const cols = includePayload
      ? 'seq, ts, event_type, event_category, severity, scope, target, payload, duration_ms'
      : 'seq, ts, event_type, event_category, severity, scope, target, duration_ms';

    let sql = `SELECT ${cols} FROM task_events WHERE task_id = ?`;
    const params = [taskId];

    if (isFiniteNumber(sinceSeq)) {
      sql += ' AND seq > ?';
      params.push(sinceSeq);
    }
    if (typeof eventType === 'string' && eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }
    if (typeof category === 'string' && category) {
      sql += ' AND event_category = ?';
      params.push(category);
    }
    if (typeof severity === 'string' && severity) {
      sql += ' AND severity = ?';
      params.push(severity);
    }
    if (typeof scope === 'string' && scope) {
      sql += ' AND scope = ?';
      params.push(scope);
    }

    sql += ' ORDER BY seq LIMIT ?';
    params.push(safeLimit);

    const events = db.prepare(sql).all(...params);
    const maxSeq = events.reduce(
      (m, e) => Math.max(m, Number(e.seq || 0) || 0),
      isFiniteNumber(sinceSeq) ? sinceSeq : 0
    );

    return { taskId, sinceSeq: isFiniteNumber(sinceSeq) ? sinceSeq : null, maxSeq, events };
  }

  function getTelemetryStats() {
    const recentCrawls = db.prepare(`
      SELECT 
        COUNT(DISTINCT task_id) as crawl_count,
        SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as total_urls,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
        AVG(duration_ms) as avg_duration_ms
      FROM task_events
      WHERE ts > datetime('now', '-24 hours')
        AND task_type = 'crawl'
    `).get();

    const hourlyStats = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00', ts) as hour,
        COUNT(DISTINCT task_id) as crawl_count,
        SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as urls_fetched,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
      FROM task_events
      WHERE ts > datetime('now', '-24 hours')
        AND task_type = 'crawl'
      GROUP BY hour
      ORDER BY hour DESC
      LIMIT 24
    `).all();

    const errorBreakdown = db.prepare(`
      SELECT 
        event_type,
        COUNT(*) as count,
        MAX(ts) as last_seen
      FROM task_events
      WHERE severity = 'error'
        AND ts > datetime('now', '-7 days')
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    `).all();

    const domainStats = db.prepare(`
      SELECT 
        scope as domain,
        COUNT(*) as fetch_count,
        AVG(duration_ms) as avg_ms,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
      FROM task_events
      WHERE event_type = 'crawl:url:batch'
        AND ts > datetime('now', '-24 hours')
        AND scope IS NOT NULL
      GROUP BY scope
      ORDER BY fetch_count DESC
      LIMIT 20
    `).all();

    return { recentCrawls, hourlyStats, errorBreakdown, domainStats };
  }

  return {
    listTasks,
    getTaskSummary,
    getTaskProblems,
    getTaskTimeline,
    getTaskEventsPage,
    getTaskApiBundle,
    getIncrementalEvents,
    getTelemetryStats
  };
}

module.exports = { createCrawlObserverUiQueries };
