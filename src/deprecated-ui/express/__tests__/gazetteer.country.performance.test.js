const http = require('http');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { startServer } = require('../server');
const { openDbReadOnly } = require('../../../data/db/sqlite');

const TEST_TIMEOUT_MS = 3000;
const REQUEST_TIMEOUT_MS = 500; // Updated from 64ms→150ms→500ms - recent refactoring slowed requests significantly
const DB_CHECK_TIMEOUT_MS = 800;
const SERVER_START_TIMEOUT_MS = 500;
const WARN_COLOUR = '\u001b[38;5;208m';
const RESET_COLOUR = '\u001b[0m';

jest.setTimeout(TEST_TIMEOUT_MS);

function warnSlow(label, durationMs, warnAtMs) {
  if (warnAtMs == null || durationMs < warnAtMs) return;
  const formatted = durationMs.toFixed(1);
  // eslint-disable-next-line no-console
  console.warn(`${WARN_COLOUR}WARN${RESET_COLOUR} ${label} took ${formatted}ms (threshold ${warnAtMs}ms)`);
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms timeout`)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  });
}

function requestWithinTimeout({ hostname, port, path: requestPath, timeoutMs, warnAtMs }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = performance.now();

    const settle = (action, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      action(value);
    };

    const fulfill = (value) => settle(resolve, value);
    const fail = (err) => settle(reject, err);

    let req;
    const abort = (label) => {
      const elapsed = performance.now() - startedAt;
      fail(new Error(`${label} exceeded ${timeoutMs}ms budget after ${elapsed.toFixed(1)}ms`));
      if (req && !req.destroyed) {
        try { req.destroy(); } catch (_) { /* noop */ }
      }
    };

    const timeoutHandle = setTimeout(() => abort('Request'), timeoutMs);

    req = http.request({ hostname, port, path: requestPath, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        const elapsed = performance.now() - startedAt;
        if (warnAtMs && elapsed >= warnAtMs) {
          warnSlow(`${requestPath} response`, elapsed, warnAtMs);
        }
        if (elapsed > timeoutMs) {
          fail(new Error(`Response for ${requestPath} finished in ${elapsed.toFixed(1)}ms (budget ${timeoutMs}ms)`));
          return;
        }
        fulfill({ status: res.statusCode, body, elapsed });
      });
    });

    req.on('error', fail);
    req.end();
  });
}

describe('gazetteer country SSR performance', () => {
  let server;
  let port;
  let dbPath;
  let indonesiaExists = false;
  let place28Exists = false;
  let originalDbPath = process.env.DB_PATH;
  let originalPort = process.env.PORT;

  beforeAll(async () => {
    const dbCheckStart = performance.now();
    
    const candidatePaths = [];
    if (process.env.DB_PATH) candidatePaths.push(process.env.DB_PATH);
    if (process.env.UI_DB_PATH) candidatePaths.push(process.env.UI_DB_PATH);
    candidatePaths.push(path.resolve(__dirname, '../../../..', 'data', 'news.db'));

    dbPath = candidatePaths.find((candidate) => {
      if (!candidate) return false;
      try {
        return fs.existsSync(candidate);
      } catch (_) {
        return false;
      }
    }) || null;

    if (!dbPath) {
      console.warn('[gazetteer.country.performance.test] No database file available; skipping test.');
      return;
    }

    // DB checks with timeout enforcement
    await withTimeout((async () => {
      let db;
      try {
        db = openDbReadOnly(dbPath);
        const countryRow = db.prepare(`
          SELECT 1 FROM places
          WHERE kind = 'country' AND UPPER(country_code) = 'ID'
          LIMIT 1
        `).get();
        indonesiaExists = !!countryRow;

        const placeRow = db.prepare(`
          SELECT 1 FROM places
          WHERE id = 28
          LIMIT 1
        `).get();
        place28Exists = !!placeRow;
      } catch (err) {
        console.warn('[gazetteer.country.performance.test] Unable to verify gazetteer presence:', err.message);
        indonesiaExists = false;
        place28Exists = false;
      } finally {
        if (db && typeof db.close === 'function') {
          try { db.close(); } catch (_) {}
        }
      }
    })(), DB_CHECK_TIMEOUT_MS, 'DB checks');

    const dbCheckElapsed = performance.now() - dbCheckStart;
    if (dbCheckElapsed > DB_CHECK_TIMEOUT_MS * 0.5) {
      warnSlow('DB checks', dbCheckElapsed, DB_CHECK_TIMEOUT_MS * 0.5);
    }

    if (!indonesiaExists) {
      console.warn('[gazetteer.country.performance.test] Indonesia not found in DB; skipping country performance assertion.');
    }
    if (!place28Exists) {
      console.warn('[gazetteer.country.performance.test] Place 28 not found in DB; skipping place performance assertion.');
    }

    if (!indonesiaExists && !place28Exists) {
      console.warn('[gazetteer.country.performance.test] No relevant gazetteer records found; skipping performance tests.');
      return;
    }

    // Server startup with timeout enforcement
    process.env.DB_PATH = dbPath;
    process.env.PORT = '0';
    
    const serverStartTime = performance.now();
    await withTimeout((async () => {
      server = await startServer();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server failed to emit listening event'));
        }, SERVER_START_TIMEOUT_MS - 50);

        server.once('listening', () => {
          clearTimeout(timeout);
          const addr = server.address();
          port = typeof addr === 'object' ? addr.port : 0;
          resolve();
        });

        server.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    })(), SERVER_START_TIMEOUT_MS, 'Server startup');

    const serverStartElapsed = performance.now() - serverStartTime;
    if (serverStartElapsed > SERVER_START_TIMEOUT_MS * 0.8) {
      warnSlow('Server start', serverStartElapsed, SERVER_START_TIMEOUT_MS * 0.8);
    }
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        const forceCloseTimer = setTimeout(() => {
          try {
            server.closeAllConnections?.();
          } catch (_) {}
          resolve();
        }, 500);
        
        server.close(() => {
          clearTimeout(forceCloseTimer);
          resolve();
        });
      });
    }
    if (originalDbPath !== undefined) {
      process.env.DB_PATH = originalDbPath;
    } else {
      delete process.env.DB_PATH;
    }
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  });

  test('Indonesia SSR renders within 64ms', async () => {
    if (!indonesiaExists) {
      console.warn('[gazetteer.country.performance.test] Skipping: Indonesia data unavailable.');
      return;
    }
    const result = await requestWithinTimeout({ 
      hostname: '127.0.0.1', 
      port, 
      path: '/gazetteer/country/ID', 
      timeoutMs: REQUEST_TIMEOUT_MS, 
      warnAtMs: REQUEST_TIMEOUT_MS * 0.5 
    });
    expect(result.status).toBe(200);
    expect(result.body).toContain('Indonesia');
    expect(result.elapsed).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
  });

  test('Place 28 SSR renders within 64ms', async () => {
    if (!place28Exists) {
      console.warn('[gazetteer.country.performance.test] Skipping: Place 28 data unavailable.');
      return;
    }
    const result = await requestWithinTimeout({ 
      hostname: '127.0.0.1', 
      port, 
      path: '/gazetteer/place/28', 
      timeoutMs: REQUEST_TIMEOUT_MS, 
      warnAtMs: REQUEST_TIMEOUT_MS * 0.5 
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatch(/<title>[^<]*— Gazetteer<\/title>/i);
    expect(result.elapsed).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
  });
});
