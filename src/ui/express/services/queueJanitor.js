const PID_CHECK_UNAVAILABLE = process.platform === 'win32';

function isPidActive(pid) {
  if (!pid || !Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const code = error.code;
    if (code === 'ESRCH' || code === 'ENOENT') {
      return false;
    }
    // On Windows EPERM can mean the process still exists; treat unknown errors as "probably alive".
    return !PID_CHECK_UNAVAILABLE || code === 'EPERM';
  }
}

function collectActiveJobIds(jobRegistry) {
  const ids = new Set();
  if (!jobRegistry || typeof jobRegistry.getJobs !== 'function') {
    return ids;
  }
  try {
    const jobs = jobRegistry.getJobs();
    if (jobs && typeof jobs.forEach === 'function') {
      jobs.forEach((_, key) => ids.add(key));
    } else if (jobs && typeof jobs.keys === 'function') {
      for (const key of jobs.keys()) {
        ids.add(key);
      }
    }
  } catch (_) {
    return ids;
  }
  return ids;
}

function hasTable(db, tableName) {
  if (!db || typeof db.prepare !== 'function' || !tableName) {
    return false;
  }
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    return !!row;
  } catch (_) {
    return false;
  }
}

function buildStaleQuery(db, includeEnhanced) {
  const baseCount = '(SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id)';
  const baseMax = '(SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id)';
  const enhancedCount = includeEnhanced
    ? `COALESCE(NULLIF(${baseCount}, 0), (SELECT COUNT(*) FROM queue_events_enhanced ee WHERE ee.job_id = j.id), 0)`
    : baseCount;
  const enhancedMax = includeEnhanced
    ? `COALESCE(${baseMax}, (SELECT MAX(ts) FROM queue_events_enhanced ee WHERE ee.job_id = j.id))`
    : baseMax;
  return `
    SELECT
      j.id,
      j.pid,
      j.started_at AS startedAt,
      (${enhancedCount}) AS eventCount,
      (${enhancedMax}) AS lastEventAt
    FROM crawl_jobs j
    WHERE j.status = 'running' AND j.ended_at IS NULL
  `;
}

function resolveStaleQueueJobs({
  db,
  jobRegistry = null,
  logger = null,
  zeroEventGraceMs = 2 * 60 * 1000,
  force = false
} = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return 0;
  }
  if (!force && zeroEventGraceMs <= 0) {
    zeroEventGraceMs = 60 * 1000;
  }

  const includeEnhanced = hasTable(db, 'queue_events_enhanced');
  let rows;
  try {
    rows = db.prepare(buildStaleQuery(db, includeEnhanced)).all();
  } catch (error) {
    if (includeEnhanced) {
      try {
        rows = db.prepare(buildStaleQuery(db, false)).all();
      } catch (fallbackError) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('[queueJanitor] failed to scan for stale queues:', fallbackError?.message || fallbackError);
        }
        return 0;
      }
    } else {
      if (logger && typeof logger.warn === 'function') {
        logger.warn('[queueJanitor] failed to scan for stale queues:', error?.message || error);
      }
      return 0;
    }
  }

  if (!rows || rows.length === 0) {
    return 0;
  }

  const activeIds = collectActiveJobIds(jobRegistry);
  const updateStmt = db.prepare('UPDATE crawl_jobs SET ended_at = ?, status = ? WHERE id = ? AND status = ? AND ended_at IS NULL');
  const now = Date.now();
  let resolved = 0;

  for (const row of rows) {
    if (!row || !row.id) {
      continue;
    }
    if (activeIds.has(row.id)) {
      continue;
    }
    const pid = Number.isFinite(row.pid) ? row.pid : null;
    if (pid && isPidActive(pid)) {
      continue;
    }
    const startedMs = row.startedAt ? Date.parse(row.startedAt) : NaN;
    if (!Number.isFinite(startedMs)) {
      continue;
    }
    const idleMs = now - startedMs;
    if (!force && idleMs < zeroEventGraceMs) {
      continue;
    }
    const eventCount = Number.isFinite(row.eventCount) ? row.eventCount : parseInt(row.eventCount, 10) || 0;
    if (eventCount > 0) {
      continue;
    }

    const endedAtIso = new Date().toISOString();
    try {
      const result = updateStmt.run(endedAtIso, 'done', row.id, 'running');
      if (result && result.changes) {
        resolved += result.changes;
        if (logger && typeof logger.info === 'function') {
          logger.info(`[queueJanitor] auto-resolved queue ${row.id} with no recorded events`);
        }
      }
    } catch (error) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`[queueJanitor] failed to auto-resolve queue ${row.id}:`, error?.message || error);
      }
    }
  }

  return resolved;
}

module.exports = {
  resolveStaleQueueJobs
};
