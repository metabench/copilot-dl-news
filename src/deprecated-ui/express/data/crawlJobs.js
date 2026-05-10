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
    throw new Error('crawlJobs data helpers require a database handle with prepare()');
  }
  return db;
}

function normalizeArgs(args) {
  if (args == null) return null;
  try {
    return typeof args === 'string' ? args : JSON.stringify(args);
  } catch (_) {
    return null;
  }
}

function recordCrawlJobStart(db, payload = {}, { trace } = {}) {
  const handle = ensureDb(db);
  const {
    id,
    url = null,
    args = null,
    pid = null,
    startedAt = new Date().toISOString(),
    status = 'running'
  } = payload;

  if (!id) {
    throw new Error('recordCrawlJobStart requires an id');
  }

  const serializedArgs = normalizeArgs(args);

  return withTrace(trace, 'crawl-jobs:insert', () =>
    handle
      .prepare(
        'INSERT OR REPLACE INTO crawl_jobs(id, url, args, pid, started_at, status) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, url, serializedArgs, pid, startedAt, status)
  );
}

function markCrawlJobStatus(db, payload = {}, { trace } = {}) {
  const handle = ensureDb(db);
  const {
    id,
    endedAt = new Date().toISOString(),
    status = 'done'
  } = payload;

  if (!id) {
    throw new Error('markCrawlJobStatus requires an id');
  }

  return withTrace(trace, 'crawl-jobs:update', () =>
    handle
      .prepare('UPDATE crawl_jobs SET ended_at = ?, status = ? WHERE id = ?')
      .run(endedAt, status, id)
  );
}

module.exports = {
  recordCrawlJobStart,
  markCrawlJobStatus
};
