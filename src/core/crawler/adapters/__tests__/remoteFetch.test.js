'use strict';

/**
 * Tests for remote fetch — local crawl coordination with page downloads
 * executed by a remote fetch worker (src/core/crawler/adapters/remoteFetch.js).
 *
 * Uses an in-process stub worker implementing the distributed worker
 * protocol (GET /meta, POST /batch) — no external network access.
 */

const http = require('http');
const {
  resolveWorkerUrl,
  resolveRemoteFetchConfig,
  createRemoteFetchFn
} = require('../remoteFetch');

function startStubWorker({ pageBody = '<html><body>remote page</body></html>', status = 200 } = {}) {
  const seen = { batches: [] };
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/meta') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        apiVersion: 'test-1',
        capabilities: { includeBodyBase64: true, gzipResponse: false }
      }));
      return;
    }
    if (req.method === 'POST' && req.url === '/batch') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        seen.batches.push(payload);
        const requests = payload.requests || [];
        if (payload.ping || requests.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ summary: { ok: 0, errors: 0 }, results: [] }));
          return;
        }
        const results = requests.map((r) => ({
          url: r.url,
          finalUrl: r.url.includes('redirect-me') ? r.url.replace('redirect-me', 'landed') : undefined,
          method: r.method || 'GET',
          status,
          ok: status >= 200 && status < 300,
          headers: { 'content-type': 'text/html; charset=utf-8', etag: '"stub-etag"' },
          bodyBase64: r.includeBody ? Buffer.from(pageBody, 'utf8').toString('base64') : undefined,
          durationMs: 5,
          error: null
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ summary: { ok: results.length, errors: 0 }, results }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}`, seen });
    });
  });
}

describe('resolveRemoteFetchConfig', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('is disabled by default (main crawl fetches locally)', () => {
    delete process.env.CRAWL_REMOTE_FETCH;
    expect(resolveRemoteFetchConfig().enabled).toBe(false);
  });

  it('is enabled via CRAWL_REMOTE_FETCH env', () => {
    process.env.CRAWL_REMOTE_FETCH = 'true';
    expect(resolveRemoteFetchConfig().enabled).toBe(true);
  });

  it('explicit option beats env', () => {
    process.env.CRAWL_REMOTE_FETCH = 'true';
    expect(resolveRemoteFetchConfig({ enabled: false }).enabled).toBe(false);
  });

  it('explicit workerUrl beats WORKER_URL env', () => {
    process.env.WORKER_URL = 'http://env-worker:8081';
    expect(resolveWorkerUrl('http://explicit:9999')).toBe('http://explicit:9999');
    expect(resolveWorkerUrl()).toBe('http://env-worker:8081');
  });
});

describe('createRemoteFetchFn', () => {
  it('returns null when disabled — FetchPipeline keeps its local default', () => {
    expect(createRemoteFetchFn({ enabled: false })).toBeNull();
    expect(createRemoteFetchFn(null)).toBeNull();
  });

  it('downloads pages via the remote worker and returns a FetchPipeline-compatible response', async () => {
    const stub = await startStubWorker();
    try {
      const fetchFn = createRemoteFetchFn({
        enabled: true,
        workerUrl: stub.url,
        timeoutMs: 5000,
        compress: false,
        fallbackToLocal: false,
        maxConcurrency: 2
      }, { logger: { info: () => {}, warn: () => {} } });

      const response = await fetchFn('https://example.com/world/france', {
        headers: { 'user-agent': 'test' },
        redirect: 'manual',
        agent: { fake: 'agent-should-be-stripped' }
      });

      // The exact surface FetchPipeline uses:
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(response.headers.get('etag')).toBe('"stub-etag"');
      const body = await response.text();
      expect(body).toContain('remote page');

      // Body must have been requested from the worker (FetchPipeline calls .text()).
      const batchWithRequests = stub.seen.batches.find(b => (b.requests || []).length > 0);
      expect(batchWithRequests.requests[0].includeBody).toBe(true);
      expect(batchWithRequests.requests[0].url).toBe('https://example.com/world/france');
    } finally {
      stub.server.close();
    }
  });

  it('reports the redirect landing URL as response.url', async () => {
    const stub = await startStubWorker();
    try {
      const fetchFn = createRemoteFetchFn({
        enabled: true, workerUrl: stub.url, compress: false, fallbackToLocal: false
      }, { logger: { info: () => {} } });
      const response = await fetchFn('https://example.com/redirect-me', {});
      expect(response.url).toBe('https://example.com/landed');
    } finally {
      stub.server.close();
    }
  });

  it('falls back to local fetch when the worker is unreachable', async () => {
    const localCalls = [];
    const fetchFn = createRemoteFetchFn({
      enabled: true,
      workerUrl: 'http://127.0.0.1:1', // nothing listens here
      timeoutMs: 500,
      fallbackToLocal: true
    }, {
      logger: { info: () => {}, warn: () => {} },
      localFetch: async (url, opts) => {
        localCalls.push({ url, opts });
        return { status: 200, ok: true, headers: { get: () => null }, text: async () => 'local body' };
      }
    });

    const response = await fetchFn('https://example.com/page', {});
    expect(localCalls.length).toBe(1);
    expect(await response.text()).toBe('local body');
  });

  it('exposes a dashboard telemetry snapshot via getTelemetry()', async () => {
    const stub = await startStubWorker();
    try {
      const fetchFn = createRemoteFetchFn({
        enabled: true, workerUrl: stub.url, compress: false, fallbackToLocal: false
      }, { logger: { info: () => {} } });

      // Before any fetch: safe snapshot, worker not yet contacted.
      const before = fetchFn.getTelemetry();
      expect(before.enabled).toBe(true);
      expect(before.workerUrl).toBe(stub.url);
      expect(before.requestsSent).toBe(0);
      expect(before.lastFetchAt).toBeNull();

      await fetchFn('https://example.com/world/peru', {});

      const after = fetchFn.getTelemetry();
      expect(after.healthy).toBe(true);
      expect(after.requestsSent).toBeGreaterThanOrEqual(1);
      expect(after.requestsOk).toBeGreaterThanOrEqual(1);
      expect(after.lastUrl).toBe('https://example.com/world/peru');
      expect(typeof after.lastFetchMs).toBe('number');
      expect(after.lastFetchAt).toBeTruthy();
      expect(after.localFallbacks).toBe(0);
    } finally {
      stub.server.close();
    }
  });

  it('counts local fallbacks in telemetry when the worker is unreachable', async () => {
    // The adapter detects an unhealthy worker and falls back internally
    // (no exception surfaces); the dashboard signal is localFallbacks.
    const fetchFn = createRemoteFetchFn({
      enabled: true, workerUrl: 'http://127.0.0.1:1', timeoutMs: 300, fallbackToLocal: true
    }, {
      logger: { info: () => {}, warn: () => {} },
      localFetch: async () => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => 'local' })
    });
    await fetchFn('https://example.com/x', {});
    const t = fetchFn.getTelemetry();
    expect(t.localFallbacks).toBeGreaterThanOrEqual(1);
    expect(t.healthy).toBe(false);
  });

  it('propagates errors when fallback is disabled', async () => {
    const fetchFn = createRemoteFetchFn({
      enabled: true,
      workerUrl: 'http://127.0.0.1:1',
      timeoutMs: 500,
      fallbackToLocal: false
    }, {
      logger: { info: () => {}, warn: () => {} },
      localFetch: async () => { throw new Error('local fetch should not be called'); }
    });
    await expect(fetchFn('https://example.com/page', {})).rejects.toThrow();
  });
});
