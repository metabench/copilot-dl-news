'use strict';

/**
 * Unit tests for tools/crawl/lib/crawl-backend.js — the unified CrawlBackend
 * interface with Local + Remote backends.
 *
 * These tests exercise pure helpers, the factory, the terminal-state predicate,
 * and the LocalBackend.status() SQL path against an in-memory better-sqlite3.
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
  parseHostPort,
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
  let Database;

  beforeAll(() => {
    try {
      Database = require('better-sqlite3');
    } catch (_e) {
      Database = null;
    }
  });

  beforeEach(() => {
    if (!Database) return;
    dbPath = path.join(os.tmpdir(), `crawl-backend-test-${process.pid}-${Date.now()}.db`);
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE fetches (
        host TEXT,
        fetched_at TEXT,
        bytes_downloaded INTEGER
      );
    `);
    const insert = db.prepare('INSERT INTO fetches (host, fetched_at, bytes_downloaded) VALUES (?, ?, ?)');
    insert.run('a.com', '2025-01-01T00:00:00Z', 100);
    insert.run('a.com', '2025-01-01T00:00:01Z', 200);
    insert.run('b.com', '2025-01-01T00:00:02Z', 300);
    db.close();
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

  test('aggregates per-host fetched + bytes from the fetches table', async () => {
    if (!Database) {
      console.warn('better-sqlite3 unavailable — skipping');
      return;
    }
    const b = new LocalBackend({ dbPath });
    const out = await b.status({});
    expect(out.ok).toBe(true);
    expect(out.kind).toBe('local');
    const a = out.domains.find(d => d.domain === 'a.com');
    const bb = out.domains.find(d => d.domain === 'b.com');
    expect(a).toBeTruthy();
    expect(bb).toBeTruthy();
    expect(a.fetched).toBe(2);
    expect(a.bytes).toBe(300);
    expect(bb.fetched).toBe(1);
    expect(bb.bytes).toBe(300);
    expect(out.totals.fetched).toBe(3);
    expect(out.totals.bytes).toBe(600);
    b.close();
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
