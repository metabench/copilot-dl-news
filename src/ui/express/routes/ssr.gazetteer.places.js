const express = require('express');
const { renderNav } = require('../services/navigation');
const {
  escapeHtml,
  formatNumber,
  formatBytes,
  toQueryString,
  safeTracePre,
  createSizeEstimator
} = require('../views/gazetteer/helpers');
const {
  normalizeGazetteerPlacesQuery,
  fetchGazetteerPlaces
} = require('../data/gazetteerPlaces');

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

    const showStorage = String(req.query.storage || '0') === '1';
    const normalizedQuery = normalizeGazetteerPlacesQuery(req.query || {});

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

      const doneFetch = safeTracePre(trace, 'rows');
      const {
        total,
        rows: baseRows,
        filters
      } = fetchGazetteerPlaces(db, normalizedQuery, {
        orderByNameExpression: 'name',
        orderBySecondary: 'p.id ASC'
      });
      doneFetch();

      let rows = baseRows;
      const {
        search,
        kind,
        countryCode,
        adm1,
        minPopulation,
        sort,
        direction,
        page,
        pageSize
      } = filters;

      let totalStorage = 0;
      if (showStorage) {
        const estimateSize = createSizeEstimator(db);
        rows = rows.map((row) => {
          const size = estimateSize(row.id);
          totalStorage += size;
          return { ...row, size_bytes: size };
        });
      }

      const toggleLinkParams = {
        q: search,
        kind,
        cc: countryCode,
        adm1,
        minpop: minPopulation || '',
        sort,
        dir: direction,
        page,
        pageSize
      };
      const toggleLink = showStorage
        ? `<a href="${toQueryString(toggleLinkParams)}">Hide storage</a>`
        : `<a href="${toQueryString({ ...toggleLinkParams, storage: 1 })}">Show approx storage</a>`;

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

      if (search) summaryBits.push(`query “${escapeHtml(search)}”`);
      if (kind) summaryBits.push(`kind ${escapeHtml(kind)}`);
      if (countryCode) summaryBits.push(`country ${escapeHtml(countryCode)}`);
      if (adm1) summaryBits.push(`ADM1 ${escapeHtml(adm1)}`);
      if (minPopulation) summaryBits.push(`min population ${escapeHtml(minPopulation)}`);

      const basePagerParams = {
        q: search,
        kind,
        cc: countryCode,
        adm1,
        minpop: minPopulation || '',
        sort,
        dir: direction,
        pageSize
      };
      if (showStorage) {
        basePagerParams.storage = 1;
      }
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const hasPrev = page > 1;
      const hasNext = page < totalPages;
      const prevLink = hasPrev
        ? `<a href="${toQueryString({ ...basePagerParams, page: page - 1 })}">← Prev</a>`
        : `<span class="muted">← Prev</span>`;
      const nextLink = hasNext
        ? `<a href="${toQueryString({ ...basePagerParams, page: page + 1 })}">Next →</a>`
        : `<span class="muted">Next →</span>`;

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
  .pager{display:flex;align-items:center;justify-content:space-between;margin:10px 0;font-size:13px}
  .pager span.muted{color:var(--muted)}
  .pager .current{flex:1;text-align:center;color:var(--muted)}
  .tr{text-align:right}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Gazetteer places</h1>
      ${renderNav('gazetteer')}
    </header>
    <form class="filters" method="GET" action="/gazetteer/places">
  <label>Search<input type="text" name="q" value="${escapeHtml(search)}" placeholder="City, region, …"/></label>
  <label>Kind<input type="text" name="kind" value="${escapeHtml(kind)}" placeholder="city"/></label>
  <label>Country<input type="text" name="cc" value="${escapeHtml(countryCode)}" placeholder="GB"/></label>
  <label>ADM1<input type="text" name="adm1" value="${escapeHtml(adm1)}" placeholder="ENG"/></label>
  <label>Min population<input type="number" name="minpop" value="${escapeHtml(minPopulation || '')}"/></label>
  <label>Sort<input type="text" name="sort" value="${escapeHtml(sort)}"/></label>
  <label>Direction<input type="text" name="dir" value="${escapeHtml(direction)}"/></label>
  <label>Page<input type="number" min="1" name="page" value="${escapeHtml(page)}"/></label>
  <label>Page size<input type="number" min="1" max="200" name="pageSize" value="${escapeHtml(pageSize)}"/></label>
      <button type="submit">Apply</button>
    </form>
    <div class="meta">${summaryBits.join(' · ')}</div>
    <div class="pager">
      <div>${prevLink}</div>
      <div class="current">Page ${page} of ${totalPages}</div>
      <div>${nextLink}</div>
    </div>
    <div class="toolbar">
      ${toggleLink}
      <a href="/gazetteer">Back to summary</a>
      <a href="/gazetteer/countries">Countries</a>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Country</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${showStorage ? 5 : 4}" class="meta">No places found.</td></tr>`}</tbody>
    </table>
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
