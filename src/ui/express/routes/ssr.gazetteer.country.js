const express = require('express');
const { renderNav } = require('../services/navigation');
const { fetchCountryPageData, GazetteerCountryError } = require('../data/gazetteerCountry');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function createGazetteerCountryRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) {
    throw new Error('createGazetteerCountryRouter requires urlsDbPath');
  }
  if (typeof startTrace !== 'function') {
    throw new Error('createGazetteerCountryRouter requires startTrace(req, tag)');
  }

  const router = express.Router();

  router.get('/gazetteer/country/:cc', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const cc = String(req.params.cc || '').trim().toUpperCase();
    const showStorage = String(req.query.storage || '0') === '1';

    const endTrace = () => {
      try {
        trace.end();
      } catch (_) {
        // ignore trace errors
      }
    };

    try {
      const { country, regions, cities, countryStorage } = fetchCountryPageData({
        dbPath: urlsDbPath,
        countryCode: cc,
        includeStorage: showStorage,
        trace
      });

      const toggleHtml = showStorage
        ? '<span>Storage: On · <a href="?">storage=0</a></span>'
        : '<span>Storage: Off · <a href="?storage=1">storage=1</a></span>';

      const regionsHtml = regions.map((region) => `
        <li><a href="/gazetteer/place/${escapeHtml(region.id)}">${escapeHtml(region.name || '')}</a> <span class="meta">${escapeHtml(region.adm1_code || '')}</span></li>
      `).join('');

      const rowsHtml = cities.map((city) => `
        <tr>
          <td><a href="/gazetteer/place/${escapeHtml(city.id)}">${escapeHtml(city.name || '')}</a></td>
          <td>${escapeHtml(city.adm1_code || '')}</td>
          ${showStorage ? `<td style="text-align:right"><span title="Approximate">~ ${formatBytes(city.size_bytes || 0)}</span></td>` : ''}
          <td style="text-align:right">${formatNumber(city.population)}</td>
        </tr>
      `).join('');

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(country.name || country.country_code)} — Country</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:20px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px}
  .card{background:#f8fafc;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .bad{color:#dc2626}
  .muted{color:var(--muted)}
  .row{display:flex;justify-content:space-between;align-items:center}
  .pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:2px 8px;background:#fff}
  a.tiny{font-size:12px}
  .right{float:right}
  .infobox div{margin:2px 0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width: 800px){ .grid{grid-template-columns:1fr} }
  .infobox{padding:10px}
  .switch{font-size:12px}
  .switch a{margin-left:6px}
  .switch strong{font-weight:600}
  .storage-val{font-weight:600}
  .toggle{margin-top:6px}
  .hdr{margin:0 0 6px}
  .w100{width:100%}
  .tr{ text-align:right }
  .name{ font-weight:600 }
  .table-wrap{margin-top:8px}
  .tbl-meta{margin:4px 2px}
  .tbl-meta strong{font-weight:600}
  .tbl-meta .muted{margin-left:8px}
  .tbl-meta .right{float:right}
  .tbl-meta::after{content:"";display:block;clear:both}
  .pill strong{font-weight:600}
  .breadcrumbs{margin-bottom:4px}
  .breadcrumbs a{color:var(--muted);text-decoration:none}
  .breadcrumbs a:hover{color:var(--fg);text-decoration:underline}
  .hdr-cc{margin-left:8px}
  .hdr-pop{margin-left:8px}
  .hdr-id{margin-left:8px}
  .hdr-line{margin-top:2px}
  .hdr-line .meta{margin-right:8px}
  .hdr-line .meta:last-child{margin-right:0}
  .hdr-line .meta strong{font-weight:600}
  .toggle a{ text-decoration:none }
  .toggle a:hover{ text-decoration:underline }
  .section-title{margin:8px 0 6px}
  .section-title strong{font-weight:600}
  .hdr-links a{margin-left:8px}
  .hdr-links a:first-child{margin-left:0}
  .hdr-links{margin-top:6px}
  .center{display:flex;justify-content:center}
  .center .muted{margin-top:2px}
  .spaced{letter-spacing:0.2px}
  .mono{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
  .mono .muted{letter-spacing:0}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  @media (max-width:900px){ .grid-2{grid-template-columns:1fr} }
</style>
</head><body>
  <div class="container">
    <header>
      <h1 class="spaced">${escapeHtml(country.name || country.country_code)} <span class="pill mono">${escapeHtml(country.country_code || '')}</span></h1>
  ${renderNav('gazetteer')}
    </header>
    <section class="card infobox">
      <div class="row"><div class="name">Infobox</div><div class="switch toggle">${toggleHtml}</div></div>
      <div class="hdr-line">
        ${country.population ? `<span class="meta">Population: <strong>${formatNumber(country.population)}</strong></span>` : ''}
        ${showStorage ? `<span class="meta">Storage: <span class="storage-val">${formatBytes(countryStorage || 0)}</span></span>` : ''}
      </div>
      <div class="hdr-links"><a href="/gazetteer">Gazetteer</a> · <a href="/gazetteer/countries">Countries</a></div>
    </section>

    <section class="card">
      <h2 class="section-title"><strong>Regions</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${regions.length} regions</span>
      </div>
      <ul>${regionsHtml || '<li class="meta">No regions</li>'}</ul>
    </section>

    <section class="table-wrap">
      <h2 class="section-title"><strong>Cities</strong></h2>
      <div class="tbl-meta">
        <span class="muted">${cities.length} cities</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>ADM1</th>${showStorage ? '<th class="tr">Storage</th>' : ''}<th class="tr">Population</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4" class="meta">No cities</td></tr>'}</tbody>
      </table>
    </section>
  </div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      endTrace();
    } catch (err) {
      endTrace();
      if (err instanceof GazetteerCountryError) {
        if (err.code === 'DB_UNAVAILABLE') {
          res.status(err.statusCode).send('<!doctype html><title>Country</title><h1>Country</h1><p>Database unavailable.</p>');
          return;
        }
        if (err.code === 'NOT_FOUND') {
          res.status(err.statusCode).send('<!doctype html><title>Not found</title><p>Country not found</p>');
          return;
        }
      }
      const message = err && err.message ? err.message : String(err);
      res.status(500).send(`<!doctype html><title>Error</title><pre>${escapeHtml(message)}</pre>`);
    }
  });

  return router;
}

module.exports = {
  createGazetteerCountryRouter
};
