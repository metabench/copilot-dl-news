/**
 * Progressive enhancement for crawls list page
 * Mirrors queues enhancer pattern (SSR markup + client activation)
 */

const { each, is_defined } = require('lang-tools');

const COMPONENT_ACTIVATORS = {
  'crawls-table': activateCrawlsTable,
  'crawls-tbody': activateCrawlsTbody,
  'crawl-row-': activateCrawlRow,
  'summary': activateSummary,
  'shown-count': activateCounter,
  'active-count': activateCounter,
  'completed-count': activateCounter,
  'visited-total': activateCounter,
  'downloaded-total': activateCounter,
  'errors-total': activateCounter,
  'status-list': activateStatusList
};

let eventSource = null;
let tableElement = null;

function escapeSelector(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value));
  }
  return String(value).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function computeDurationLabel(startedAt, endedAt) {
  if (!startedAt) return '';
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return '';
  const end = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return '';
  const diff = Math.max(0, end.getTime() - start.getTime());
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function scanAndActivate() {
  const elements = document.querySelectorAll('[data-jsgui-id]');
  each(Array.from(elements), (el) => {
    const id = el.getAttribute('data-jsgui-id');
    if (!is_defined(id)) return;
    each(Object.entries(COMPONENT_ACTIVATORS), ([pattern, activator], _, stop) => {
      if (id.includes(pattern)) {
        try {
          activator(el, id);
        } catch (err) {
          console.error('[CrawlsEnhancer] activation error for %s:', id, err);
        }
        stop();
      }
    });
  });
  refreshSummary();
}

function activateCrawlsTable(el) {
  tableElement = el;
  el.dataset.enhanced = 'true';
  if (eventSource || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
    return;
  }
  eventSource = new EventSource('/events');
  eventSource.addEventListener('progress', (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      handleProgressEvent(payload);
    } catch (err) {
      console.error('[CrawlsEnhancer] progress parse failed:', err);
    }
  });
  eventSource.addEventListener('done', (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      handleDoneEvent(payload);
    } catch (err) {
      console.error('[CrawlsEnhancer] done parse failed:', err);
    }
  });
}

function activateCrawlsTbody(el) {
  el.dataset.enhanced = 'true';
}

function activateCrawlRow(el) {
  el.dataset.enhanced = 'true';
  el.addEventListener('click', (event) => {
    if (event.target && event.target.tagName === 'A') return;
    const jobId = el.getAttribute('data-crawl-id');
    if (jobId) {
      window.location.href = `/jobs/${encodeURIComponent(jobId)}`;
    }
  });
}

function activateSummary(el) {
  el.dataset.enhanced = 'true';
}

function activateCounter(el) {
  el.dataset.enhanced = 'true';
}

function activateStatusList(el) {
  el.dataset.enhanced = 'true';
}

function handleProgressEvent(payload) {
  if (!payload || typeof payload !== 'object' || !payload.jobId) return;
  const row = findRow(payload.jobId);
  if (!row) return;
  updateRowMetrics(row, payload);
  updateRowStage(row, payload);
  const status = payload.paused ? 'paused' : payload.status || 'running';
  updateRowStatus(row, status);
  updateDuration(row, payload);
  row.setAttribute('data-crawl-active', '1');
  refreshSummary();
}

function handleDoneEvent(payload) {
  if (!payload || typeof payload !== 'object' || !payload.jobId) return;
  const row = findRow(payload.jobId);
  if (!row) return;
  updateRowMetrics(row, payload);
  updateRowStage(row, payload);
  updateRowStatus(row, payload.status || 'done');
  updateDuration(row, payload);
  row.setAttribute('data-crawl-active', '0');
  refreshSummary();
}

function findRow(jobId) {
  const selector = escapeSelector(jobId);
  if (tableElement) {
    const withinTable = tableElement.querySelector(`[data-crawl-id="${selector}"]`);
    if (withinTable) return withinTable;
  }
  return document.querySelector(`[data-crawl-id="${selector}"]`);
}

function updateRowMetrics(row, payload) {
  const metrics = payload && typeof payload.metrics === 'object' ? payload.metrics : null;

  const getValue = (key) => {
    if (metrics && is_defined(metrics[key])) return metrics[key];
    if (is_defined(payload[key])) return payload[key];
    return undefined;
  };

  updateMetricCell(row, 'visited', getValue('visited'));
  updateMetricCell(row, 'downloaded', getValue('downloaded'));
  updateMetricCell(row, 'errors', getValue('errors'));
  updateMetricCell(row, 'queueSize', getValue('queueSize'));
  updateTextCell(row, 'pid', getValue('pid'));

  const startedAt = getValue('startedAt') || payload.startedAt;
  const endedAt = getValue('endedAt') || payload.endedAt;

  if (startedAt) {
    updateTimestampCell(row, 'started', startedAt);
  }

  if (endedAt) {
    updateTimestampCell(row, 'ended', endedAt);
  }

  if (is_defined(payload.crawlType)) {
    updateTextCell(row, 'type', payload.crawlType);
  }
}

function updateMetricCell(row, role, value) {
  if (!is_defined(value)) return;
  const cell = row.querySelector(`[data-jsgui-role="${role}"]`);
  if (!cell) return;
  cell.textContent = String(value);
}

function updateTextCell(row, role, value) {
  if (!is_defined(value)) return;
  const cell = row.querySelector(`[data-jsgui-role="${role}"]`);
  if (!cell) return;
  cell.textContent = String(value);
}

function updateTimestampCell(row, role, value) {
  const cell = row.querySelector(`[data-jsgui-role="${role}"]`);
  if (!cell) return;
  const formatted = formatTimestamp(value);
  if (formatted) {
    cell.textContent = formatted;
  }
}

function updateRowStage(row, payload) {
  const stageSpan = row.querySelector('[data-jsgui-role="stage"]');
  if (!stageSpan) return;
  const status = (payload.status || '').trim().toLowerCase();
  const stage = payload.stage ? String(payload.stage).trim() : '';
  const stageText = stage && stage.toLowerCase() !== status ? ` · ${stage}` : '';
  stageSpan.textContent = stageText;
}

function updateRowStatus(row, status) {
  const normalized = String(status || '').trim().toLowerCase() || 'unknown';
  row.setAttribute('data-crawl-status', normalized);
  const pill = row.querySelector('[data-jsgui-role="status-text"]');
  if (pill) {
    pill.textContent = normalized;
    pill.classList.remove('warn', 'good', 'info');
    if (normalized === 'running') {
      pill.classList.add('good');
    } else if (normalized === 'paused') {
      pill.classList.add('warn');
    } else {
      pill.classList.add('info');
    }
  }
}

function updateDuration(row, payload) {
  const cell = row.querySelector('[data-jsgui-role="duration"]');
  if (!cell) return;

  if (is_defined(payload.durationLabel)) {
    cell.textContent = String(payload.durationLabel);
    return;
  }

  const metrics = payload && typeof payload.metrics === 'object' ? payload.metrics : null;
  const startedAt = (metrics && metrics.startedAt) || payload.startedAt;
  const endedAt = (metrics && metrics.endedAt) || payload.endedAt;

  const label = computeDurationLabel(startedAt, endedAt);
  if (label) {
    cell.textContent = label;
  }
}

function refreshSummary() {
  const rows = document.querySelectorAll('[data-crawl-id]');
  const totals = {
    shown: rows.length,
    active: 0,
    completed: 0,
    visited: 0,
    downloaded: 0,
    errors: 0
  };
  const statusCounts = new Map();

  each(Array.from(rows), (row) => {
    const status = row.getAttribute('data-crawl-status') || 'unknown';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    const activeState = row.getAttribute('data-crawl-active');
    if (activeState === '1') {
      totals.active += 1;
    } else if (activeState === '0') {
      totals.completed += 1;
    }

    totals.visited += parseCellNumber(row, 'visited');
    totals.downloaded += parseCellNumber(row, 'downloaded');
    totals.errors += parseCellNumber(row, 'errors');
  });

  setCounter('shown-count', totals.shown);
  setCounter('active-count', totals.active);
  setCounter('completed-count', totals.completed);
  setCounter('visited-total', totals.visited);
  setCounter('downloaded-total', totals.downloaded);
  setCounter('errors-total', totals.errors);
  updateStatusList(statusCounts);
}

function parseCellNumber(row, role) {
  const cell = row.querySelector(`[data-jsgui-role="${role}"]`);
  if (!cell) return 0;
  const value = parseInt(cell.textContent, 10);
  return Number.isFinite(value) ? value : 0;
}

function setCounter(idSuffix, value) {
  each(Array.from(document.querySelectorAll(`[data-jsgui-id$="${idSuffix}"]`)), (el) => {
    el.textContent = String(value);
  });
}

function updateStatusList(statusCounts) {
  const list = document.querySelector('[data-jsgui-id$="status-list"]');
  if (!list) return;

  if (!statusCounts.size) {
    list.innerHTML = '<li class="ui-meta">No crawls yet.</li>';
    return;
  }

  const statuses = Array.from(statusCounts.entries()).sort((a, b) => {
    if (a[0] === 'running') return -1;
    if (b[0] === 'running') return 1;
    if (a[0] === 'paused') return -1;
    if (b[0] === 'paused') return 1;
    if (a[0] === b[0]) return 0;
    if (a[1] === b[1]) return a[0].localeCompare(b[0]);
    return b[1] - a[1];
  });

  list.innerHTML = '';
  each(statuses, ([status, count]) => {
    const li = document.createElement('li');
    li.dataset.jsguiRole = 'status-item';
    li.dataset.status = status;

    const statusSpan = document.createElement('span');
    statusSpan.className = 'status';
    statusSpan.textContent = status;

    const countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.dataset.jsguiRole = 'status-count';
    countSpan.textContent = String(count);

    li.appendChild(statusSpan);
    li.appendChild(countSpan);
    list.appendChild(li);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanAndActivate, { once: true });
} else {
  scanAndActivate();
}

if (typeof window !== 'undefined') {
  window.CrawlsEnhancer = {
    refreshSummary
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scanAndActivate,
    refreshSummary,
    handleProgressEvent,
    handleDoneEvent,
    updateRowMetrics,
    updateRowStatus,
    updateDuration
  };
}
