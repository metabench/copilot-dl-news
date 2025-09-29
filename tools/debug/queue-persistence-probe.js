#!/usr/bin/env node
'use strict';

const http = require('http');
const path = require('path');

function parseArgs(argv) {
  const out = {
    startUrl: 'https://example.com',
    depth: 0,
    maxPages: 1,
    useSitemap: false,
    delayMs: 800,
    fakeRunner: true,
    fakeQueue: true
  };

  for (const raw of argv) {
    const [key, value = ''] = raw.split('=');
    const flag = key.replace(/^--/, '').toLowerCase();
    switch (flag) {
      case 'starturl':
        if (value) out.startUrl = value; break;
      case 'depth':
        out.depth = Number(value) || 0; break;
      case 'maxpages':
        out.maxPages = Number(value) || 1; break;
      case 'usesitemap':
        out.useSitemap = value === '1' || value.toLowerCase() === 'true'; break;
      case 'delay':
      case 'delayms':
        out.delayMs = Math.max(0, Number(value) || out.delayMs); break;
      case 'realrunner':
        out.fakeRunner = false; break;
      case 'realqueue':
        out.fakeQueue = false; break;
      case 'fakerunner':
        out.fakeRunner = value !== '0' && value.toLowerCase() !== 'false'; break;
      case 'fakequeue':
        out.fakeQueue = value !== '0' && value.toLowerCase() !== 'false'; break;
      default:
        // ignore unknown flags to stay lightweight
        break;
    }
  }

  return out;
}

const options = parseArgs(process.argv.slice(2));

// Set up diagnostic-friendly defaults while allowing caller overrides via env.
if (options.fakeRunner && process.env.UI_FAKE_RUNNER === undefined) {
  process.env.UI_FAKE_RUNNER = '1';
}
if (options.fakeQueue && process.env.UI_FAKE_QUEUE === undefined) {
  process.env.UI_FAKE_QUEUE = '1';
}
if (process.env.UI_QUEUE_DEBUG === undefined) {
  process.env.UI_QUEUE_DEBUG = '1';
}

const { createApp } = require(path.join(__dirname, '..', '..', 'src', 'ui', 'express', 'server'));

const app = createApp();
const server = http.createServer(app);

function post(port, targetPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { method: 'POST', port, path: targetPath, headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
          } catch (err) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

function get(port, targetPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ port, path: targetPath }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
          } catch (err) {
            resolve({ status: res.statusCode, text: data });
          }
        });
      })
      .on('error', reject);
  });
}

async function run() {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, () => resolve());
  });

  const { port } = server.address();
  console.log(`[queues-debug] UI server listening on port ${port}`);

  const payload = {
    startUrl: options.startUrl,
    depth: options.depth,
    maxPages: options.maxPages,
    useSitemap: options.useSitemap
  };

  console.log('[queues-debug] POST /api/crawl payload:', payload);
  const start = await post(port, '/api/crawl', payload);
  console.log('[queues-debug] response:', start);
  const jobId = start.json?.jobId || null;

  if (options.delayMs) {
    console.log(`[queues-debug] waiting ${options.delayMs}ms before inspecting queues...`);
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }

  const queues = await get(port, '/api/queues');
  console.log('[queues-debug] GET /api/queues ->', queues);

  if (jobId) {
    const events = await get(port, `/api/queues/${encodeURIComponent(jobId)}/events?limit=200`);
    console.log('[queues-debug] GET /api/queues/:id/events ->', events);
  } else {
    console.warn('[queues-debug] jobId missing in /api/crawl response; skipping events lookup');
  }
}

async function main() {
  const shutdown = () => {
    try {
      server.close(() => process.exit(0));
    } catch (_) {
      process.exit(0);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  try {
    await run();
  } catch (err) {
    console.error('[queues-debug] error:', err);
  } finally {
    shutdown();
  }
}

main();
