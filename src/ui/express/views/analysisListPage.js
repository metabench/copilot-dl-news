const { escapeHtml } = require('../utils/html');
const {
  renderAnalysisSummary,
  renderAnalysisTable,
  renderAnalysisRow,
  buildClientPayload
} = require('./analysis/renderAnalysisTable');
const { createAnalysisViewModel } = require('./analysis/createAnalysisViewModel');

function ensureRenderNav(fn) {
  return typeof fn === 'function' ? fn : () => '';
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderAnalysisListPage({ items = [], total = 0, limit = 50, renderNav, viewModel = null }) {
  const navRenderer = ensureRenderNav(renderNav);
  const safeLimit = Number.isFinite(limit) ? limit : 50;
  const navHtml = navRenderer('analysis', { variant: 'bar' });

  const model = viewModel || createAnalysisViewModel(items, { total, limit: safeLimit });
  const guidPrefix = 'ssr-';
  const summaryHtml = renderAnalysisSummary(model.summary, guidPrefix);
  const tableHtml = renderAnalysisTable(model.rows, guidPrefix);
  const clientPayload = buildClientPayload(model, { total, limit: safeLimit });
  const payloadJson = safeJson(clientPayload);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
<link rel="stylesheet" href="/styles/analysis-progress-bar.css" />
</head><body class="ui-page analysis-list-page">
  ${navHtml}
  <div class="ui-container analysis-list-page__layout">
    <header class="analysis-list-page__header">
      <div class="analysis-list-page__title">
        <h1>Analysis runs</h1>
        <p class="ui-meta">Monitor background analysis batches and their current stages.</p>
      </div>
      <form class="ui-filters analysis-list-page__filters" method="GET" action="/analysis/ssr">
        <label class="ui-filters__label">Limit
          <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}" />
        </label>
        <button type="submit" class="ui-button">Apply</button>
        <span class="ui-meta">Total ${escapeHtml(String(total))}</span>
      </form>
    </header>

    <div class="analysis-list-page__overview">
      ${summaryHtml}
      <aside class="analysis-actions" aria-label="Start a new analysis" data-jsgui-id="${guidPrefix}start-form">
        <div id="analysis-start-form"></div>
      </aside>
    </div>

    ${tableHtml}
  </div>
  <script>window.__ANALYSIS_VIEW_MODEL__ = ${payloadJson};</script>
  <script type="module" src="/js/analysis-enhancer.js"></script>
</body></html>`;
}

function streamAnalysisListPage({ res, renderNav, viewModel, total = 0, limit = 50, chunkSize = 64 }) {
  if (!res || typeof res.write !== 'function') {
    throw new Error('streamAnalysisListPage requires a writable response');
  }
  if (!viewModel) {
    throw new Error('streamAnalysisListPage requires a precomputed view model');
  }

  const navRenderer = ensureRenderNav(renderNav);
  const navHtml = navRenderer('analysis', { variant: 'bar' });
  const safeLimit = Number.isFinite(limit) ? limit : 50;
  const guidPrefix = 'ssr-';
  const summaryHtml = renderAnalysisSummary(viewModel.summary, guidPrefix);
  const clientPayload = buildClientPayload(viewModel, { total, limit: safeLimit });
  const payloadJson = safeJson(clientPayload);

  const opening = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Analysis runs</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
<link rel="stylesheet" href="/styles/analysis-progress-bar.css" />
</head><body class="ui-page analysis-list-page">
  ${navHtml}
  <div class="ui-container analysis-list-page__layout">
    <header class="analysis-list-page__header">
      <div class="analysis-list-page__title">
        <h1>Analysis runs</h1>
        <p class="ui-meta">Monitor background analysis batches and their current stages.</p>
      </div>
      <form class="ui-filters analysis-list-page__filters" method="GET" action="/analysis/ssr">
        <label class="ui-filters__label">Limit
          <input type="number" min="1" max="200" name="limit" value="${escapeHtml(String(safeLimit))}" />
        </label>
        <button type="submit" class="ui-button">Apply</button>
        <span class="ui-meta">Total ${escapeHtml(String(total))}</span>
      </form>
    </header>
    <div class="analysis-list-page__overview">
      ${summaryHtml}
      <aside class="analysis-actions" aria-label="Start a new analysis" data-jsgui-id="${guidPrefix}start-form">
        <div id="analysis-start-form"></div>
      </aside>
    </div>
    <section class="analysis-table" aria-label="Analysis runs">
      <div class="table-responsive">
        <table class="analysis-table__grid" data-jsgui-id="${guidPrefix}analysis-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Duration</th>
              <th>Config</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody data-jsgui-id="${guidPrefix}analysis-tbody">
`;

  res.write(opening);

  if (!viewModel.rows.length) {
    res.write('            <tr><td colspan="8" class="ui-meta">No analysis runs yet.</td></tr>\n');
  } else {
    for (let i = 0; i < viewModel.rows.length; i += chunkSize) {
      const chunk = viewModel.rows.slice(i, i + chunkSize)
        .map((row) => `            ${renderAnalysisRow(row, guidPrefix)}`)
        .join('\n');
      res.write(`${chunk}\n`);
    }
  }

  const closing = `          </tbody>
        </table>
      </div>
    </section>
  </div>
  <script>window.__ANALYSIS_VIEW_MODEL__ = ${payloadJson};</script>
  <script type="module" src="/js/analysis-enhancer.js"></script>
</body></html>`;

  res.end(closing);
}

module.exports = {
  renderAnalysisListPage,
  streamAnalysisListPage
};
