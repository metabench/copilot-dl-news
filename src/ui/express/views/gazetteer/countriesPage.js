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
          <td class="u-nowrap">${escapeHtml(row.country_code || '')}</td>
          <td class="text-right">${formatNumber(row.population)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="3" class="ui-meta">No countries</td></tr>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Countries — Gazetteer</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page gazetteer-countries-page">
  ${navHtml}
  <div class="ui-container gazetteer-countries__layout">
    <header class="gazetteer-countries__header">
      <h1>Countries</h1>
    </header>
    <div class="table-responsive">
      <table class="gazetteer-countries__table">
        <thead><tr><th>Name</th><th>CC</th><th class="text-right">Population</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  renderGazetteerCountriesPage
};
