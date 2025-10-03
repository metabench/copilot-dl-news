const { escapeHtml, formatNumber } = require('./helpers');

function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '';
}

function renderGazetteerCountriesPage({ rows = [], renderNav }) {
  const navRenderer = ensureRenderNav(renderNav);
  const navHtml = navRenderer('gazetteer', { variant: 'bar' });

  const rowsHtml = rows.length
    ? rows.map((row) => `
        <tr>
          <td><a href="/gazetteer/place/${escapeHtml(row.id)}">${escapeHtml(row.name || '')}</a></td>
          <td>${escapeHtml(row.country_code || '')}</td>
          <td style="text-align:right">${formatNumber(row.population)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" class="meta">No countries</td></tr>';

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Countries — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 18px}
  header h1{margin:0;font-size:20px}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  th,td{border-bottom:1px solid var(--border);padding:8px 10px;font-size:14px}
  th{color:var(--muted);text-align:left;background:#fcfcfd}
  tr:nth-child(even){background:#fafafa}
  tr:hover{background:#f6f8fa}
  .meta{color:var(--muted);font-size:12px}
</style>
</head><body>
  ${navHtml}
  <div class="container">
    <header>
      <h1>Countries</h1>
    </header>
    <table>
      <thead><tr><th>Name</th><th>CC</th><th style="text-align:right">Population</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</body></html>`;
}

module.exports = {
  renderGazetteerCountriesPage
};
