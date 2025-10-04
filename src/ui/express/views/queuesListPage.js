const { escapeHtml } = require('../utils/html');

function countByStatus(rows) {
  const counts = new Map();
  for (const row of rows) {
    const status = String(row.status || 'unknown').toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[0] === 'done') return -1;
      if (b[0] === 'done') return 1;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
}

function summarize(rows) {
  if (!rows.length) {
    return {
      statuses: [],
      totalEvents: 0,
      uniquePids: 0,
      latestEnded: null
    };
  }

  const statuses = countByStatus(rows);
  const totalEvents = rows.reduce((sum, row) => sum + (Number(row.events) || 0), 0);
  const pidSet = new Set(rows.map((row) => row.pid).filter(Boolean));
  const latestEnded = rows
    .map((row) => row.endedAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;

  return {
    statuses,
    totalEvents,
    uniquePids: pidSet.size,
    latestEnded
  };
}

function renderQueuesListPage({ rows, renderNav }) {
  const itemsHtml = rows.length
    ? rows.map((row) => `
        <tr>
          <td class="u-fit u-nowrap"><a href="/queues/${escapeHtml(row.id)}/ssr">${escapeHtml(row.id)}</a></td>
          <td class="u-fit u-nowrap">${escapeHtml(row.status || '')}</td>
          <td class="u-fit u-nowrap">${escapeHtml(row.startedAt || '')}</td>
          <td class="u-fit u-nowrap">${escapeHtml(row.endedAt || '')}</td>
          <td class="u-fit u-nowrap">${escapeHtml(row.pid || '')}</td>
          <td>${escapeHtml(row.url || '')}</td>
          <td class="text-right u-nowrap">${escapeHtml(row.events ?? 0)}</td>
          <td class="u-fit u-nowrap">${escapeHtml(row.lastEventAt || '')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="8" class="ui-meta">No queues</td></tr>';

  const navHtml = renderNav('queues', { variant: 'bar' });
  const summary = summarize(rows);
  const statusItemsHtml = summary.statuses.length
    ? summary.statuses.map(([status, count]) => `
          <li><span class="status">${escapeHtml(status)}</span><span class="count">${escapeHtml(String(count))}</span></li>
        `).join('')
    : '<li class="ui-meta">No activity yet.</li>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Queues</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page queues-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="queues-page" aria-label="Queues layout">
      <section class="queues-summary" aria-label="Queues overview">
        <h2 class="queues-summary__title">Snapshot</h2>
        <div class="queues-summary__cards">
          <div class="queues-summary__card">
            <strong>${escapeHtml(String(rows.length))}</strong>
            <span>Shown queues</span>
          </div>
          <div class="queues-summary__card">
            <strong>${escapeHtml(String(summary.totalEvents))}</strong>
            <span>Total events</span>
          </div>
          <div class="queues-summary__card">
            <strong>${escapeHtml(String(summary.uniquePids))}</strong>
            <span>Active PIDs</span>
          </div>
        </div>
        <ul class="queues-statuses">
          ${statusItemsHtml}
        </ul>
        ${summary.latestEnded ? `<p class="queues-summary__note">Latest queue finished at <strong>${escapeHtml(summary.latestEnded)}</strong>.</p>` : ''}
        <p class="queues-summary__note">On mobile, open an individual queue to review activity details; widescreen view keeps this snapshot visible.</p>
      </section>
      <main class="queues-panel">
        <header class="queues-panel__header">
          <h1>Queues</h1>
          <a class="ui-button" href="/queues/latest">Latest queue →</a>
        </header>
        <div class="queues-panel__top">
          <div class="ui-meta">${rows.length} shown</div>
        </div>
        <div class="table-responsive">
          <table class="queues-table">
            <thead><tr><th class="u-fit">Job</th><th class="u-fit">Status</th><th class="u-fit u-nowrap">Started</th><th class="u-fit u-nowrap">Ended</th><th class="u-fit">PID</th><th>URL</th><th class="u-fit text-right">Events</th><th class="u-fit u-nowrap">Last event</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
        <p class="queues-panel__tip">Default navigation opens the most recent queue; use Next → inside a queue to move to the next one.</p>
      </main>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  renderQueuesListPage
};