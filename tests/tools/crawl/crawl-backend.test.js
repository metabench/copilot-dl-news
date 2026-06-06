'use strict';

/**
 * Unit tests for tools/crawl/lib/crawl-backend.js — the unified CrawlBackend
 * interface with Local + Remote backends.
 *
 * These tests exercise pure helpers, the factory, the terminal-state predicate,
 * and the LocalBackend.status() download-evidence path with injected DB helpers.
 * They do NOT touch the network or fleet.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const {
  CrawlBackend,
  LocalBackend,
  RemoteBackend,
  getBackend,
  isLocalJobTerminal,
  parseHostPort,
  summarizeLocalJobs,
  uniqueHostnamesFromUrls,
  httpRequest
} = require('../../../tools/crawl/lib/crawl-backend');

describe('crawl-backend — pure helpers', () => {
  test('parseHostPort splits host:port and defaults port', () => {
    expect(parseHostPort('h.example:3200')).toEqual({ host: 'h.example', port: 3200 });
    expect(parseHostPort('h.example', 3200)).toEqual({ host: 'h.example', port: 3200 });
    expect(parseHostPort('1.2.3.4:9999')).toEqual({ host: '1.2.3.4', port: 9999 });
  });

  test('uniqueHostnamesFromUrls dedupes case-insensitively and skips invalid', () => {
    const out = uniqueHostnamesFromUrls([
      'https://A.com/x',
      'https://a.com/y',
      'http://b.com',
      'not a url',
      'https://c.com/z'
    ]);
    expect(out.sort()).toEqual(['a.com', 'b.com', 'c.com']);
  });

  test('local job terminal helpers summarize bounded job status evidence', () => {
    expect(isLocalJobTerminal('completed')).toBe(true);
    expect(isLocalJobTerminal('running')).toBe(false);
    expect(summarizeLocalJobs([
      { status: 'running' },
      { status: 'completed' },
      { status: 'failed' },
    ])).toMatchObject({
      total: 3,
      running: 1,
      completed: 1,
      failed: 1,
      terminal: 2,
    });
  });

  test('LocalBackend.jobs can poll accepted job IDs without listing every local job', async () => {
    const b = new LocalBackend({ host: '127.0.0.1', port: 3019, dbPath: '/no-db-needed.db' });
    const calls = [];
    b._httpRequest = jest.fn(async (method, host, port, urlPath) => {
      calls.push({ method, host, port, urlPath });
      return {
        body: {
          status: 'ok',
          job: {
            id: urlPath.endsWith('/job-a') ? 'job-a' : 'job-b',
            operationName: 'basicArticleCrawl',
            startUrl: urlPath.endsWith('/job-a')
              ? 'http://127.0.0.1:41922/news/a.html'
              : 'http://127.0.0.2:41922/news/b.html',
            status: urlPath.endsWith('/job-a') ? 'completed' : 'running',
            startedAt: '2026-05-29T18:40:00.000Z',
          },
        },
      };
    });

    const out = await b.jobs({ jobIds: ['job-a', 'job-b'], hosts: ['127.0.0.1', '127.0.0.2'] });

    expect(out.ok).toBe(true);
    expect(out.raw.source).toBe('job-id');
    expect(out.counts).toMatchObject({ total: 2, completed: 1, running: 1, terminal: 1 });
    expect(calls.map(call => call.urlPath)).toEqual([
      '/api/v1/crawl/jobs/job-a',
      '/api/v1/crawl/jobs/job-b',
    ]);
  });
});

describe('crawl-backend — factory', () => {
  test('getBackend("local") returns a LocalBackend with kind/label', () => {
    const b = getBackend('local', { dbPath: '/nonexistent.db' });
    expect(b).toBeInstanceOf(LocalBackend);
    expect(b.kind).toBe('local');
    expect(typeof b.label).toBe('string');
  });

  test('getBackend("remote") parses host string and returns RemoteBackend', () => {
    const b = getBackend('remote', { host: 'h.example:3200' });
    expect(b).toBeInstanceOf(RemoteBackend);
    expect(b.kind).toBe('remote');
    expect(b.label).toBe('h.example:3200');
  });

  test('getBackend rejects unknown kind', () => {
    expect(() => getBackend('mystery')).toThrow();
  });
});

describe('crawl-backend — CrawlBackend.allTerminal', () => {
  test('returns true when every host is non-running with terminal state', () => {
    const status = {
      domains: [
        { domain: 'a.com', isRunning: false, state: 'stopped' },
        { domain: 'b.com', isRunning: false, state: 'done' }
      ]
    };
    expect(CrawlBackend.allTerminal(status, ['a.com', 'b.com'])).toBe(true);
  });

  test('returns false when any host is still running', () => {
    const status = {
      domains: [
        { domain: 'a.com', isRunning: true, state: 'crawling' },
        { domain: 'b.com', isRunning: false, state: 'done' }
      ]
    };
    expect(CrawlBackend.allTerminal(status, ['a.com', 'b.com'])).toBe(false);
  });

  test('returns false when any host has non-terminal state', () => {
    const status = {
      domains: [
        { domain: 'a.com', isRunning: false, state: 'pending' }
      ]
    };
    expect(CrawlBackend.allTerminal(status, ['a.com'])).toBe(false);
  });

  test('returns false when a requested host is missing from status', () => {
    const status = {
      domains: [{ domain: 'a.com', isRunning: false, state: 'stopped' }]
    };
    expect(CrawlBackend.allTerminal(status, ['a.com', 'b.com'])).toBe(false);
  });

  test('missingHosts returns requested hosts absent from status', () => {
    const status = {
      domains: [{ domain: 'a.com', isRunning: false, state: 'stopped' }]
    };
    expect(CrawlBackend.missingHosts(status, ['A.com', 'b.com', 'b.com'])).toEqual(['b.com']);
    expect(CrawlBackend.missingHosts(null, ['a.com'])).toEqual(['a.com']);
  });

  test('accepts idle/completed as terminal', () => {
    const status = {
      domains: [
        { domain: 'a.com', isRunning: false, state: 'idle' },
        { domain: 'b.com', isRunning: false, state: 'completed' }
      ]
    };
    expect(CrawlBackend.allTerminal(status, ['a.com', 'b.com'])).toBe(true);
  });
});

describe('crawl-backend — LocalBackend.status() against an on-disk fixture DB', () => {
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `crawl-backend-test-${process.pid}-${Date.now()}.db`);
    fs.writeFileSync(dbPath, '');
  });

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_e) {}
    }
  });

  test('returns ok:false when DB file is missing', async () => {
    const b = new LocalBackend({ dbPath: '/definitely/not/here.db' });
    const out = await b.status({});
    expect(out.ok).toBe(false);
    expect(out.kind).toBe('local');
    expect(out.raw && out.raw.reason).toMatch(/db-missing/);
    b.close();
  });

  test('uses injected DB opener and DB-owned download evidence for local status', async () => {
    const tmp = path.join(os.tmpdir(), `crawl-backend-open-${process.pid}-${Date.now()}.db`);
    fs.writeFileSync(tmp, '');
    const close = jest.fn();
    const db = { close };
    const openDb = jest.fn(() => db);
    const getCloudCrawlRecentEvidence = jest.fn(() => ({
      available: true,
      downloads: 2,
      success: 2,
      failed: 0,
      bytes: 300,
      hosts: [
        { host: 'a.com', downloads: 2, success: 2, failed: 0, bytes: 300 },
      ],
      statuses: [{ status: 200, count: 2 }],
    }));
    try {
      const b = new LocalBackend({
        dbPath: tmp,
        openDb,
        downloadEvidenceQueries: { getCloudCrawlRecentEvidence },
      });
      const out = await b.status({ hosts: ['a.com'] });
      expect(openDb).toHaveBeenCalledWith(tmp);
      expect(getCloudCrawlRecentEvidence).toHaveBeenCalledWith(db, expect.objectContaining({
        startedAt: undefined,
        finishedAt: expect.any(String),
        domains: ['a.com'],
      }));
      expect(out.ok).toBe(true);
      expect(out.domains).toHaveLength(1);
      expect(out.domains[0]).toMatchObject({ domain: 'a.com', fetched: 2, bytes: 300 });
      expect(out.totals).toMatchObject({ fetched: 2, bytes: 300 });
      b.close();
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      try { fs.unlinkSync(tmp); } catch (_e) {}
    }
  });

  test('aggregates per-host fetched + bytes from recent download evidence', async () => {
    const b = new LocalBackend({
      dbPath,
      openDb: () => ({ close() {} }),
      downloadEvidenceQueries: {
        getCloudCrawlRecentEvidence: () => ({
          available: true,
          downloads: 3,
          success: 2,
          failed: 1,
          bytes: 600,
          hosts: [
            { host: 'a.com', downloads: 2, success: 2, failed: 0, bytes: 300 },
            { host: 'b.com', downloads: 1, success: 0, failed: 1, bytes: 300 },
          ],
        }),
      },
    });
    const out = await b.status({});
    expect(out.ok).toBe(true);
    expect(out.kind).toBe('local');
    const a = out.domains.find(d => d.domain === 'a.com');
    const bb = out.domains.find(d => d.domain === 'b.com');
    expect(a).toBeTruthy();
    expect(bb).toBeTruthy();
    expect(a.fetched).toBe(2);
    expect(a.errors).toBe(0);
    expect(a.bytes).toBe(300);
    expect(bb.fetched).toBe(1);
    expect(bb.errors).toBe(1);
    expect(bb.bytes).toBe(300);
    expect(out.totals.fetched).toBe(3);
    expect(out.totals.errors).toBe(1);
    expect(out.totals.bytes).toBe(600);
    b.close();
  });

  test('lists matching in-process local jobs from the UI registry endpoint', async () => {
    const b = new LocalBackend({ host: '127.0.0.1', port: 3171 });
    b._httpRequest = jest.fn(async () => ({
      body: {
        items: [
          {
            id: 'job-1',
            operationName: 'basicArticleCrawl',
            startUrl: 'https://www.bbc.com/news',
            status: 'running',
            createdAt: '2026-05-28T10:00:00.000Z',
            startedAt: '2026-05-28T10:00:01.000Z',
            finishedAt: null,
          },
          {
            id: 'job-2',
            operationName: 'basicArticleCrawl',
            startUrl: 'https://example.com/',
            status: 'completed',
            createdAt: '2026-05-28T10:00:00.000Z',
            startedAt: '2026-05-28T10:00:01.000Z',
            finishedAt: '2026-05-28T10:00:05.000Z',
          },
        ],
      },
    }));

    const out = await b.jobs({
      sinceIso: '2026-05-28T09:59:59.000Z',
      urls: ['https://www.bbc.com/news'],
      hosts: ['bbc.com'],
    });

    expect(out.ok).toBe(true);
    expect(out.counts).toMatchObject({ total: 1, running: 1, terminal: 0 });
    expect(out.jobs[0]).toMatchObject({
      id: 'job-1',
      operationName: 'basicArticleCrawl',
      status: 'running',
    });
    expect(b._httpRequest.mock.calls[0][5]).toBe(1500);
  });

  test('returns bounded unavailable evidence when local jobs endpoint times out', async () => {
    const b = new LocalBackend({ host: '127.0.0.1', port: 3171 });
    b._httpRequest = jest.fn(async () => {
      throw new Error('timeout after 750ms');
    });

    const out = await b.jobs({
      sinceIso: '2026-05-28T09:59:59.000Z',
      urls: ['https://www.bbc.com/news'],
      hosts: ['bbc.com'],
      timeoutMs: 750,
    });

    expect(out).toMatchObject({
      ok: false,
      kind: 'local-jobs',
      error: 'timeout after 750ms',
      counts: { total: 0 },
      jobs: [],
      raw: {
        urlCount: 1,
        hostCount: 1,
        timeoutMs: 750,
      },
    });
  });
});

describe('crawl-backend — RemoteBackend.status() shape normalization', () => {
  test('normalizes per-domain stats + throughput into NormalizedStatus', async () => {
    const b = new RemoteBackend({ host: '127.0.0.1', port: 3200 });
    // Inject a fake httpRequest for this test only.
    b._httpRequest = async () => ({
      body: {
        domains: [
          { domain: 'a.com', state: 'crawling', isRunning: true,
            stats: { fetched: 10, errors: 1, pending: 5, bytes: 1024 },
            contentPipeline: { totalStored: 8 } },
          { domain: 'b.com', state: 'stopped', isRunning: false,
            stats: { fetched: 4, errors: 0, pending: 0 },
            contentPipeline: { totalStored: 4 } }
        ],
        throughput: { fetchesPerSec: 1.25, writesPerSec: 0.5, windowSec: 30 }
      }
    });
    const out = await b.status({});
    expect(out.ok).toBe(true);
    expect(out.kind).toBe('remote');
    expect(out.domains).toHaveLength(2);
    expect(out.totals.fetched).toBe(14);
    expect(out.totals.errors).toBe(1);
    expect(out.totals.pending).toBe(5);
    expect(out.totals.stored).toBe(12);
    expect(out.throughput).toEqual({ fetchesPerSec: 1.25, writesPerSec: 0.5, windowSec: 30 });
    const a = out.domains.find(d => d.domain === 'a.com');
    expect(a.isRunning).toBe(true);
    expect(a.fetched).toBe(10);
    expect(a.bytes).toBe(1024);
  });
});

describe('crawl-backend - RemoteBackend lifecycle helpers', () => {
  test('RemoteBackend.stop sends domains for multi-host stops instead of stopping all', async () => {
    const b = new RemoteBackend({ host: '127.0.0.1', port: 3200 });
    const calls = [];
    b._httpRequest = async (...call) => {
      calls.push(call);
      return {
        body: {
          results: [
            { domain: 'a.com', status: 'stopped' },
            { domain: 'b.com', status: 'stopped' }
          ]
        }
      };
    };

    const out = await b.stop({ hosts: ['a.com', 'b.com'] });

    expect(out.ok).toBe(true);
    expect(out.stopped).toEqual([
      { target: 'a.com', status: 'stopped' },
      { target: 'b.com', status: 'stopped' }
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('POST');
    expect(calls[0][3]).toBe('/api/stop');
    expect(calls[0][4]).toEqual({ domains: ['a.com', 'b.com'] });
  });

  test('RemoteBackend.stop sends domain for single-host stops', async () => {
    const b = new RemoteBackend({ host: '127.0.0.1', port: 3200 });
    const calls = [];
    b._httpRequest = async (...call) => {
      calls.push(call);
      return { body: { domain: 'a.com', status: 'stopped' } };
    };

    const out = await b.stop({ hosts: ['a.com'] });

    expect(out.ok).toBe(true);
    expect(out.stopped).toEqual([{ target: 'a.com', status: 'stopped' }]);
    expect(calls[0][4]).toEqual({ domain: 'a.com' });
  });
});

describe('crawl-backend - httpRequest timeout handling', () => {
  test('rejects a hanging response once with a timeout error and closes cleanly', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"partial":');
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      await expect(httpRequest('GET', '127.0.0.1', port, '/', null, 25)).rejects.toThrow(/timeout after 25ms/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
