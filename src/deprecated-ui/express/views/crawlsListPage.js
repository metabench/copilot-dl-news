const { renderCrawlsTable, renderCrawlsSummary, renderCrawlRow } = require('./crawls/renderCrawlsTable');
const { createCrawlsViewModel } = require('./crawls/createCrawlsViewModel');

function renderCrawlsListPage({ items = [], renderNav, viewModel = null }) {
  const navHtml = renderNav('crawls', { variant: 'bar' });
  const guidPrefix = 'ssr-';
  const model = viewModel || createCrawlsViewModel(items);
  const summaryHtml = renderCrawlsSummary(model.summary, guidPrefix);
  const tableHtml = renderCrawlsTable(model.rows, guidPrefix);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Crawls</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page crawls-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="crawls-page" aria-label="Crawls layout">
      ${summaryHtml}

      <section class="crawls-panel" aria-label="Crawls table" data-jsgui-id="${guidPrefix}panel">
        <div class="crawls-panel__header">
          <h1>Crawls</h1>
        </div>
        ${tableHtml}
        <p class="crawls-panel__tip">
          Use the main crawler dashboard at <code>/</code> to start new crawls.
        </p>
      </section>
    </div>
  </div>
  <script src="/js/crawls-enhancer.js" defer></script>
</body></html>`;
}

function streamCrawlsListPage({ res, renderNav, viewModel, chunkSize = 64 }) {
  if (!res || typeof res.write !== 'function') {
    throw new Error('streamCrawlsListPage requires a writable response');
  }
  if (!viewModel) {
    throw new Error('streamCrawlsListPage requires a precomputed view model');
  }

  const model = viewModel;
  const navHtml = renderNav('crawls', { variant: 'bar' });
  const guidPrefix = 'ssr-';
  const summaryHtml = renderCrawlsSummary(model.summary, guidPrefix);

  const opening = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Crawls</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page crawls-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="crawls-page" aria-label="Crawls layout">
      ${summaryHtml}

      <section class="crawls-panel" aria-label="Crawls table" data-jsgui-id="${guidPrefix}panel">
        <div class="crawls-panel__header">
          <h1>Crawls</h1>
        </div>
        <div class="table-responsive">
          <table class="crawls-table" data-jsgui-id="${guidPrefix}crawls-table">
            <thead>
              <tr>
                <th class="u-fit">ID</th>
                <th class="u-fit">Status</th>
                <th class="u-fit">Type</th>
                <th>URL</th>
                <th class="text-right u-nowrap">Visited</th>
                <th class="text-right u-nowrap">Downloaded</th>
                <th class="text-right u-nowrap">Errors</th>
                <th class="text-right u-nowrap">Queue</th>
                <th class="u-fit">PID</th>
                <th class="u-fit u-nowrap">Started</th>
                <th class="u-fit u-nowrap">Ended</th>
                <th class="u-fit u-nowrap">Duration</th>
              </tr>
            </thead>
            <tbody data-jsgui-id="${guidPrefix}crawls-tbody">
`;

  res.write(opening);

  if (!model.rows.length) {
    res.write('          <tr><td colspan="12" class="ui-meta">No crawls recorded yet.</td></tr>\n');
  } else {
    for (let i = 0; i < model.rows.length; i += chunkSize) {
      const chunk = model.rows.slice(i, i + chunkSize)
        .map((row) => `          ${renderCrawlRow(row, guidPrefix)}`)
        .join('\n');
      res.write(`${chunk}\n`);
    }
  }

  const closing = `            </tbody>
          </table>
        </div>
        <p class="crawls-panel__tip">
          Use the main crawler dashboard at <code>/</code> to start new crawls.
        </p>
      </section>
    </div>
  </div>
  <script src="/js/crawls-enhancer.js" defer></script>
</body></html>`;

  res.end(closing);
}

module.exports = {
  renderCrawlsListPage,
  streamCrawlsListPage
};
