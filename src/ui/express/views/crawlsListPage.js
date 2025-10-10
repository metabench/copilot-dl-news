const { escapeHtml } = require('../utils/html');

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return String(ts);
  }
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt) return '';
  const end = endedAt || Date.now();
  const diffMs = end - startedAt;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function countByStatus(items) {
  const counts = new Map();
  for (const item of items) {
    const status = String(item.status || 'unknown').toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => {
      // Sort: running first, then by count desc, then alphabetically
      if (a[0] === 'running') return -1;
      if (b[0] === 'running') return 1;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
}

function summarize(items) {
  if (!items.length) {
    return {
      statuses: [],
      totalVisited: 0,
      totalDownloaded: 0,
      totalErrors: 0,
      activeCrawls: 0
    };
  }

  const statuses = countByStatus(items);
  const totalVisited = items.reduce((sum, item) => sum + (item.metrics?.visited || 0), 0);
  const totalDownloaded = items.reduce((sum, item) => sum + (item.metrics?.downloaded || 0), 0);
  const totalErrors = items.reduce((sum, item) => sum + (item.metrics?.errors || 0), 0);
  const activeCrawls = items.filter(item => item.pid).length;

  return {
    statuses,
    totalVisited,
    totalDownloaded,
    totalErrors,
    activeCrawls
  };
}

function renderCrawlsListPage({ items, renderNav }) {
  const navHtml = renderNav('crawls', { variant: 'bar' });
  const summary = summarize(items);
  
  const statusItemsHtml = summary.statuses.length
    ? summary.statuses.map(([status, count]) => `
          <li><span class="status">${escapeHtml(status)}</span><span class="count">${escapeHtml(String(count))}</span></li>
        `).join('')
    : '<li class="ui-meta">No crawls yet.</li>';

  const itemsHtml = items.length
    ? items.map((item) => {
        const duration = formatDuration(item.startedAt, item.endedAt);
        const statusClass = item.status === 'running' ? 'status-running' : 
                          item.status === 'paused' ? 'status-paused' : 
                          item.status === 'done' ? 'status-done' : '';
        
        return `
        <tr class="${statusClass}">
          <td class="u-fit u-nowrap">
            <a href="/jobs/${escapeHtml(item.id)}">${escapeHtml(item.id)}</a>
          </td>
          <td class="u-fit u-nowrap">
            <span class="pill ${item.paused ? 'warn' : (item.pid ? 'good' : 'info')}">${escapeHtml(item.status || '')}</span>
          </td>
          <td>${item.url ? escapeHtml(item.url) : '<span class="ui-meta">—</span>'}</td>
          <td class="text-right u-nowrap">${escapeHtml(String(item.metrics?.visited || 0))}</td>
          <td class="text-right u-nowrap">${escapeHtml(String(item.metrics?.downloaded || 0))}</td>
          <td class="text-right u-nowrap">${escapeHtml(String(item.metrics?.errors || 0))}</td>
          <td class="text-right u-nowrap">${escapeHtml(String(item.metrics?.queueSize || 0))}</td>
          <td class="u-fit u-nowrap">${item.pid ? escapeHtml(String(item.pid)) : '<span class="ui-meta">—</span>'}</td>
          <td class="u-fit u-nowrap">${formatTimestamp(item.startedAt)}</td>
          <td class="u-fit u-nowrap">${duration ? escapeHtml(duration) : '<span class="ui-meta">—</span>'}</td>
        </tr>
      `;
      }).join('')
    : '<tr><td colspan="10" class="ui-meta">No crawls</td></tr>';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Crawls</title>
<link rel="stylesheet" href="/ui.css" />
<link rel="stylesheet" href="/ui-dark.css" />
</head><body class="ui-page crawls-list-page">
  ${navHtml}
  <div class="ui-container">
    <div class="crawls-page" aria-label="Crawls layout">
      <section class="crawls-summary" aria-label="Crawls overview">
        <h2 class="crawls-summary__title">Snapshot</h2>
        <div class="crawls-summary__cards">
          <div class="crawls-summary__card">
            <strong>${escapeHtml(String(items.length))}</strong>
            <span>Total Crawls</span>
          </div>
          <div class="crawls-summary__card">
            <strong>${escapeHtml(String(summary.activeCrawls))}</strong>
            <span>Active</span>
          </div>
          <div class="crawls-summary__card">
            <strong>${escapeHtml(String(summary.totalVisited))}</strong>
            <span>Visited</span>
          </div>
          <div class="crawls-summary__card">
            <strong>${escapeHtml(String(summary.totalDownloaded))}</strong>
            <span>Downloaded</span>
          </div>
        </div>
        <ul class="crawls-statuses" aria-label="Crawls by status">
          ${statusItemsHtml}
        </ul>
        <p class="crawls-summary__note">
          Click a crawl ID to view detailed progress and metrics.
        </p>
      </section>

      <section class="crawls-panel" aria-label="Crawls table">
        <div class="crawls-panel__header">
          <h1>Crawls</h1>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>URL</th>
              <th class="text-right">Visited</th>
              <th class="text-right">Downloaded</th>
              <th class="text-right">Errors</th>
              <th class="text-right">Queue</th>
              <th>PID</th>
              <th>Started</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <p class="crawls-panel__tip">
          Use the main crawler dashboard at <code>/</code> to start new crawls.
        </p>
      </section>
    </div>
  </div>
</body></html>`;
}

module.exports = {
  renderCrawlsListPage
};
