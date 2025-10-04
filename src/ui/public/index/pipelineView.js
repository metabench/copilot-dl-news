import { formatNumber as defaultFormatNumber, formatRelativeTime as defaultFormatRelativeTime } from './formatters.js';
import { setElementVisibility } from './domUtils.js';

const STATUS_STYLES = {
  idle: { label: 'Idle', className: 'badge badge-neutral' },
  running: { label: 'Running', className: 'badge badge-intelligent' },
  pending: { label: 'Pending', className: 'badge badge-warn' },
  ready: { label: 'Ready', className: 'badge badge-ok' },
  applied: { label: 'Applied', className: 'badge badge-ok' },
  blocked: { label: 'Blocked', className: 'badge badge-bad' },
  error: { label: 'Error', className: 'badge badge-bad' },
  failed: { label: 'Failed', className: 'badge badge-bad' }
};

export const PIPELINE_DEFAULTS = {
  analysis: {
    status: 'idle',
    statusLabel: 'Idle',
    summary: 'No analysis runs detected yet.',
    lastRun: null,
    signals: [],
    detailUrl: null,
    runId: null
  },
  planner: {
    status: 'idle',
    statusLabel: 'Idle',
    summary: 'Planner will activate once intelligent crawl begins.',
    stage: '—',
    goals: { completed: 0, total: 0 },
    goalSummary: '—'
  },
  execution: {
    status: 'idle',
    statusLabel: 'Idle',
    summary: 'Awaiting crawl activity.',
    jobs: 0,
    queue: null,
    coverage: null
  }
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeStatusKey(status) {
  if (!status) {
    return 'idle';
  }
  const key = String(status).toLowerCase();
  if (STATUS_STYLES[key]) {
    return key;
  }
  if (key === 'completed' || key === 'complete' || key === 'success') {
    return 'ready';
  }
  if (key === 'paused') {
    return 'pending';
  }
  if (key === 'failure') {
    return 'failed';
  }
  return 'idle';
}

function describeAnalysisHistoryEntry(entry) {
  if (!entry) {
    return 'Analysis update';
  }
  if (entry.summary) {
    return String(entry.summary);
  }
  const parts = [];
  if (entry.stage) {
    parts.push(String(entry.stage).replace(/[_-]+/g, ' '));
  }
  if (entry.status) {
    parts.push(String(entry.status).replace(/[_-]+/g, ' '));
  }
  return parts.length ? parts.join(' · ') : 'Analysis update';
}

function getCurrentWindow() {
  try {
    return window;
  } catch (err) {
    return undefined;
  }
}

export function createPipelineView(dom, formatters = {}) {
  const {
    panel,
    updatedEl,
    cards = {},
    elements = {},
    analysisHistorySection,
    analysisHistoryList,
    analysisHistoryClearButton,
    analysisHighlightsEl
  } = dom;

  const {
    formatNumber = defaultFormatNumber,
    formatRelativeTime = defaultFormatRelativeTime
  } = formatters;

  const state = {
    analysis: deepClone(PIPELINE_DEFAULTS.analysis),
    planner: deepClone(PIPELINE_DEFAULTS.planner),
    execution: deepClone(PIPELINE_DEFAULTS.execution)
  };

  function syncDebugState() {
    const win = getCurrentWindow();
    if (!win) {
      return;
    }
    try {
      win.__pipelineState = deepClone(state);
    } catch (err) {
      // ignore
    }
  }

  function render() {
    let latestTs = 0;
    let hasActivity = false;

    for (const [stageKey, stage] of Object.entries(state)) {
      const defaults = PIPELINE_DEFAULTS[stageKey] || {};
      const card = cards[stageKey];
      const els = elements[stageKey] || {};
      const statusKey = normalizeStatusKey(stage.status || defaults.status || 'idle');
      const statusMeta = STATUS_STYLES[statusKey] || STATUS_STYLES.idle;

      if (card) {
        card.setAttribute('data-status', statusKey);
      }

      if (els.status) {
        els.status.className = statusMeta.className;
        els.status.textContent = stage.statusLabel || statusMeta.label;
      }

      if (els.summary) {
        const summary = stage.summary || defaults.summary || '';
        els.summary.textContent = summary;
        els.summary.classList.toggle('muted', !stage.summary);
      }

      if (stageKey === 'analysis') {
        if (els.link) {
          const detailUrl = stage.detailUrl || defaults.detailUrl || null;
          const runId = stage.runId || stage.runID || stage.run || undefined;
          els.link.textContent = '';
          if (detailUrl) {
            const anchor = document.createElement('a');
            anchor.href = detailUrl;
            anchor.target = '_blank';
            anchor.rel = 'noopener';
            anchor.textContent = runId || 'View';
            els.link.appendChild(anchor);
            els.link.classList.remove('muted');
          } else {
            els.link.textContent = '—';
            els.link.classList.add('muted');
          }
        }

        if (els.lastRun) {
          if (stage.lastRun) {
            const ts = typeof stage.lastRun === 'number' ? stage.lastRun : Date.parse(stage.lastRun);
            if (Number.isFinite(ts)) {
              els.lastRun.textContent = formatRelativeTime(ts);
              els.lastRun.title = new Date(ts).toLocaleString();
            } else {
              els.lastRun.textContent = String(stage.lastRun);
              els.lastRun.title = '';
            }
          } else {
            els.lastRun.textContent = '—';
            els.lastRun.title = '';
          }
        }

        if (els.signals) {
          const signals = Array.isArray(stage.signals) ? stage.signals.filter(Boolean) : [];
          if (signals.length) {
            els.signals.textContent = signals.slice(0, 3).join(' · ');
            els.signals.classList.remove('muted');
          } else {
            els.signals.textContent = 'None captured';
            els.signals.classList.add('muted');
          }
        }
      } else if (stageKey === 'planner') {
        if (els.stage) {
          els.stage.textContent = stage.stage || defaults.stage || '—';
        }
        if (els.goals) {
          const goalSummary = stage.goalSummary
            || (stage.goals && stage.goals.total
              ? `${formatNumber(stage.goals.completed || 0)}/${formatNumber(stage.goals.total)} complete`
              : '—');
          els.goals.textContent = goalSummary;
          els.goals.classList.toggle('muted', !goalSummary || goalSummary === '—');
        }
      } else if (stageKey === 'execution') {
        if (els.jobs) {
          const jobsVal = stage.jobs != null ? Number(stage.jobs) : 0;
          els.jobs.textContent = Number.isFinite(jobsVal) ? formatNumber(jobsVal) : String(stage.jobs ?? '0');
        }
        if (els.queue) {
          const queueVal = stage.queue;
          if (queueVal == null) {
            els.queue.textContent = '—';
            els.queue.classList.add('muted');
          } else {
            const num = Number(queueVal);
            els.queue.textContent = Number.isFinite(num) ? formatNumber(num) : String(queueVal);
            els.queue.classList.remove('muted');
          }
        }
        if (els.coverage) {
          if (stage.coverage == null) {
            els.coverage.textContent = '—';
            els.coverage.classList.add('muted');
          } else if (typeof stage.coverage === 'number') {
            els.coverage.textContent = `${stage.coverage.toFixed(1)}%`;
            els.coverage.classList.remove('muted');
          } else {
            els.coverage.textContent = String(stage.coverage);
            els.coverage.classList.remove('muted');
          }
        }
      }

      if (stage.updatedAt) {
        const ts = typeof stage.updatedAt === 'number' ? stage.updatedAt : Date.parse(stage.updatedAt);
        if (Number.isFinite(ts)) {
          latestTs = Math.max(latestTs, ts);
        }
      }
      if (stage.updatedAt || statusKey !== 'idle') {
        hasActivity = true;
      }
    }

    if (panel) {
      setElementVisibility(panel, hasActivity);
    }
    if (updatedEl) {
      if (hasActivity && latestTs) {
        updatedEl.textContent = `Updated ${formatRelativeTime(latestTs)}`;
      } else if (hasActivity) {
        updatedEl.textContent = 'Pipeline updates active';
      } else {
        updatedEl.textContent = 'Waiting for planner telemetry…';
      }
    }

    syncDebugState();
  }

  function resetPipelineState() {
    for (const [stageKey, defaults] of Object.entries(PIPELINE_DEFAULTS)) {
      state[stageKey] = deepClone(defaults);
    }
    if (panel) {
      setElementVisibility(panel, false);
    }
    if (updatedEl) {
      updatedEl.textContent = 'Waiting for planner telemetry…';
    }
    syncDebugState();
    render();
  }

  function applyStagePatch(stageKey, patch, safeTs) {
    if (!patch || typeof patch !== 'object') {
      return false;
    }
    const target = state[stageKey];
    if (!target) {
      return false;
    }
    let stageChanged = false;
    for (const [prop, value] of Object.entries(patch)) {
      if (prop === 'updatedAt') {
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const existing = target[prop] && typeof target[prop] === 'object' && !Array.isArray(target[prop])
          ? target[prop]
          : {};
        const merged = { ...existing, ...value };
        if (JSON.stringify(existing) !== JSON.stringify(merged)) {
          target[prop] = merged;
          stageChanged = true;
        }
      } else if (Array.isArray(value)) {
        const existing = Array.isArray(target[prop]) ? target[prop] : [];
        const same = existing.length === value.length && existing.every((v, idx) => v === value[idx]);
        if (!same) {
          target[prop] = value.slice();
          stageChanged = true;
        }
      } else {
        let nextVal = value;
        if (prop === 'status') {
          nextVal = normalizeStatusKey(value);
        }
        if (target[prop] !== nextVal) {
          target[prop] = nextVal;
          stageChanged = true;
        }
      }
    }
    if (stageChanged || patch.updatedAt != null) {
      const patchTs = patch.updatedAt != null
        ? (typeof patch.updatedAt === 'number' ? patch.updatedAt : Date.parse(patch.updatedAt))
        : safeTs;
      const ts = Number.isFinite(patchTs) ? patchTs : safeTs;
      target.updatedAt = ts;
      return true;
    }
    return false;
  }

  function updatePipeline(partial = {}, options = {}) {
    let changed = false;
    const baseTs = options.timestamp != null
      ? (typeof options.timestamp === 'number' ? options.timestamp : Date.parse(options.timestamp))
      : Date.now();
    const safeTs = Number.isFinite(baseTs) ? baseTs : Date.now();

    for (const [stageKey, patch] of Object.entries(partial)) {
      if (applyStagePatch(stageKey, patch, safeTs)) {
        changed = true;
      }
    }

    if (changed) {
      render();
    }
  }

  function getAnalysisState() {
    const cache = getCurrentWindow();
    if (cache && cache.__analysisState) {
      return cache.__analysisState;
    }
    const stateSnapshot = { history: [], runId: null, lastRun: null, detailUrl: null };
    try {
      const saved = localStorage.getItem('analysisHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const trimmed = parsed.filter((entry) => entry && Number.isFinite(entry.ts));
          stateSnapshot.history = trimmed.slice(-50);
        }
      }
      stateSnapshot.runId = localStorage.getItem('analysisLastRunId') || null;
      const savedAt = localStorage.getItem('analysisLastRunAt');
      if (savedAt != null) {
        const n = Number(savedAt);
        if (Number.isFinite(n)) {
          stateSnapshot.lastRun = n;
        }
      }
      stateSnapshot.detailUrl = localStorage.getItem('analysisLastDetailUrl') || null;
    } catch (err) {
      // ignore
    }
    if (cache) {
      try {
        cache.__analysisState = stateSnapshot;
      } catch (err) {
        // ignore
      }
    }
    return stateSnapshot;
  }

  function persistAnalysisHistory(history) {
    try {
      const trimmed = Array.isArray(history)
        ? history.filter((entry) => entry && Number.isFinite(entry.ts)).slice(-50)
        : [];
      localStorage.setItem('analysisHistory', JSON.stringify(trimmed));
    } catch (err) {
      // ignore
    }
  }

  function renderAnalysisHistory(entries, options = {}) {
    if (!analysisHistoryList || !analysisHistorySection) {
      return;
    }
    const detailUrl = options.detailUrl || null;
    analysisHistoryList.innerHTML = '';
    const list = Array.isArray(entries)
      ? entries.slice().sort((a, b) => (b?.ts || 0) - (a?.ts || 0))
      : [];

    if (!list.length) {
      analysisHistorySection.dataset.hasEntries = '0';
      if (analysisHistoryClearButton) {
        analysisHistoryClearButton.disabled = true;
      }
      const emptyRow = document.createElement('li');
      emptyRow.className = 'pipeline-history-empty';
      emptyRow.textContent = 'No analysis telemetry yet.';
      analysisHistoryList.appendChild(emptyRow);
      return;
    }

    analysisHistorySection.dataset.hasEntries = '1';
    if (analysisHistoryClearButton) {
      analysisHistoryClearButton.disabled = false;
    }

    const limit = Math.min(list.length, 20);
    for (let i = 0; i < limit; i += 1) {
      const entry = list[i];
      const li = document.createElement('li');
      li.className = 'pipeline-history-item';

      const ts = Number.isFinite(entry?.ts) ? entry.ts : Date.now();
      const dt = new Date(ts);
      const timeEl = document.createElement('time');
      if (!Number.isNaN(dt.getTime())) {
        timeEl.dateTime = dt.toISOString();
        timeEl.textContent = formatRelativeTime(ts);
        timeEl.title = dt.toLocaleString();
      } else {
        timeEl.textContent = 'just now';
      }
      li.appendChild(timeEl);

      const body = document.createElement('div');
      const summaryText = describeAnalysisHistoryEntry(entry);
      if (detailUrl) {
        const anchor = document.createElement('a');
        anchor.href = detailUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = summaryText;
        body.appendChild(anchor);
      } else {
        const span = document.createElement('span');
        span.textContent = summaryText;
        body.appendChild(span);
      }

      if (entry?.status) {
        const status = document.createElement('div');
        status.className = 'muted';
        status.textContent = `Status: ${String(entry.status).replace(/[_-]+/g, ' ')}`;
        body.appendChild(status);
      }

      li.appendChild(body);
      analysisHistoryList.appendChild(li);
    }
  }

  function buildAnalysisHighlights(stateSnapshot = {}) {
    const highlights = [];
    const coverage = stateSnapshot.coverage && typeof stateSnapshot.coverage === 'object' ? stateSnapshot.coverage : null;
    const seeded = stateSnapshot.seededHubs && typeof stateSnapshot.seededHubs === 'object' ? stateSnapshot.seededHubs : null;
    const stats = stateSnapshot.stats && typeof stateSnapshot.stats === 'object' ? stateSnapshot.stats : null;

    if (coverage && coverage.expected != null) {
      const expected = formatNumber(coverage.expected);
      const seededCount = coverage.seeded != null ? formatNumber(coverage.seeded) : null;
      const pct = coverage.coveragePct != null
        ? (coverage.coveragePct > 1 ? coverage.coveragePct : coverage.coveragePct * 100)
        : null;
      const pctText = pct != null ? `${pct.toFixed(1)}%` : null;
      const parts = [`Tracking ${expected} hubs`];
      if (seededCount) {
        parts.push(`${seededCount} seeded`);
      }
      if (pctText) {
        parts.push(`${pctText} coverage`);
      }
      highlights.push(parts.join(' · '));
    }

    if (seeded) {
      if (seeded.sectionsFromPatterns != null && seeded.sectionsFromPatterns > 0) {
        highlights.push(`${formatNumber(seeded.sectionsFromPatterns)} sections inferred from patterns`);
      }
      if (seeded.countryCandidates != null && seeded.countryCandidates > 0) {
        highlights.push(`${formatNumber(seeded.countryCandidates)} country hub candidates queued`);
      }
      if (seeded.sample && Array.isArray(seeded.sample) && seeded.sample.length) {
        highlights.push(`Seeded sample: ${seeded.sample.slice(0, 2).join(', ')}`);
      }
    }

    if (Array.isArray(stateSnapshot.problems) && stateSnapshot.problems.length) {
      const top = stateSnapshot.problems.slice().sort((a, b) => (b?.count || 0) - (a?.count || 0))[0];
      if (top && top.kind) {
        highlights.push(`Needs attention: ${top.kind} (${formatNumber(top.count || 0)})`);
      }
    }

    if (stats && (stats.articlesSaved != null || stats.articlesFound != null)) {
      const saved = formatNumber(stats.articlesSaved || 0);
      const found = formatNumber(stats.articlesFound || 0);
      highlights.push(`Articles saved ${saved} of ${found} found`);
    }

    if (Array.isArray(stateSnapshot.analysisHighlights)) {
      for (const item of stateSnapshot.analysisHighlights) {
        if (item) {
          highlights.push(String(item));
        }
      }
    }

    const seen = new Set();
    const unique = [];
    for (const item of highlights) {
      const key = item && item.toLowerCase ? item.toLowerCase() : item;
      if (!seen.has(key) && item) {
        seen.add(key);
        unique.push(item);
      }
      if (unique.length >= 4) {
        break;
      }
    }

    return unique;
  }

  function renderAnalysisHighlights(highlights) {
    if (!analysisHighlightsEl) {
      return;
    }
    analysisHighlightsEl.innerHTML = '';
    if (!Array.isArray(highlights) || !highlights.length) {
      analysisHighlightsEl.removeAttribute('role');
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Run analysis to surface notable findings.';
      analysisHighlightsEl.appendChild(span);
      return;
    }

    analysisHighlightsEl.setAttribute('role', 'list');
    for (const item of highlights) {
      const row = document.createElement('span');
      row.setAttribute('role', 'listitem');
      row.textContent = item;
      analysisHighlightsEl.appendChild(row);
    }
  }

  return {
    resetPipelineState,
    updatePipeline,
    getAnalysisState,
    persistAnalysisHistory,
    renderAnalysisHistory,
    buildAnalysisHighlights,
    renderAnalysisHighlights
  };
}
