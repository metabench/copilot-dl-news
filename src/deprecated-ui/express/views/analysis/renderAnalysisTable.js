/**
 * Isomorphic analysis table renderer
 * Shared between Express SSR and client activation.
 */

const {
  escapeHtml,
  formatTimestamp,
  formatDuration
} = require('../../../../shared/renderer-utils');

const SUCCESS_STATUSES = new Set(['completed', 'done', 'finished']);
const WARNING_STATUSES = new Set(['failed', 'errored', 'error', 'cancelled', 'paused', 'pausing']);
const ACTIVE_STATUSES = new Set(['running', 'starting', 'resuming']);

function pickStatusPillClass(status) {
  if (!status) return 'info';
  const normalized = String(status).toLowerCase();
  if (ACTIVE_STATUSES.has(normalized)) return 'good';
  if (WARNING_STATUSES.has(normalized)) return 'warn';
  if (SUCCESS_STATUSES.has(normalized)) return 'info';
  return 'info';
}

function safeTimestampAttr(value) {
  if (!value) return '';
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return '';
  return String(ts.getTime());
}

function renderDiagnostics(diagnostics = []) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return '';
  }
  return diagnostics.map((line, idx) => (
    `<div class="analysis-stage__meta" data-jsgui-role="diagnostic" data-diagnostic-index="${idx}">${escapeHtml(String(line))}</div>`
  )).join('');
}

function renderAnalysisRow(row, guidPrefix = '') {
  if (!row) return '';
  const id = escapeHtml(String(row.id));
  const normalizedStatus = row.status || 'unknown';
  const pillClass = pickStatusPillClass(normalizedStatus);
  const stageMain = row.stage ? escapeHtml(String(row.stage)) : '—';
  const diagnosticsHtml = renderDiagnostics(row.diagnostics || []);
  const stageHtml = `
    <div class="analysis-stage">
      <div class="analysis-stage__main" data-jsgui-role="stage-main">${stageMain}</div>
      ${diagnosticsHtml}
    </div>
  `;
  const startedAtLabel = row.startedAtLabel ? escapeHtml(String(row.startedAtLabel)) : '—';
  const endedAtLabel = row.endedAtLabel ? escapeHtml(String(row.endedAtLabel)) : '—';
  const durationLabel = row.durationLabel ? escapeHtml(String(row.durationLabel)) : '—';
  const configLabel = row.configLabel ? escapeHtml(String(row.configLabel)) : '<span class="ui-meta">—</span>';
  const taskHtml = row.backgroundTaskId != null
    ? `<a href="/api/background-tasks/${escapeHtml(String(row.backgroundTaskId))}" target="_blank" rel="noreferrer noopener">Task #${escapeHtml(String(row.backgroundTaskId))}</a>${row.backgroundTaskStatus ? `<span class="ui-meta"> (${escapeHtml(String(row.backgroundTaskStatus))})</span>` : ''}`
    : '<span class="ui-meta">—</span>';
  const progressCell = row.isActive
    ? `<div class="analysis-progress-slot" data-run-id="${id}" data-jsgui-role="progress-slot"></div>`
    : '<span class="ui-meta">—</span>';

  const attrs = [
    `data-jsgui-id="${guidPrefix}analysis-row-${id}"`,
    `data-analysis-id="${id}"`,
    `data-analysis-status="${escapeHtml(String(normalizedStatus))}"`,
    `data-analysis-active="${row.isActive ? '1' : '0'}"`
  ];

  const startedAttr = safeTimestampAttr(row.startedAt);
  if (startedAttr) {
    attrs.push(`data-analysis-started-at="${startedAttr}"`);
  }
  const endedAttr = safeTimestampAttr(row.endedAt);
  if (endedAttr) {
    attrs.push(`data-analysis-ended-at="${endedAttr}"`);
  }

  return `
    <tr ${attrs.join(' ')}>
      <td class="u-nowrap"><a href="/analysis/${id}/ssr">${id}</a></td>
      <td class="u-nowrap" data-jsgui-role="status-cell">
        <span class="pill ${pillClass}" data-jsgui-role="status-label">${escapeHtml(String(row.statusLabel || normalizedStatus))}</span>
      </td>
      <td data-jsgui-role="stage-cell">${stageHtml}</td>
      <td class="u-nowrap" data-jsgui-role="started-label">${startedAtLabel}</td>
      <td class="u-nowrap" data-jsgui-role="ended-label">${endedAtLabel}</td>
      <td class="u-nowrap" data-jsgui-role="duration-label">${durationLabel}</td>
      <td data-jsgui-role="config-label">${configLabel}</td>
      <td class="u-nowrap" data-jsgui-role="task-cell">${taskHtml}</td>
      <td class="analysis-progress-cell" data-jsgui-role="progress-cell">${progressCell}</td>
    </tr>
  `.trim();
}

function renderAnalysisTable(rows = [], guidPrefix = '') {
  const bodyHtml = rows.length
    ? rows.map((row) => renderAnalysisRow(row, guidPrefix)).join('\n')
    : '<tr><td colspan="9" class="ui-meta">No analysis runs yet.</td></tr>';

  return `
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
              <th>Task</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody data-jsgui-id="${guidPrefix}analysis-tbody">
            ${bodyHtml}
          </tbody>
        </table>
      </div>
    </section>
  `.trim();
}

function renderStatusList(summary, guidPrefix = '') {
  if (!summary || !Array.isArray(summary.statuses) || summary.statuses.length === 0) {
    return '<li class="ui-meta">No runs yet.</li>';
  }
  return summary.statuses.map(([status, count]) => `
        <li data-status="${escapeHtml(String(status))}">
          <span class="status">${escapeHtml(String(status))}</span>
          <span class="count" data-jsgui-id="${guidPrefix}status-${escapeHtml(String(status))}-count">${escapeHtml(String(count))}</span>
        </li>
      `).join('');
}

function renderAnalysisSummary(summary, guidPrefix = '') {
  if (!summary) {
    return '';
  }
  const statusList = renderStatusList(summary, guidPrefix);

  return `
    <section class="analysis-summary" aria-label="Analysis snapshot" data-jsgui-id="${guidPrefix}summary">
      <header class="analysis-summary__header">
        <h2>Snapshot</h2>
        <p class="analysis-summary__meta">Showing ${escapeHtml(String(summary.shown))} of ${escapeHtml(String(summary.total))} runs (limit ${escapeHtml(String(summary.limit))})</p>
      </header>
      <div class="analysis-summary__cards">
        <article class="analysis-summary__card">
          <strong data-jsgui-id="${guidPrefix}runs-total">${escapeHtml(String(summary.shown))}</strong>
          <span>Runs displayed</span>
        </article>
        <article class="analysis-summary__card">
          <strong data-jsgui-id="${guidPrefix}runs-active">${escapeHtml(String(summary.running))}</strong>
          <span>Active</span>
        </article>
        <article class="analysis-summary__card">
          <strong data-jsgui-id="${guidPrefix}runs-paused">${escapeHtml(String(summary.paused))}</strong>
          <span>Paused</span>
        </article>
        <article class="analysis-summary__card">
          <strong data-jsgui-id="${guidPrefix}runs-completed">${escapeHtml(String(summary.completed))}</strong>
          <span>Completed</span>
        </article>
        <article class="analysis-summary__card">
          <strong data-jsgui-id="${guidPrefix}runs-failed">${escapeHtml(String(summary.failed))}</strong>
          <span>Failed</span>
        </article>
      </div>
      <ul class="analysis-summary__statuses" data-jsgui-id="${guidPrefix}status-list" aria-label="Runs by status">
        ${statusList}
      </ul>
    </section>
  `.trim();
}

function serializeRowForClient(row) {
  if (!row) return null;
  const startedMs = safeTimestampAttr(row.startedAt);
  const endedMs = safeTimestampAttr(row.endedAt);
  return {
    id: row.id,
    status: row.status,
    statusLabel: row.statusLabel,
    stage: row.stage || null,
    diagnostics: Array.isArray(row.diagnostics) ? row.diagnostics.slice(0, 6) : [],
    isActive: !!row.isActive,
    startedAt: startedMs ? Number(startedMs) : null,
    endedAt: endedMs ? Number(endedMs) : null,
    durationLabel: row.durationLabel || null,
    configLabel: row.configLabel || null,
    backgroundTaskId: row.backgroundTaskId != null ? row.backgroundTaskId : null,
    backgroundTaskStatus: row.backgroundTaskStatus || null,
    backgroundTaskHref: row.backgroundTaskHref || null
  };
}

function buildClientPayload(viewModel, extras = {}) {
  if (!viewModel) return { rows: [], summary: {}, total: 0, limit: 0 };
  const rows = Array.isArray(viewModel.rows) ? viewModel.rows.map(serializeRowForClient).filter(Boolean) : [];
  const summary = Object.assign({}, viewModel.summary || {});
  return Object.assign({ rows, summary }, extras);
}

function formatDurationBetween(startedAt, endedAt) {
  if (!startedAt) return '';
  return formatDuration(startedAt, endedAt) || '';
}

module.exports = {
  renderAnalysisRow,
  renderAnalysisTable,
  renderAnalysisSummary,
  buildClientPayload,
  formatTimestamp,
  formatDurationBetween
};

if (typeof window !== 'undefined') {
  window.AnalysisRenderer = {
    renderAnalysisRow,
    renderAnalysisTable,
    renderAnalysisSummary,
    buildClientPayload,
    formatTimestamp,
    formatDurationBetween
  };
}
