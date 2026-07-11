'use strict';

/**
 * Electron main for the crawl-display E2E check. Self-contained: starts a
 * stub unified-app server in-process (real crawl-status SSR + fake jobs API
 * + live SSE telemetry with remoteFetch), opens a real BrowserWindow on it,
 * waits for the SSE-driven UI updates, then asserts the rendered DOM and
 * captures a screenshot.
 *
 * Run via crawlDisplay.electron.check.js (handles xvfb on headless Linux),
 * or directly:
 *   npx electron src/ui/electron/unifiedApp/checks/crawlDisplay.electron.main.js \
 *     [--screenshot out.png] [--keep-open]
 *
 * Exit code 0 = all assertions passed.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const { app: electronApp, BrowserWindow } = require('electron');

const { renderCrawlStatusPageHtml } = require(path.join(__dirname, '..', '..', '..', 'server', 'crawlStatus', 'CrawlStatusPage'));

function parseStringArg(flag, defaultValue = null) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return defaultValue;
}

const FAKE_JOB = {
  id: 'e2e-job-1',
  mode: 'in-process',
  operationName: 'basicArticleCrawl',
  startUrl: 'https://www.theguardian.com/uk',
  status: 'running',
  createdAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  finishedAt: null,
  paused: false,
  abortRequested: false,
  error: null,
  progress: {
    visited: 24, downloaded: 22, saved: 9, errors: 1, queued: 41,
    docsDownloadedPerSec: 2.5, docsSavedPerSec: 1.1, networkMbPerSec: 0.8, savedMbPerSec: 0.3,
    remoteFetch: null,
    updatedAt: new Date().toISOString()
  }
};

const REMOTE_FETCH = {
  enabled: true,
  workerUrl: 'http://oracle-worker.example:8081',
  healthy: true,
  requestsSent: 22, requestsOk: 21, requestsError: 1,
  bytesTransferred: 3 * 1024 * 1024, batchesSent: 22, localFallbacks: 0,
  lastFetchAt: new Date().toISOString(), lastFetchMs: 210,
  lastUrl: 'https://www.theguardian.com/world/france'
};

function startStubServer() {
  const sseClients = new Set();
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/crawl-status')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderCrawlStatusPageHtml({}));
      return;
    }
    if (url.startsWith('/api/v1/crawl/jobs')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: [FAKE_JOB] }));
      return;
    }
    if (url.startsWith('/api/v1/crawl/operations')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: [{ name: 'basicArticleCrawl', label: 'Basic article crawl' }] }));
      return;
    }
    if (url.startsWith('/api/crawl-telemetry/events')) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write(':ok\n\n');
      sseClients.add(res);
      res.on('close', () => sseClients.delete(res));
      return;
    }
    if (url.startsWith('/api/crawl-telemetry/history')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: [] }));
      return;
    }
    if (url.startsWith('/shared-remote-obs/')) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('// stub\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body>stub home <a href="/?app=crawl-status">Open Crawl Status</a></body></html>');
  });

  // Push progress telemetry (with remoteFetch) every 400ms, as the real
  // TelemetryIntegration broadcast does.
  const pushTimer = setInterval(() => {
    const event = {
      type: 'crawl:progress',
      data: {
        visited: FAKE_JOB.progress.visited,
        queued: FAKE_JOB.progress.queued,
        errors: FAKE_JOB.progress.errors,
        remoteFetch: REMOTE_FETCH
      }
    };
    const frame = `data: ${JSON.stringify({ type: 'crawl:telemetry', data: event })}\n\n`;
    for (const client of sseClients) {
      try { client.write(frame); } catch (_) {}
    }
  }, 400);
  pushTimer.unref?.();

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function run() {
  const screenshotPath = parseStringArg('--screenshot');
  const keepOpen = process.argv.includes('--keep-open');
  const { server, port } = await startStubServer();

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: keepOpen,
    backgroundColor: '#101113',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  await win.loadURL(`http://127.0.0.1:${port}/crawl-status`);
  // Allow the jobs poll + a few SSE frames to arrive and render.
  await new Promise((r) => setTimeout(r, 2500));

  const results = await win.webContents.executeJavaScript(`(() => {
    const $ = (sel) => document.querySelector(sel);
    const text = (sel) => ($(sel) ? $(sel).textContent : null);
    const strip = $('[data-crawl-remote-fetch-strip]');
    return {
      hasJobsTable: Boolean($('#rows')),
      jobRowVisited: text('#rows tr td:nth-child(4)'),
      throughputQueue: text('[data-crawl-throughput-stat="queue"]'),
      remoteStripPresent: Boolean(strip),
      remoteStripActive: strip ? strip.getAttribute('data-crawl-remote-fetch-active') === 'true' : false,
      remoteStripHealth: strip ? strip.getAttribute('data-crawl-remote-fetch-health') : null,
      remoteWorkerText: text('[data-crawl-remote-fetch-stat="worker"]'),
      remoteOk: text('[data-crawl-remote-fetch-stat="ok"]'),
      remoteMb: text('[data-crawl-remote-fetch-stat="mb"]')
    };
  })()`);

  const assertions = [
    ['jobs table rendered', results.hasJobsTable],
    ['job row shows visited count', results.jobRowVisited === '24'],
    ['throughput queue populated', results.throughputQueue === '41'],
    ['remote-fetch strip present', results.remoteStripPresent],
    ['remote-fetch strip activated by SSE', results.remoteStripActive],
    ['remote worker health = healthy', results.remoteStripHealth === 'healthy'],
    ['remote worker URL shown', (results.remoteWorkerText || '').includes('oracle-worker.example:8081')],
    ['remote OK count shown', results.remoteOk === '21'],
    ['remote MB shown', results.remoteMb === '3.00']
  ];

  let failed = 0;
  for (const [name, ok] of assertions) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  }
  if (failed) console.log('DOM state:', JSON.stringify(results, null, 2));

  if (screenshotPath) {
    const image = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(path.resolve(screenshotPath)), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());
    console.log(`screenshot: ${screenshotPath}`);
  }

  console.log(failed === 0
    ? '✅ electron crawl display E2E passed'
    : `❌ electron crawl display E2E failed (${failed})`);

  if (!keepOpen) {
    server.close();
    electronApp.exit(failed === 0 ? 0 : 1);
  }
}

electronApp.whenReady().then(() => {
  run().catch((err) => {
    console.error('E2E error:', err);
    electronApp.exit(2);
  });
});
