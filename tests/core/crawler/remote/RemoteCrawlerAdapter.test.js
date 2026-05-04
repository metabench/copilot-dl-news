'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('events');

const { RemoteCrawlerAdapter } = require('../../../../src/core/crawler/remote/RemoteCrawlerAdapter');
const {
  generateNodeId,
  PROTOCOL_VERSION,
  MessageTypes,
  createAnnouncement,
  createWorkAssignment,
  createResultSync,
  createIntelligenceShare,
  createHeartbeat,
  validateMessage,
} = require('../../../../src/core/crawler/remote/PeerProtocol');

// ── Test helpers ────────────────────────────────────────────

/**
 * Create a mock crawler with enough interface for the adapter to work.
 */
function createMockCrawler(overrides = {}) {
  const emitter = new EventEmitter();
  const queue = [];

  const crawler = Object.assign(emitter, {
    domain: overrides.domain || 'example.com',
    startUrl: overrides.startUrl || 'https://example.com',
    crawlType: overrides.crawlType || 'basic',
    isProcessing: false,
    isPaused: () => false,
    isAbortRequested: () => false,
    maxDownloads: 200,
    concurrency: 1,
    structureOnly: false,
    plannerEnabled: false,
    isGazetteerMode: false,
    featuresEnabled: { contentAcquisition: true },
    state: {
      getStats: () => ({
        pagesVisited: overrides.pagesVisited || 0,
        pagesDownloaded: 0,
        articlesFound: 0,
        articlesSaved: 0,
        errors: 0,
        bytesDownloaded: 0,
      }),
      getHubVisitStats: () => ({ seeded: 0, visited: 0 }),
      getDomainLimitState: () => null,
      addFatalIssue: () => {},
      getFatalState: () => null,
      setFatalState: () => {},
    },
    queue: {
      size: () => queue.length,
    },
    enqueueRequest: (req) => {
      queue.push(req);
      return true;
    },
    requestAbort: () => {},
    crawl: async () => {},
    dispose: async () => {},
    _queue: queue,
    ...overrides,
  });

  return crawler;
}

// ── PeerProtocol tests ──────────────────────────────────────

describe('PeerProtocol', () => {
  it('generates unique node IDs', () => {
    const id1 = generateNodeId();
    const id2 = generateNodeId();
    assert.ok(typeof id1 === 'string');
    assert.ok(id1.length > 4);
    assert.notEqual(id1, id2, 'Two generated IDs should differ');
  });

  it('creates valid announcement messages', () => {
    const msg = createAnnouncement({
      nodeId: 'test-node',
      domains: ['bbc.com'],
      baseUrl: 'http://localhost:3200',
    });

    assert.equal(msg.type, MessageTypes.ANNOUNCE);
    assert.equal(msg.version, PROTOCOL_VERSION);
    assert.equal(msg.nodeId, 'test-node');
    assert.deepEqual(msg.domains, ['bbc.com']);
    assert.ok(msg.timestamp);
    assert.ok(msg.capabilities);
    assert.ok(msg.system);
    assert.ok(msg.system.platform);
    assert.ok(msg.system.cpus > 0);
  });

  it('creates valid work assignment messages', () => {
    const msg = createWorkAssignment({
      assignedBy: 'hub-node',
      targetNodeId: 'worker-1',
      domains: ['reuters.com', { domain: 'bbc.com', maxPages: 100 }],
    });

    assert.equal(msg.type, MessageTypes.WORK_ASSIGN);
    assert.equal(msg.assignedBy, 'hub-node');
    assert.equal(msg.targetNodeId, 'worker-1');
    assert.equal(msg.domains.length, 2);
    assert.equal(msg.domains[0].domain, 'reuters.com');
    assert.equal(msg.domains[1].domain, 'bbc.com');
    assert.equal(msg.domains[1].maxPages, 100);
    assert.ok(msg.assignmentId.startsWith('wa-'));
  });

  it('creates result sync messages', () => {
    const msg = createResultSync({
      nodeId: 'node-1',
      domain: 'bbc.com',
      batch: { batchId: 'b-1', watermark: '2024-01-01', counts: { urls: 5, links: 20 } },
    });

    assert.equal(msg.type, MessageTypes.RESULT_SYNC);
    assert.equal(msg.domain, 'bbc.com');
    assert.equal(msg.batchId, 'b-1');
    assert.equal(msg.counts.urls, 5);
  });

  it('creates intelligence share messages', () => {
    const msg = createIntelligenceShare({
      nodeId: 'node-1',
      domain: 'bbc.com',
      intelligence: { rateLimit: { isLimited: true } },
    });

    assert.equal(msg.type, MessageTypes.INTEL_SHARE);
    assert.ok(msg.intelligence.rateLimit.isLimited);
  });

  it('creates heartbeat messages', () => {
    const msg = createHeartbeat({ nodeId: 'node-1', summary: { pagesVisited: 100 } });

    assert.equal(msg.type, MessageTypes.HEARTBEAT);
    assert.equal(msg.summary.pagesVisited, 100);
  });

  it('validates messages correctly', () => {
    assert.equal(validateMessage(null).valid, false);
    assert.equal(validateMessage({}).valid, false);
    assert.equal(validateMessage({ type: 'bogus' }).valid, false);
    assert.equal(validateMessage({ type: MessageTypes.ANNOUNCE }).valid, false); // missing version
    assert.equal(validateMessage({ type: MessageTypes.ANNOUNCE, version: '1.0.0' }).valid, false); // missing nodeId
    assert.equal(validateMessage({ type: MessageTypes.ANNOUNCE, version: '1.0.0', nodeId: 'x' }).valid, true);
  });
});

// ── RemoteCrawlerAdapter tests ──────────────────────────────

describe('RemoteCrawlerAdapter', () => {
  let crawler;
  let adapter;

  beforeEach(() => {
    crawler = createMockCrawler();
    adapter = new RemoteCrawlerAdapter(crawler, { nodeId: 'test-adapter' });
  });

  it('requires a crawler instance', () => {
    assert.throws(() => new RemoteCrawlerAdapter(null), /requires a crawler instance/);
  });

  it('generates nodeId when not provided', () => {
    const a = new RemoteCrawlerAdapter(createMockCrawler());
    assert.ok(a.nodeId);
    assert.ok(a.nodeId.length > 4);
  });

  it('uses provided nodeId', () => {
    assert.equal(adapter.nodeId, 'test-adapter');
  });

  describe('getStatus()', () => {
    it('returns structured status', () => {
      const status = adapter.getStatus();
      
      assert.equal(status.nodeId, 'test-adapter');
      assert.equal(status.domain, 'example.com');
      assert.equal(status.isRunning, false);
      assert.equal(status.isPaused, false);
      assert.equal(status.fatalState, null);
      assert.ok(status.stats);
      assert.equal(status.crawlType, 'basic');
    });
  });

  describe('getHealth()', () => {
    it('returns healthy when no fatal state', () => {
      const health = adapter.getHealth();

      assert.ok(health.ok);
      assert.equal(health.nodeId, 'test-adapter');
      assert.equal(health.fatalState, null);
    });
  });

  describe('seedUrls()', () => {
    it('returns zero for empty input', () => {
      assert.deepEqual(adapter.seedUrls([]), { inserted: 0, total: 0, errors: [] });
      assert.deepEqual(adapter.seedUrls(null), { inserted: 0, total: 0, errors: [] });
    });

    it('seeds URLs into crawler queue', () => {
      const result = adapter.seedUrls([
        'https://example.com/page1',
        'https://example.com/page2',
      ]);

      assert.equal(result.inserted, 2);
      assert.equal(result.total, 2);
      assert.equal(crawler._queue.length, 2);
      assert.equal(crawler._queue[0].url, 'https://example.com/page1');
      assert.equal(crawler._queue[0].type, 'seed');
    });
  });

  describe('fatal state detection', () => {
    it('detects DNS failure after threshold', () => {
      // Simulate DNS failures
      for (let i = 0; i < 3; i++) {
        crawler.emit('url:visited', {
          error: 'getaddrinfo ENOTFOUND example.com',
          httpStatus: null,
        });
      }

      const fatal = adapter.getFatalState();
      assert.ok(fatal);
      assert.equal(fatal.reason, 'DNS_FAILURE');
    });

    it('resets consecutive errors on success', () => {
      // 2 errors (below threshold)
      crawler.emit('url:visited', { error: 'getaddrinfo ENOTFOUND example.com' });
      crawler.emit('url:visited', { error: 'getaddrinfo ENOTFOUND example.com' });

      // Success resets
      crawler.emit('url:visited', { httpStatus: 200, url: 'https://example.com/page' });

      // 2 more errors (still below threshold since reset)
      crawler.emit('url:visited', { error: 'getaddrinfo ENOTFOUND example.com' });
      crawler.emit('url:visited', { error: 'getaddrinfo ENOTFOUND example.com' });

      assert.equal(adapter.getFatalState(), null);
    });

    it('detects consecutive error fatal after max threshold', () => {
      for (let i = 0; i < 20; i++) {
        crawler.emit('url:visited', {
          error: 'ECONNRESET',
          httpStatus: null,
        });
      }

      const fatal = adapter.getFatalState();
      assert.ok(fatal);
      assert.equal(fatal.reason, 'CONSECUTIVE_ERRORS');
    });
  });

  describe('run tracking', () => {
    it('creates run on start', () => {
      adapter.start();
      assert.equal(adapter.getRunHistory().length, 1);
      assert.equal(adapter.getRunHistory()[0].status, 'running');
    });

    it('finalizes run on stop', () => {
      adapter.start();
      adapter.stop();
      const runs = adapter.getRunHistory();
      assert.equal(runs.length, 1);
      assert.equal(runs[0].status, 'stopped');
      assert.ok(runs[0].endedAt);
    });
  });

  describe('start/stop', () => {
    it('starts crawl and returns status', () => {
      const result = adapter.start();
      assert.ok(result.started);
    });

    it('prevents double start', () => {
      adapter.start();
      const result = adapter.start();
      assert.equal(result.started, false);
    });

    it('stops crawl', () => {
      adapter.start();
      const result = adapter.stop();
      assert.ok(result.stopped);
    });

    it('cannot stop when not running', () => {
      const result = adapter.stop();
      assert.equal(result.stopped, false);
    });

    it('clears fatal state on restart', () => {
      // Trigger fatal
      for (let i = 0; i < 3; i++) {
        crawler.emit('url:visited', { error: 'getaddrinfo ENOTFOUND' });
      }
      assert.ok(adapter.getFatalState());

      // Restart clears fatal
      adapter.start();
      assert.equal(adapter.getFatalState(), null);
    });
  });

  describe('getIntelligence()', () => {
    it('returns intelligence object', () => {
      const intel = adapter.getIntelligence();
      assert.ok(intel);
      assert.equal(intel.domain, 'example.com');
      assert.equal(intel.nodeId, 'test-adapter');
      assert.ok(intel.errorPatterns);
    });
  });

  describe('exportBatch()', () => {
    it('returns empty batch when no DB', () => {
      const batch = adapter.exportBatch();
      assert.equal(batch.counts.urls, 0);
      assert.ok(batch.error); // 'No database available'
    });

    it('exports data using correct multi-table JOINs', () => {
      // Create an in-memory SQLite DB with the real schema tables
      let Database;
      try {
        Database = require('better-sqlite3');
      } catch (_) {
        // Skip if better-sqlite3 not available in test env
        return;
      }
      const db = new Database(':memory:');
      db.exec(`
        CREATE TABLE urls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          canonical_url TEXT,
          created_at TEXT,
          last_seen_at TEXT,
          analysis TEXT,
          host TEXT
        );
        CREATE TABLE http_responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url_id INTEGER NOT NULL REFERENCES urls(id),
          request_started_at TEXT NOT NULL,
          fetched_at TEXT,
          http_status INTEGER,
          content_type TEXT,
          bytes_downloaded INTEGER,
          ttfb_ms INTEGER,
          download_ms INTEGER,
          total_ms INTEGER
        );
        CREATE TABLE content_storage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          http_response_id INTEGER REFERENCES http_responses(id)
        );
        CREATE TABLE content_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content_id INTEGER REFERENCES content_storage(id),
          classification TEXT,
          title TEXT,
          word_count INTEGER,
          nav_links_count INTEGER,
          article_links_count INTEGER,
          date TEXT
        );
      `);

      // Insert test data
      db.prepare(`INSERT INTO urls (url, host, created_at, last_seen_at) VALUES (?, ?, ?, ?)`).run(
        'https://example.com/article1', 'example.com', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'
      );
      db.prepare(`INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded) VALUES (?, ?, ?, ?, ?, ?)`).run(
        1, '2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z', 200, 'text/html', 5000
      );
      db.prepare(`INSERT INTO content_storage (http_response_id) VALUES (?)`).run(1);
      db.prepare(`INSERT INTO content_analysis (content_id, classification, title, word_count) VALUES (?, ?, ?, ?)`).run(
        1, 'article', 'Test Article', 500
      );

      // Wire the mock crawler to have a DB
      const dbCrawler = createMockCrawler({
        dbAdapter: { getDb: () => db },
      });
      const dbAdapter = new RemoteCrawlerAdapter(dbCrawler, { nodeId: 'db-test' });

      const batch = dbAdapter.exportBatch();
      assert.equal(batch.counts.urls, 1);
      assert.equal(batch.urls[0].url, 'https://example.com/article1');
      assert.equal(batch.urls[0].http_status, 200);
      assert.equal(batch.urls[0].classification, 'article');
      assert.equal(batch.urls[0].title, 'Test Article');
      assert.equal(batch.urls[0].word_count, 500);
      assert.equal(batch.urls[0].bytes_downloaded, 5000);
      assert.ok(batch.watermark);

      db.close();
    });
  });

  describe('onCrawlFinished callback', () => {
    it('invokes callback when crawl completes', async () => {
      let callbackResult = null;
      const cbCrawler = createMockCrawler({
        crawl: async () => { /* immediate completion */ },
      });
      const cbAdapter = new RemoteCrawlerAdapter(cbCrawler, {
        nodeId: 'cb-test',
        onCrawlFinished: (result) => { callbackResult = result; },
      });

      cbAdapter.start();
      // Wait for the async crawl to complete
      await new Promise(r => setTimeout(r, 50));

      assert.ok(callbackResult);
      assert.equal(callbackResult.status, 'completed');
      assert.equal(callbackResult.domain, 'example.com');
    });

    it('invokes callback with error status on crawl failure', async () => {
      let callbackResult = null;
      const errCrawler = createMockCrawler({
        crawl: async () => { throw new Error('test-crash'); },
      });
      const errAdapter = new RemoteCrawlerAdapter(errCrawler, {
        nodeId: 'err-test',
        onCrawlFinished: (result) => { callbackResult = result; },
      });

      errAdapter.start();
      await new Promise(r => setTimeout(r, 50));

      assert.ok(callbackResult);
      assert.equal(callbackResult.status, 'error');
      assert.equal(callbackResult.error, 'test-crash');
    });
  });
});
