/**
 * Progressive enhancement for the analysis list page.
 * Activates summary counters, live progress updates, and start form controls.
 */

import { createAnalysisStartForm } from '/assets/components/AnalysisStartForm.js';

const ACTIVE_STATUSES = new Set(['running', 'starting', 'resuming']);
const COMPLETED_STATUSES = new Set(['completed', 'done', 'finished']);
const FAILED_STATUSES = new Set(['failed', 'errored', 'error', 'cancelled']);
const STATUS_PRIORITY = ['running', 'starting', 'resuming', 'paused', 'completed', 'done', 'failed', 'unknown'];

const state = {
  rows: new Map(),
  limit: 0,
  total: 0
};

const counterElements = new Map();
const progressBars = new Map();
let statusListEl = null;
let tableElement = null;
let tbodyElement = null;
let eventSource = null;
let progressBarModulePromise = null;
let startFormController = null;
let startFormMounted = false;

const initialPayload = typeof window !== 'undefined' && window.__ANALYSIS_VIEW_MODEL__
  ? window.__ANALYSIS_VIEW_MODEL__
  : { rows: [], summary: {}, total: 0, limit: 0 };

const SUB_PROGRESS_KEYS = [
  'subProgress',
  'subprogress',
  'subTask',
  'subtask',
  'sub_task',
  'secondaryProgress',
  'secondary',
  'childProgress',
  'nestedProgress'
];

function findSubProgress(source) {
  if (!source || typeof source !== 'object') {
    return { found: false, value: null };
  }
  for (const key of SUB_PROGRESS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return { found: true, value: source[key] };
    }
  }
  return { found: false, value: null };
}

function pickSubProgressCandidate(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const direct = findSubProgress(source);
    if (direct.found) {
      return direct;
    }
    if (source.progress && typeof source.progress === 'object') {
      const nested = findSubProgress(source.progress);
      if (nested.found) {
        return nested;
      }
    }
  }
  return { found: false, value: null };
}

function bootstrap() {
  initializeStateFromPayload(initialPayload);
  scanAndActivate();
  hydrateInitialRows();
  connectEventStream();
  updateSummary();
}

function initializeStateFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  state.limit = Number.isFinite(payload.limit) ? payload.limit : Number(payload.limit) || 0;
  state.total = Number.isFinite(payload.total) ? payload.total : Number(payload.total) || 0;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  rows.forEach((row) => {
    if (!row || row.id == null) return;
    const id = String(row.id);
    const backgroundTaskId = row.backgroundTaskId != null ? row.backgroundTaskId : null;
    state.rows.set(id, {
      id,
      status: normalizeStatus(row.status),
      statusLabel: toTitleCase(row.statusLabel || row.status || 'unknown'),
      stage: row.stage || null,
      startedAt: parseTimestamp(row.startedAt),
      endedAt: parseTimestamp(row.endedAt),
      durationLabel: row.durationLabel || null,
      configLabel: row.configLabel || null,
      isActive: !!row.isActive,
      diagnostics: Array.isArray(row.diagnostics) ? row.diagnostics.slice(0, 4) : [],
      backgroundTaskId,
      backgroundTaskStatus: row.backgroundTaskStatus || null,
      backgroundTaskHref: row.backgroundTaskHref || (backgroundTaskId != null ? `/api/background-tasks/${encodeURIComponent(String(backgroundTaskId))}` : null)
    });
  });
}

function scanAndActivate() {
  const elements = document.querySelectorAll('[data-jsgui-id]');
  elements.forEach((el) => {
    const id = el.getAttribute('data-jsgui-id');
    if (!id) return;
    if (id.includes('analysis-table')) {
      activateAnalysisTable(el);
    } else if (id.includes('analysis-tbody')) {
      activateAnalysisTbody(el);
    } else if (id.includes('analysis-row-')) {
      activateAnalysisRow(el);
    } else if (id.includes('runs-')) {
      activateCounter(el, id);
    } else if (id.includes('status-list')) {
      activateStatusList(el);
    } else if (id.includes('start-form')) {
      activateStartForm(el);
    }
  });
}

function hydrateInitialRows() {
  state.rows.forEach((entry) => {
    applyRowToDom(entry, null);
  });
}

function activateAnalysisTable(el) {
  if (!tableElement) {
    tableElement = el;
  }
  el.dataset.enhanced = 'true';
}

function activateAnalysisTbody(el) {
  if (!tbodyElement) {
    tbodyElement = el;
  }
  el.dataset.enhanced = 'true';
}

function activateAnalysisRow(el) {
  if (el.dataset.analysisRowEnhanced === '1') return;
  el.dataset.analysisRowEnhanced = '1';
  el.dataset.enhanced = 'true';
  el.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target && target.tagName === 'A') return;
    const runId = el.getAttribute('data-analysis-id');
    if (runId) {
      window.location.href = `/analysis/${encodeURIComponent(runId)}/ssr`;
    }
  });
}

function activateCounter(el, id) {
  const suffix = extractCounterSuffix(id);
  if (!suffix) return;
  if (!counterElements.has(suffix)) {
    counterElements.set(suffix, new Set());
  }
  counterElements.get(suffix).add(el);
  el.dataset.enhanced = 'true';
}

function activateStatusList(el) {
  statusListEl = el;
  el.dataset.enhanced = 'true';
}

function activateStartForm(_el) {
  if (startFormMounted) return;
  const container = document.getElementById('analysis-start-form');
  if (!container) return;
  try {
    startFormController = createAnalysisStartForm(container, {
      onStart: handleStart,
      onPreview: handlePreview
    });
    startFormMounted = true;
  } catch (err) {
    console.error('[AnalysisEnhancer] failed to mount analysis start form', err);
  }
}

async function handlePreview(formData) {
  const params = new URLSearchParams();
  if (Number.isFinite(formData?.analysisVersion)) {
    params.set('version', String(formData.analysisVersion));
  }
  const query = params.toString();
  const url = query ? `/api/analysis/count?${query}` : '/api/analysis/count';
  const response = await requestJson(url, { method: 'GET' }, 'Preview analysis count');
  if (!response || typeof response.count !== 'number') {
    throw new Error('Unexpected preview response');
  }
  return response.count;
}

async function handleStart(formData) {
  const payload = sanitizeStartPayload(formData);
  if (startFormController) {
    startFormController.setEnabled(false);
  }
  try {
    const response = await requestJson('/api/analysis/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 'Start analysis');
    restoreSubmitButton();
    return response;
  } finally {
    if (startFormController) {
      startFormController.setEnabled(true);
    }
  }
}

function sanitizeStartPayload(data) {
  const payload = {};
  if (Number.isFinite(data?.analysisVersion)) payload.analysisVersion = data.analysisVersion;
  if (Number.isFinite(data?.pageLimit)) payload.pageLimit = data.pageLimit;
  if (Number.isFinite(data?.domainLimit)) payload.domainLimit = data.domainLimit;
  ['skipPages', 'skipDomains', 'dryRun', 'verbose'].forEach((flag) => {
    if (data && data[flag]) payload[flag] = true;
  });
  return payload;
}

function restoreSubmitButton() {
  if (!startFormController || typeof startFormController.getElement !== 'function') return;
  const formEl = startFormController.getElement();
  if (!formEl) return;
  const submitBtn = formEl.querySelector('.analysis-start-form__submit-btn');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Start Analysis';
  }
}

async function requestJson(url, options, contextLabel) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error
      : `${contextLabel || 'Request'} failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

function connectEventStream() {
  if (eventSource || typeof window === 'undefined' || typeof window.EventSource !== 'function') return;
  eventSource = new EventSource('/events');
  eventSource.addEventListener('analysis-progress', onAnalysisProgressEvent);
  window.addEventListener('beforeunload', () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    progressBars.forEach((record) => {
      try {
        record.bar?.destroy?.();
      } catch (_) {}
    });
    progressBars.clear();
  }, { once: true });
}

function onAnalysisProgressEvent(evt) {
  if (!evt || !evt.data) return;
  let payload;
  try {
    payload = JSON.parse(evt.data);
  } catch (err) {
    console.error('[AnalysisEnhancer] failed to parse analysis-progress payload', err);
    return;
  }
  if (!payload || payload.runId == null) return;
  const runId = String(payload.runId);
  const current = state.rows.get(runId) || {
    id: runId,
    status: 'unknown',
    statusLabel: 'Unknown',
    stage: null,
    startedAt: null,
    endedAt: null,
    durationLabel: null,
    configLabel: null,
    isActive: false,
    diagnostics: [],
    backgroundTaskId: null,
    backgroundTaskStatus: null,
    backgroundTaskHref: null
  };

  const normalizedStatus = normalizeStatus(payload.status || (payload.final ? 'completed' : current.status));
  current.status = normalizedStatus;
  current.statusLabel = toTitleCase(payload.statusLabel || normalizedStatus);
  current.stage = payload.stage || payload.lastProgress?.stage || current.stage;

  const startedAt = parseTimestamp(payload.startedAt || payload.ts || payload.lastProgress?.startedAt || current.startedAt);
  if (startedAt != null) {
    current.startedAt = startedAt;
  }
  const endedAt = parseTimestamp(payload.endedAt || (payload.final ? payload.ts : null));
  if (endedAt != null) {
    current.endedAt = endedAt;
  }

  const diagnostics = extractDiagnostics(payload);
  if (diagnostics.length) {
    current.diagnostics = diagnostics;
  }

  current.isActive = !payload.final && ACTIVE_STATUSES.has(current.status);
  if (current.startedAt != null) {
    current.durationLabel = formatDuration(current.startedAt, current.endedAt);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'backgroundTaskId')) {
    if (payload.backgroundTaskId == null || payload.backgroundTaskId === '') {
      current.backgroundTaskId = null;
      current.backgroundTaskHref = null;
    } else {
      current.backgroundTaskId = payload.backgroundTaskId;
      current.backgroundTaskHref = payload.backgroundTaskHref || `/api/background-tasks/${encodeURIComponent(String(payload.backgroundTaskId))}`;
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'backgroundTaskStatus')) {
    current.backgroundTaskStatus = payload.backgroundTaskStatus || null;
  }
  if (!current.backgroundTaskHref && current.backgroundTaskId != null) {
    current.backgroundTaskHref = `/api/background-tasks/${encodeURIComponent(String(current.backgroundTaskId))}`;
  }

  state.rows.set(runId, current);
  state.total = Math.max(state.total, state.rows.size);

  applyRowToDom(current, payload);
  updateSummary();
}

function applyRowToDom(entry, payload) {
  if (!entry || !entry.id) return;
  let row = findRowElement(entry.id);
  if (!row) {
    row = createRowElement(entry);
  }
  if (!row) return;

  row.setAttribute('data-analysis-status', entry.status || 'unknown');
  row.setAttribute('data-analysis-active', entry.isActive ? '1' : '0');
  if (entry.startedAt != null) {
    row.setAttribute('data-analysis-started-at', String(entry.startedAt));
  } else {
    row.removeAttribute('data-analysis-started-at');
  }
  if (entry.endedAt != null) {
    row.setAttribute('data-analysis-ended-at', String(entry.endedAt));
  } else {
    row.removeAttribute('data-analysis-ended-at');
  }

  const statusLabelEl = row.querySelector('[data-jsgui-role="status-label"]');
  if (statusLabelEl) {
    statusLabelEl.textContent = entry.statusLabel || toTitleCase(entry.status || 'unknown');
    statusLabelEl.classList.remove('good', 'warn', 'info');
    statusLabelEl.classList.add(pickStatusPillClass(entry.status));
  }

  const stageMainEl = row.querySelector('[data-jsgui-role="stage-main"]');
  if (stageMainEl) {
    stageMainEl.textContent = entry.stage || '—';
  }
  updateDiagnostics(row, entry);

  const startedLabel = row.querySelector('[data-jsgui-role="started-label"]');
  if (startedLabel) {
    startedLabel.textContent = entry.startedAt != null ? formatTimestamp(entry.startedAt) : '—';
  }

  const endedLabel = row.querySelector('[data-jsgui-role="ended-label"]');
  if (endedLabel) {
    endedLabel.textContent = entry.endedAt != null ? formatTimestamp(entry.endedAt) : '—';
  }

  const durationLabel = row.querySelector('[data-jsgui-role="duration-label"]');
  if (durationLabel) {
    durationLabel.textContent = entry.durationLabel || (entry.startedAt != null ? formatDuration(entry.startedAt, entry.endedAt) : '—');
  }

  const taskCell = ensureTaskCell(row);
  if (taskCell) {
    taskCell.innerHTML = renderTaskCell(entry);
  }

  const progressCell = row.querySelector('[data-jsgui-role="progress-cell"]');
  if (progressCell) {
    if (entry.isActive) {
      ensureProgressBar(entry, progressCell, payload);
    } else {
      teardownProgressBar(entry.id);
      progressCell.innerHTML = '<span class="ui-meta">—</span>';
    }
  }
}

function updateDiagnostics(row, entry) {
  const container = row.querySelector('.analysis-stage');
  if (!container) return;
  container.querySelectorAll('[data-jsgui-role="diagnostic"]').forEach((el) => el.remove());
  const diagnostics = Array.isArray(entry.diagnostics) ? entry.diagnostics : [];
  diagnostics.forEach((line, index) => {
    const diag = document.createElement('div');
    diag.className = 'analysis-stage__meta';
    diag.dataset.jsguiRole = 'diagnostic';
    diag.dataset.diagnosticIndex = String(index);
    diag.textContent = String(line);
    container.appendChild(diag);
  });
}

function ensureProgressBar(entry, progressCell, payload) {
  let slot = progressCell.querySelector('[data-jsgui-role="progress-slot"]');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'analysis-progress-slot';
    slot.dataset.jsguiRole = 'progress-slot';
    slot.dataset.runId = entry.id;
    progressCell.innerHTML = '';
    progressCell.appendChild(slot);
  }
  slot.dataset.runId = entry.id;

  let record = progressBars.get(entry.id);
  if (record && record.slot !== slot) {
    try {
      record.bar?.destroy?.();
    } catch (_) {}
    progressBars.delete(entry.id);
    record = null;
  }
  if (record) {
    if (payload?.progress) record.bar.updateProgress(payload.progress);
    if (payload?.status) record.bar.updateStatus(payload.status);
    if (payload) {
      const subCandidate = pickSubProgressCandidate(payload, payload.lastProgress, payload.progress);
      if (subCandidate.found) {
        record.bar.updateSubProgress(subCandidate.value);
      }
    }
    return;
  }

  slot.innerHTML = '';
  loadProgressBarModule().then((module) => {
    if (!module || typeof module.createAnalysisProgressBar !== 'function') return;
    const currentSlot = progressCell.querySelector('[data-jsgui-role="progress-slot"]');
    if (currentSlot !== slot) return;
    const bar = module.createAnalysisProgressBar(slot, {
      runId: entry.id,
      startedAt: entry.startedAt || Date.now(),
      compact: true
    });
    progressBars.set(entry.id, { bar, slot });
    if (payload?.progress) bar.updateProgress(payload.progress);
    if (payload?.status) bar.updateStatus(payload.status);
    if (payload) {
      const subCandidate = pickSubProgressCandidate(payload, payload.lastProgress, payload.progress);
      if (subCandidate.found) {
        bar.updateSubProgress(subCandidate.value);
      }
    }
  }).catch((err) => {
    console.error('[AnalysisEnhancer] failed to load progress bar module', err);
    progressCell.innerHTML = '<span class="ui-meta">—</span>';
  });
}

function teardownProgressBar(runId) {
  const record = progressBars.get(runId);
  if (!record) return;
  try {
    record.bar?.destroy?.();
  } catch (_) {}
  progressBars.delete(runId);
}

function loadProgressBarModule() {
  if (!progressBarModulePromise) {
    progressBarModulePromise = import('/assets/components/AnalysisProgressBar.js').catch((err) => {
      console.error('[AnalysisEnhancer] failed to import AnalysisProgressBar.js', err);
      return null;
    });
  }
  return progressBarModulePromise;
}

function findRowElement(runId) {
  const selector = `[data-analysis-id="${cssEscape(runId)}"]`;
  if (tableElement) {
    const within = tableElement.querySelector(selector);
    if (within) return within;
  }
  return document.querySelector(selector);
}

function createRowElement(entry) {
  if (!tbodyElement) return null;
  const tr = document.createElement('tr');
  tr.dataset.jsguiId = `client-analysis-row-${entry.id}`;
  tr.dataset.analysisId = entry.id;
  tr.dataset.analysisStatus = entry.status || 'unknown';
  tr.dataset.analysisActive = entry.isActive ? '1' : '0';
  if (entry.startedAt != null) tr.dataset.analysisStartedAt = String(entry.startedAt);
  if (entry.endedAt != null) tr.dataset.analysisEndedAt = String(entry.endedAt);

  const idCell = document.createElement('td');
  idCell.className = 'u-nowrap';
  const link = document.createElement('a');
  link.href = `/analysis/${encodeURIComponent(entry.id)}/ssr`;
  link.textContent = entry.id;
  idCell.appendChild(link);
  tr.appendChild(idCell);

  const statusCell = document.createElement('td');
  statusCell.className = 'u-nowrap';
  statusCell.dataset.jsguiRole = 'status-cell';
  const statusLabel = document.createElement('span');
  statusLabel.className = `pill ${pickStatusPillClass(entry.status)}`;
  statusLabel.dataset.jsguiRole = 'status-label';
  statusLabel.textContent = entry.statusLabel || toTitleCase(entry.status || 'unknown');
  statusCell.appendChild(statusLabel);
  tr.appendChild(statusCell);

  const stageCell = document.createElement('td');
  stageCell.dataset.jsguiRole = 'stage-cell';
  const stageContainer = document.createElement('div');
  stageContainer.className = 'analysis-stage';
  const stageMain = document.createElement('div');
  stageMain.className = 'analysis-stage__main';
  stageMain.dataset.jsguiRole = 'stage-main';
  stageMain.textContent = entry.stage || '—';
  stageContainer.appendChild(stageMain);
  stageCell.appendChild(stageContainer);
  tr.appendChild(stageCell);

  const startedCell = document.createElement('td');
  startedCell.className = 'u-nowrap';
  startedCell.dataset.jsguiRole = 'started-label';
  startedCell.textContent = entry.startedAt != null ? formatTimestamp(entry.startedAt) : '—';
  tr.appendChild(startedCell);

  const endedCell = document.createElement('td');
  endedCell.className = 'u-nowrap';
  endedCell.dataset.jsguiRole = 'ended-label';
  endedCell.textContent = entry.endedAt != null ? formatTimestamp(entry.endedAt) : '—';
  tr.appendChild(endedCell);

  const durationCell = document.createElement('td');
  durationCell.className = 'u-nowrap';
  durationCell.dataset.jsguiRole = 'duration-label';
  durationCell.textContent = entry.durationLabel || (entry.startedAt != null ? formatDuration(entry.startedAt, entry.endedAt) : '—');
  tr.appendChild(durationCell);

  const configCell = document.createElement('td');
  configCell.dataset.jsguiRole = 'config-label';
  configCell.textContent = entry.configLabel || '—';
  tr.appendChild(configCell);

  const taskCell = document.createElement('td');
  taskCell.className = 'u-nowrap';
  taskCell.dataset.jsguiRole = 'task-cell';
  taskCell.innerHTML = renderTaskCell(entry);
  tr.appendChild(taskCell);

  const progressCell = document.createElement('td');
  progressCell.className = 'analysis-progress-cell';
  progressCell.dataset.jsguiRole = 'progress-cell';
  if (entry.isActive) {
    const slot = document.createElement('div');
    slot.className = 'analysis-progress-slot';
    slot.dataset.jsguiRole = 'progress-slot';
    slot.dataset.runId = entry.id;
    progressCell.appendChild(slot);
  } else {
    progressCell.innerHTML = '<span class="ui-meta">—</span>';
  }
  tr.appendChild(progressCell);

  if (tbodyElement.firstChild) {
    tbodyElement.insertBefore(tr, tbodyElement.firstChild);
  } else {
    tbodyElement.appendChild(tr);
  }
  activateAnalysisRow(tr);
  return tr;
}

function updateSummary() {
  const rows = document.querySelectorAll('[data-analysis-id]');
  const totals = {
    shown: rows.length,
    running: 0,
    paused: 0,
    completed: 0,
    failed: 0
  };
  const statusCounts = new Map();

  rows.forEach((row) => {
    const status = (row.getAttribute('data-analysis-status') || 'unknown').toLowerCase();
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (ACTIVE_STATUSES.has(status)) {
      totals.running += 1;
    } else if (status === 'paused') {
      totals.paused += 1;
    } else if (COMPLETED_STATUSES.has(status)) {
      totals.completed += 1;
    } else if (FAILED_STATUSES.has(status)) {
      totals.failed += 1;
    }
  });

  updateCounter('runs-total', totals.shown);
  updateCounter('runs-active', totals.running);
  updateCounter('runs-paused', totals.paused);
  updateCounter('runs-completed', totals.completed);
  updateCounter('runs-failed', totals.failed);
  renderStatusList(statusCounts);
}

function renderStatusList(statusCountsMap) {
  if (!statusListEl) return;
  const entries = collectStatusCounts(statusCountsMap);
  if (!entries.length) {
    statusListEl.innerHTML = '<li class="ui-meta">No runs yet.</li>';
    return;
  }
  const html = entries.map(([status, count]) => `
    <li data-status="${escapeHtml(status)}">
      <span class="status">${escapeHtml(status)}</span>
      <span class="count" data-status-count>${escapeHtml(String(count))}</span>
    </li>
  `).join('');
  statusListEl.innerHTML = html;
}

function collectStatusCounts(map) {
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    const ap = priorityIndex(a[0]);
    const bp = priorityIndex(b[0]);
    if (ap !== bp) return ap - bp;
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  return entries;
}

function priorityIndex(status) {
  const normalized = (status || '').toLowerCase();
  const idx = STATUS_PRIORITY.indexOf(normalized);
  return idx === -1 ? STATUS_PRIORITY.length + 1 : idx;
}

function updateCounter(suffix, value) {
  const elements = counterElements.get(suffix);
  if (!elements) return;
  elements.forEach((el) => {
    el.textContent = String(value);
  });
}

function extractCounterSuffix(id) {
  const match = id.match(/runs-(total|active|paused|completed|failed)$/);
  return match ? match[0] : null;
}

function ensureTaskCell(row) {
  if (!row) return null;
  let cell = row.querySelector('[data-jsgui-role="task-cell"]');
  if (cell) return cell;
  cell = document.createElement('td');
  cell.className = 'u-nowrap';
  cell.dataset.jsguiRole = 'task-cell';
  const progressCell = row.querySelector('[data-jsgui-role="progress-cell"]');
  if (progressCell && progressCell.parentElement === row) {
    row.insertBefore(cell, progressCell);
  } else {
    row.appendChild(cell);
  }
  return cell;
}

function renderTaskCell(entry) {
  const id = entry?.backgroundTaskId;
  if (id == null || id === '') {
    return '<span class="ui-meta">—</span>';
  }
  const href = entry.backgroundTaskHref || `/api/background-tasks/${encodeURIComponent(String(id))}`;
  const statusSuffix = entry.backgroundTaskStatus ? `<span class="ui-meta"> (${escapeHtml(String(entry.backgroundTaskStatus))})</span>` : '';
  return `<a href="${escapeHtml(String(href))}" target="_blank" rel="noreferrer noopener">Task #${escapeHtml(String(id))}</a>${statusSuffix}`;
}

function extractDiagnostics(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const lines = [];
  const possibleSources = [];
  if (Array.isArray(payload.diagnostics)) possibleSources.push(payload.diagnostics);
  if (payload.details) {
    if (Array.isArray(payload.details.diagnostics)) possibleSources.push(payload.details.diagnostics);
    if (payload.details.failure && payload.details.failure.message) {
      lines.push(`Failure: ${payload.details.failure.message}`);
    }
  }
  if (payload.lastProgress && Array.isArray(payload.lastProgress.diagnostics)) {
    possibleSources.push(payload.lastProgress.diagnostics);
  }
  possibleSources.forEach((source) => {
    source.forEach((item) => {
      const text = item && typeof item === 'object' && 'message' in item
        ? String(item.message)
        : String(item);
      if (text && text.trim()) {
        lines.push(text.trim());
      }
    });
  });
  if (payload.exit && payload.exit.error) {
    lines.push(String(payload.exit.error));
  }
  const unique = Array.from(new Set(lines));
  return unique.slice(0, 4);
}

function parseTimestamp(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeStatus(status) {
  if (status == null) return 'unknown';
  const normalized = String(status).trim().toLowerCase();
  return normalized || 'unknown';
}

function pickStatusPillClass(status) {
  const normalized = normalizeStatus(status);
  if (ACTIVE_STATUSES.has(normalized)) return 'good';
  if (FAILED_STATUSES.has(normalized) || normalized === 'paused') return 'warn';
  return 'info';
}

function formatTimestamp(ts) {
  if (ts == null) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatDuration(startedAt, endedAt) {
  if (startedAt == null) return '';
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return '';
  const end = endedAt != null ? new Date(endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return '';
  const diff = Math.max(0, end.getTime() - start.getTime());
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function toTitleCase(value) {
  const str = value == null ? '' : String(value);
  if (!str) return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function cssEscape(value) {
  const str = String(value);
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(str);
  }
  return str.replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

export function refreshAnalysisSummary() {
  updateSummary();
}
