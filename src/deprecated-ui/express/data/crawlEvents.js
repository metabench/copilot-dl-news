function withTrace(trace, name, fn) {
  if (!trace || typeof trace.pre !== 'function') {
    return fn();
  }

  const end = trace.pre(name);
  try {
    const result = fn();
    if (typeof end === 'function') end();
    return result;
  } catch (error) {
    if (typeof end === 'function') end(error);
    throw error;
  }
}

function ensureDb(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('crawlEvents data helpers require a database handle with prepare()');
  }
  return db;
}

function coerceDetails(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

const {
  insertQueueEvent: runInsertQueueEvent,
  insertCrawlProblem: runInsertCrawlProblem,
  insertPlannerStageEvent: runInsertPlannerStageEvent,
  insertCrawlMilestone: runInsertCrawlMilestone
} = require('../../../data/db/sqlite/queries/ui/crawlEvents');

function insertQueueEvent(db, jobId, event = {}, { trace } = {}) {
  const handle = ensureDb(db);
  if (!jobId) {
    throw new Error('insertQueueEvent requires a jobId');
  }

  const {
    action = 'unknown',
    url = null,
    depth = null,
    host = null,
    reason = null,
    queueSize = null,
    alias = null,
    queueOrigin = null,
    queueRole = null,
    queueDepthBucket = null,
    ts = new Date().toISOString()
  } = event;

  return withTrace(trace, 'crawl-events:queue', () =>
    runInsertQueueEvent(handle, [
      jobId,
      ts,
      String(action || ''),
      url || null,
      depth != null ? depth : null,
      host || null,
      reason || null,
      queueSize != null ? queueSize : null,
      alias || null,
      queueOrigin || null,
      queueRole || null,
      queueDepthBucket || null
    ])
  );
}

function insertCrawlProblem(db, jobId, problem = {}, { trace } = {}) {
  const handle = ensureDb(db);
  if (!jobId) {
    throw new Error('insertCrawlProblem requires a jobId');
  }

  const {
    ts = new Date().toISOString(),
    kind = 'unknown',
    scope = null,
    target = null,
    message = null,
    details = null
  } = problem;

  return withTrace(trace, 'crawl-events:problem', () =>
    runInsertCrawlProblem(handle, [
      jobId,
      ts,
      String(kind || ''),
      scope || null,
      target || null,
      message || null,
      coerceDetails(details)
    ])
  );
}

function insertPlannerStageEvent(db, jobId, event = {}, { trace } = {}) {
  const handle = ensureDb(db);
  if (!jobId) {
    throw new Error('insertPlannerStageEvent requires a jobId');
  }

  const {
    ts = new Date().toISOString(),
    stage = null,
    status = null,
    sequence = null,
    durationMs = null,
    details = null
  } = event;

  return withTrace(trace, 'crawl-events:planner-stage', () =>
    runInsertPlannerStageEvent(handle, [
      jobId,
      ts,
      stage != null ? String(stage) : null,
      status != null ? String(status) : null,
      sequence != null ? sequence : null,
      durationMs != null ? durationMs : null,
      coerceDetails(details)
    ])
  );
}

function insertCrawlMilestone(db, jobId, milestone = {}, { trace } = {}) {
  const handle = ensureDb(db);
  if (!jobId) {
    throw new Error('insertCrawlMilestone requires a jobId');
  }

  const {
    ts = new Date().toISOString(),
    kind = 'unknown',
    scope = null,
    target = null,
    message = null,
    details = null
  } = milestone;

  return withTrace(trace, 'crawl-events:milestone', () =>
    runInsertCrawlMilestone(handle, [
      jobId,
      ts,
      String(kind || ''),
      scope || null,
      target || null,
      message || null,
      coerceDetails(details)
    ])
  );
}

module.exports = {
  insertQueueEvent,
  insertCrawlProblem,
  insertPlannerStageEvent,
  insertCrawlMilestone
};
