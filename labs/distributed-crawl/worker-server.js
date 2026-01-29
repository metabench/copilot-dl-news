const http = require('http');
const zlib = require('zlib');
const { setTimeout: delay } = require('timers/promises');

const WORKER_API_VERSION = '2026-01-09.1';

const WORKER_STARTED_AT = Date.now();

const RECENT_BATCH_SUMMARIES_LIMIT = 50;
const recentBatchSummaries = [];

const RECENT_FETCH_EVENTS_LIMIT = 250;
const recentFetchEvents = [];

const activeFetches = new Map();

const sseClients = new Set();
let nextSseClientId = 1;
let nextFetchId = 1;

function pushRecentFetchEvent(evt) {
  if (!evt || typeof evt !== 'object') return;
  recentFetchEvents.push(evt);
  while (recentFetchEvents.length > RECENT_FETCH_EVENTS_LIMIT) {
    recentFetchEvents.shift();
  }
}

function broadcastSseEvent(evtName, data) {
  const payload = `event: ${evtName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function tryGetHostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function snapshotActivity() {
  return {
    activeCount: activeFetches.size,
    active: Array.from(activeFetches.values()).slice(0, 200),
    recent: recentFetchEvents.slice(-RECENT_FETCH_EVENTS_LIMIT),
  };
}

function recordBatchSummary(summary) {
  if (!summary || typeof summary !== 'object') return;
  recentBatchSummaries.push({
    at: new Date().toISOString(),
    ...summary,
  });
  while (recentBatchSummaries.length > RECENT_BATCH_SUMMARIES_LIMIT) {
    recentBatchSummaries.shift();
  }
}

const WORKER_CAPABILITIES = Object.freeze({
  includeBodyBase64: true,
  gzipResponse: true,
  perRequestIncludeBody: true,
  batchIncludeBody: true,
  puppeteer: true,
  maxBodyBytes: true,
});

function getWorkerMeta() {
  return {
    apiVersion: WORKER_API_VERSION,
    capabilities: WORKER_CAPABILITIES,
    serverDefaults: {
      port: DEFAULTS.port,
      host: DEFAULTS.host,
      maxConcurrency: DEFAULTS.maxConcurrency,
      timeoutMs: DEFAULTS.timeoutMs,
      maxBodyBytes: DEFAULTS.maxBodyBytes,
      batchSize: DEFAULTS.batchSize,
    },
  };
}

function getOpenApiSpec({ baseUrl = 'http://0.0.0.0:8081' } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Distributed Crawl Worker API',
      version: WORKER_API_VERSION,
      description: 'Minimal batch fetch worker for distributed crawling + verification.',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/meta': {
        get: {
          summary: 'Worker metadata (version + capabilities)',
          responses: {
            '200': {
              description: 'Worker metadata',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/WorkerMeta' },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          summary: 'Health check',
          responses: {
            '200': {
              description: 'Health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'OpenAPI schema',
          responses: {
            '200': {
              description: 'OpenAPI schema',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/batch': {
        post: {
          summary: 'Fetch a batch of URLs in parallel',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/BatchResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid request',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '500': {
              description: 'Internal error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        WorkerMeta: {
          type: 'object',
          required: ['apiVersion', 'capabilities', 'serverDefaults'],
          properties: {
            apiVersion: { type: 'string' },
            capabilities: { type: 'object', additionalProperties: { type: 'boolean' } },
            serverDefaults: {
              type: 'object',
              properties: {
                port: { type: 'integer' },
                host: { type: 'string' },
                maxConcurrency: { type: 'integer' },
                timeoutMs: { type: 'integer' },
                maxBodyBytes: { nullable: true },
                batchSize: { type: 'integer' },
              },
            },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['ok', 'apiVersion'],
          properties: {
            ok: { type: 'boolean' },
            apiVersion: { type: 'string' },
          },
        },
        BatchRequest: {
          type: 'object',
          required: ['requests'],
          properties: {
            requests: {
              type: 'array',
              items: { $ref: '#/components/schemas/BatchRequestItem' },
            },
            maxConcurrency: { type: 'integer', minimum: 1 },
            timeoutMs: { type: 'integer', minimum: 1 },
            maxBodyBytes: { nullable: true },
            batchSize: { type: 'integer', minimum: 1 },
            includeBody: { type: 'boolean' },
            compress: { type: 'string', enum: ['gzip', 'none'] },
          },
        },
        BatchRequestItem: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] },
            includeBody: { type: 'boolean' },
            requestHeaders: { type: 'object', additionalProperties: { type: 'string' } },
            usePuppeteer: { type: 'boolean' },
            waitUntil: { type: 'string' },
            urlId: { nullable: true },
          },
        },
        BatchResponse: {
          type: 'object',
          required: ['summary', 'results'],
          properties: {
            summary: {
              type: 'object',
              required: ['count', 'ok', 'errors', 'durationMs', 'maxConcurrency', 'timeoutMs', 'apiVersion'],
              properties: {
                count: { type: 'integer' },
                ok: { type: 'integer' },
                errors: { type: 'integer' },
                durationMs: { type: 'integer' },
                maxConcurrency: { type: 'integer' },
                timeoutMs: { type: 'integer' },
                apiVersion: { type: 'string' },
              },
            },
            results: {
              type: 'array',
              items: { $ref: '#/components/schemas/BatchResultItem' },
            },
          },
        },
        BatchResultItem: {
          type: 'object',
          required: ['url', 'method', 'ok', 'durationMs'],
          properties: {
            url: { type: 'string' },
            method: { type: 'string' },
            status: { nullable: true },
            ok: { type: 'boolean' },
            durationMs: { type: 'integer' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            bodyBase64: { type: 'string', nullable: true },
            bodyBytes: { type: 'integer', nullable: true },
            error: { type: 'string', nullable: true },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string' },
            detail: { type: 'string', nullable: true },
          },
        },
      },
    },
  };
}

function writeJson(res, statusCode, body, { extraHeaders } = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'x-worker-api-version': WORKER_API_VERSION,
    ...(extraHeaders || {}),
  });
  res.end(payload);
}

function writeHtml(res, statusCode, html, { extraHeaders } = {}) {
  res.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'x-worker-api-version': WORKER_API_VERSION,
    ...(extraHeaders || {}),
  });
  res.end(html);
}

function getStatusJson({ serverOptions } = {}) {
  const meta = getWorkerMeta();
  const uptimeSec = Math.round(process.uptime());
  const mem = process.memoryUsage();
  return {
    ok: true,
    apiVersion: WORKER_API_VERSION,
    startedAt: new Date(WORKER_STARTED_AT).toISOString(),
    uptimeSec,
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    meta,
    server: {
      host: serverOptions?.host,
      port: serverOptions?.port,
      maxConcurrency: serverOptions?.maxConcurrency,
      timeoutMs: serverOptions?.timeoutMs,
      batchSize: serverOptions?.batchSize,
      maxBodyBytes: serverOptions?.maxBodyBytes,
    },
    recent: {
      batchSummaries: recentBatchSummaries.slice(-RECENT_BATCH_SUMMARIES_LIMIT),
      fetchEvents: recentFetchEvents.slice(-RECENT_FETCH_EVENTS_LIMIT),
    },
    activity: {
      activeFetches: activeFetches.size,
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return 'n/a';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function renderHealthPage(statusJson, { baseUrl } = {}) {
  const recent = (statusJson?.recent?.batchSummaries || []).slice(-10).reverse();
  const recentRows = recent.length
    ? recent
      .map((s) => {
        const ok = Number(s.ok || 0);
        const err = Number(s.errors || 0);
        const count = Number(s.count || 0);
        const dur = Number(s.durationMs || 0);
        return `<tr>
          <td>${escapeHtml(s.at || '')}</td>
          <td>${count}</td>
          <td>${ok}</td>
          <td>${err}</td>
          <td>${dur}</td>
        </tr>`;
      })
      .join('')
    : '<tr><td colspan="5">No batch activity yet.</td></tr>';

  const mem = statusJson?.memory || {};
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Worker Health</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; background:#0b1020; color:#e6e8ef; }
    .card { background:#111a33; border:1px solid #22305f; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .row { display:flex; gap: 16px; flex-wrap: wrap; }
    .k { color:#9fb0ff; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .v { font-size: 16px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align:left; padding: 8px; border-bottom: 1px solid #22305f; font-size: 13px; }
    th { color:#9fb0ff; font-weight: 600; }
    a { color:#9fb0ff; }
    .badge { display:inline-block; padding: 2px 8px; border-radius: 999px; background:#1d2b57; border:1px solid #2e3f7a; font-size: 12px; }
    .btn { display:inline-flex; align-items:center; gap:8px; padding: 8px 12px; border-radius: 10px; border:1px solid #2e3f7a; background:#0f1833; color:#e6e8ef; cursor:pointer; }
    .btn:hover { background:#132045; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .muted { color:#a9b0c7; }
    .ok { color:#8cffc7; }
    .warn { color:#ffd27a; }
    .err { color:#ff8aa1; }
  </style>
</head>
<body>
  <h1>Distributed Worker Health <span class="badge">OK</span></h1>

  <div class="card row">
    <div>
      <div class="k">API Version</div>
      <div class="v">${escapeHtml(statusJson.apiVersion)}</div>
    </div>
    <div>
      <div class="k">Uptime</div>
      <div class="v">${escapeHtml(statusJson.uptimeSec)}s</div>
    </div>
    <div>
      <div class="k">Node</div>
      <div class="v">${escapeHtml(statusJson.node?.version)} (${escapeHtml(statusJson.node?.platform)}/${escapeHtml(statusJson.node?.arch)})</div>
    </div>
    <div>
      <div class="k">Memory (RSS)</div>
      <div class="v">${escapeHtml(formatBytes(mem.rss))}</div>
    </div>
  </div>

  <div class="card">
    <div class="k">Endpoints</div>
    <div class="v">
      <a href="${baseUrl}/meta">/meta</a> ·
      <a href="${baseUrl}/health">/health</a> ·
      <a href="${baseUrl}/status.json">/status.json</a> ·
      <a href="${baseUrl}/events">/events</a> ·
      <a href="${baseUrl}/demo">/demo</a> ·
      <a href="${baseUrl}/openapi.json">/openapi.json</a>
    </div>
  </div>

  <div class="card">
    <div class="k">Live activity</div>
    <div class="row" style="align-items: center; margin-top: 8px;">
      <div>
        <div class="k">Active fetches</div>
        <div class="v"><span id="activeCount" class="mono">${escapeHtml(statusJson.activity?.activeFetches ?? 0)}</span></div>
      </div>
      <div>
        <div class="k">Stream</div>
        <div class="v"><span id="streamStatus" class="badge">connecting</span></div>
      </div>
      <div style="flex:1"></div>
      <div>
        <button class="btn" id="btnDemo">Run demo crawl (25)</button>
      </div>
    </div>

    <div class="muted" style="margin-top: 10px;">
      The stream shows per-request start/end events (method/status/duration/host). Use on a remote node for real load.
    </div>

    <div style="margin-top: 12px;">
      <table>
        <thead>
          <tr><th>At</th><th>Type</th><th>Host</th><th>Method</th><th>Status</th><th>ms</th><th>URL</th></tr>
        </thead>
        <tbody id="eventsTbody">
          <tr><td colspan="7" class="muted">Waiting for events…</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="k">Recent batch summaries (last 10)</div>
    <table>
      <thead>
        <tr><th>At</th><th>Count</th><th>OK</th><th>Errors</th><th>Duration (ms)</th></tr>
      </thead>
      <tbody>
        ${recentRows}
      </tbody>
    </table>
  </div>

  <script>
    (function () {
      const $ = (id) => document.getElementById(id);
      const tbody = $('eventsTbody');
      const activeCount = $('activeCount');
      const streamStatus = $('streamStatus');

      function esc(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function setStreamBadge(text, cls) {
        streamStatus.textContent = text;
        streamStatus.className = 'badge ' + (cls || '');
      }

      function renderRows(rows) {
        const max = 40;
        const last = rows.slice(-max).reverse();
        if (!last.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="muted">Waiting for events…</td></tr>';
          return;
        }
        tbody.innerHTML = last.map((e) => {
          const at = esc(e.at || '');
          const type = esc(e.type || '');
          const host = esc(e.host || '');
          const method = esc(e.method || '');
          const status = e.status == null ? '' : String(e.status);
          const ms = e.durationMs == null ? '' : String(e.durationMs);
          const url = esc(e.url || '');
          const statusCls = e.ok === true ? 'ok' : (e.ok === false ? 'err' : '');
          return (
            '<tr>' +
            '<td class="mono">' + at + '</td>' +
            '<td class="mono">' + type + '</td>' +
            '<td class="mono">' + host + '</td>' +
            '<td class="mono">' + method + '</td>' +
            '<td class="mono ' + statusCls + '">' + esc(status) + '</td>' +
            '<td class="mono">' + esc(ms) + '</td>' +
            '<td class="mono">' + url + '</td>' +
            '</tr>'
          );
        }).join('');
      }

      const rows = [];
      try {
        const es = new EventSource('/events');
        setStreamBadge('connecting');
        es.addEventListener('open', () => setStreamBadge('connected', 'ok'));
        es.addEventListener('error', () => setStreamBadge('error', 'err'));
        es.addEventListener('snapshot', (ev) => {
          try {
            const snap = JSON.parse(ev.data);
            if (snap && typeof snap.activeCount === 'number') activeCount.textContent = String(snap.activeCount);
            if (Array.isArray(snap.recent)) {
              rows.splice(0, rows.length, ...snap.recent);
              renderRows(rows);
            }
          } catch {}
        });
        es.addEventListener('fetch', (ev) => {
          try {
            const e = JSON.parse(ev.data);
            if (e && typeof e.activeCount === 'number') activeCount.textContent = String(e.activeCount);
            rows.push(e);
            renderRows(rows);
          } catch {}
        });
        es.addEventListener('ping', () => {});
      } catch {
        setStreamBadge('unsupported', 'warn');
      }

      const btn = $('btnDemo');
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Running…';
          try {
            const resp = await fetch('/demo', { method: 'POST' });
            const json = await resp.json().catch(() => ({}));
            console.log('demo result', json);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Run demo crawl (25)';
          }
        });
      }
    })();
  </script>
</body>
</html>`;
}

const DEFAULTS = {
  port: 8081,
  host: '0.0.0.0',
  maxConcurrency: 25,
  timeoutMs: 10000,
  maxBodyBytes: null, // null = no cap
  batchSize: 20,
};

function parseJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const obj = JSON.parse(buf.toString('utf8') || '{}');
        resolve(obj);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function pickHeaders(headers) {
  const allow = ['content-type', 'content-length', 'location', 'cache-control', 'etag', 'last-modified'];
  const out = {};
  for (const key of allow) {
    if (headers[key] !== undefined) out[key] = headers[key];
  }
  return out;
}

async function fetchOne(task, options) {
  const { url, method = 'HEAD', includeBody = false, requestHeaders = {}, usePuppeteer = false, waitUntil = 'domcontentloaded' } = task;
  const methodUpper = method.toUpperCase();
  const fetchId = nextFetchId++;
  const startedAt = Date.now();
  const host = tryGetHostFromUrl(url);
  const onEvent = typeof options?.onEvent === 'function' ? options.onEvent : null;

  const active = {
    id: fetchId,
    url,
    host,
    method: methodUpper,
    startedAt: new Date(startedAt).toISOString(),
  };
  activeFetches.set(fetchId, active);
  const startEvt = {
    type: 'start',
    id: fetchId,
    at: new Date().toISOString(),
    url,
    host,
    method: methodUpper,
    activeCount: activeFetches.size,
  };
  pushRecentFetchEvent(startEvt);
  broadcastSseEvent('fetch', startEvt);
  if (onEvent) {
    try {
      onEvent(startEvt);
    } catch {}
  }

  let result = {
    url,
    method: methodUpper,
    status: null,
    ok: false,
    durationMs: null,
    headers: {},
    bodyBase64: undefined,
    error: null,
  };
  try {
    if (usePuppeteer) {
      if (!options.puppeteerBrowser) throw new Error('Puppeteer requested but browser not available');
      const page = await options.puppeteerBrowser.newPage();
      try {
        const resp = await page.goto(url, { waitUntil, timeout: options.timeoutMs });
        result.status = resp?.status() ?? null;
        result.ok = resp ? resp.status() >= 200 && resp.status() < 400 : false;
        result.headers = resp ? pickHeaders(resp.headers()) : {};
        if (includeBody) {
          const html = await page.content();
          let buf = Buffer.from(html, 'utf8');
          if (options.maxBodyBytes != null && buf.length > options.maxBodyBytes) {
            buf = buf.subarray(0, options.maxBodyBytes);
          }
          result.bodyBase64 = buf.toString('base64');
          result.bodyBytes = buf.length;
        }
      } finally {
        await page.close();
      }
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error('timeout')), options.timeoutMs);
      try {
        const resp = await fetch(url, {
          method: methodUpper,
          signal: controller.signal,
          headers: requestHeaders,
        });
        result.status = resp.status;
        result.ok = resp.ok;
        try {
          // resp.headers is a Headers object in Node fetch.
          const asObj = Object.fromEntries(resp.headers.entries());
          result.headers = pickHeaders(asObj);
        } catch {
          result.headers = {};
        }
        if (includeBody && methodUpper !== 'HEAD') {
          const arrayBuf = await resp.arrayBuffer();
          let buf = Buffer.from(arrayBuf);
          if (options.maxBodyBytes != null && buf.length > options.maxBodyBytes) {
            buf = buf.subarray(0, options.maxBodyBytes);
          }
          result.bodyBase64 = buf.toString('base64');
          result.bodyBytes = buf.length;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (err) {
    result.error = err.message;
  } finally {
    result.durationMs = Date.now() - startedAt;
    activeFetches.delete(fetchId);

    const endEvt = {
      type: 'end',
      id: fetchId,
      at: new Date().toISOString(),
      url,
      host,
      method: methodUpper,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
      activeCount: activeFetches.size,
    };
    pushRecentFetchEvent(endEvt);
    broadcastSseEvent('fetch', endEvt);
    if (onEvent) {
      try {
        onEvent(endEvt);
      } catch {}
    }
  }
  return result;
}

async function runConcurrent(tasks, { maxConcurrency, handler }) {
  const results = new Array(tasks.length);
  let idx = 0;
  const runNext = () => {
    if (idx >= tasks.length) return Promise.resolve();
    const currentIndex = idx++;
    return Promise.resolve()
      .then(() => handler(tasks[currentIndex], currentIndex))
      .then((r) => {
        results[currentIndex] = r;
      })
      .catch((err) => {
        results[currentIndex] = { ok: false, error: err?.message || String(err) };
      })
      .then(runNext);
  };
  const workers = [];
  const concurrency = Math.max(1, Math.min(maxConcurrency || 1, tasks.length));
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(runNext());
  }
  await Promise.all(workers);
  return results;
}

function getDemoUrls() {
  // Intentionally a mix of front pages / topic pages across hosts.
  // Keep stable, low-cost endpoints; remote datacenter node can handle the concurrency.
  return [
    'https://www.bbc.com/news',
    'https://www.bbc.com/news/world',
    'https://www.theguardian.com/international',
    'https://www.theguardian.com/world',
    'https://www.reuters.com',
    'https://www.reuters.com/world',
    'https://apnews.com',
    'https://apnews.com/hub/world-news',
    'https://www.npr.org',
    'https://www.npr.org/sections/news/',
    'https://www.cbc.ca/news',
    'https://www.cbc.ca/news/world',
    'https://www.aljazeera.com',
    'https://www.aljazeera.com/news/',
    'https://www.dw.com/en/top-stories/s-9097',
    'https://www.france24.com/en/',
    'https://www.euronews.com',
    'https://www.euronews.com/news/international',
    'https://www.nbcnews.com',
    'https://www.cnn.com',
    'https://www.washingtonpost.com',
    'https://www.nytimes.com',
    'https://www.ft.com',
    'https://www.bloomberg.com',
    'https://www.wsj.com',
  ].slice(0, 25);
}

async function handleDemo(req, res, serverOptions) {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const urls = getDemoUrls();
  const maxConcurrency = Math.max(1, Math.min(serverOptions.maxConcurrency || 25, 200));
  const timeoutMs = serverOptions.timeoutMs || 10000;
  const startedAt = Date.now();

  // Use GET but do not include body by default; this is a concurrency exercise + link reachability.
  const tasks = urls.map((url) => ({ url, method: 'GET', includeBody: false }));
  const results = await runConcurrent(tasks, {
    maxConcurrency,
    handler: (task) => fetchOne(task, { timeoutMs, maxBodyBytes: serverOptions.maxBodyBytes }),
  });

  const durationMs = Date.now() - startedAt;
  const okCount = results.filter((r) => r && r.ok).length;
  const summary = {
    label: 'demo',
    count: results.length,
    ok: okCount,
    errors: results.length - okCount,
    durationMs,
    maxConcurrency,
    timeoutMs,
    apiVersion: WORKER_API_VERSION,
  };
  recordBatchSummary(summary);
  writeJson(res, 200, { summary, results });
}

async function handleBatch(req, res, serverOptions) {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  let body;
  try {
    body = await parseJson(req);
  } catch (err) {
    writeJson(res, 400, { error: 'Invalid JSON', detail: err.message });
    return;
  }
  const requests = Array.isArray(body.requests) ? body.requests : [];
  if (requests.length === 0) {
    writeJson(res, 400, { error: 'No requests provided' });
    return;
  }
  const maxConcurrency = Math.max(1, Math.min(body.maxConcurrency || serverOptions.maxConcurrency, 200));
  const timeoutMs = body.timeoutMs || serverOptions.timeoutMs;
  const maxBodyBytes = body.hasOwnProperty('maxBodyBytes') ? body.maxBodyBytes : serverOptions.maxBodyBytes;
  const batchSize = body.batchSize || serverOptions.batchSize;
  const globalIncludeBody = body.includeBody === true;  // Batch-level includeBody flag
  const needsPuppeteer = requests.some((r) => r.usePuppeteer);
  let puppeteerBrowser = null;
  if (needsPuppeteer) {
    try {
      // Lazy load to avoid cost when not needed.
      const puppeteer = require('puppeteer');
      puppeteerBrowser = await puppeteer.launch({ headless: 'new' });
    } catch (err) {
      writeJson(res, 500, { error: 'Puppeteer required but failed to launch', detail: err.message });
      return;
    }
  }

  const startedAt = Date.now();
  const results = new Array(requests.length);

  async function processChunk(chunk, offset) {
    let idx = 0;
    const runNext = () => {
      if (idx >= chunk.length) return Promise.resolve();
      const currentIndex = idx++;
      const absoluteIndex = offset + currentIndex;
      // Apply global includeBody if request doesn't specify
      const request = { ...chunk[currentIndex] };
      if (globalIncludeBody && request.includeBody === undefined) {
        request.includeBody = true;
      }
      return fetchOne(request, { timeoutMs, maxBodyBytes, puppeteerBrowser })
        .then((r) => {
          results[absoluteIndex] = r;
        })
        .catch((err) => {
          results[absoluteIndex] = { url: chunk[currentIndex]?.url, error: err.message };
        })
        .then(() => runNext());
    };
    const workers = [];
    const concurrency = Math.min(maxConcurrency, chunk.length);
    for (let i = 0; i < concurrency; i += 1) {
      workers.push(runNext());
    }
    await Promise.all(workers);
  }

  let offset = 0;
  while (offset < requests.length) {
    const chunk = requests.slice(offset, offset + batchSize);
    await processChunk(chunk, offset);
    offset += chunk.length;
  }

  if (puppeteerBrowser) {
    await puppeteerBrowser.close();
  }
  const durationMs = Date.now() - startedAt;
  const okCount = results.filter((r) => r && r.ok).length;
  
  const summary = {
      count: results.length,
      ok: okCount,
      errors: results.length - okCount,
      durationMs,
      maxConcurrency,
      timeoutMs,
      apiVersion: WORKER_API_VERSION,
  };
  recordBatchSummary(summary);

  const payload = JSON.stringify({
    summary,
    results,
  });

  // Compression support
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const compress = body.compress || (acceptEncoding.includes('gzip') ? 'gzip' : 'none');
  
  if (compress === 'gzip') {
    const compressed = zlib.gzipSync(payload);
    res.writeHead(200, { 
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'x-uncompressed-length': payload.length.toString(),
      'x-worker-api-version': WORKER_API_VERSION,
    });
    res.end(compressed);
  } else {
    res.writeHead(200, { 'content-type': 'application/json', 'x-worker-api-version': WORKER_API_VERSION });
    res.end(payload);
  }
}

function createWorkerServer(opts = {}) {
  const serverOptions = { ...DEFAULTS, ...opts };
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      const baseUrl = `http://${serverOptions.host}:${serverOptions.port}`;
      const statusJson = getStatusJson({ serverOptions });
      writeHtml(res, 200, renderHealthPage(statusJson, { baseUrl }));
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      const clientId = nextSseClientId++;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-worker-api-version': WORKER_API_VERSION,
      });
      res.write(': connected\n\n');

      const client = { id: clientId, res };
      sseClients.add(client);

      // Initial snapshot.
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshotActivity())}\n\n`);

      const keepAlive = setInterval(() => {
        try {
          res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        } catch {
          // ignore
        }
      }, 15000);

      req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(client);
      });
      return;
    }

    if (req.url === '/demo') {
      handleDemo(req, res, serverOptions).catch((err) => {
        writeJson(res, 500, { error: 'Internal error', detail: err.message });
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/status.json') {
      writeJson(res, 200, getStatusJson({ serverOptions }));
      return;
    }

    if (req.method === 'GET' && req.url === '/meta') {
      writeJson(res, 200, getWorkerMeta());
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      writeJson(res, 200, { ok: true, apiVersion: WORKER_API_VERSION });
      return;
    }

    if (req.method === 'GET' && req.url === '/openapi.json') {
      const baseUrl = `http://${serverOptions.host}:${serverOptions.port}`;
      writeJson(res, 200, getOpenApiSpec({ baseUrl }));
      return;
    }

    if (req.url === '/batch') {
      handleBatch(req, res, serverOptions).catch((err) => {
        writeJson(res, 500, { error: 'Internal error', detail: err.message });
      });
      return;
    }
    writeJson(res, 404, { error: 'Not found' });
  });
  return server.listen(serverOptions.port, serverOptions.host, () => {
    console.log(`Worker server listening on http://${serverOptions.host}:${serverOptions.port}`);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const portArg = args.find((a) => a.startsWith('--port='));
  const hostArg = args.find((a) => a.startsWith('--host='));
  const port = portArg ? Number(portArg.split('=')[1]) : DEFAULTS.port;
  const host = hostArg ? hostArg.split('=')[1] : DEFAULTS.host;
  createWorkerServer({ port, host });
}

module.exports = { createWorkerServer, WORKER_API_VERSION, WORKER_CAPABILITIES };
