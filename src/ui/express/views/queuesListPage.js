const { renderQueuesTable, renderQueuesSummary, renderQueueRow } = require('./queues/renderQueuesTable');
const { createQueuesViewModel } = require('./queues/createQueuesViewModel');

function renderQueuesListPage({ rows = [], renderNav, viewModel = null }) {
  const navHtml = renderNav('queues', { variant: 'bar' });
  const guidPrefix = 'ssr-'; // Unique prefix for SSR-rendered components

  // Use isomorphic renderers against precomputed view model
  const model = viewModel || createQueuesViewModel(rows);
  const summaryHtml = renderQueuesSummary(model.summary, guidPrefix);
  const tableHtml = renderQueuesTable(model.rows, guidPrefix);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page queues-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="queues-page" aria-label="Queues layout">
      ${summaryHtml}
      <main class="queues-panel">
        <header class="queues-panel__header">
          <h1>Queues</h1>
          <a class="ui-button" href="/queues/latest">Latest queue →</a>
        </header>
        ${tableHtml}
        <p class="queues-panel__tip">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</p>
      </main>
    </div>
  </div>
  <!-- Progressive enhancement script -->
  <script src="/js/queues-enhancer.js" defer></script>
</body></html>`;
}

function streamQueuesListPage({ res, renderNav, viewModel, chunkSize = 64 }) {
  if (!res || typeof res.write !== 'function') {
    throw new Error('streamQueuesListPage requires a writable response');
  }
  if (!viewModel) {
    throw new Error('streamQueuesListPage requires a precomputed view model');
  }

  const guidPrefix = 'ssr-';
  const summaryHtml = renderQueuesSummary(viewModel.summary, guidPrefix);
  const navHtml = renderNav('queues', { variant: 'bar' });

  const opening = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page queues-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="queues-page" aria-label="Queues layout">
      ${summaryHtml}
      <main class="queues-panel">
        <header class="queues-panel__header">
          <h1>Queues</h1>
          <a class="ui-button" href="/queues/latest">Latest queue →</a>
        </header>
        <div class="table-responsive">
          <table class="queues-table" data-jsgui-id="${guidPrefix}queues-table">
            <thead>
              <tr>
                <th class="u-fit">Job</th>
                <th class="u-fit">Status</th>
                <th class="u-fit u-nowrap">Started</th>
                <th class="u-fit u-nowrap">Ended</th>
                <th class="u-fit">PID</th>
                <th>URL</th>
                <th class="u-fit text-right">Events</th>
                <th class="u-fit u-nowrap">Last event</th>
              </tr>
            </thead>
            <tbody data-jsgui-id="${guidPrefix}queues-tbody">
`;

  res.write(opening);

  if (!viewModel.rows.length) {
    res.write('              <tr><td colspan="8" class="ui-meta">No queues</td></tr>\n');
  } else {
    for (let i = 0; i < viewModel.rows.length; i += chunkSize) {
      const chunk = viewModel.rows.slice(i, i + chunkSize)
        .map((row) => `              ${renderQueueRow(row, guidPrefix)}`)
        .join('\n');
      res.write(`${chunk}\n`);
    }
  }

  const closing = `            </tbody>
          </table>
        </div>
        <p class="queues-panel__tip">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</p>
      </main>
    </div>
  </div>
  <!-- Progressive enhancement script -->
  <script src="/js/queues-enhancer.js" defer></script>
</body></html>`;

  res.end(closing);
}

module.exports = {
  renderQueuesListPage,
  streamQueuesListPage
};