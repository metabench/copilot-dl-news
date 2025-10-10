/**
 * @fileoverview HTTP smoke tests for basic server functionality
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
const { startServer } = require('../server');

function expectHtmlMatch(html, pattern, label) {
  if (pattern.test(html)) return;
  const snippet = html.length > 400 ? `${html.slice(0, 400)}…` : html;
  throw new Error(`Expected ${label} to match ${pattern}, but it was missing. Snippet:\n${snippet}`);
}

function getText(hostname, port, path) {
  return new Promise((resolve, reject) => {
    http.get({ hostname, port, path }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: buf }));
    }).on('error', reject);
  });
}

describe('UI smoke over real HTTP', () => {
  let server;
  let port;
  beforeAll(async () => {
    const prev = process.env.PORT;
    process.env.PORT = '0';
    server = await startServer();
    // Reduced server startup wait from 100ms to 20ms
    await new Promise((r) => setTimeout(r, 20));
    const addr = server.address();
    port = typeof addr === 'object' ? addr.port : prev || 3000;
  });
  afterAll(async () => {
    if (server) {
      // Shutdown background services
      if (server.locals?.backgroundTaskManager) {
        await server.locals.backgroundTaskManager.shutdown();
      }
      if (server.locals?.compressionWorkerPool) {
        await server.locals.compressionWorkerPool.shutdown();
      }
      if (server.locals?.configManager?.stopWatching) {
        server.locals.configManager.stopWatching();
      }
      
      // Close database connection
      const db = server.locals?.getDb?.();
      if (db?.close) db.close();
      
      // Close HTTP server
      await new Promise((r) => server.close(r));
      
      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  test('serves index and basic pages', async () => {
    const root = await getText('127.0.0.1', port, '/');
    expect(root.status).toBe(200);
    expectHtmlMatch(root.text, /<html/i, 'root html shell');

    const index = await getText('127.0.0.1', port, '/index.html');
    expect(index.status).toBe(200);
    expectHtmlMatch(index.text, /Use sitemap|Start crawl/i, 'index page content');

    const domain = await getText('127.0.0.1', port, '/domain');
    expect(domain.status).toBe(200);
    expectHtmlMatch(domain.text, /Domain Summary|Recent Articles/i, 'domain page content');

    const url = await getText('127.0.0.1', port, '/url');
    expect(url.status).toBe(200);
    expectHtmlMatch(url.text, /URL Details|Fetches/i, 'url page content');
  });

  test('SSE emits seed message', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/events' }, (r) => {
        let buf = '';
        r.setEncoding('utf8');
        const timeout = setTimeout(() => {
          try { r.destroy(); } catch (_) {}
          resolve({ status: r.statusCode, text: buf });
        }, 1000);
        r.on('data', (d) => { buf += d; });
        r.on('end', () => { clearTimeout(timeout); resolve({ status: r.statusCode, text: buf }); });
      });
      req.on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/event: log/);
    expect(res.text).toMatch(/\[sse\] log stream enabled/);
  });
});
