'use strict';

const express = require('express');
const zlib = require('zlib');
const { RemoteCrawlerAdapter } = require('./RemoteCrawlerAdapter');
const {
  generateNodeId,
  createAnnouncement,
  validateMessage,
  MessageTypes,
  PROTOCOL_VERSION,
} = require('./PeerProtocol');

/**
 * PeerCrawlServer — Express API for hosting NewsCrawler peers.
 *
 * Manages one or more NewsCrawler instances via RemoteCrawlerAdapter,
 * exposing them through a REST API. Supports peer registration, domain
 * management, export endpoints, and intelligence sharing.
 *
 * This replaces `deploy/remote-crawler/server.js` and
 * `deploy/remote-crawler-v2/multi-domain-server.js` with a unified
 * server backed by the full NewsCrawler engine.
 *
 * @example
 * const { createPeerServer } = require('./PeerCrawlServer');
 * const server = createPeerServer({
 *   nodeId: 'my-peer',
 *   port: 3200,
 *   domains: [{ domain: 'bbc.com', maxPages: 100 }],
 *   crawlerFactory: (domain, opts) => new NewsCrawler(`https://${domain}`, opts),
 * });
 * await server.start();
 */

/**
 * Create the Express app without starting the HTTP listener.
 *
 * @param {Object} options
 * @param {string} [options.nodeId] - Peer node ID
 * @param {Function} options.crawlerFactory - `(domain, options) => NewsCrawler`
 * @param {Object[]} [options.domains=[]] - Initial domain configs
 * @param {number} [options.maxConcurrent=5] - Max concurrent crawling domains
 * @returns {{ app: express.Application, orchestrator: Object }}
 */
function createPeerApp(options = {}) {
  const {
    crawlerFactory,
    maxConcurrent = 5,
    domains: initialDomains = [],
  } = options;

  if (typeof crawlerFactory !== 'function') {
    throw new Error('PeerCrawlServer requires a crawlerFactory function');
  }

  const nodeId = options.nodeId || generateNodeId();
  const startedAt = new Date();

  // ── Domain Worker Registry ──────────────────────────────────
  /** @type {Map<string, { adapter: RemoteCrawlerAdapter, crawler: Object, config: Object, state: string }>} */
  const workers = new Map();

  /** @type {Map<string, { nodeId: string, baseUrl: string, domains: string[], lastSeen: string }>} */
  const peers = new Map();

  // Initialize workers for configured domains
  for (const domainConfig of initialDomains) {
    const domain = typeof domainConfig === 'string' ? domainConfig : domainConfig.domain;
    if (domain) {
      _createWorker(domain, domainConfig);
    }
  }

  function _createWorker(domain, config = {}) {
    if (workers.has(domain)) return workers.get(domain);

    const crawlerOptions = {
      maxDownloads: config.maxPages || config.maxDownloads || 200,
      crawlType: config.crawlType || 'basic',
      ...(config.crawlerOptions || {}),
    };

    const crawler = crawlerFactory(domain, crawlerOptions);
    const adapter = new RemoteCrawlerAdapter(crawler, {
      nodeId,
      onCrawlFinished: ({ status }) => {
        const entry = workers.get(domain);
        if (entry) {
          entry.state = status === 'completed' ? 'completed' : 'error';
        }
      },
    });

    // Seed URLs if provided
    if (Array.isArray(config.seedUrls) && config.seedUrls.length > 0) {
      adapter.seedUrls(config.seedUrls);
    }

    const entry = {
      adapter,
      crawler,
      config: { domain, ...config },
      state: 'idle',
    };
    workers.set(domain, entry);
    return entry;
  }

  function _getWorker(domain) {
    return workers.get(domain) || null;
  }

  function _getRunningCount() {
    let count = 0;
    for (const [, entry] of workers) {
      if (entry.state === 'running') count++;
    }
    return count;
  }

  // ── Express App ─────────────────────────────────────────────
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  // ── Health & Status ─────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    const anyFatal = Array.from(workers.values()).some(w => w.adapter.getFatalState());
    res.json({
      ok: !anyFatal,
      nodeId,
      version: PROTOCOL_VERSION,
      service: 'peer-crawl-server',
      domains: workers.size,
      running: _getRunningCount(),
      uptimeMs: Date.now() - startedAt.getTime(),
    });
  });

  app.get('/api/status', (_req, res) => {
    const domainStatuses = [];
    for (const [domain, entry] of workers) {
      domainStatuses.push({
        domain,
        state: entry.state,
        ...entry.adapter.getStatus(),
      });
    }

    res.json({
      nodeId,
      version: PROTOCOL_VERSION,
      startedAt: startedAt.toISOString(),
      uptimeMs: Date.now() - startedAt.getTime(),
      maxConcurrent,
      totalDomains: workers.size,
      running: _getRunningCount(),
      domains: domainStatuses,
      peers: Array.from(peers.values()),
    });
  });

  // ── Domain Management ─────────────────────────────────────

  app.get('/api/domains', (_req, res) => {
    const list = [];
    for (const [domain, entry] of workers) {
      list.push({
        domain,
        state: entry.state,
        isRunning: entry.state === 'running',
        fatalState: entry.adapter.getFatalState()?.reason || null,
      });
    }
    res.json({ domains: list });
  });

  app.get('/api/domain/:domain', (req, res) => {
    const entry = _getWorker(req.params.domain);
    if (!entry) return res.status(404).json({ error: `Domain not found: ${req.params.domain}` });
    res.json(entry.adapter.getStatus());
  });

  // ── Crawl Control ─────────────────────────────────────────

  app.post('/api/crawl/start', (req, res) => {
    const { domain, domains: domainList, maxPages, crawlType } = req.body || {};

    const targets = domainList || (domain ? [domain] : Array.from(workers.keys()));
    const results = [];

    for (const target of targets) {
      let entry = _getWorker(target);

      // Auto-create worker if domain is new
      if (!entry) {
        entry = _createWorker(target, { maxPages, crawlType });
      }

      if (entry.state === 'running') {
        results.push({ domain: target, status: 'already_running' });
        continue;
      }

      if (_getRunningCount() >= maxConcurrent) {
        results.push({ domain: target, status: 'deferred', reason: 'max_concurrent' });
        continue;
      }

      const startResult = entry.adapter.start({ maxDownloads: maxPages });
      if (startResult.started) {
        entry.state = 'running';
        results.push({ domain: target, status: 'started', ...startResult });
      } else {
        results.push({ domain: target, status: 'failed', error: startResult.error });
      }
    }

    res.json({ nodeId, results });
  });

  app.post('/api/crawl/stop', (req, res) => {
    const { domain } = req.body || {};
    const targets = domain ? [domain] : Array.from(workers.keys());
    const results = [];

    for (const target of targets) {
      const entry = _getWorker(target);
      if (!entry) {
        results.push({ domain: target, status: 'not_found' });
        continue;
      }
      const stopResult = entry.adapter.stop();
      entry.state = 'stopped';
      results.push({ domain: target, ...stopResult });
    }

    res.json({ nodeId, results });
  });

  // ── Seeding ───────────────────────────────────────────────

  app.post('/api/seed', (req, res) => {
    const { domain, urls } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain required' });
    if (!Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });

    let entry = _getWorker(domain);
    if (!entry) {
      entry = _createWorker(domain, {});
    }

    const result = entry.adapter.seedUrls(urls);
    res.json({ domain, ...result });
  });

  // ── Export ────────────────────────────────────────────────

  app.get('/api/export/batch', (req, res) => {
    const since = req.query.since || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 10000);
    const domain = req.query.domain || null;

    const results = [];

    if (domain) {
      const entry = _getWorker(domain);
      if (!entry) return res.status(404).json({ error: `Domain not found: ${domain}` });
      results.push(entry.adapter.exportBatch({ since, limit }));
    } else {
      for (const [, entry] of workers) {
        results.push(entry.adapter.exportBatch({ since, limit }));
      }
    }

    // Gzip the response
    const payload = JSON.stringify({
      nodeId,
      exportedAt: new Date().toISOString(),
      batchCount: results.length,
      batches: results,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    zlib.gzip(payload, (err, compressed) => {
      if (err) return res.status(500).json({ error: err.message });
      res.send(compressed);
    });
  });

  app.get('/api/export/full', (req, res) => {
    const since = req.query.since || null;
    const limit = parseInt(req.query.limit, 10) || 0;
    const domain = req.query.domain || null;

    const results = [];

    if (domain) {
      const entry = _getWorker(domain);
      if (!entry) return res.status(404).json({ error: `Domain not found: ${domain}` });
      results.push(entry.adapter.exportFull({ since, limit }));
    } else {
      for (const [, entry] of workers) {
        results.push(entry.adapter.exportFull({ since, limit }));
      }
    }

    res.json({
      nodeId,
      exportedAt: new Date().toISOString(),
      resultCount: results.length,
      results,
    });
  });

  // ── Intelligence ──────────────────────────────────────────

  app.get('/api/intelligence', (req, res) => {
    const domain = req.query.domain || null;
    const results = [];

    if (domain) {
      const entry = _getWorker(domain);
      if (!entry) return res.status(404).json({ error: `Domain not found: ${domain}` });
      results.push(entry.adapter.getIntelligence());
    } else {
      for (const [, entry] of workers) {
        results.push(entry.adapter.getIntelligence());
      }
    }

    res.json({ nodeId, intelligence: results });
  });

  // ── Peer Management ───────────────────────────────────────

  app.get('/api/peers', (_req, res) => {
    const peerList = Array.from(peers.values());
    // Include self
    peerList.unshift({
      nodeId,
      baseUrl: null, // self
      domains: Array.from(workers.keys()),
      lastSeen: new Date().toISOString(),
      isSelf: true,
    });
    res.json({ peers: peerList });
  });

  app.post('/api/peers/announce', (req, res) => {
    const msg = req.body;
    const validation = validateMessage(msg);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    if (msg.type !== MessageTypes.ANNOUNCE) {
      return res.status(400).json({ error: `Expected announce message, got: ${msg.type}` });
    }

    peers.set(msg.nodeId, {
      nodeId: msg.nodeId,
      baseUrl: msg.baseUrl,
      domains: msg.domains || [],
      capabilities: msg.capabilities || {},
      system: msg.system || {},
      lastSeen: new Date().toISOString(),
    });

    res.json({
      registered: true,
      hubNodeId: nodeId,
      peerCount: peers.size + 1, // +1 for self
    });
  });

  // ── Config ────────────────────────────────────────────────

  app.get('/api/config', (_req, res) => {
    res.json({
      nodeId,
      maxConcurrent,
      totalDomains: workers.size,
      domains: Array.from(workers.entries()).map(([domain, entry]) => ({
        domain,
        ...entry.config,
      })),
    });
  });

  // ── Run History ───────────────────────────────────────────

  app.get('/api/runs', (req, res) => {
    const domain = req.query.domain || null;
    const limit = parseInt(req.query.limit, 10) || 5;
    const runs = [];

    if (domain) {
      const entry = _getWorker(domain);
      if (!entry) return res.status(404).json({ error: `Domain not found: ${domain}` });
      runs.push({ domain, runs: entry.adapter.getRunHistory(limit) });
    } else {
      for (const [d, entry] of workers) {
        runs.push({ domain: d, runs: entry.adapter.getRunHistory(limit) });
      }
    }

    res.json({ nodeId, runs });
  });

  // ── Error handler ─────────────────────────────────────────

  app.use((err, _req, res, _next) => {
    console.error(`[PeerCrawlServer] Error:`, err?.message || err);
    res.status(500).json({ error: err?.message || String(err) });
  });

  return {
    app,
    orchestrator: {
      nodeId,
      workers,
      peers,
      getWorker: _getWorker,
      createWorker: _createWorker,
      getRunningCount: _getRunningCount,
    },
  };
}

/**
 * Create and start a full peer server.
 *
 * @param {Object} options - Same as createPeerApp + { port, host }
 * @returns {{ app, orchestrator, start: Function, stop: Function }}
 */
function createPeerServer(options = {}) {
  const { port = 0, host = '0.0.0.0' } = options;
  const { app, orchestrator } = createPeerApp(options);
  let server = null;

  return {
    app,
    orchestrator,

    async start() {
      if (server) throw new Error('Server already started');

      return new Promise((resolve, reject) => {
        server = app
          .listen(port, host, () => {
            const addr = server.address();
            console.log(`[PeerCrawlServer] Node ${orchestrator.nodeId} listening on http://${host}:${addr.port}`);
            console.log(`[PeerCrawlServer] Domains: ${orchestrator.workers.size}`);
            resolve({ host, port: addr.port, nodeId: orchestrator.nodeId });
          })
          .on('error', reject);
      });
    },

    async stop() {
      // Stop all crawlers
      for (const [, entry] of orchestrator.workers) {
        if (entry.state === 'running') {
          try { entry.adapter.stop(); } catch (_) {}
        }
        // Dispose crawler resources
        if (typeof entry.crawler.dispose === 'function') {
          try { await entry.crawler.dispose(); } catch (_) {}
        }
      }

      if (!server) return;
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) { reject(err); return; }
          server = null;
          resolve();
        });
      });
    },
  };
}

module.exports = {
  createPeerApp,
  createPeerServer,
};
