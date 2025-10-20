/**
 * Progressive enhancement for queues page
 * Aligns with crawls enhancer SSR activation pattern
 */

const { each, is_defined } = require('lang-tools');

const COMPONENT_ACTIVATORS = {
  'queues-table': activateQueuesTable,
  'queues-tbody': activateQueuesTbody,
  'queue-row-': activateQueueRow,
  'summary': activateSummary,
  'shown-count': activateCounter,
  'total-events': activateCounter,
  'active-pids': activateCounter,
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
          console.error('[QueuesEnhancer] activation error for %s:', id, err);
        }
        stop();
      }
    });
  });
  refreshSummary();
}

function activateQueuesTable(el) {
  tableElement = el;
  el.dataset.enhanced = 'true';
  if (eventSource || typeof window === 'undefined' || typeof window.EventSource !== 'function') {
    return;
  }
  eventSource = new EventSource('/events');
  eventSource.addEventListener('queue', (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      handleQueueEvent(payload);
    } catch (err) {
      console.error('[QueuesEnhancer] queue parse failed:', err);
    }
  });
}

function activateQueuesTbody(el) {
  el.dataset.enhanced = 'true';
}

function activateQueueRow(el) {
  el.dataset.enhanced = 'true';
  el.addEventListener('click', (event) => {
    if (event.target && event.target.tagName === 'A') return;
    const jobId = el.getAttribute('data-job-id');
    if (jobId) {
      window.location.href = `/queues/${encodeURIComponent(jobId)}/ssr`;
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

function handleQueueEvent(payload) {
  if (!payload || typeof payload !== 'object' || !payload.jobId) return;
  const row = findRow(payload.jobId);
  if (!row) return;

  updateRowMetrics(row, payload);
  updateRowStatus(row, payload.status);
  updateRowTiming(row, payload);
  refreshSummary();
}

function findRow(jobId) {
  const selector = escapeSelector(jobId);
  if (tableElement) {
    const withinTable = tableElement.querySelector(`[data-job-id="${selector}"]`);
    if (withinTable) return withinTable;
  }
  return document.querySelector(`[data-job-id="${selector}"]`);
}

function updateRowMetrics(row, payload) {
  if (is_defined(payload.events)) {
    const cell = row.querySelector('[data-jsgui-role="events"]');
    if (cell) cell.textContent = String(payload.events);
  }

  if (is_defined(payload.url)) {
    const cell = row.querySelector('[data-jsgui-role="url"]');
    if (cell) cell.textContent = String(payload.url);
  }

  if (is_defined(payload.pid)) {
    const cell = row.querySelector('[data-jsgui-role="pid"]');
    if (cell) {
      const pidValue = String(payload.pid);
      cell.textContent = pidValue;
      cell.dataset.queuePid = pidValue;
    }
  }
}

function updateRowStatus(row, status) {
  if (!is_defined(status)) return;
  const normalized = String(status).trim().toLowerCase() || 'unknown';
  row.setAttribute('data-queue-status', normalized);
  const cell = row.querySelector('[data-jsgui-role="status"]');
  if (cell) {
    cell.textContent = String(status);
  }
}

function updateRowTiming(row, payload) {
  if (is_defined(payload.startedAt)) {
    updateTimestampCell(row, 'started', payload.startedAt);
  }
  if (is_defined(payload.endedAt)) {
    updateTimestampCell(row, 'ended', payload.endedAt);
  }
  if (is_defined(payload.lastEventAt)) {
    updateTimestampCell(row, 'lastEvent', payload.lastEventAt);
  }
}

function updateTimestampCell(row, role, value) {
  const cell = row.querySelector(`[data-jsgui-role="${role}"]`);
  if (!cell) return;
  const formatted = formatTimestamp(value);
  if (formatted) {
    cell.textContent = formatted;
  }
}

function refreshSummary() {
  const rows = document.querySelectorAll('[data-job-id]');
  const totals = {
    shown: rows.length,
    totalEvents: 0,
    activePids: new Set()
  };
  const statusCounts = new Map();

  each(Array.from(rows), (row) => {
    const status = row.getAttribute('data-queue-status') || 'unknown';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    totals.totalEvents += parseCellNumber(row, 'events');

    const pidCell = row.querySelector('[data-jsgui-role="pid"]');
    if (pidCell) {
      const pid = pidCell.dataset.queuePid || pidCell.textContent.trim();
      if (pid) totals.activePids.add(pid);
    }
  });

  setCounter('shown-count', totals.shown);
  setCounter('total-events', totals.totalEvents);
  setCounter('active-pids', totals.activePids.size);
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
    list.innerHTML = '<li class="ui-meta">No activity yet.</li>';
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
  window.QueuesEnhancer = {
    refreshSummary,
    handleQueueEvent
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    scanAndActivate,
    refreshSummary,
    handleQueueEvent,
    updateRowMetrics,
    updateRowStatus,
    updateRowTiming
  };
}
