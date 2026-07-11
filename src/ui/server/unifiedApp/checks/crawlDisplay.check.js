'use strict';

/**
 * Crawl Display Check — verifies the unified app (the server the Electron
 * shell spawns; see src/ui/electron/unifiedApp/main.js) can display a crawl:
 *
 *   1. /crawl-status renders the crawl page inside the app (jobs table,
 *      throughput strip, remote-fetch strip, client renderers).
 *   2. /api/v1/crawl/jobs answers with the jobs snapshot (incl. `progress`).
 *   3. /api/crawl-telemetry/events is a live SSE stream (content-type check).
 *   4. The crawl-status sub-app is registered in the shell nav (iframe app).
 *
 * Run against a running server:  node src/ui/server/unifiedApp/checks/crawlDisplay.check.js [port]
 * (start one with: npm run ui:unified   — or launch the Electron app, which
 * spawns the same server on port 3170: start-crawler-app.cmd)
 */

const http = require('http');

const PORT = Number(process.argv[2]) || Number(process.env.UNIFIED_PORT) || 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { console.log(`✓ ${name}`); passed++; }
  else { console.log(`✗ ${name}`); failed++; }
}

function get(path, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timeout for ${path}`)); });
  });
}

/** Open the SSE stream just long enough to verify headers, then abort. */
function probeSse(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      const contentType = res.headers['content-type'] || '';
      res.destroy();
      resolve({ status: res.statusCode, contentType });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(new Error(`timeout for ${path}`)); });
  });
}

async function run() {
  console.log(`=== Crawl Display Check (unified app @ ${BASE_URL}) ===\n`);

  // 1. Crawl status page renders with all display surfaces.
  const page = await get('/crawl-status');
  assert('GET /crawl-status → 200', page.status === 200);
  assert('page has jobs table', page.body.includes('id="rows"'));
  assert('page has throughput strip', page.body.includes('data-crawl-throughput-strip'));
  assert('page has remote-fetch strip', page.body.includes('data-crawl-remote-fetch-strip'));
  assert('page ships remote-fetch renderer', page.body.includes('renderRemoteFetch'));
  assert('page ships SSE subscription', page.body.includes('initTelemetryStream'));

  // 2. Jobs API answers with items; progress field present on job objects.
  const jobs = await get('/api/v1/crawl/jobs');
  assert('GET /api/v1/crawl/jobs → 200', jobs.status === 200);
  let items = null;
  try { items = JSON.parse(jobs.body).items; } catch (_) {}
  assert('jobs payload has items[]', Array.isArray(items));
  if (Array.isArray(items) && items.length > 0) {
    assert('job objects carry progress field', 'progress' in items[0]);
  } else {
    console.log('  (no active jobs — progress field asserted via registry tests)');
  }

  // 3. Telemetry SSE endpoint streams.
  const sse = await probeSse('/api/crawl-telemetry/events');
  assert('GET /api/crawl-telemetry/events → 200', sse.status === 200);
  assert('SSE content-type', sse.contentType.includes('text/event-stream'));

  // 4. Shell nav registers the crawl-status sub-app (iframe).
  const home = await get('/');
  assert('GET / → 200', home.status === 200);
  assert('shell links crawl-status app', home.body.includes('crawl-status'));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(`\nCheck failed to run: ${err.message}`);
  console.error('Is the unified app server running? Start with: npm run ui:unified');
  process.exit(2);
});
