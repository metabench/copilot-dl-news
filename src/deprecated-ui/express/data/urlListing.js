const { Buffer } = require('buffer');

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
    throw new Error('urlListing data helpers require a database handle with prepare()');
  }
  return db;
}

function clamp(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(n)) {
    return Math.max(min, Math.min(max, n));
  }
  return fallback;
}

function parseBooleanFlag(value) {
  if (value == null) return false;
  return value === true || value === '1' || value === 'true';
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const json = Buffer.from(String(raw), 'base64').toString('utf8');
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const ts = obj.ts || null;
    const url = typeof obj.url === 'string' ? obj.url : null;
    if (!url) return null;
    return { ts, url };
  } catch (_) {
    return null;
  }
}

function encodeCursor(obj) {
  if (!obj || typeof obj !== 'object' || !obj.url) return null;
  try {
    return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  } catch (_) {
    return null;
  }
}

function parseListOptions(query = {}) {
  const limit = clamp(query.limit, { min: 1, max: 5000, fallback: 200 });
  const offset = clamp(query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
  const dirRaw = String(query.dir || query.direction || '').trim().toLowerCase();
  const orderDir = dirRaw === 'asc' ? 'ASC' : 'DESC';
  const host = String(query.host || '').trim().toLowerCase();
  const includeSubdomains = parseBooleanFlag(query.includeSubdomains ?? query.subdomains);
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();
  const minWordCount = clamp(query.minWordCount, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
  const cursorRaw = String(query.cursor || '').trim();
  const classification = String(query.classification || '').trim().toLowerCase();
  const status = Number.parseInt(String(query.status || ''), 10);
  const combinedHint = String(query.combinedHint || '').trim().toLowerCase();

  let minCombinedConfidence = null;
  const rawConfidence = query.minCombinedConfidence ?? query.minConfidence;
  if (rawConfidence != null) {
    const parsed = Number(rawConfidence);
    if (!Number.isNaN(parsed)) {
      minCombinedConfidence = parsed > 1 ? parsed / 100 : parsed;
      if (minCombinedConfidence < 0) minCombinedConfidence = 0;
      if (minCombinedConfidence > 1) minCombinedConfidence = 1;
    }
  }

  return {
    limit,
    offset,
    orderDir,
    host,
    includeSubdomains,
    from,
    to,
    minWordCount,
    cursorRaw,
    classification,
    status,
    combinedHint,
    minCombinedConfidence
  };
}

function listUrls(db, options = {}, { trace } = {}) {
  const handle = ensureDb(db);
  const {
    limit,
    orderDir,
    host,
    includeSubdomains,
    from,
    to,
    minWordCount,
    cursorRaw,
    classification,
    status,
    combinedHint,
    minCombinedConfidence
  } = options;

  const filters = [];
  const params = [];

  if (from) {
    filters.push('COALESCE(a.fetched_at, a.crawled_at) >= ?');
    params.push(from);
  }
  if (to) {
    filters.push('COALESCE(a.fetched_at, a.crawled_at) <= ?');
    params.push(to);
  }
  if (host) {
    if (includeSubdomains) {
      filters.push('(EXISTS (SELECT 1 FROM urls u WHERE u.url = a.url AND (u.host = ? OR u.host LIKE ?)))');
      params.push(host, `%.${host}`);
    } else {
      filters.push('(EXISTS (SELECT 1 FROM urls u WHERE u.url = a.url AND u.host = ?))');
      params.push(host);
    }
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const totalRow = withTrace(trace, 'urls:count', () =>
    handle.prepare(`SELECT COUNT(*) AS c FROM articles a ${whereSql}`).get(...params)
  );
  const total = totalRow?.c || 0;

  let sql = `
    SELECT a.url, a.title,
           COALESCE(lf.ts, a.fetched_at, a.crawled_at) AS order_ts,
           COALESCE(a.fetched_at, a.crawled_at) AS ts,
           lf.http_status AS http_status,
           lf.classification AS classification,
           lf.word_count AS word_count,
           json_extract(f.analysis, '$.combined.hint') AS combined_hint,
           CAST(json_extract(f.analysis, '$.combined.confidence') AS REAL) AS combined_confidence
    FROM articles a
    LEFT JOIN latest_fetch lf ON lf.url = a.url
    LEFT JOIN fetches f ON f.url = a.url AND COALESCE(f.fetched_at, f.request_started_at) = lf.ts
    ${whereSql}
  `;

  const fetchPredicates = [];
  const fetchParams = [];
  if (Number.isFinite(status) && status > 0) {
    fetchPredicates.push('lf.http_status = ?');
    fetchParams.push(status);
  }
  if (minWordCount > 0) {
    fetchPredicates.push('(lf.word_count IS NOT NULL AND lf.word_count >= ?)');
    fetchParams.push(minWordCount);
  }
  if (classification && ['article', 'nav', 'other'].includes(classification)) {
    fetchPredicates.push('LOWER(lf.classification) = ?');
    fetchParams.push(classification);
  }
  if (combinedHint && ['article', 'nav', 'other'].includes(combinedHint)) {
    fetchPredicates.push("LOWER(json_extract(f.analysis, '$.combined.hint')) = ?");
    fetchParams.push(combinedHint);
  }
  if (minCombinedConfidence != null) {
    fetchPredicates.push("CAST(json_extract(f.analysis, '$.combined.confidence') AS REAL) >= ?");
    fetchParams.push(minCombinedConfidence);
  }
  if (fetchPredicates.length) {
    sql += (whereSql ? ' AND ' : ' WHERE ') + fetchPredicates.join(' AND ');
  }

  const cursor = decodeCursor(cursorRaw);
  const keysetPredicates = [];
  const keysetParams = [];
  if (cursor && cursor.url) {
    if (orderDir === 'ASC') {
      keysetPredicates.push('(order_ts > ? OR (order_ts = ? AND a.url > ?))');
    } else {
      keysetPredicates.push('(order_ts < ? OR (order_ts = ? AND a.url < ?))');
    }
    keysetParams.push(cursor.ts, cursor.ts, cursor.url);
  }
  if (keysetPredicates.length) {
    sql += (sql.includes(' WHERE ') ? ' AND ' : ' WHERE ') + keysetPredicates.join(' AND ');
  }

  sql += ` ORDER BY (order_ts IS NULL) ASC, order_ts ${orderDir}, a.url ${orderDir} LIMIT ?`;

  const rows = withTrace(trace, 'urls:list', () =>
    handle.prepare(sql).all(...params, ...fetchParams, ...keysetParams, limit)
  );

  const urls = rows.map((row) => row.url);

  let nextCursor = null;
  let prevCursor = null;
  if (rows.length) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    const firstCursor = { ts: first.order_ts || first.ts || null, url: first.url };
    const lastCursor = { ts: last.order_ts || last.ts || null, url: last.url };
    nextCursor = encodeCursor(lastCursor);
    prevCursor = encodeCursor(firstCursor);
  }

  return {
    total,
    urls,
    rows,
    nextCursor,
    prevCursor
  };
}

module.exports = {
  parseListOptions,
  listUrls,
  encodeCursor,
  decodeCursor
};
