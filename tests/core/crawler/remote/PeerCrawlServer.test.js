'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('events');

const { createPeerServer, createPeerApp } = require('../../../../src/core/crawler/remote/PeerCrawlServer');
const { MessageTypes, createAnnouncement } = require('../../../../src/core/crawler/remote/PeerProtocol');

// ── Test helpers ────────────────────────────────────────────

function createMockCrawler(domain, options = {}) {
  const emitter = new EventEmitter();
  const queue = [];

  return Object.assign(emitter, {
    domain,
    startUrl: `https://${domain}`,
    crawlType: options.crawlType || 'basic',
    isProcessing: false,
    isPaused: () => false,
    isAbortRequested: () => false,
    maxDownloads: options.maxDownloads || 200,
    concurrency: 1,
    structureOnly: false,
    plannerEnabled: false,
    isGazetteerMode: false,
    featuresEnabled: { contentAcquisition: true },
    state: {
      getStats: () => ({
        pagesVisited: 0,
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
  });
}

// ── PeerCrawlServer tests ───────────────────────────────────

describe('PeerCrawlServer', () => {
  describe('createPeerApp', () => {
    it('requires a crawlerFactory', () => {
      assert.throws(() => createPeerApp({}), /crawlerFactory/);
    });

    it('creates an Express app', () => {
      const { app, orchestrator } = createPeerApp({
        crawlerFactory: (domain, opts) => createMockCrawler(domain, opts),
        domains: ['bbc.com'],
      });

      assert.ok(app);
      assert.ok(orchestrator);
      assert.ok(orchestrator.nodeId);
      assert.equal(orchestrator.workers.size, 1);
    });
  });

  describe('HTTP API', () => {
    let server;
    let baseUrl;

    before(async () => {
      server = createPeerServer({
        port: 0, // random port
        nodeId: 'test-server',
        crawlerFactory: (domain, opts) => createMockCrawler(domain, opts),
        domains: [
          { domain: 'bbc.com', maxPages: 100 },
          { domain: 'reuters.com', maxPages: 200 },
        ],
      });

      const address = await server.start();
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
      if (server) {
        await server.stop();
      }
    });

    it('GET /api/health returns 200', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.ok(body.ok);
      assert.equal(body.nodeId, 'test-server');
      assert.equal(body.domains, 2);
    });

    it('GET /api/status returns full status', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      const body = await res.json();

      assert.equal(body.nodeId, 'test-server');
      assert.equal(body.totalDomains, 2);
      assert.ok(Array.isArray(body.domains));
      assert.equal(body.domains.length, 2);
    });

    it('GET /api/domains lists domains', async () => {
      const res = await fetch(`${baseUrl}/api/domains`);
      const body = await res.json();

      assert.ok(Array.isArray(body.domains));
      const domainNames = body.domains.map(d => d.domain);
      assert.ok(domainNames.includes('bbc.com'));
      assert.ok(domainNames.includes('reuters.com'));
    });

    it('GET /api/domain/:domain returns individual domain', async () => {
      const res = await fetch(`${baseUrl}/api/domain/bbc.com`);
      const body = await res.json();
      assert.equal(body.domain, 'bbc.com');
    });

    it('GET /api/domain/:unknown returns 404', async () => {
      const res = await fetch(`${baseUrl}/api/domain/nonexistent.com`);
      assert.equal(res.status, 404);
    });

    it('POST /api/crawl/start starts a domain', async () => {
      const res = await fetch(`${baseUrl}/api/crawl/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'bbc.com' }),
      });
      const body = await res.json();

      assert.equal(body.nodeId, 'test-server');
      assert.ok(Array.isArray(body.results));
      assert.equal(body.results[0].domain, 'bbc.com');
      assert.equal(body.results[0].status, 'started');
    });

    it('POST /api/crawl/stop stops a domain', async () => {
      const res = await fetch(`${baseUrl}/api/crawl/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'bbc.com' }),
      });
      const body = await res.json();

      assert.equal(body.results[0].domain, 'bbc.com');
    });

    it('POST /api/seed inserts URLs', async () => {
      const res = await fetch(`${baseUrl}/api/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'bbc.com',
          urls: ['https://bbc.com/page1', 'https://bbc.com/page2'],
        }),
      });
      const body = await res.json();

      assert.equal(body.domain, 'bbc.com');
      assert.equal(body.inserted, 2);
      assert.equal(body.total, 2);
    });

    it('POST /api/seed requires domain', async () => {
      const res = await fetch(`${baseUrl}/api/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['https://x.com'] }),
      });
      assert.equal(res.status, 400);
    });

    it('GET /api/intelligence returns intelligence', async () => {
      const res = await fetch(`${baseUrl}/api/intelligence`);
      const body = await res.json();

      assert.ok(Array.isArray(body.intelligence));
      assert.ok(body.intelligence.length > 0);
    });

    it('GET /api/peers includes self', async () => {
      const res = await fetch(`${baseUrl}/api/peers`);
      const body = await res.json();

      assert.ok(Array.isArray(body.peers));
      assert.ok(body.peers.some(p => p.isSelf));
    });

    it('POST /api/peers/announce registers a peer', async () => {
      const announcement = createAnnouncement({
        nodeId: 'remote-peer-1',
        domains: ['theguardian.com'],
        baseUrl: 'http://192.168.1.50:3200',
      });

      const res = await fetch(`${baseUrl}/api/peers/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      const body = await res.json();

      assert.ok(body.registered);
      assert.equal(body.hubNodeId, 'test-server');
      assert.ok(body.peerCount >= 2);
    });

    it('GET /api/config returns config', async () => {
      const res = await fetch(`${baseUrl}/api/config`);
      const body = await res.json();

      assert.equal(body.nodeId, 'test-server');
      assert.ok(body.totalDomains >= 2);
    });

    it('GET /api/runs returns run history', async () => {
      const res = await fetch(`${baseUrl}/api/runs`);
      const body = await res.json();

      assert.ok(Array.isArray(body.runs));
    });

    it('POST /api/crawl/start auto-creates new domain', async () => {
      const res = await fetch(`${baseUrl}/api/crawl/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: 'cnn.com' }),
      });
      const body = await res.json();

      assert.equal(body.results[0].domain, 'cnn.com');
      assert.equal(body.results[0].status, 'started');

      // Verify it appears in domains list
      const listRes = await fetch(`${baseUrl}/api/domains`);
      const listBody = await listRes.json();
      assert.ok(listBody.domains.some(d => d.domain === 'cnn.com'));
    });
  });
});
