/**
 * Isomorphic queue table renderer
 * Used on both server (SSR) and client (progressive activation)
 */

const {
  escapeHtml,
  is_defined
} = require('../shared/renderer-utils');

/**
 * Render a single queue row
 * @param {Object} row - Queue data
 * @param {string} guidPrefix - Unique prefix for data-jsgui-id
 * @returns {string} HTML string
 */
function renderQueueRow(row, guidPrefix = '') {
  const jobId = escapeHtml(row.id);
  const statusValue = is_defined(row.status) ? String(row.status) : 'unknown';
  const normalizedStatus = statusValue.toLowerCase();
  const status = escapeHtml(statusValue);
  const startedAt = escapeHtml(is_defined(row.startedAt) ? row.startedAt : '');
  const endedAt = escapeHtml(is_defined(row.endedAt) ? row.endedAt : '');
  const pidValue = is_defined(row.pid) ? String(row.pid) : '';
  const pid = escapeHtml(pidValue);
  const url = escapeHtml(is_defined(row.url) ? row.url : '');
  const events = escapeHtml(String(is_defined(row.events) ? row.events : 0));
  const lastEventAt = escapeHtml(is_defined(row.lastEventAt) ? row.lastEventAt : '');

  return `
    <tr data-jsgui-id="${guidPrefix}queue-row-${jobId}" data-job-id="${jobId}" data-queue-status="${escapeHtml(normalizedStatus)}">
      <td class="u-fit u-nowrap"><a href="/queues/${jobId}/ssr">${jobId}</a></td>
      <td class="u-fit u-nowrap" data-jsgui-role="status">${status}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="started">${startedAt}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="ended">${endedAt}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="pid" data-queue-pid="${escapeHtml(pidValue)}">${pid}</td>
      <td data-jsgui-role="url">${url}</td>
      <td class="text-right u-nowrap" data-jsgui-role="events">${events}</td>
      <td class="u-fit u-nowrap" data-jsgui-role="lastEvent">${lastEventAt}</td>
    </tr>
  `.trim();
}

/**
 * Render queues table
 * @param {Array} rows - Queue data array
 * @param {string} guidPrefix - Unique prefix for data-jsgui-id
 * @returns {string} HTML string
 */
function renderQueuesTable(rows, guidPrefix = '') {
  const itemsHtml = rows.length
    ? rows.map((row) => renderQueueRow(row, guidPrefix)).join('\n')
    : '<tr><td colspan="8" class="ui-meta">No queues</td></tr>';

  return `
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
          ${itemsHtml}
        </tbody>
      </table>
    </div>
  `.trim();
}

/**
 * Render queue summary cards
 */
function renderQueuesSummary(summary, guidPrefix = '') {
  const statusItemsHtml = summary.statuses.length
    ? summary.statuses.map(([status, count]) => `
          <li data-jsgui-role="status-item" data-status="${escapeHtml(status)}">
            <span class="status">${escapeHtml(status)}</span>
            <span class="count" data-jsgui-role="status-count">${escapeHtml(String(count))}</span>
          </li>
        `).join('')
    : '<li class="ui-meta">No activity yet.</li>';

  return `
    <section class="queues-summary" aria-label="Queues overview" data-jsgui-id="${guidPrefix}summary">
      <h2 class="queues-summary__title">Snapshot</h2>
      <div class="queues-summary__cards">
        <div class="queues-summary__card">
          <strong data-jsgui-id="${guidPrefix}shown-count" data-jsgui-role="count">${escapeHtml(String(summary.shown))}</strong>
          <span>Shown queues</span>
        </div>
        <div class="queues-summary__card">
          <strong data-jsgui-id="${guidPrefix}total-events" data-jsgui-role="count">${escapeHtml(String(summary.totalEvents))}</strong>
          <span>Total events</span>
        </div>
        <div class="queues-summary__card">
          <strong data-jsgui-id="${guidPrefix}active-pids" data-jsgui-role="count">${escapeHtml(String(summary.uniquePids))}</strong>
          <span>Active PIDs</span>
        </div>
      </div>
      <ul class="queues-statuses" data-jsgui-id="${guidPrefix}status-list" aria-label="Queues by status">
        ${statusItemsHtml}
      </ul>
      ${summary.latestEnded ? `<p class="queues-summary__note" data-jsgui-id="${guidPrefix}latest-ended">Latest queue finished at <strong data-jsgui-role="latest-ended">${escapeHtml(summary.latestEnded)}</strong>.</p>` : ''}
      <p class="queues-summary__note">On mobile, open an individual queue to review activity details; widescreen view keeps this snapshot visible.</p>
    </section>
  `.trim();
}

// Export for both CommonJS (server) and browser (if bundled)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderQueueRow,
    renderQueuesTable,
    renderQueuesSummary
  };
}

// Also export for browser global (for inline script usage)
if (typeof window !== 'undefined') {
  window.QueuesRenderer = {
    renderQueueRow,
    renderQueuesTable,
    renderQueuesSummary
  };
}
