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
  fetchGazetteerPlaces
} = require('../data/gazetteerPlaces');

function createGazetteerKindRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) throw new Error('createGazetteerKindRouter requires urlsDbPath');
  if (typeof startTrace !== 'function') throw new Error('createGazetteerKindRouter requires startTrace(req, tag)');

  const router = express.Router();

  router.get('/gazetteer/kind/:kind', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try { trace.end(); } catch (_) { /* noop */ }
    };

    const kindParam = String(req.params.kind || '').trim();
    const normalizedKind = kindParam.toLowerCase();
    const showStorage = String(req.query.storage || '0') === '1';
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? ''), 10) || 300));

    if (!normalizedKind) {
      endTrace();
      res.status(400).send('<!doctype html><title>Gazetteer</title><body><h1>Missing kind</h1></body></html>');
      return;
    }

    let openDbReadOnly;
    try {
      ({ openDbReadOnly } = require('../../../ensure_db'));
    } catch (err) {
      endTrace();
      res.status(503).send('<!doctype html><title>Gazetteer</title><body><h1>Database unavailable.</h1></body></html>');
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const doneRows = safeTracePre(trace, 'rows');
      const {
        rows: baseRows
      } = fetchGazetteerPlaces(db, {
        kind: normalizedKind,
        search: '',
        countryCode: '',
        adm1: '',
        minPopulation: 0,
        sort: 'population',
        direction: 'DESC',
        page: 1,
        pageSize: limit,
        offset: 0
      }, {
        selectColumns: `p.id,
               p.country_code,
               p.adm1_code,
               p.population,
               COALESCE(cn.name, (
                 SELECT name
                 FROM place_names pn
                 WHERE pn.place_id = p.id
                 ORDER BY pn.is_official DESC, pn.is_preferred DESC, pn.name
                 LIMIT 1
               )) AS name`,
        orderByNameExpression: 'name COLLATE NOCASE',
        orderBySecondary: 'name COLLATE NOCASE ASC'
      });
      doneRows();

      let rows = baseRows;
      let totalStorage = 0;
      if (showStorage) {
        const estimateSize = createSizeEstimator(db);
        rows = rows.map((row) => {
          const size = estimateSize(row.id);
          totalStorage += size;
          return { ...row, size_bytes: size };
        });
      }

      const perCountry = new Map();
      for (const r of rows) {
        const code = (r.country_code || '').toUpperCase() || '—';
        perCountry.set(code, (perCountry.get(code) || 0) + 1);
      }
      const countrySummary = Array.from(perCountry.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([code, count]) => `<span class="pill">${escapeHtml(code)}: ${count}</span>`)
        .join(' ');

      const columnCount = showStorage ? 5 : 4;
      const rowsHtml = rows.map((row) => `
        <tr>
          <td><a href="/gazetteer/place/${row.id}">${escapeHtml(row.name || '(unnamed)')}</a></td>
          <td>${escapeHtml(row.country_code || '')}</td>
          <td>${escapeHtml(row.adm1_code || '')}</td>
          ${showStorage ? `<td class="tr"><span title="Approximate">~ ${formatBytes(row.size_bytes || 0)}</span></td>` : ''}
          <td class="tr">${formatNumber(row.population)}</td>
        </tr>
      `).join('');

      const toggleLink = showStorage
        ? `<a href="${toQueryString({ limit })}">Hide storage</a>`
        : `<a href="${toQueryString({ storage: 1, limit })}">Show approx storage</a>`;

      const titleText = normalizedKind.replace(/^[a-z]/, (ch) => ch.toUpperCase());
      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer – ${escapeHtml(titleText)}</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px;margin:6px 0}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;margin:2px;background:#fff;font-size:12px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:12px}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
  .toolbar a{color:#2563eb;text-decoration:none;font-size:13px}
  .toolbar a:hover{text-decoration:underline}
  .tr{text-align:right}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>${escapeHtml(titleText)} places</h1>
      ${renderNav('gazetteer')}
    </header>
    <div class="meta">Showing ${rows.length} place${rows.length === 1 ? '' : 's'} (limit ${limit}).</div>
    ${countrySummary ? `<div class="meta">Top countries: ${countrySummary}</div>` : ''}
    ${showStorage ? `<div class="meta">Total shown storage: ~ ${formatBytes(totalStorage)}</div>` : ''}
    <div class="toolbar">
      ${toggleLink}
      <a href="/gazetteer">Back to summary</a>
      <a href="/gazetteer/places">All places</a>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Country</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${columnCount}" class="meta">No places found.</td></tr>`}</tbody>
    </table>
  </div>
</body></html>`;

      const doneRender = safeTracePre(trace, 'render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      endTrace();
      try { db.close(); } catch (_) { /* noop */ }
    } catch (err) {
      try { if (db) db.close(); } catch (_) { /* noop */ }
      endTrace();
      const message = err && err.message ? err.message : String(err);
      res.status(500).send(`<!doctype html><title>Error</title><pre>${escapeHtml(message)}</pre>`);
    }
  });

  return router;
}

module.exports = {
  createGazetteerKindRouter
};
