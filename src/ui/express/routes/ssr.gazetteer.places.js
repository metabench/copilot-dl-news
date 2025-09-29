const express = require('express');
const { renderNav } = require('../services/navigation');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function formatNumber(value) {
  if (value == null) return '';
  try {
    return Number(value).toLocaleString();
  } catch (_) {
    return String(value);
  }
}

function formatBytes(value) {
  if (value == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = Number(value) || 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return (index === 0 ? String(current | 0) : current.toFixed(1)) + ' ' + units[index];
}

function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

function safeTracePre(trace, name) {
  if (!trace || typeof trace.pre !== 'function') return () => {};
  try {
    return trace.pre(name) || (() => {});
  } catch (_) {
    return () => {};
  }
}

function createSizeEstimator(db) {
  const placeStmt = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS total FROM places WHERE id=?`);
  const namesStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS total FROM place_names WHERE place_id=?`);
  const externalStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS total FROM place_external_ids WHERE place_id=?`);
  const hierarchyStmt = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS total FROM place_hierarchy WHERE parent_id=? OR child_id=?`);

  const cache = new Map();
  return (id) => {
    if (cache.has(id)) return cache.get(id);
    const base = placeStmt.get(id)?.total || 0;
    const names = namesStmt.get(id)?.total || 0;
    const external = externalStmt.get(id)?.total || 0;
    const hierarchy = hierarchyStmt.get(id, id)?.total || 0;
    const total = (base + names + external + hierarchy) | 0;
    cache.set(id, total);
    return total;
  };
}

function createGazetteerPlacesRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) throw new Error('createGazetteerPlacesRouter requires urlsDbPath');
  if (typeof startTrace !== 'function') throw new Error('createGazetteerPlacesRouter requires startTrace(req, tag)');

  const router = express.Router();

  router.get('/gazetteer/places', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try { trace.end(); } catch (_) { /* noop */ }
    };

    const q = String(req.query.q || '').trim();
    const kind = String(req.query.kind || '').trim();
    const cc = String(req.query.cc || '').trim().toUpperCase();
    const adm1 = String(req.query.adm1 || '').trim();
    const minpop = parseInt(req.query.minpop || '0', 10) || 0;
    const sort = String(req.query.sort || 'name').trim();
    const dir = (String(req.query.dir || 'asc').toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize || '50', 10)));
    const showStorage = String(req.query.storage || '0') === '1';

    let openDbReadOnly;
    try {
      ({ openDbReadOnly } = require('../../../ensure_db'));
    } catch (err) {
      endTrace();
      res.status(503).send('<!doctype html><title>Gazetteer</title><body><h1>Gazetteer</h1><p>Database unavailable.</p></body></html>');
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const where = [];
      const params = [];
      if (kind) {
        where.push('p.kind = ?');
        params.push(kind);
      }
      if (cc) {
        where.push('UPPER(p.country_code) = ?');
        params.push(cc);
      }
      if (adm1) {
        where.push('p.adm1_code = ?');
        params.push(adm1);
      }
      if (minpop > 0) {
        where.push('COALESCE(p.population,0) >= ?');
        params.push(minpop);
      }
      if (q) {
        const like = `%${q.toLowerCase()}%`;
        where.push(`EXISTS (SELECT 1 FROM place_names nx WHERE nx.place_id = p.id AND (LOWER(nx.normalized) LIKE ? OR LOWER(nx.name) LIKE ?))`);
        params.push(like, like);
      }
      const whereSql = where.length ? ` AND ${where.join(' AND ')}` : '';
      const sortCol = (sort === 'pop' || sort === 'population')
        ? 'p.population'
        : (sort === 'country' ? 'p.country_code' : 'name');

      const doneCount = safeTracePre(trace, 'count');
      const total = db.prepare(`
        SELECT COUNT(*) AS count
        FROM places p
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${whereSql}
      `).get(...params).count;
      doneCount();

      const doneRows = safeTracePre(trace, 'rows');
      let rows = db.prepare(`
        SELECT p.id,
               p.kind,
               p.country_code,
               p.adm1_code,
               p.population,
               COALESCE(cn.name, pn.name) AS name
        FROM places p
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ((p.canonical_name_id IS NOT NULL AND p.canonical_name_id IN (SELECT id FROM place_names))
               OR EXISTS(SELECT 1 FROM place_names pn WHERE pn.place_id = p.id))
          ${whereSql}
        ORDER BY ${sortCol} ${dir}, p.id ASC
        LIMIT ? OFFSET ?
      `).all(...params, pageSize, (page - 1) * pageSize);
      doneRows();

      let totalStorage = 0;
      if (showStorage) {
        const estimateSize = createSizeEstimator(db);
        rows = rows.map((row) => {
          const size = estimateSize(row.id);
          totalStorage += size;
          return { ...row, size_bytes: size };
        });
      }

      const baseParams = { q, kind, cc, adm1, minpop, sort, dir, page, pageSize };
      const toggleLink = showStorage
        ? `<a href="${toQueryString(baseParams)}">Hide storage</a>`
        : `<a href="${toQueryString({ ...baseParams, storage: 1 })}">Show approx storage</a>`;

      const totalPages = Math.max(1, Math.ceil(Number(total || 0) / pageSize));
      const prevHref = page > 1
        ? toQueryString({ ...baseParams, page: page - 1, storage: showStorage ? 1 : undefined })
        : null;
      const nextHref = page < totalPages
        ? toQueryString({ ...baseParams, page: page + 1, storage: showStorage ? 1 : undefined })
        : null;

      const rowsHtml = rows.map((row) => `
        <tr>
          <td><a href="/gazetteer/place/${row.id}">${escapeHtml(row.name || '(unnamed)')}</a></td>
          <td>${escapeHtml(row.country_code || '')}</td>
          <td>${escapeHtml(row.adm1_code || '')}</td>
          ${showStorage ? `<td class="tr"><span title="Approximate">~ ${formatBytes(row.size_bytes || 0)}</span></td>` : ''}
          <td class="tr">${formatNumber(row.population)}</td>
        </tr>
      `).join('');

      const summaryBits = [];
      summaryBits.push(`${rows.length ? rows.length : 'No'} result${rows.length === 1 ? '' : 's'}`);
      summaryBits.push(`page ${page}`);
      summaryBits.push(`page size ${pageSize}`);

      if (q) summaryBits.push(`query “${escapeHtml(q)}”`);
      if (kind) summaryBits.push(`kind ${escapeHtml(kind)}`);
      if (cc) summaryBits.push(`country ${escapeHtml(cc)}`);
      if (adm1) summaryBits.push(`ADM1 ${escapeHtml(adm1)}`);
      if (minpop) summaryBits.push(`min population ${escapeHtml(minpop)}`);

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer places</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:960px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:22px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px;margin:6px 0}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  form.filters{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
  form.filters label{display:flex;flex-direction:column;font-size:12px;color:var(--muted)}
  form.filters input{padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:13px}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0;font-size:13px}
  .toolbar a{color:#2563eb;text-decoration:none}
  .toolbar a:hover{text-decoration:underline}
  .tr{text-align:right}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Gazetteer places</h1>
      ${renderNav('gazetteer')}
    </header>
    <form class="filters" method="GET" action="/gazetteer/places">
      <label>Search<input type="text" name="q" value="${escapeHtml(q)}" placeholder="City, region, …"/></label>
      <label>Kind<input type="text" name="kind" value="${escapeHtml(kind)}" placeholder="city"/></label>
      <label>Country<input type="text" name="cc" value="${escapeHtml(cc)}" placeholder="GB"/></label>
      <label>ADM1<input type="text" name="adm1" value="${escapeHtml(adm1)}" placeholder="ENG"/></label>
      <label>Min population<input type="number" name="minpop" value="${escapeHtml(minpop || '')}"/></label>
      <label>Sort<input type="text" name="sort" value="${escapeHtml(sort)}"/></label>
      <label>Direction<input type="text" name="dir" value="${escapeHtml(dir)}"/></label>
      <label>Page<input type="number" min="1" name="page" value="${escapeHtml(page)}"/></label>
      <label>Page size<input type="number" min="1" max="200" name="pageSize" value="${escapeHtml(pageSize)}"/></label>
      <button type="submit">Apply</button>
    </form>
    <div class="meta">${summaryBits.join(' · ')}</div>
    <div class="toolbar">
      ${toggleLink}
      <a href="/gazetteer">Back to summary</a>
      <a href="/gazetteer/countries">Countries</a>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Country</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${showStorage ? 5 : 4}" class="meta">No places found.</td></tr>`}</tbody>
    </table>
    <div class="toolbar">
      ${prevHref ? `<a href="${prevHref}">← Prev</a>` : ''}
      ${nextHref ? `<a href="${nextHref}">Next →</a>` : ''}
    </div>
  ${showStorage ? `<div class="meta">Total shown storage: ~ ${formatBytes(totalStorage)}</div>` : ''}
  </div>
</body></html>`;

      const doneClose = safeTracePre(trace, 'db-close');
      db.close();
      doneClose();

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      endTrace();
    } catch (err) {
      try { if (db) db.close(); } catch (_) { /* noop */ }
      endTrace();
      const msg = err && err.message ? err.message : String(err);
      res.status(500).send(`<!doctype html><title>Error</title><pre>${escapeHtml(msg)}</pre>`);
    }
  });

  return router;
}

module.exports = {
  createGazetteerPlacesRouter
};
