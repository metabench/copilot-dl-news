/**
 * Isomorphic crawls table renderer
 * Shared between server-side rendering and client-side activation
 */

const {
  escapeHtml,
  is_defined,
  formatTimestamp,
  formatDuration,
  normalizeStatus
} = require('../shared/renderer-utils');

function pickMetric(row, key) {
  if (row.metrics && is_defined(row.metrics[key])) return row.metrics[key];
  if (is_defined(row[key])) return row[key];
  return 0;
}

function renderCrawlRow(row, guidPrefix = '') {
  const jobId = escapeHtml(String(row.id));
  const status = normalizeStatus(row.status, { paused: row.paused });
  const statusClass = row.paused ? 'status-paused' : status === 'running' ? 'status-running' : status === 'done' ? 'status-done' : '';
  const pillClass = row.paused ? 'warn' : row.pid ? 'good' : status === 'done' ? 'info' : 'info';
  const stageLabel = row.stage && row.stage !== status ? ` · ${escapeHtml(String(row.stage))}` : '';
  const visited = pickMetric(row, 'visited');
  const downloaded = pickMetric(row, 'downloaded');
  const errors = pickMetric(row, 'errors');
  const queueSize = pickMetric(row, 'queueSize');
  const durationLabel = row.durationLabel || formatDuration(row.startedAt, row.endedAt);
  const endedAt = row.endedAt ? formatTimestamp(row.endedAt) : '';
  const startedAt = formatTimestamp(row.startedAt);
  const crawlType = row.crawlType ? escapeHtml(String(row.crawlType)) : '<span class="ui-meta">—</span>';

  return `
    <tr class="${statusClass}" data-jsgui-id="${guidPrefix}crawl-row-${jobId}" data-crawl-id="${jobId}" data-crawl-status="${escapeHtml(status)}" data-crawl-active="${row.isActive ? '1' : '0'}">
      <td class="u-fit u-nowrap"><a href="/jobs/${jobId}">${jobId}</a></td>
      <td class="u-fit u-nowrap" data-jsgui-role="status">
        <span class="pill ${pillClass}" data-jsgui-role="status-text">${escapeHtml(status)}</span>
        <span class="ui-meta" data-jsgui-role="stage">${stageLabel}</span>
      </td>
      <td class="u-fit u-nowrap" data-jsgui-role="type">${crawlType}</td>
      <td>${row.url ? escapeHtml(String(row.url)) : '<span class="ui-meta">—</span>'}</td>
      <td class="text-right u-nowrap" data-jsgui-role="visited">${escapeHtml(String(visited || 0))}</td>
      <td class="text-right u-nowrap" data-jsgui-role="downloaded">${escapeHtml(String(downloaded || 0))}</td>
      <td class="text-right u-nowrap" data-jsgui-role="errors">${escapeHtml(String(errors || 0))}</td>
      <td class="text-right u-nowrap" data-jsgui-role="queueSize">${escapeHtml(String(queueSize || 0))}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="pid">${row.pid ? escapeHtml(String(row.pid)) : '<span class="ui-meta">—</span>'}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="started">${startedAt || '<span class="ui-meta">—</span>'}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="ended">${endedAt || '<span class="ui-meta">—</span>'}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="duration">${durationLabel ? escapeHtml(durationLabel) : '<span class="ui-meta">—</span>'}</td>
    </tr>
  `.trim();
}

function renderCrawlsTable(rows, guidPrefix = '') {
  const itemsHtml = rows.length
    ? rows.map((row) => renderCrawlRow(row, guidPrefix)).join('\n')
    : '<tr><td colspan="12" class="ui-meta">No crawls recorded yet.</td></tr>';

  return `
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
          ${itemsHtml}
        </tbody>
      </table>
    </div>
  `.trim();
}

function renderCrawlsSummary(summary, guidPrefix = '') {
  const statusItemsHtml = summary.statuses.length
    ? summary.statuses.map(([status, count]) => `
          <li data-jsgui-role="status-item" data-status="${escapeHtml(status)}">
            <span class="status">${escapeHtml(status)}</span>
            <span class="count" data-jsgui-role="status-count">${escapeHtml(String(count))}</span>
          </li>
        `).join('')
    : '<li class="ui-meta">No crawls yet.</li>';

  return `
    <section class="crawls-summary" aria-label="Crawls overview" data-jsgui-id="${guidPrefix}summary">
      <h2 class="crawls-summary__title">Snapshot</h2>
      <div class="crawls-summary__cards">
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}shown-count" data-jsgui-role="count">${escapeHtml(String(summary.shown))}</strong>
          <span>Total Crawls Shown</span>
        </div>
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}active-count" data-jsgui-role="count">${escapeHtml(String(summary.activeCrawls))}</strong>
          <span>Active</span>
        </div>
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}completed-count" data-jsgui-role="count">${escapeHtml(String(summary.completed))}</strong>
          <span>Completed</span>
        </div>
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}visited-total" data-jsgui-role="count">${escapeHtml(String(summary.totalVisited))}</strong>
          <span>Total Visited</span>
        </div>
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}downloaded-total" data-jsgui-role="count">${escapeHtml(String(summary.totalDownloaded))}</strong>
          <span>Total Downloaded</span>
        </div>
        <div class="crawls-summary__card">
          <strong data-jsgui-id="${guidPrefix}errors-total" data-jsgui-role="count">${escapeHtml(String(summary.totalErrors))}</strong>
          <span>Total Errors</span>
        </div>
      </div>
      <ul class="crawls-statuses" data-jsgui-id="${guidPrefix}status-list" aria-label="Crawls by status">
        ${statusItemsHtml}
      </ul>
      <p class="crawls-summary__note">
        Click a crawl ID to view detailed telemetry. Active crawls update in real time.
      </p>
    </section>
  `.trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderCrawlRow,
    renderCrawlsTable,
    renderCrawlsSummary,
    formatDuration,
    formatTimestamp,
    normalizeStatus
  };
}

if (typeof window !== 'undefined') {
  window.CrawlsRenderer = {
    renderCrawlRow,
    renderCrawlsTable,
    renderCrawlsSummary,
    formatDuration,
    formatTimestamp,
    normalizeStatus
  };
}
