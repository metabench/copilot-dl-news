const { escapeHtml } = require('../utils/html');

function deriveProblemSeverity(kind) {
  switch (kind) {
    case 'missing-hub':
      return 'warn';
    case 'unknown-pattern':
      return 'info';
    default:
      return 'info';
  }
}

function buildFiltersQuery(baseFilters, overrides = {}) {
  const params = new URLSearchParams();
  const merged = { ...baseFilters, ...overrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function renderProblemsPage({ items, filters, cursors, renderNav }) {
  const rows = items.map((item) => {
    const severity = deriveProblemSeverity(item.kind);
    const severityClass = severity === 'warn' ? 'warn' : 'info';
    return `
        <tr>
          <td class="u-nowrap">${escapeHtml(item.ts)}</td>
          <td class="text-mono">${escapeHtml(item.jobId || '')}</td>
          <td><span class="pill ${severityClass}"><code>${escapeHtml(item.kind)}</code></span></td>
          <td>${escapeHtml(item.scope || '')}</td>
          <td>${escapeHtml(item.target || '')}</td>
          <td>${escapeHtml(item.message || '')}</td>
        </tr>`;
  }).join('');

  const pager = `
        <div class="ui-pager">
          <div class="ui-meta">${items.length} shown</div>
          <div class="ui-pager__links">
            ${cursors?.prevAfter ? `<a class="ui-pager__link" href="/problems/ssr${buildFiltersQuery(filters, { after: cursors.prevAfter, before: undefined })}">← Newer</a>` : ''}
            ${cursors?.nextBefore ? `<a class="ui-pager__link" href="/problems/ssr${buildFiltersQuery(filters, { before: cursors.nextBefore, after: undefined })}">Older →</a>` : ''}
          </div>
        </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Problems</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page problems-page problems-legacy-page">
  <div class="ui-container problems-page__layout">
    <header class="problems-page__header">
      <h1>Problems</h1>
      ${renderNav('problems')}
    </header>
    <form class="ui-filters" method="GET" action="/problems/ssr">
      <label class="ui-filters__label">Job <input type="text" name="job" value="${escapeHtml(filters.job || '')}"/></label>
      <label class="ui-filters__label">Kind <input type="text" name="kind" value="${escapeHtml(filters.kind || '')}"/></label>
      <label class="ui-filters__label">Scope <input type="text" name="scope" value="${escapeHtml(filters.scope || '')}"/></label>
      <label class="ui-filters__label">Limit <input type="number" min="1" max="500" name="limit" value="${escapeHtml(filters.limit)}"/></label>
      <button type="submit" class="ui-button">Apply</button>
    </form>
    ${pager}
    <div class="table-responsive">
    <table class="problems-page__table">
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="ui-meta">No problems</td></tr>'}</tbody>
    </table>
    </div>
    ${pager}
  </div>
</body></html>`;
}

module.exports = {
  renderProblemsPage
};

