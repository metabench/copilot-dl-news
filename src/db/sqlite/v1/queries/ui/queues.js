"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.queues");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    listIncompleteJobs: handle.prepare(`
      SELECT id, url, args, started_at, status
      FROM crawl_jobs
      WHERE (status = 'running' AND ended_at IS NULL)
         OR (status IS NULL AND ended_at IS NULL)
      ORDER BY started_at DESC
      LIMIT ?
    `),
    clearIncompleteJobs: handle.prepare(`
      DELETE FROM crawl_jobs
      WHERE (status = 'running' AND ended_at IS NULL)
         OR (status IS NULL AND ended_at IS NULL)
    `),
    listQueues: (() => {
      try {
        return handle.prepare(`
          SELECT j.id, j.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
                 COALESCE(e.events, 0) AS events,
                 e.lastEventAt
          FROM crawl_jobs j
          LEFT JOIN (
            SELECT job_id, COUNT(*) AS events, MAX(ts) AS lastEventAt
            FROM queue_events
            GROUP BY job_id
          ) e ON e.job_id = j.id
          ORDER BY COALESCE(j.ended_at, j.started_at) DESC
          LIMIT ?
        `);
      } catch (_) {
        // Fallback for older schema without url column
        return handle.prepare(`
          SELECT j.id, NULL AS url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
                 COALESCE(e.events, 0) AS events,
                 e.lastEventAt
          FROM crawl_jobs j
          LEFT JOIN (
            SELECT job_id, COUNT(*) AS events, MAX(ts) AS lastEventAt
            FROM queue_events
            GROUP BY job_id
          ) e ON e.job_id = j.id
          ORDER BY COALESCE(j.ended_at, j.started_at) DESC
          LIMIT ?
        `);
      }
    })(),
    latestQueueId: handle.prepare(`
      SELECT id FROM crawl_jobs
      ORDER BY COALESCE(ended_at, started_at) DESC
      LIMIT 1
    `),
    queueJob: handle.prepare(`
      SELECT id, url, pid, started_at AS startedAt, ended_at AS endedAt, status
      FROM crawl_jobs
      WHERE id = ?
    `),
    queueBounds: handle.prepare(`
      SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ?
    `),
    queueBoundsAction: handle.prepare(`
      SELECT MIN(id) AS minId, MAX(id) AS maxId FROM queue_events WHERE job_id = ? AND action = ?
    `),
    queueNeighbors: handle.prepare(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(ended_at, started_at) DESC) AS rn
        FROM crawl_jobs
      )
      SELECT
        (SELECT id FROM ordered WHERE rn = o.rn - 1) AS newerId,
        (SELECT id FROM ordered WHERE rn = o.rn + 1) AS olderId
      FROM ordered o WHERE o.id = ?
    `)
  }));
}

function listIncompleteCrawlJobs(db, options = {}) {
  const { listIncompleteJobs } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { max: 200, fallback: 50 });
  return listIncompleteJobs.all(safeLimit);
}

function clearIncompleteCrawlJobs(db) {
  const { clearIncompleteJobs } = prepareStatements(db);
  const result = clearIncompleteJobs.run();
  return { deleted: result.changes };
}

function listQueues(db, options = {}) {
  const { listQueues } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { max: 200, fallback: 50 });
  return listQueues.all(safeLimit);
}

function getLatestQueueId(db) {
  const { latestQueueId } = prepareStatements(db);
  const row = latestQueueId.get();
  return row?.id ?? null;
}

function getQueueJob(db, id) {
  const safeId = String(id ?? '').trim();
  if (!safeId) return null;
  const { queueJob } = prepareStatements(db);
  return queueJob.get(safeId);
}

function getQueueEventBounds(db, id, action) {
  const stmts = prepareStatements(db);
  const stmt = action ? stmts.queueBoundsAction : stmts.queueBounds;
  const params = action ? [id, action] : [id];
  const row = stmt.get(...params);
  return { minId: row?.minId ?? null, maxId: row?.maxId ?? null };
}

function getQueueNeighbors(db, id) {
  const { queueNeighbors } = prepareStatements(db);
  const row = queueNeighbors.get(id);
  return {
    newerId: row?.newerId ?? null,
    olderId: row?.olderId ?? null
  };
}

function normalizeAction(action) {
  const trimmed = String(action ?? "").trim();
  return trimmed ? trimmed : null;
}

function parseId(value) {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildQueueEventsQuery({ action, beforeId, afterId, order, table }) {
  const filters = ["job_id = ?"];
  const params = [];
  if (action) {
    filters.push("action = ?");
    params.push(action);
  }
  if (beforeId) {
    filters.push("id < ?");
    params.push(beforeId);
  } else if (afterId) {
    filters.push("id > ?");
    params.push(afterId);
  }
  const sql = `
    SELECT id, ts, action, url, depth, host, reason, queue_size AS queueSize,
           queue_origin AS queueOrigin, queue_role AS queueRole, queue_depth_bucket AS queueDepthBucket
    FROM ${table}
    WHERE ${filters.join(" AND ")}
    ORDER BY id ${order}
    LIMIT ?
  `.trim();
  return { sql, params };
}

function fetchQueueEvents(db, { id, action, before, after, limit } = {}) {
  if (!db || typeof db.prepare !== "function") {
    return { events: [], newestId: null, oldestId: null, appliedFilters: {} };
  }
  const normalizedAction = normalizeAction(action);
  const beforeId = parseId(before);
  const afterId = parseId(after);
  const order = beforeId ? "DESC" : afterId ? "ASC" : "DESC";
  const safeLimit = sanitizeLimit(limit, { fallback: 200 });
  const baseParams = [id];
  const query = buildQueueEventsQuery({
    table: "queue_events",
    action: normalizedAction,
    beforeId,
    afterId,
    order
  });
  const stmt = db.prepare(query.sql);
  let rows = stmt.all(...baseParams, ...query.params, safeLimit);
  if (order === "ASC") rows = rows.reverse();
  return {
    events: rows,
    newestId: rows.length ? rows[0].id : null,
    oldestId: rows.length ? rows[rows.length - 1].id : null,
    appliedFilters: {
      action: normalizedAction,
      before: beforeId,
      after: afterId,
      limit: safeLimit
    }
  };
}

function getQueueDetail(db, options = {}) {
  const job = getQueueJob(db, options.id);
  if (!job) {
    return { job: null, events: [], pagination: {}, neighbors: {}, filters: {} };
  }
  const eventsInfo = fetchQueueEvents(db, options);
  const bounds = getQueueEventBounds(db, job.id, eventsInfo.appliedFilters.action);
  const neighbors = getQueueNeighbors(db, job.id);
  return {
    job,
    events: eventsInfo.events,
    pagination: {
      newestId: eventsInfo.newestId,
      oldestId: eventsInfo.oldestId,
      minId: bounds.minId,
      maxId: bounds.maxId
    },
    neighbors,
    filters: {
      action: eventsInfo.appliedFilters.action,
      before: eventsInfo.appliedFilters.before,
      after: eventsInfo.appliedFilters.after,
      limit: eventsInfo.appliedFilters.limit
    }
  };
}

module.exports = {
  listIncompleteCrawlJobs,
  clearIncompleteCrawlJobs,
  listQueues,
  getLatestQueueId,
  getQueueJob,
  getQueueEventBounds,
  getQueueNeighbors,
  fetchQueueEvents,
  getQueueDetail
};
