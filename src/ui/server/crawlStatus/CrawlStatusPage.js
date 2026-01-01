'use strict';

const jsgui = require('jsgui3-html');

const { Control, Standard_Web_Page } = jsgui;
const Server_Page_Context = jsgui.Server_Page_Context || jsgui.Page_Context;

function buildCrawlStatusClientScript({ jobsApiPath, extraJobsApiPath, eventsPath, telemetryHistoryPath }) {
  const jobsApiPathJson = JSON.stringify(jobsApiPath);
  const extraJobsApiPathJson = JSON.stringify(extraJobsApiPath || null);
  const eventsPathJson = JSON.stringify(eventsPath);
  const telemetryHistoryPathJson = JSON.stringify(telemetryHistoryPath || null);
  const remoteObsBasePathJson = JSON.stringify('/api/crawl-telemetry/remote-obs');

  // NOTE: Avoid nested template literals here because this file is loaded in Jest,
  // and nested backticks can be easy to break when embedding HTML fragments.
  return `
(function () {
  const jobsApiPath = ${jobsApiPathJson};
  const extraJobsApiPath = ${extraJobsApiPathJson};
  const eventsPath = ${eventsPathJson};
  const telemetryHistoryPath = ${telemetryHistoryPathJson};
  const remoteObsBasePath = ${remoteObsBasePathJson};

  const elStatus = document.getElementById('status');
  const elRows = document.getElementById('rows');
  const elStartForm = document.getElementById('crawl-start-form');
  const elStartOperation = document.getElementById('crawl-start-operation');
  const elStartOperationLabel = document.getElementById('crawl-start-operation-label');
  const elStartUrl = document.getElementById('crawl-start-url');
  const elStartOverrides = document.getElementById('crawl-start-overrides');
  const elStartStatus = document.getElementById('crawl-start-status');

  const jobs = new Map();

  const telemetryUiHealth = {
    parseErrors: 0,
    lastParseErrorAt: null,
    lastParseErrorMessage: null,
    orphanEvents: 0
  };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function badgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('pause')) return 'paused';
    if (s.includes('run')) return 'running';
    if (s.includes('error') || s.includes('fail')) return 'error';
    if (s.includes('done') || s.includes('complete') || s.includes('stopped')) return 'done';
    return '';
  }

  function clamp01(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function formatPercent(ratio) {
    const p = Math.round(clamp01(ratio) * 100);
    return String(p) + '%';
  }

  function deriveProgressModel(job) {
    if (!job || typeof job !== 'object') return null;

    // Generic support for jobs that already expose progress.
    const p = job.progress && typeof job.progress === 'object' ? job.progress : null;
    const current = p && Number.isFinite(Number(p.current)) ? Number(p.current) : null;
    const total = p && Number.isFinite(Number(p.total)) ? Number(p.total) : null;
    if (current !== null && total !== null && total > 0) {
      const ratio = clamp01(current / total);
      return { mode: 'determinate', ratio, label: String(current) + '/' + String(total) };
    }

    // Prefer canonical crawl telemetry totals when present.
    const percentComplete = Number(job.percentComplete ?? job.metrics?.percentComplete ?? null);
    if (Number.isFinite(percentComplete)) {
      const ratio = clamp01(percentComplete / 100);
      return { mode: 'determinate', ratio, label: 'total ' + String(Math.round(ratio * 100)) + '%' };
    }

    const telemetryTotal = Number(job.total ?? job.metrics?.total ?? null);
    const visitedForTotal = Number(job.visited ?? job.metrics?.visited ?? 0);
    if (Number.isFinite(telemetryTotal) && telemetryTotal > 0 && Number.isFinite(visitedForTotal)) {
      const ratio = clamp01(visitedForTotal / telemetryTotal);
      return { mode: 'determinate', ratio, label: String(visitedForTotal) + '/' + String(telemetryTotal) };
    }

    // Prefer progress-tree root totals when available.
    const tree = job._progressTree;
    const root = tree && typeof tree === 'object' ? tree.root : null;
    if (root && typeof root === 'object') {
      const rc = Number(root.current ?? null);
      const rt = Number(root.total ?? null);
      if (Number.isFinite(rc) && Number.isFinite(rt) && rt > 0) {
        const ratio = clamp01(rc / rt);
        return { mode: 'determinate', ratio, label: String(root.label || 'tree') + ' ' + String(rc) + '/' + String(rt) };
      }
    }

    // Crawl proxy: treat "visited out of visited+queue" as a queue-drain indicator.
    const visited = Number(job.visited ?? job.metrics?.visited ?? 0);
    const queued = Number(job.queueSize ?? job.metrics?.queueSize ?? 0);
    const denom = visited + queued;
    if (Number.isFinite(denom) && denom > 0) {
      const ratio = clamp01(visited / denom);
      return { mode: 'determinate', ratio, label: 'drain ' + formatPercent(ratio) };
    }

    // If the job is running but we can't compute a ratio, show indeterminate.
    const status = String(job.status || job.stage || '').toLowerCase();
    if (status.includes('run')) {
      return { mode: 'indeterminate', ratio: null, label: 'running' };
    }

    return null;
  }

  function renderProgressBar(model) {
    if (!model) return '';
    if (model.mode === 'indeterminate') {
      return '<div class="pbar pbar--indeterminate"><div class="pbar__fill"></div></div>';
    }
    const pct = Math.round(clamp01(model.ratio) * 100);
    return '<div class="pbar" title="' + escapeHtml(model.label || '') + '"><div class="pbar__fill" style="width:' + pct + '%"></div></div>';
  }

  function formatEventSummary(evt) {
    if (!evt || typeof evt !== 'object') return '';
    const type = String(evt.type || 'telemetry');
    const data = evt.data && typeof evt.data === 'object' ? evt.data : {};
    if (type === 'crawl:progress') {
      const v = Number(data.visited ?? 0);
      const q = Number(data.queued ?? 0);
      const e = Number(data.errors ?? 0);
      const t = Number(data.total ?? null);
      const pct = Number(data.percentComplete ?? null);
      return 'progress v=' + String(v) + ' q=' + String(q) + ' e=' + String(e);
    }
    if (type === 'crawl:progress-tree:updated' || type === 'crawl:progress-tree:completed') {
      const root = data && typeof data === 'object' ? data.root : null;
      const label = root && root.label ? String(root.label) : 'tree';
      const rc = root && root.current != null ? Number(root.current) : null;
      const rt = root && root.total != null ? Number(root.total) : null;
      if (Number.isFinite(rc) && Number.isFinite(rt) && rt > 0) {
        return 'progress-tree ' + String(label) + ' ' + String(rc) + '/' + String(rt);
      }
      return 'progress-tree ' + String(label);
    }
    if (type === 'crawl:url:error') {
      const u = data.url ? String(data.url) : '';
      const m = data.error ? String(data.error) : '';
      return ('url:error ' + (u ? u.slice(0, 80) : '') + ' ' + (m ? ('- ' + m.slice(0, 80)) : '')).trim();
    }
    if (evt.message) {
      return String(evt.message).slice(0, 140);
    }
    return type;
  }

  function render() {
    const items = Array.from(jobs.values()).sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    elRows.innerHTML = items
      .map((job) => {
        const id = escapeHtml(job.id);
        const url = escapeHtml(job.url || job.startUrl || '');
        const status = escapeHtml(job.status || job.stage || 'unknown');
        const badge = badgeClass(job.status || job.stage);
        const visited = Number(job.visited ?? job.metrics?.visited ?? 0);
        const downloaded = Number(job.downloaded ?? job.metrics?.downloaded ?? 0);
        const errors = Number(job.errors ?? job.metrics?.errors ?? 0);
        const queueSize = Number(job.queueSize ?? job.metrics?.queueSize ?? 0);
        const last = escapeHtml(job.lastActivityAt || job.metrics?._lastProgressWall || '');

        const progressModel = deriveProgressModel(job);
        const progressHtml = renderProgressBar(progressModel);
        const progressLabel = progressModel && progressModel.label ? escapeHtml(progressModel.label) : '';

        const recent = Array.isArray(job._events) ? job._events : [];
        const lastEvent = escapeHtml(job._lastEventSummary || '');

        const tree = job._progressTree;
        const treeHtml = tree ? renderProgressTreePanel(tree) : '';
        const eventsHtml = recent.length
          ? (
              '<details class="job-events">' +
              '<summary>Events (' + recent.length + ')</summary>' +
              '<div class="job-events-body">' +
              recent
                .map((line) => '<div class="job-event-line">' + escapeHtml(line) + '</div>')
                .join('') +
              '</div>' +
              '</details>'
            )
          : '';

        const detailHref = jobsApiPath + '/' + encodeURIComponent(job.id || '');
        const observerHref = '/crawl-observer/task/' + encodeURIComponent(job.id || '');
        return (
          '\n<tr>' +
          '\n  <td>' +
          '\n    <div class="mono">' + id + '</div>' +
          '\n    <div class="muted">' + (url ? url : '') + '</div>' +
          '\n    <div>' +
          '<a href="' + detailHref + '" class="muted">detail</a>' +
          ' · <a href="' + observerHref + '" class="muted" target="_blank" rel="noopener noreferrer">observer</a>' +
          '</div>' +
          (treeHtml ? ('\n    ' + treeHtml) : '') +
          (lastEvent ? ('\n    <div class="job-last">Last: <span class="mono">' + lastEvent + '</span></div>') : '') +
          (eventsHtml ? ('\n    ' + eventsHtml) : '') +
          '\n  </td>' +
          '\n  <td><span class="badge ' + badge + '">' + status + '</span></td>' +
          '\n  <td>' + progressHtml + (progressLabel ? ('<div class="muted">' + progressLabel + '</div>') : '') + '</td>' +
          '\n  <td class="mono">' + visited + '</td>' +
          '\n  <td class="mono">' + downloaded + '</td>' +
          '\n  <td class="mono">' + errors + '</td>' +
          '\n  <td class="mono">' + queueSize + '</td>' +
          '\n  <td class="mono">' + last + '</td>' +
          '\n  <td class="row-actions">' +
          '\n    <button data-action="pause" data-id="' + id + '">Pause</button>' +
          '\n    <button data-action="resume" data-id="' + id + '">Resume</button>' +
          '\n    <button data-action="stop" data-id="' + id + '">Stop</button>' +
          '\n  </td>' +
          '\n</tr>\n'
        );
      })
      .join('');
  }

  function normalizeJobId(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  function mergeJob(jobId, patch) {
    const prev = jobs.get(jobId) || { id: jobId };
    jobs.set(jobId, { ...prev, ...patch, id: jobId });
  }

  function recordJobEvent(jobId, evt) {
    const job = jobs.get(jobId) || { id: jobId };
    const summary = formatEventSummary(evt);
    const ts = evt && (evt.timestamp || evt.timestampMs) ? (evt.timestamp || evt.timestampMs) : '';
    const line = (ts ? (String(ts) + ' ') : '') + String(evt && evt.type ? evt.type : 'telemetry') + (summary ? (' — ' + summary) : '');

    const prev = Array.isArray(job._events) ? job._events : [];
    const next = prev.slice(-19);
    next.push(line);

    jobs.set(jobId, {
      ...job,
      id: jobId,
      _events: next,
      _lastEventType: evt && evt.type ? String(evt.type) : null,
      _lastEventSummary: summary || (evt && evt.type ? String(evt.type) : null)
    });
  }

  function normalizeProgressTreeNode(node, { depth, maxDepth, maxChildren }) {
    if (!node || typeof node !== 'object') return null;

    const id = node.id != null ? String(node.id).slice(0, 120) : null;
    const label = node.label != null ? String(node.label).slice(0, 200) : (id || '');
    const current = node.current != null && Number.isFinite(Number(node.current)) ? Number(node.current) : null;
    const total = node.total != null && Number.isFinite(Number(node.total)) ? Number(node.total) : null;
    const unit = node.unit != null ? String(node.unit).slice(0, 24) : null;
    const status = node.status != null ? String(node.status).slice(0, 16) : null;

    let children = [];
    if (depth < maxDepth && Array.isArray(node.children)) {
      children = node.children
        .slice(0, maxChildren)
        .map((c) => normalizeProgressTreeNode(c, { depth: depth + 1, maxDepth, maxChildren }))
        .filter(Boolean);
    }

    return { id, label, current, total, unit, status, children };
  }

  function normalizeProgressTreePayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const maxDepth = 4;
    const maxChildren = 30;
    const root = normalizeProgressTreeNode(payload.root, { depth: 0, maxDepth, maxChildren });
    if (!root) return null;
    const activePath = Array.isArray(payload.activePath)
      ? payload.activePath.map((x) => String(x).slice(0, 120)).slice(0, 80)
      : [];
    return { root, activePath };
  }

  function renderProgressTreeNode(node, activeSet, depth) {
    if (!node) return '';
    const indent = Math.min(24, depth * 12);
    const hasTotals = Number.isFinite(node.current) && Number.isFinite(node.total) && node.total > 0;
    const ratio = hasTotals ? clamp01(node.current / node.total) : null;
    const isActive = node.id && activeSet && activeSet.has(node.id);

    const label = escapeHtml(node.label || node.id || '');
    const meta = hasTotals
      ? escapeHtml(String(node.current) + '/' + String(node.total) + (node.unit ? (' ' + node.unit) : ''))
      : (node.status ? escapeHtml(String(node.status)) : '');

    const bar = hasTotals
      ? ('<div class="ptree-bar"><div class="ptree-bar__fill" style="width:' + Math.round(ratio * 100) + '%"></div></div>')
      : '<div class="ptree-bar ptree-bar--indeterminate"><div class="ptree-bar__fill"></div></div>';

    const children = Array.isArray(node.children) ? node.children : [];
    return (
      '<div class="ptree-node' + (isActive ? ' is-active' : '') + '" style="margin-left:' + indent + 'px">' +
      '<div class="ptree-row">' +
      '<div class="ptree-label">' + label + '</div>' +
      '<div class="ptree-meta">' + meta + '</div>' +
      '</div>' +
      bar +
      (children.length ? ('<div class="ptree-children">' + children.map((c) => renderProgressTreeNode(c, activeSet, depth + 1)).join('') + '</div>') : '') +
      '</div>'
    );
  }

  function renderProgressTreePanel(tree) {
    if (!tree || typeof tree !== 'object' || !tree.root) return '';
    const active = new Set(Array.isArray(tree.activePath) ? tree.activePath : []);
    const rootLabel = escapeHtml(tree.root.label || 'Progress');
    const rootMeta = (Number.isFinite(tree.root.current) && Number.isFinite(tree.root.total) && tree.root.total > 0)
      ? escapeHtml(String(tree.root.current) + '/' + String(tree.root.total))
      : '';

    return (
      '<details class="job-tree">' +
      '<summary>Progress tree' + (rootMeta ? (' — ' + rootMeta) : '') + '</summary>' +
      '<div class="ptree">' +
      '<div class="ptree-title">' + rootLabel + '</div>' +
      renderProgressTreeNode(tree.root, active, 0) +
      '</div>' +
      '</details>'
    );
  }

  function applyTelemetryEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    const type = evt.type || '';
    const jobId = normalizeJobId(evt.jobId) || normalizeJobId(evt.data && evt.data.jobId);
    if (!jobId) {
      telemetryUiHealth.orphanEvents += 1;
      return;
    }

    recordJobEvent(jobId, evt);

    const data = evt.data && typeof evt.data === 'object' ? evt.data : {};
    const ts = evt.timestamp || evt.timestampMs || null;

    if (type === 'crawl:progress') {
      mergeJob(jobId, {
        status: 'running',
        stage: 'running',
        visited: Number(data.visited ?? 0),
        downloaded: Number(data.downloaded ?? 0),
        errors: Number(data.errors ?? 0),
        queueSize: Number(data.queued ?? 0),
        total: data.total != null ? Number(data.total) : undefined,
        percentComplete: data.percentComplete != null ? Number(data.percentComplete) : undefined,
        lastActivityAt: ts
      });
      return;
    }

    if (type === 'crawl:progress-tree:updated' || type === 'crawl:progress-tree:completed') {
      const tree = normalizeProgressTreePayload(data);
      if (tree) {
        mergeJob(jobId, {
          status: 'running',
          stage: 'running',
          _progressTree: tree,
          _progressTreeCompleted: type === 'crawl:progress-tree:completed',
          lastActivityAt: ts
        });
      }
      return;
    }

    if (type === 'crawl:started') {
      mergeJob(jobId, {
        status: 'running',
        stage: 'running',
        url: data.startUrl || null,
        crawlType: evt.crawlType || data.crawlType || null,
        lastActivityAt: ts
      });
      return;
    }

    if (type === 'crawl:paused') {
      mergeJob(jobId, { status: 'paused', stage: 'paused', lastActivityAt: ts });
      return;
    }

    if (type === 'crawl:resumed') {
      mergeJob(jobId, { status: 'running', stage: 'running', lastActivityAt: ts });
      return;
    }

    if (type === 'crawl:completed') {
      mergeJob(jobId, { status: 'done', stage: 'done', lastActivityAt: ts, lastExit: data });
      return;
    }

    if (type === 'crawl:failed') {
      mergeJob(jobId, { status: 'error', stage: 'error', lastActivityAt: ts, lastExit: data });
      return;
    }

    if (type === 'crawl:stopped') {
      mergeJob(jobId, { status: 'stopped', stage: 'stopped', lastActivityAt: ts, lastExit: data });
      return;
    }
  }

  async function refreshSnapshot() {
    try {
      const res = await fetch(jobsApiPath, { headers: { Accept: 'application/json' } });
      const payload = await res.json();
      if (!payload || !Array.isArray(payload.items)) {
        throw new Error('Invalid jobs payload');
      }

      for (const job of payload.items) {
        if (job && job.id) {
          jobs.set(job.id, job);
        }
      }

      let extraCount = 0;
      if (extraJobsApiPath) {
        try {
          const res2 = await fetch(extraJobsApiPath, { headers: { Accept: 'application/json' } });
          const payload2 = await res2.json();
          if (payload2 && Array.isArray(payload2.items)) {
            extraCount = payload2.items.length;
            for (const item of payload2.items) {
              if (item && item.id) {
                jobs.set(item.id, { ...item, inProcess: true });
              }
            }
          }
        } catch (_) {}
      }

      elStatus.textContent = 'Loaded ' + payload.items.length + ' job(s)' + (extraJobsApiPath ? (' + ' + extraCount + ' in-process job(s)') : '') + '. Waiting for live updates…';
      render();
    } catch (err) {
      elStatus.textContent = 'Failed to load jobs snapshot: ' + (err && err.message ? err.message : String(err));
    }
  }

  function normalizeStartUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (raw.includes('://')) return raw;
    // Convenience: allow typing "example.com" or "example.com/path".
    if (raw.includes('.') || raw.startsWith('localhost')) {
      return 'https://' + raw;
    }
    return raw;
  }

  function setStartStatus(message, kind) {
    if (!elStartStatus) return;
    elStartStatus.textContent = message || '';
    elStartStatus.className = 'start-status' + (kind ? (' start-status--' + kind) : '');
  }

  async function loadAvailability() {
    if (!elStartOperation) return;
    try {
      const res = await fetch('/api/v1/crawl/availability?operations=1&sequences=0', { headers: { Accept: 'application/json' } });
      const payload = await res.json();
      const ops = payload && payload.availability && Array.isArray(payload.availability.operations)
        ? payload.availability.operations
        : [];

      elStartOperation.innerHTML = '';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = ops.length ? 'Select an operation…' : 'No operations available';
      elStartOperation.appendChild(opt0);

      for (const op of ops) {
        if (!op || !op.name) continue;
        const option = document.createElement('option');
        option.value = op.name;
        option.textContent = op.summary ? (op.name + ' — ' + op.summary) : op.name;
        option.dataset.defaultOptions = op.defaultOptions ? JSON.stringify(op.defaultOptions) : '';
        elStartOperation.appendChild(option);
      }

      // Default to the first operation when present.
      if (!elStartOperation.value && ops.length) {
        elStartOperation.value = ops[0].name;
      }

      if (elStartOperationLabel) {
        elStartOperationLabel.textContent = elStartOperation.value || (ops.length ? String(ops[0].name || '') : 'n/a');
      }

      if (ops.length === 1) {
        elStartOperation.value = ops[0].name;
        const json = elStartOperation.selectedOptions && elStartOperation.selectedOptions[0]
          ? elStartOperation.selectedOptions[0].dataset.defaultOptions
          : '';
        if (elStartOverrides && json) {
          elStartOverrides.value = json;
        }

        if (elStartOperationLabel) {
          elStartOperationLabel.textContent = ops[0].name;
        }
      }

      setStartStatus('Ready.', 'ok');
    } catch (err) {
      setStartStatus('Failed to load operations: ' + (err && err.message ? err.message : String(err)), 'error');
    }
  }

  function setupStartForm() {
    if (!elStartForm || !elStartOperation || !elStartUrl) return;

    elStartOperation.addEventListener('change', () => {
      const selected = elStartOperation.selectedOptions && elStartOperation.selectedOptions[0]
        ? elStartOperation.selectedOptions[0]
        : null;
      const json = selected && selected.dataset ? selected.dataset.defaultOptions : '';
      if (elStartOverrides && json) {
        elStartOverrides.value = json;
      }

      if (elStartOperationLabel) {
        elStartOperationLabel.textContent = elStartOperation.value || 'n/a';
      }
    });

    elStartForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const operationName = String(elStartOperation.value || '').trim();
      const startUrl = normalizeStartUrl(elStartUrl.value);
      if (!operationName) {
        setStartStatus('Choose an operation.', 'error');
        return;
      }
      if (!startUrl) {
        setStartStatus('Enter a start URL.', 'error');
        return;
      }

      if (elStartUrl && elStartUrl.value !== startUrl) {
        elStartUrl.value = startUrl;
      }

      let overrides = undefined;
      const overridesRaw = elStartOverrides ? String(elStartOverrides.value || '').trim() : '';
      if (overridesRaw) {
        try {
          overrides = JSON.parse(overridesRaw);
        } catch (err) {
          setStartStatus('Overrides must be valid JSON: ' + (err && err.message ? err.message : String(err)), 'error');
          return;
        }
      }

      setStartStatus('Starting…', 'working');
      try {
        const endpoint = '/api/v1/crawl/operations/' + encodeURIComponent(operationName) + '/start';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ startUrl, overrides })
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || String(res.status));
        }

        const payload = await res.json();
        const jobId = payload && payload.jobId ? String(payload.jobId) : '';
        setStartStatus('Started' + (jobId ? (' job ' + jobId) : '') + '.', 'ok');
        await refreshSnapshot();
      } catch (err) {
        setStartStatus('Start failed: ' + (err && err.message ? err.message : String(err)), 'error');
      }
    });

    loadAvailability();
  }

  async function sendAction(id, action) {
    const job = jobs.get(id);
    const base = job && job.inProcess && extraJobsApiPath ? extraJobsApiPath : jobsApiPath;
    const endpoint = base + '/' + encodeURIComponent(id) + '/' + action;
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || String(res.status));
      }
      await refreshSnapshot();
    } catch (err) {
      elStatus.textContent = 'Action failed (' + action + ' ' + id + '): ' + (err && err.message ? err.message : String(err));
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (!action || !id) return;
    sendAction(id, action);
  });

  refreshSnapshot();
  setupStartForm();

  async function replayTelemetryHistory() {
    if (!telemetryHistoryPath) return;
    try {
      const res = await fetch(telemetryHistoryPath, { headers: { Accept: 'application/json' } });
      const payload = await res.json();
      if (payload && Array.isArray(payload.items)) {
        for (const item of payload.items) {
          applyTelemetryEvent(item);
        }
        render();
      }
    } catch (_) {}
  }

  replayTelemetryHistory();

  function connectLiveUpdatesLegacy() {
    if (typeof EventSource !== 'function') {
      elStatus.textContent = 'This browser does not support EventSource; showing snapshots only.';
      return;
    }

    const es = new EventSource(eventsPath);

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload && payload.type === 'crawl:telemetry' && payload.data) {
          applyTelemetryEvent(payload.data);
          const healthBits = [];
          if (telemetryUiHealth.parseErrors) healthBits.push('parseErrors=' + telemetryUiHealth.parseErrors);
          if (telemetryUiHealth.orphanEvents) healthBits.push('orphanEvents=' + telemetryUiHealth.orphanEvents);
          elStatus.textContent = 'Live update: ' + (payload.data.type || 'telemetry') + (healthBits.length ? (' (' + healthBits.join(', ') + ')') : '');
          render();
        }
      } catch (err) {
        telemetryUiHealth.parseErrors += 1;
        telemetryUiHealth.lastParseErrorAt = Date.now();
        telemetryUiHealth.lastParseErrorMessage = err && err.message ? err.message : String(err || 'parse error');
        elStatus.textContent = 'Live update parse error (' + telemetryUiHealth.parseErrors + '): ' + telemetryUiHealth.lastParseErrorMessage;
      }
    };

    es.onerror = () => {
      elStatus.textContent = 'Live updates disconnected (SSE error). Refresh to retry.';
    };
  }

  function connectLiveUpdatesRemoteObservable() {
    const adapters = window.RemoteObservableClientAdapters;
    if (!adapters || typeof adapters.createRemoteObservableConnection !== 'function') {
      return false;
    }

    try {
      const conn = adapters.createRemoteObservableConnection({ basePath: remoteObsBasePath, autoConnect: true });
      const ev = adapters.toEvented(conn);

      ev.on('next', (evt) => {
        applyTelemetryEvent(evt);
        elStatus.textContent = 'Live update: ' + (evt && evt.type ? evt.type : 'telemetry');
        render();
      });

      ev.on('error', () => {
        elStatus.textContent = 'Live updates disconnected (remote observable error). Refresh to retry.';
      });

      return true;
    } catch (_) {
      return false;
    }
  }

  const remoteOk = connectLiveUpdatesRemoteObservable();
  if (!remoteOk) {
    connectLiveUpdatesLegacy();
  }
})();
`;
}

class CrawlStatusPage extends Standard_Web_Page {
  constructor(spec = {}) {
    super(spec);
    this.__type_name = 'crawl_status_page';
    this.title = 'Crawl Status';

    this.jobsApiPath = spec.jobsApiPath || '/api/crawls';
    this.extraJobsApiPath = spec.extraJobsApiPath || null;
    this.eventsPath = spec.eventsPath || '/api/crawl-telemetry/events';
    this.telemetryHistoryPath = spec.telemetryHistoryPath || '/api/crawl-telemetry/history';
  }

  compose() {
    super.compose();

    if (this.head && this.head.title) {
      this.head.title.add('Crawl Status');
    }

    const ctx = this.context;

    // Shared RemoteObservable browser modules (plain scripts; no bundler required).
    // These enable an Evented/Rx/async-iterator interface over the crawl telemetry stream.
    if (this.head) {
      const s1 = new Control({ context: ctx, tagName: 'script' });
      s1.dom.attributes.src = '/shared-remote-obs/RemoteObservableShared.js';
      this.head.add(s1);

      const s2 = new Control({ context: ctx, tagName: 'script' });
      s2.dom.attributes.src = '/shared-remote-obs/RemoteObservableClient.js';
      this.head.add(s2);

      const s3 = new Control({ context: ctx, tagName: 'script' });
      s3.dom.attributes.src = '/shared-remote-obs/RemoteObservableClientAdapters.js';
      this.head.add(s3);
    }

    const style = new Control({ context: ctx, tagName: 'style' });
    style.add(`
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 16px; color: #111; }
header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h1 { font-size: 18px; margin: 0; }
.meta { font-size: 12px; color: #555; }
.links a { margin-right: 12px; font-size: 12px; }

  .start { margin-top: 12px; padding: 12px 12px; border: 1px solid #eee; border-radius: 10px; background: #fafafa; }
  .start h2 { font-size: 13px; margin: 0 0 8px 0; }
  .start-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  .start-field { display: flex; flex-direction: column; gap: 4px; }
  .start-field label { font-size: 11px; color: #444; }
  .start-field input, .start-field select, .start-field textarea { font-size: 12px; padding: 7px 10px; border: 1px solid #ddd; border-radius: 8px; }
  .start-field input { min-width: 360px; }
  .start-actions { display: flex; gap: 8px; }
  .start-actions button { font-size: 12px; padding: 8px 12px; }
  details.start-advanced { margin-top: 10px; }
  details.start-advanced summary { cursor: pointer; font-size: 12px; color: #444; }
  .start-advanced-body { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
  .start-advanced-body textarea { min-width: 420px; min-height: 70px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  .start-meta { margin-top: 6px; font-size: 12px; color: #555; }
  .start-status { margin-top: 8px; font-size: 12px; color: #444; }
  .start-status--ok { color: #1b6e2d; }
  .start-status--working { color: #2457c5; }
  .start-status--error { color: #b3261e; }

table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; vertical-align: top; }
th { text-align: left; background: #fafafa; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 10px; border: 1px solid #ddd; background: #fff; }
.badge.running { border-color: #7aa7ff; background: #eef4ff; }
.badge.paused { border-color: #ffb347; background: #fff3e6; }
.badge.done { border-color: #6cc070; background: #eefaf0; }
.badge.error { border-color: #ff7a7a; background: #ffecec; }
.muted { color: #666; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
.row-actions button { font-size: 12px; padding: 4px 8px; margin-right: 6px; }
.footer { margin-top: 12px; font-size: 12px; color: #666; }

  .pbar { width: 140px; height: 8px; border-radius: 999px; background: #f0f0f0; border: 1px solid #ddd; overflow: hidden; position: relative; }
  .pbar__fill { height: 100%; background: linear-gradient(90deg, #7aa7ff, #6cc070); width: 0%; }
  .pbar--indeterminate .pbar__fill { width: 40%; position: absolute; left: -40%; animation: pbarSlide 1200ms ease-in-out infinite; }
  @keyframes pbarSlide { 0% { left: -40%; } 50% { left: 60%; } 100% { left: 100%; } }

  .job-last { margin-top: 6px; }
  .job-events { margin-top: 6px; }
  .job-events summary { cursor: pointer; color: #444; }
  .job-events-body { margin-top: 6px; max-height: 160px; overflow: auto; border: 1px solid #eee; background: #fafafa; padding: 6px; }
  .job-event-line { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 11px; margin-bottom: 4px; white-space: pre-wrap; }

  .job-tree { margin-top: 6px; }
  .job-tree summary { cursor: pointer; color: #444; }
  .ptree { margin-top: 8px; border: 1px solid #eee; background: #fafafa; padding: 8px; }
  .ptree-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
  .ptree-node { margin-bottom: 8px; }
  .ptree-node.is-active .ptree-label { font-weight: 700; }
  .ptree-row { display: flex; justify-content: space-between; gap: 8px; }
  .ptree-label { font-size: 12px; color: #222; }
  .ptree-meta { font-size: 11px; color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  .ptree-bar { height: 8px; border-radius: 999px; border: 1px solid #ddd; background: #f0f0f0; overflow: hidden; margin-top: 4px; position: relative; }
  .ptree-bar__fill { height: 100%; width: 0%; background: linear-gradient(90deg, #7aa7ff, #6cc070); }
  .ptree-bar--indeterminate .ptree-bar__fill { width: 40%; position: absolute; left: -40%; animation: pbarSlide 1200ms ease-in-out infinite; }
`);
    this.head.add(style);

    const body = this.body || this;

    const header = new Control({ context: ctx, tagName: 'header' });
    body.add(header);

    const left = new Control({ context: ctx, tagName: 'div' });
    header.add(left);

    const h1 = new Control({ context: ctx, tagName: 'h1' });
    h1.add('Ongoing Crawl Status');
    left.add(h1);

    const meta = new Control({ context: ctx, tagName: 'div' });
    meta.dom.attributes.class = 'meta';
    meta.add('Live updates via ');
    const metaEvents = new Control({ context: ctx, tagName: 'span' });
    metaEvents.dom.attributes.class = 'mono';
    metaEvents.add(this.eventsPath);
    meta.add(metaEvents);
    meta.add(', snapshots via ');
    const metaJobs = new Control({ context: ctx, tagName: 'span' });
    metaJobs.dom.attributes.class = 'mono';
    metaJobs.add(this.jobsApiPath);
    meta.add(metaJobs);
    left.add(meta);

    const links = new Control({ context: ctx, tagName: 'div' });
    links.dom.attributes.class = 'links';
    header.add(links);

    const linkApiDocs = new Control({ context: ctx, tagName: 'a' });
    linkApiDocs.dom.attributes.href = '/api-docs';
    linkApiDocs.add('API docs');
    links.add(linkApiDocs);

    const linkJobs = new Control({ context: ctx, tagName: 'a' });
    linkJobs.dom.attributes.href = this.jobsApiPath;
    linkJobs.add('jobs JSON');
    links.add(linkJobs);

    if (this.extraJobsApiPath) {
      const linkJobs2 = new Control({ context: ctx, tagName: 'a' });
      linkJobs2.dom.attributes.href = this.extraJobsApiPath;
      linkJobs2.add('in-process jobs JSON');
      links.add(linkJobs2);
    }

    const linkEvents = new Control({ context: ctx, tagName: 'a' });
    linkEvents.dom.attributes.href = this.eventsPath;
    linkEvents.add('events stream');
    links.add(linkEvents);

    const linkHistory = new Control({ context: ctx, tagName: 'a' });
    linkHistory.dom.attributes.href = this.telemetryHistoryPath;
    linkHistory.add('telemetry history');
    links.add(linkHistory);

    const linkObserver = new Control({ context: ctx, tagName: 'a' });
    linkObserver.dom.attributes.href = '/crawl-observer';
    linkObserver.add('crawl observer');
    links.add(linkObserver);

    const startPanel = new Control({ context: ctx, tagName: 'section' });
    startPanel.dom.attributes.class = 'start';
    body.add(startPanel);

    const startTitle = new Control({ context: ctx, tagName: 'h2' });
    startTitle.add('Start crawl (in-process)');
    startPanel.add(startTitle);

    const form = new Control({ context: ctx, tagName: 'form' });
    form.dom.attributes.id = 'crawl-start-form';
    startPanel.add(form);

    const row = new Control({ context: ctx, tagName: 'div' });
    row.dom.attributes.class = 'start-row';
    form.add(row);

    const urlField = new Control({ context: ctx, tagName: 'div' });
    urlField.dom.attributes.class = 'start-field';
    row.add(urlField);
    const urlLabel = new Control({ context: ctx, tagName: 'label' });
    urlLabel.dom.attributes.for = 'crawl-start-url';
    urlLabel.add('Start URL');
    urlField.add(urlLabel);
    const urlInput = new Control({ context: ctx, tagName: 'input' });
    urlInput.dom.attributes.id = 'crawl-start-url';
    urlInput.dom.attributes.type = 'url';
    urlInput.dom.attributes.placeholder = 'https://example.com';
    urlField.add(urlInput);

    const actions = new Control({ context: ctx, tagName: 'div' });
    actions.dom.attributes.class = 'start-actions';
    row.add(actions);
    const startBtn = new Control({ context: ctx, tagName: 'button' });
    startBtn.dom.attributes.type = 'submit';
    startBtn.add('Start');
    actions.add(startBtn);

    const metaRow = new Control({ context: ctx, tagName: 'div' });
    metaRow.dom.attributes.class = 'start-meta';
    metaRow.add('Operation: ');
    const opLabel = new Control({ context: ctx, tagName: 'span' });
    opLabel.dom.attributes.class = 'mono';
    opLabel.dom.attributes.id = 'crawl-start-operation-label';
    opLabel.add('Loading…');
    metaRow.add(opLabel);
    startPanel.add(metaRow);

    const advanced = new Control({ context: ctx, tagName: 'details' });
    advanced.dom.attributes.class = 'start-advanced';
    advanced.dom.attributes.id = 'crawl-start-advanced';
    startPanel.add(advanced);
    const advancedSummary = new Control({ context: ctx, tagName: 'summary' });
    advancedSummary.add('Advanced (operation + overrides)');
    advanced.add(advancedSummary);

    const advancedBody = new Control({ context: ctx, tagName: 'div' });
    advancedBody.dom.attributes.class = 'start-advanced-body';
    advanced.add(advancedBody);

    const opField = new Control({ context: ctx, tagName: 'div' });
    opField.dom.attributes.class = 'start-field';
    advancedBody.add(opField);
    const opSelectLabel = new Control({ context: ctx, tagName: 'label' });
    opSelectLabel.dom.attributes.for = 'crawl-start-operation';
    opSelectLabel.add('Operation');
    opField.add(opSelectLabel);
    const opSelect = new Control({ context: ctx, tagName: 'select' });
    opSelect.dom.attributes.id = 'crawl-start-operation';
    const opInitial = new Control({ context: ctx, tagName: 'option' });
    opInitial.dom.attributes.value = '';
    opInitial.add('Loading…');
    opSelect.add(opInitial);
    opField.add(opSelect);

    const ovField = new Control({ context: ctx, tagName: 'div' });
    ovField.dom.attributes.class = 'start-field';
    advancedBody.add(ovField);
    const ovLabel = new Control({ context: ctx, tagName: 'label' });
    ovLabel.dom.attributes.for = 'crawl-start-overrides';
    ovLabel.add('Overrides (JSON)');
    ovField.add(ovLabel);
    const ovText = new Control({ context: ctx, tagName: 'textarea' });
    ovText.dom.attributes.id = 'crawl-start-overrides';
    ovText.dom.attributes.placeholder = '{ }';
    ovField.add(ovText);

    const startStatus = new Control({ context: ctx, tagName: 'div' });
    startStatus.dom.attributes.id = 'crawl-start-status';
    startStatus.dom.attributes.class = 'start-status';
    startStatus.add('Loading operations…');
    startPanel.add(startStatus);

    const status = new Control({ context: ctx, tagName: 'div' });
    status.dom.attributes.id = 'status';
    status.dom.attributes.class = 'footer';
    status.add('Loading…');
    body.add(status);

    const table = new Control({ context: ctx, tagName: 'table' });
    body.add(table);

    const thead = new Control({ context: ctx, tagName: 'thead' });
    table.add(thead);

    const headRow = new Control({ context: ctx, tagName: 'tr' });
    thead.add(headRow);

    const columns = ['Job', 'Status', 'Progress', 'Visited', 'Downloaded', 'Errors', 'Queue', 'Last Activity', 'Controls'];
    for (const col of columns) {
      const th = new Control({ context: ctx, tagName: 'th' });
      th.add(col);
      headRow.add(th);
    }

    const tbody = new Control({ context: ctx, tagName: 'tbody' });
    tbody.dom.attributes.id = 'rows';
    table.add(tbody);

    const script = new Control({ context: ctx, tagName: 'script' });
    script.add(buildCrawlStatusClientScript({
      jobsApiPath: this.jobsApiPath,
      extraJobsApiPath: this.extraJobsApiPath,
      eventsPath: this.eventsPath,
      telemetryHistoryPath: this.telemetryHistoryPath
    }));
    body.add(script);
  }
}

function renderCrawlStatusPageHtml({
  jobsApiPath = '/api/crawls',
  extraJobsApiPath = null,
  eventsPath = '/api/crawl-telemetry/events',
  telemetryHistoryPath = '/api/crawl-telemetry/history',
  req,
  res
} = {}) {
  const context = new Server_Page_Context({
    req,
    res,
    pool: {}
  });

  const page = new CrawlStatusPage({
    context,
    jobsApiPath,
    extraJobsApiPath,
    eventsPath,
    telemetryHistoryPath
  });

  if (!page._composed) {
    page.compose();
  }

  return page.all_html_render();
}

module.exports = {
  CrawlStatusPage,
  renderCrawlStatusPageHtml
};
