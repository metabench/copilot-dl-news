/**
 * Milestones Page View
 * Refactored to use centralized utilities and component system
 * Following jsgui3-inspired composition patterns
 */

const { escapeHtml, toQueryString } = require('../utils/html');
const { pill } = require('../components/base');

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
 * Render milestones page with table and filters
 * @param {Object} spec - Page specification
 * @param {Array} spec.items - Milestone items
 * @param {Object} spec.filters - Current filter values
 * @param {Object} spec.cursors - Pagination cursors
 * @param {Function} spec.renderNav - Navigation renderer
 * @returns {string} Complete HTML page
 */
function renderMilestonesPage({ items, filters, cursors, renderNav }) {
  // Create render context for components
  const context = { escapeHtml };
  
  // Build table rows with pill component for kind
  const rows = items.map((item) => `
        <tr>
          <td class="u-nowrap">${escapeHtml(item.ts)}</td>
          <td class="text-mono">${escapeHtml(item.jobId || '')}</td>
          <td>${pill({ text: item.kind, variant: 'good' }, context)}</td>
          <td>${escapeHtml(item.scope || '')}</td>
          <td>${escapeHtml(item.target || '')}</td>
          <td>${escapeHtml(item.message || '')}</td>
        </tr>
      `).join('');

  const pager = `
        <div class="ui-pager">
          <div class="ui-meta">${items.length} shown</div>
          <div class="ui-pager__links">
            ${cursors?.prevAfter ? `<a class="ui-pager__link" href="/milestones/ssr${buildFiltersQuery(filters, { after: cursors.prevAfter, before: undefined })}">← Newer</a>` : ''}
            ${cursors?.nextBefore ? `<a class="ui-pager__link" href="/milestones/ssr${buildFiltersQuery(filters, { before: cursors.nextBefore, after: undefined })}">Older →</a>` : ''}
          </div>
        </div>`;

  const navHtml = typeof renderNav === 'function' 
    ? renderNav('milestones', { variant: 'bar' })
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Milestones</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page milestones-page">
  ${navHtml}
  <div class="ui-container milestones-page__layout">
    <header class="milestones-page__header">
      <h1>Milestones</h1>
    </header>
    <form class="ui-filters" method="GET" action="/milestones/ssr">
      <label class="ui-filters__label">Job <input type="text" name="job" value="${escapeHtml(filters.job || '')}"/></label>
      <label class="ui-filters__label">Kind <input type="text" name="kind" value="${escapeHtml(filters.kind || '')}"/></label>
      <label class="ui-filters__label">Scope <input type="text" name="scope" value="${escapeHtml(filters.scope || '')}"/></label>
      <label class="ui-filters__label">Limit <input type="number" min="1" max="500" name="limit" value="${escapeHtml(filters.limit)}"/></label>
      <button type="submit" class="ui-button">Apply</button>
    </form>
    ${pager}
    <div class="table-responsive">
    <table class="milestones-page__table">
      <thead><tr><th>Time</th><th>Job</th><th>Kind</th><th>Scope</th><th>Target</th><th>Message</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="ui-meta">No milestones</td></tr>'}</tbody>
    </table>
    </div>
    ${pager}
  </div>
</body></html>`;
}

module.exports = {
  renderMilestonesPage
};