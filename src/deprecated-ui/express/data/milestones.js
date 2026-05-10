function sanitizeLimit(value, { min = 1, max = 500, fallback = 100 } = {}) {
  const n = parseInt(String(value ?? ''), 10);
  if (Number.isFinite(n)) {
    return Math.max(min, Math.min(max, n));
  }
  return fallback;
}

function fetchMilestones(db, { job, kind, scope, before, after, limit } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    return { items: [], cursors: {}, appliedFilters: {} };
  }

  const safeLimit = sanitizeLimit(limit);
  const filters = [];
  const params = [];
  const normalizedJob = String(job ?? '').trim();
  const normalizedKind = String(kind ?? '').trim();
  const normalizedScope = String(scope ?? '').trim();
  const beforeId = parseInt(String(before ?? '').trim(), 10);
  const afterId = parseInt(String(after ?? '').trim(), 10);

  if (normalizedJob) { filters.push('job_id = ?'); params.push(normalizedJob); }
  if (normalizedKind) { filters.push('kind = ?'); params.push(normalizedKind); }
  if (normalizedScope) { filters.push('scope = ?'); params.push(normalizedScope); }

  let order = 'DESC';
  if (Number.isFinite(beforeId) && beforeId > 0) {
    filters.push('id < ?');
    params.push(beforeId);
  } else if (Number.isFinite(afterId) && afterId > 0) {
    filters.push('id > ?');
    params.push(afterId);
    order = 'ASC';
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  let rows = db.prepare(`
    SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
    FROM crawl_milestones
    ${whereSql}
    ORDER BY id ${order}
    LIMIT ?
  `).all(...params, safeLimit);

  if (order === 'ASC') {
    rows = rows.reverse();
  }

  const cursors = rows.length
    ? { nextBefore: rows[rows.length - 1].id, prevAfter: rows[0].id }
    : {};

  return {
    items: rows,
    cursors,
    appliedFilters: {
      job: normalizedJob,
      kind: normalizedKind,
      scope: normalizedScope,
      before: Number.isFinite(beforeId) && beforeId > 0 ? beforeId : null,
      after: Number.isFinite(afterId) && afterId > 0 ? afterId : null,
      limit: safeLimit
    }
  };
}

module.exports = {
  fetchMilestones
};
