/**
 * @fileoverview HTTP integration tests for queue SSR pages
 * 
 * CRITICAL TESTING RULES:
 * - Tests must NEVER hang silently (GOLDEN RULE)
 * - Always add explicit timeouts: test('name', async () => {...}, 30000)
 * - Add progress logging for operations >5s
 * - Use timeout guards from src/test-utils/timeoutGuards.js
 * 
 * See: docs/TESTING_ASYNC_CLEANUP_GUIDE.md for complete patterns
 * See: docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md for utilities
 * See: AGENTS.md "Testing Guidelines" section
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer } = require('../server');
const { withTimeout } = require('../../../test-utils/timeoutGuards');

function getText(hostname, port, pathStr) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = http.get({ hostname, port, path: pathStr }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => buf += d);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf, location: res.headers.location }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error(`HTTP request to ${pathStr} timed out after 5s`));
      });
    }),
    6000,
    `getText(${pathStr})`
  );
}

function postJson(hostname, port, pathStr, body) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = http.request({ hostname, port, path: pathStr, method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => buf += d);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }); }
          catch { resolve({ status: res.statusCode, text: buf }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error(`HTTP POST to ${pathStr} timed out after 5s`));
      });
      req.end(body ? JSON.stringify(body) : undefined);
    }),
    6000,
    `postJson(${pathStr})`
  );
}

// Seeds a queue by starting the fake runner that emits QUEUE events
async function seedQueue(serverPort) {
  const r = await postJson('127.0.0.1', serverPort, '/api/crawl', { startUrl: 'https://ex.com', depth: 0, maxPages: 1, useSitemap: false });
  expect(r.status).toBe(202);
  // Allow a short time for events to persist
  await new Promise((r) => setTimeout(r, 250));
}

describe('Queues SSR pages and redirect', () => {
  let server;
  let port;
  const tmpDb = path.join(__dirname, 'tmp_gaz_ui.db');

  beforeAll(async () => {
    try { fs.unlinkSync(tmpDb); } catch (_) {}
    // Use a temp DB and enable fake runner with queue events
    process.env.DB_PATH = tmpDb;
    process.env.PORT = '0';
    process.env.UI_FAKE_RUNNER = '1';
    process.env.UI_FAKE_QUEUE = '1';
    server = await startServer();
    await new Promise((r) => setTimeout(r, 120));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : 3000;
    await seedQueue(port);
  });

  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
    try { delete process.env.DB_PATH; } catch (_) {}
    try { delete process.env.UI_FAKE_RUNNER; } catch (_) {}
    try { delete process.env.UI_FAKE_QUEUE; } catch (_) {}
    try { fs.unlinkSync(tmpDb); } catch (_) {}
  });

  test('GET /queues redirects to /queues/ssr', async () => {
    console.log('[TEST] Requesting /queues...');
    const res = await getText('127.0.0.1', port, '/queues');
    // Node http doesn't automatically follow redirects; status is 302 by default in express res.redirect
    expect([301,302,303,307,308]).toContain(res.status);
    expect(res.location).toBe('/queues/ssr');
  }, 10000);

  test('GET /queues/ssr renders HTML list and has Latest link', async () => {
    console.log('[TEST] Requesting /queues/ssr...');
    const page = await getText('127.0.0.1', port, '/queues/ssr');
    if (page.status !== 200) {
      console.error('Queues SSR failed with status:', page.status);
      console.error('Response text:', page.text.substring(0, 500));
    }
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toMatch(/<title>Queues<\/title>/);
    expect(page.text).toMatch(/Latest queue →/);
    // Should list at least one queue row linking to /queues/:id/ssr
    expect(page.text).toMatch(/\/queues\/[A-Za-z0-9_-]+\/ssr/);
  }, 10000);

  test('GET /queues/latest redirects to most recent queue', async () => {
    console.log('[TEST] Requesting /queues/latest...');
    const res = await getText('127.0.0.1', port, '/queues/latest');
    expect([301,302,303,307,308]).toContain(res.status);
    expect(res.location).toMatch(/^\/queues\/[^/]+\/ssr$/);
  }, 10000);

  test('GET /queues/:id/ssr renders detail with filters and nav', async () => {
    console.log('[TEST] Finding queue ID from list...');
    // Find a queue id from the list page
    const list = await getText('127.0.0.1', port, '/queues/ssr');
    const m = list.text.match(/\/queues\/([^/]+)\/ssr/);
    expect(m).toBeTruthy();
    const id = m[1];
    console.log(`[TEST] Requesting detail for queue ${id}...`);
    const detail = await getText('127.0.0.1', port, `/queues/${id}/ssr`);
    expect(detail.status).toBe(200);
    expect(detail.headers['content-type']).toMatch(/text\/html/);
  // Use \\s to preserve the whitespace matcher in the RegExp string
  expect(detail.text).toMatch(new RegExp(`Queue\\s*<span[^>]*>${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    // Filter UI elements should be present
    expect(detail.text).toMatch(/<select name="action">/);
    expect(detail.text).toMatch(/<input type="number" name="limit"/);
    // Events table header
    expect(detail.text).toMatch(/<thead><tr><th class="fit">#/);
  }, 10000);
});
