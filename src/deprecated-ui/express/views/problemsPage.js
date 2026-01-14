/**
 * Problems Page View
 * Refactored to use centralized utilities and component system
 */

const { escapeHtml, toQueryString } = require('../../../shared/utils/html');
const { pill } = require('../components/base');

/**
 * Derive severity level from problem kind
 * @param {string} kind - Problem kind
 * @returns {string} Severity level (warn, info, etc.)
 */
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

/**
 * Build query string for filters with overrides
 * @param {Object} baseFilters - Base filter values
 * @param {Object} overrides - Override values
 * @returns {string} Query string with leading ?
 */
function buildFiltersQuery(baseFilters, overrides = {}) {
  const merged = { ...baseFilters, ...overrides };
  return toQueryString(merged);
}

/**
 * Render problems page with table and filters
 * @param {Object} spec - Page specification
 * @returns {string} Complete HTML page
 */
function renderProblemsPage({ items, filters, cursors, renderNav }) {
  // Create render context for components
  const context = { escapeHtml };
  
  const rows = items.map((item) => {
    const severity = deriveProblemSeverity(item.kind);
    const severityClass = severity === 'warn' ? 'warn' : 'info';
    return `
        <tr>
          <td class="u-nowrap">${escapeHtml(item.ts)}</td>
          <td class="text-mono">${escapeHtml(item.jobId || '')}</td>
          <td>${pill({ text: item.kind, variant: severityClass }, context)}</td>
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

  const navHtml = typeof renderNav === 'function' 
    ? renderNav('problems', { variant: 'bar' })
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Problems</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page problems-page">
  ${navHtml}
  <div class="ui-container problems-page__layout">
    <header class="problems-page__header">
      <h1>Problems</h1>
    </header>
    <form class="ui-filters" method="GET" action="/problems/ssr">
      <label class="ui-filters__label">Job
        <input type="text" name="job" value="${escapeHtml(filters.job || '')}"/>
      </label>
      <label class="ui-filters__label">Kind
        <input type="text" name="kind" value="${escapeHtml(filters.kind || '')}"/>
      </label>
      <label class="ui-filters__label">Scope
        <input type="text" name="scope" value="${escapeHtml(filters.scope || '')}"/>
      </label>
      <label class="ui-filters__label">Limit
        <input type="number" min="1" max="500" name="limit" value="${escapeHtml(filters.limit)}"/>
      </label>
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