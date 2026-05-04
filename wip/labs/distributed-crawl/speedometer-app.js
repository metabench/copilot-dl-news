#!/usr/bin/env node
/**
 * Distributed Crawl Speedometer - Electron App
 *
 * Real-time visualization of distributed crawl performance.
 * Shows throughput, gauge, queue state, and errors for distributed crawls.
 *
 * Run with:
 *   npx electron labs/distributed-crawl/speedometer-app.js --port=3098
 */

let electron;
let app;
let BrowserWindow;
try {
  electron = require('electron');
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
} catch (err) {
  electron = null;
}

if (require.main === module && (!electron || !app || !BrowserWindow)) {
  console.error('Electron runtime not available. Use: npx electron labs/distributed-crawl/speedometer-app.js');
  process.exit(1);
}
const express = require('express');
const path = require('path');
const { TaskEventWriter } = require('../../src/db/TaskEventWriter');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '3098', 10);
const REMOTE_WORKER = 'http://144.21.42.149:8081';
const BATCH_SIZE = 25;
const MAX_QUEUE_PREVIEW = 200;

let mainWindow = null;
let server = null;
let pushEvent = () => {};
let errorQueryStmt = null;

function createServer() {
  const expressApp = express();
  expressApp.use(express.json());

  // Live SSE channel for UI
  const clients = new Set();
  const sendToClients = (payload) => {
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach(client => client.write(event));
  };
  pushEvent = sendToClients;

  expressApp.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  // Metrics ingress from workers
  expressApp.post('/metrics', (req, res) => {
    const data = req.body;
    sendToClients(data);
    res.json({ ok: true });
  });

  // Dashboard HTML
  expressApp.get('/', (req, res) => {
    res.send(getDashboardHtml());
  });

  // Serve extracted CSS
  expressApp.get('/speedometer.css', (req, res) => {
    res.type('text/css').sendFile(path.join(__dirname, 'speedometer.css'));
  });

  // Surface recent DB errors
  expressApp.get('/errors', (req, res) => {
    if (!errorQueryStmt) {
      res.status(503).json({ ok: false, error: 'Errors not ready yet' });
      return;
    }
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const rows = errorQueryStmt.all('distributed-crawl', limit).map((row) => {
        let payload;
        try { payload = JSON.parse(row.payload || '{}'); } catch (_) { payload = row.payload; }
        return { ...row, payload };
      });
      res.json({ ok: true, errors: rows });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return expressApp;
}

function loadQueuedUrls(db, limit, afterId = 0) {
  const poolSize = Math.max(limit * 4, limit);
  const rows = db.prepare(`
    SELECT u.id, u.url, u.host
    FROM urls u
    WHERE u.id NOT IN (
      SELECT url_id FROM http_responses WHERE url_id IS NOT NULL
    ) AND u.id > ?
    ORDER BY u.id
    LIMIT ?
  `).all(afterId, poolSize);

  if (!rows.length) return { items: [], maxId: afterId };

  const buckets = new Map();
  rows.forEach((row) => {
    if (!buckets.has(row.host)) buckets.set(row.host, []);
    buckets.get(row.host).push(row);
  });

  const items = [];
  while (items.length < limit && buckets.size) {
    for (const [host, list] of buckets) {
      if (!list.length) {
        buckets.delete(host);
        continue;
      }
      items.push(list.shift());
      if (items.length >= limit) break;
    }
  }

  const maxId = rows.reduce((max, row) => Math.max(max, row.id), afterId);
  return { items, maxId };
}

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function parseUrlParts(url) {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname || '/' };
  } catch (err) {
    return { host: null, path: null };
  }
}

function countQueued(db, afterId = 0) {
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM urls u
    WHERE u.id NOT IN (
      SELECT url_id FROM http_responses WHERE url_id IS NOT NULL
    ) AND u.id > ?
  `).get(afterId);
  return row?.cnt || 0;
}

function getDashboardHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Distributed Crawl Speedometer</title>
  <link rel="stylesheet" href="/speedometer.css">
</head>
<body>
  <div class="header">
    <h1>🚀 Distributed Crawl Speedometer</h1>
    <div class="status-bar">
      <span id="sseStatus" class="badge disconnected">SSE: disconnected</span>
      <span id="lastEvent" class="badge subtle">Last event: --</span>
    </div>
    <div class="hint-bar">Shortcuts: S = start 20, X = stop</div>
  </div>
  <div class="dashboard">
    <div class="panel speedometer">
      <div class="gauge-container">
        <svg viewBox="0 0 200 120" width="300" height="180">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style="stop-color:#00ff88"/>
              <stop offset="50%" style="stop-color:#00d4ff"/>
              <stop offset="100%" style="stop-color:#ff4444"/>
            </linearGradient>
          </defs>
          <path class="gauge-bg" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke-width="12"/>
          <path id="gaugeFill" class="gauge-fill" d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke-width="12" stroke-dasharray="251" stroke-dashoffset="251"/>
        </svg>
      </div>
      <div class="speed-value" id="speedValue">0</div>
      <div class="speed-unit">URLs per second</div>
      <div class="batch-label" id="batchLabel">Waiting for first batch…</div>
      <div class="progress-summary" id="progressSummary">Pending start…</div>
      <div class="gauge-tooltip" id="gaugeTooltip">Gauge shows recent throughput. Hover for progress.</div>
    </div>
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-value" id="totalUrls">0</div>
        <div class="stat-label">Total URLs</div>
      </div>
      <div class="stat-card stat-ok">
        <div class="stat-value" id="okCount">0</div>
        <div class="stat-label">OK (2xx)</div>
      </div>
      <div class="stat-card stat-errors">
        <div class="stat-value" id="errorCount">0</div>
        <div class="stat-label">Errors</div>
      </div>
      <div class="stat-card stat-time">
        <div class="stat-value" id="avgTime">0</div>
        <div class="stat-label">Avg ms/URL</div>
      </div>
    </div>
    <div class="panel chart-container">
      <div class="panel-title">Throughput History</div>
      <canvas id="historyChart"></canvas>
    </div>
    <div class="panel queue-panel">
      <div class="panel-title">Queue Preview</div>
      <div class="queue-header">
        <div class="queue-legend">
          <span title="Awaiting fetch"><span class="dot" style="background:#666;"></span>Queued</span>
          <span title="Currently being fetched"><span class="dot" style="background:#00d4ff;"></span>In progress</span>
          <span title="Fetched successfully"><span class="dot" style="background:#00ff88;"></span>Done</span>
          <span title="Failed or timed out"><span class="dot" style="background:#ff7b7b;"></span>Error</span>
        </div>
        <div class="queue-controls">
          <button class="btn-ghost" id="queueSortToggle" onclick="toggleQueueSort()" title="Toggle status-first sorting">Sort by status</button>
          <button class="btn-ghost" onclick="renderQueue()" title="Re-render queue">Refresh view</button>
        </div>
      </div>
      <div id="queueSummary" class="queue-summary">Waiting to start…</div>
      <div id="queueList" class="queue-list">
        <div class="queue-empty">Queue will appear when the crawl starts.</div>
      </div>
    </div>
    <div class="controls">
      <button class="btn" onclick="startCrawl(20)">Start (20 URLs)</button>
      <button class="btn" onclick="startCrawl(50)">Start (50 URLs)</button>
      <button class="btn" onclick="startCrawl(100)">Start (100 URLs)</button>
      <button class="btn btn-stop" onclick="stopCrawl()">Stop</button>
    </div>
    <div class="panel log-container" id="logContainer">
      <div class="log-filters">
        <button class="log-filter active" onclick="setLogFilter('all', this)">All</button>
        <button class="log-filter" onclick="setLogFilter('error', this)">Errors</button>
        <button class="log-filter" onclick="setLogFilter('ok', this)">Batches</button>
        <button class="log-filter" onclick="setLogFilter('info', this)">Info</button>
      </div>
      <div class="log-entry">Ready. Click Start to begin crawling.</div>
    </div>
    <div class="panel errors-panel">
      <div class="panel-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span>Recent Errors (DB)</span>
        <div class="error-actions">
          <button class="btn-ghost" onclick="loadErrors()">Reload</button>
        </div>
      </div>
      <div id="errorList" class="error-list">
        <div class="queue-empty">No errors recorded.</div>
      </div>
    </div>
  </div>
  <script>
    const MAX_SPEED = 100;
    const history = [];
    const MAX_HISTORY = 60;
    let eventSource = null;
    let isRunning = false;
    const queueMap = new Map();
    let queueOrder = [];
    const MAX_QUEUE_DISPLAY = 200;
    const errorEntries = [];
    const MAX_ERROR_ENTRIES = 100;
    let logFilter = 'all';
    let queueSortByStatus = false;
    let targetTotal = null;
    let lastTargetKnown = null;
    let processedTotal = 0;
    let okTotal = 0;
    let errorTotal = 0;

    function createEl(tag, className, text) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (typeof text === 'string') el.textContent = text;
      return el;
    }

    function trimUrl(url) {
      try {
        const u = new URL(url);
        return u.hostname + (u.pathname.length > 50 ? u.pathname.slice(0, 47) + '…' : u.pathname || '/');
      } catch (err) {
        return url || '';
      }
    }

    function statusLabel(item) {
      const status = item.status || 'queued';
      if (status === 'done') return (item.statusCode || 200) + ' ✓';
      if (status === 'error') return (item.statusCode || 'ERR');
      if (status === 'in-progress') return 'in progress';
      return 'queued';
    }

    function renderProgressSummary() {
      const el = document.getElementById('progressSummary');
      if (!el) return;
      if (!targetTotal) {
        el.textContent = 'Pending start…';
        return;
      }
      const remaining = Math.max(0, targetTotal - processedTotal);
      el.textContent = processedTotal + ' processed • ' + remaining + ' remaining (target ' + targetTotal + ')';
    }

    function renderQueue() {
      const list = document.getElementById('queueList');
      const summary = document.getElementById('queueSummary');
      if (!list || !summary) return;

      list.textContent = '';

      if (!queueOrder.length) {
        summary.textContent = 'No queue loaded yet.';
        list.appendChild(createEl('div', 'queue-empty', 'Waiting for queue data...'));
        return;
      }

      const doneCount = queueOrder.filter(id => queueMap.get(id)?.status === 'done').length;
      const total = queueOrder.length;
      const shown = Math.min(MAX_QUEUE_DISPLAY, total);
      summary.textContent = shown + ' shown of ' + total + ' queued • ' + doneCount + ' done';

      const statusOrder = { 'error': 0, 'in-progress': 1, 'queued': 2, 'done': 3 };
      const displayOrder = queueSortByStatus
        ? [...queueOrder].sort((a, b) => {
            const sa = statusOrder[queueMap.get(a)?.status || 'queued'] || 4;
            const sb = statusOrder[queueMap.get(b)?.status || 'queued'] || 4;
            return sa - sb;
          })
        : queueOrder;

      displayOrder.slice(0, MAX_QUEUE_DISPLAY).forEach(id => {
        const item = queueMap.get(id) || { status: 'queued' };
        const status = item.status || 'queued';
        const wrapper = createEl('div', 'queue-item queue-' + status);
        wrapper.appendChild(createEl('div', 'queue-url', trimUrl(item.url || '')));
        const meta = createEl('div', 'queue-meta');
        meta.appendChild(createEl('span', '', statusLabel(item)));
        meta.appendChild(createEl('span', '', '#' + id));
        wrapper.appendChild(meta);
        list.appendChild(wrapper);
      });

      if (!list.children.length) {
        list.appendChild(createEl('div', 'queue-empty', 'Queue empty'));
      }
    }

    function updateQueue(items) {
      if (!Array.isArray(items)) return;
      items.forEach(item => {
        if (!item.id) return;
        const previous = queueMap.get(item.id) || {};
        queueMap.set(item.id, { ...previous, ...item });
        if (!queueOrder.includes(item.id)) queueOrder.push(item.id);
      });
      renderQueue();
    }

    function resetQueue(items) {
      queueMap.clear();
      queueOrder = [];
      updateQueue(items);
    }

    function toggleQueueSort() {
      queueSortByStatus = !queueSortByStatus;
      const btn = document.getElementById('queueSortToggle');
      if (btn) {
        btn.classList.toggle('active', queueSortByStatus);
        btn.textContent = queueSortByStatus ? 'Sort by arrival' : 'Sort by status';
      }
      renderQueue();
    }
    
    const canvas = document.getElementById('historyChart');
    const ctx = canvas.getContext('2d');
    
    function drawChart() {
      const width = canvas.width = canvas.offsetWidth;
      const height = canvas.height = canvas.offsetHeight;
      
      ctx.clearRect(0, 0, width, height);
      
      if (history.length < 2) return;
      
      const maxVal = Math.max(...history, MAX_SPEED / 2);
      
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = height - (height * i / 4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      history.forEach((val, i) => {
        const x = (i / (MAX_HISTORY - 1)) * width;
        const y = height - (val / maxVal) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,212,255,0.1)';
      ctx.fill();
    }
    
    function updateGauge(speed) {
      const ratio = Math.min(speed / MAX_SPEED, 1);
      const offset = 251 * (1 - ratio);
      document.getElementById('gaugeFill').style.strokeDashoffset = offset;
      document.getElementById('speedValue').textContent = speed.toFixed(1);
    }
    
    function addLog(msg, type = 'info') {
      const container = document.getElementById('logContainer');
      const entry = createEl('div', 'log-entry ' + type, new Date().toLocaleTimeString() + ' ' + msg);
      entry.dataset.kind = type;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;

      const logEntries = Array.from(container.querySelectorAll('.log-entry'));
      if (logEntries.length > 100) {
        const excess = logEntries.length - 100;
        for (let i = 0; i < excess; i++) {
          const node = logEntries[i];
          node.parentNode && node.parentNode.removeChild(node);
        }
      }

      applyLogFilter();
    }

    function setLogFilter(kind, el) {
      logFilter = kind;
      document.querySelectorAll('.log-filter').forEach(btn => btn.classList.remove('active'));
      if (el) el.classList.add('active');
      applyLogFilter();
    }

    function applyLogFilter() {
      const entries = document.querySelectorAll('#logContainer .log-entry');
      entries.forEach(entry => {
        const kind = entry.dataset.kind || 'info';
        entry.style.display = (logFilter === 'all' || logFilter === kind) ? '' : 'none';
      });
    }

    function renderErrors() {
      const list = document.getElementById('errorList');
      if (!list) return;
      list.textContent = '';
      if (!errorEntries.length) {
        list.appendChild(createEl('div', 'queue-empty', 'No errors recorded.'));
        return;
      }
      errorEntries.forEach((e) => {
        const item = createEl('div', 'error-item');
        const meta = createEl('div', 'error-meta');
        meta.appendChild(createEl('span', '', e.ts ? new Date(e.ts).toLocaleTimeString() : 'now'));
        meta.appendChild(createEl('span', '', e.severity || 'error'));
        item.appendChild(meta);
        item.appendChild(createEl('div', 'error-msg', e.message || e.error || 'Unknown error'));
        if (e.url) {
          const urlLine = createEl('div', 'error-msg');
          urlLine.style.opacity = '0.8';
          urlLine.style.fontSize = '12px';
          urlLine.textContent = e.url;
          item.appendChild(urlLine);
        }
        list.appendChild(item);
      });
    }

    function addErrorEntry(entry) {
      errorEntries.unshift(entry);
      if (errorEntries.length > MAX_ERROR_ENTRIES) errorEntries.pop();
      renderErrors();
    }
    
    function connectSSE() {
      eventSource = new EventSource('/events');
      
      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const lastEventEl = document.getElementById('lastEvent');
        if (lastEventEl) lastEventEl.textContent = 'Last event: ' + new Date().toLocaleTimeString();
        const sseEl = document.getElementById('sseStatus');
        if (sseEl) {
          sseEl.textContent = 'SSE: connected';
          sseEl.classList.remove('disconnected');
          sseEl.classList.add('connected');
        }
        
        if (data.type === 'batch_complete') {
          const speed = parseFloat(data.throughput) || 0;
          
          updateGauge(speed);
          history.push(speed);
          if (history.length > MAX_HISTORY) history.shift();
          drawChart();
          
          document.getElementById('totalUrls').textContent = data.totalUrls || 0;
          document.getElementById('okCount').textContent = data.ok || 0;
          document.getElementById('errorCount').textContent = data.errors || 0;
          document.getElementById('avgTime').textContent = (data.avgMs || 0).toFixed(0);
          const batchLabel = document.getElementById('batchLabel');
          if (batchLabel) {
            batchLabel.textContent = 'Batch throughput: ' + data.ok + ' ok / ' + data.errors + ' errors';
          }
          
          addLog('Batch: ' + data.ok + ' OK, ' + data.errors + ' errors, ' + speed.toFixed(1) + ' URLs/sec', 
                 data.errors > 0 ? 'error' : 'ok');
        }
        
        if (data.type === 'crawl_start') {
          addLog('Crawl started: ' + data.urlCount + ' URLs');
          isRunning = true;
        }
        
        if (data.type === 'queue_init') {
          resetQueue((data.items || []).map(item => ({ ...item, status: item.status || 'queued' })));
          addLog('Queue loaded: ' + (data.items?.length || 0) + ' items');
        }

        if (data.type === 'queue_update') {
          updateQueue(data.items || []);
        }

        if (data.type === 'crawl_complete') {
          addLog('Crawl complete! Total: ' + data.totalUrls + ' URLs in ' + (data.totalMs/1000).toFixed(1) + 's', 'ok');
          isRunning = false;
        }

        if (data.type === 'error_log') {
          addLog('Error: ' + (data.message || data.error || 'unknown'), 'error');
          addErrorEntry(data);
        }
      };
      
      eventSource.onerror = () => {
        addLog('Connection lost. Reconnecting...', 'error');
        const sseEl = document.getElementById('sseStatus');
        if (sseEl) {
          sseEl.textContent = 'SSE: disconnected';
          sseEl.classList.remove('connected');
          sseEl.classList.add('disconnected');
        }
        setTimeout(connectSSE, 2000);
      };
    }

    async function loadErrors() {
      try {
        const resp = await fetch('/errors?limit=50');
        const data = await resp.json();
        if (data.ok && Array.isArray(data.errors)) {
          data.errors.forEach(e => addErrorEntry({
            ts: e.ts,
            severity: e.severity,
            message: (e.payload && (e.payload.error || e.payload.message)) || e.event_type,
            url: e.payload && e.payload.url,
          }));
        }
      } catch (err) {
        addLog('Failed to load errors: ' + err.message, 'error');
      }
    }
    
    async function startCrawl(count) {
      if (isRunning) {
        addLog('Crawl already running', 'error');
        return;
      }
      
      try {
        const resp = await fetch('/start-crawl?count=' + count, { method: 'POST' });
        const data = await resp.json();
        if (!data.ok) {
          addLog('Failed to start: ' + data.error, 'error');
        }
      } catch (err) {
        addLog('Error: ' + err.message, 'error');
      }
    }
    
    async function stopCrawl() {
      try {
        await fetch('/stop-crawl', { method: 'POST' });
        addLog('Stop requested');
      } catch (err) {
        addLog('Error: ' + err.message, 'error');
      }
    }
    
    window.onload = () => {
      connectSSE();
      drawChart();
      renderQueue();
      renderErrors();
      loadErrors();
      window.addEventListener('resize', drawChart);
      setLogFilter('all');
    };
  </script>
</body>
</html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: 'Distributed Crawl Speedometer',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
  
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) server.close();
  });
}

async function autoStartAllQueued() {
  try {
    await fetch(`http://localhost:${PORT}/start-crawl?all=1`, { method: 'POST' });
    console.log('Auto-started crawl for all queued URLs');
  } catch (err) {
    console.error('Auto-start crawl failed:', err.message);
  }
}

async function main() {
  console.log('[main] Starting...');
  const db = require('better-sqlite3')('data/news.db');
  console.log('[main] Database opened');
  errorQueryStmt = db.prepare(`
    SELECT ts, event_type, event_category, severity, payload
    FROM task_events
    WHERE task_type = ? AND COALESCE(severity, 'info') != 'info'
    ORDER BY ts DESC
    LIMIT ?
  `);

  const expressApp = createServer();

  let crawlAbort = null;
  const eventWriter = new TaskEventWriter(db, { batchSize: 200, flushInterval: 500 });
  let currentTaskId = null;
  const logEvent = (eventType, data = {}, extra = {}) => {
    if (!currentTaskId) return;
    eventWriter.write({
      taskType: 'distributed-crawl',
      taskId: currentTaskId,
      eventType,
      data,
      ...extra,
    });
  };
  const logAndBroadcastError = (data) => {
    const parts = data.url ? parseUrlParts(data.url) : {};
    const severity = data.severity || ((data.statusCode && data.statusCode >= 500) ? 'error' : (data.statusCode && data.statusCode >= 400) ? 'warn' : 'info');
    const payload = { stage: data.stage, ...data, ...parts, severity };
    logEvent('error', payload, { severity });
    pushEvent({ type: 'error_log', ...payload, severity, ts: new Date().toISOString() });
  };
  let queueSnapshot = [];

  expressApp.post('/start-crawl', async (req, res) => {
    const allMode = req.query.all === '1' || (req.query.count || '').toString().toLowerCase() === 'all';
    const requestedCount = allMode ? Number.MAX_SAFE_INTEGER : Math.min(parseInt(req.query.count || '100', 10), MAX_QUEUE_PREVIEW);
    let responded = false;

    try {
      crawlAbort = new AbortController();
      queueSnapshot = [];

      let afterId = 0;
      let firstChunk = true;
      let previewed = 0;
      let remaining = requestedCount;

      const totalQueuedAvailable = countQueued(db, afterId);
      const totalTarget = allMode ? totalQueuedAvailable : Math.min(requestedCount, totalQueuedAvailable);

      currentTaskId = `speedometer-${Date.now()}`;
      logEvent('crawl:start', { mode: allMode ? 'all' : 'count', requestedCount, batchSize: BATCH_SIZE, totalTarget });

      const started = Date.now();
      let processed = 0;
      let ok = 0;
      let errors = 0;

      while (!crawlAbort?.signal?.aborted && remaining > 0) {
        const batchLimit = allMode ? BATCH_SIZE : Math.min(BATCH_SIZE, remaining);
        const { items: urls, maxId } = loadQueuedUrls(db, batchLimit, afterId);
        if (!urls.length) break;
        afterId = maxId;

        if (firstChunk) {
          res.json({ ok: true, count: allMode ? 'all' : urls.length });
          responded = true;
          pushEvent({ type: 'crawl_start', urlCount: allMode ? 'all' : urls.length, totalTarget });
          firstChunk = false;
        }

        const queueItems = urls.map(u => ({ id: u.id, url: u.url, host: u.host, status: 'queued' }));
        queueSnapshot.push(...queueItems);

        const previewRoom = MAX_QUEUE_PREVIEW - previewed;
        if (previewRoom > 0) {
          const slice = queueItems.slice(0, previewRoom);
          previewed += slice.length;
          pushEvent({ type: processed === 0 ? 'queue_init' : 'queue_update', items: slice });
        }

        pushEvent({
          type: 'queue_update',
          items: queueItems.map(item => ({ id: item.id, status: 'in-progress' })),
        });

        const batchStarted = Date.now();
        let result;
        try {
          const workerResp = await fetch(`${REMOTE_WORKER}/batch`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              requests: urls.map(u => ({ url: u.url, method: 'HEAD', urlId: u.id })),
              maxConcurrency: 30,
              batchSize: BATCH_SIZE,
              timeoutMs: 15000,
            }),
            signal: crawlAbort?.signal,
          });
          result = await workerResp.json();
        } catch (err) {
          result = {
            results: urls.map(u => ({ urlId: u.id, error: err.message })),
            summary: { count: urls.length, ok: 0, errors: urls.length },
          };
          logAndBroadcastError({ stage: 'worker-request', error: err.message, afterId, batchSize: urls.length });
        }

        const batchMs = Date.now() - batchStarted;
        const resultsArray = result.results || [];
        processed += result.summary?.count || urls.length;
        ok += result.summary?.ok || 0;
        errors += result.summary?.errors || 0;

        const urlById = new Map(urls.map(u => [u.id, u.url]));

        resultsArray.forEach((r) => {
          const urlId = r.urlId || r.id;
          const statusCode = r.statusCode || r.httpStatus;
          const hasError = Boolean(r.error) || (typeof r.ok === 'boolean' && !r.ok) || (statusCode && statusCode >= 400);
          if (hasError) {
            logAndBroadcastError({
              urlId,
              url: urlById.get(urlId),
              statusCode,
              error: r.error,
            });
          }
        });

        pushEvent({
          type: 'queue_update',
          items: resultsArray.map(r => ({
            id: r.urlId || r.id,
            status: r.error ? 'error' : 'done',
            statusCode: r.statusCode || r.httpStatus || (r.ok ? 200 : undefined),
          })),
        });

        pushEvent({
          type: 'batch_complete',
          totalUrls: processed,
          ok,
          errors,
          totalTarget,
          remaining: Math.max(0, totalTarget - processed),
          throughput: (processed / Math.max(1, (Date.now() - started) / 1000)).toFixed(1),
          avgMs: batchMs / Math.max(1, urls.length),
        });
        logEvent('batch:complete', {
          processed,
          ok,
          errors,
          batchMs,
          batchSize: urls.length,
          afterId,
        });

        remaining -= urls.length;
      }

      if (!responded) {
        res.json({ ok: false, error: 'No queued URLs found' });
        responded = true;
      }

      pushEvent({
        type: 'crawl_complete',
        totalUrls: processed,
        totalMs: Date.now() - started,
        totalTarget,
        remaining: Math.max(0, totalTarget - processed),
      });
      logEvent('crawl:end', {
        processed,
        ok,
        errors,
        durationMs: Date.now() - started,
        totalTarget,
      });
      currentTaskId = null;

    } catch (err) {
      console.error('Crawl error:', err.message);
      pushEvent({ type: 'crawl_complete', totalUrls: 0, totalMs: 0, error: err.message });
      logAndBroadcastError({ stage: 'crawl', error: err.message });
      if (!responded && !res.headersSent) {
        res.json({ ok: false, error: err.message });
      }
      currentTaskId = null;
    }
  });

  expressApp.post('/stop-crawl', (req, res) => {
    if (crawlAbort) {
      crawlAbort.abort();
      crawlAbort = null;
    }
    pushEvent({ type: 'crawl_complete', totalUrls: 0, totalMs: 0, cancelled: true });
    logEvent('crawl:end', { cancelled: true });
    currentTaskId = null;
    res.json({ ok: true });
  });

  server = expressApp.listen(PORT, () => {
    console.log(`[main] Speedometer server running on http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    console.error('[main] Server error:', err.message);
  });

  console.log('[main] Waiting for app.whenReady()...');
  await app.whenReady();
  console.log('[main] App ready, creating window...');
  createWindow();
  setTimeout(autoStartAllQueued, 500);

  app.on('window-all-closed', () => {
    eventWriter.destroy();
    db.close();
    if (server) server.close();
    app.quit();
  });
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getDashboardHtml };
