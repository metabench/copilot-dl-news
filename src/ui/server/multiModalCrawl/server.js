'use strict';

/**
 * Multi-Modal Crawl Server
 *
 * Provides SSE endpoint and API routes for the multi-modal intelligent crawl.
 *
 * Endpoints:
 * - GET /api/multi-modal/status - Current crawl status
 * - POST /api/multi-modal/start - Start a new crawl
 * - POST /api/multi-modal/stop - Stop current crawl
 * - POST /api/multi-modal/pause - Pause current crawl
 * - POST /api/multi-modal/resume - Resume paused crawl
 * - GET /sse/multi-modal/progress - SSE endpoint for real-time progress
 */

const express = require('express');
const { createMultiModalCrawl, MultiModalCrawlManager } = require('../../../core/crawler/multimodal');

// Track active crawl instance (singleton per process)
let activeManager = null;
let activeSseClients = new Set();

/**
 * Create Multi-Modal Crawl Router
 * @param {Object} options
 * @param {Function} options.getDbRW - Database factory function
 * @param {Object} [options.crawlOperations] - CrawlOperations instance
 * @param {Object} [options.logger] - Logger instance
 * @returns {Object} { router, close }
 */
function createMultiModalCrawlRouter({ getDbRW, crawlOperations = null, logger = console } = {}) {
  const router = express.Router();

  function getStatusPayload() {
    if (!activeManager || activeManager.sessions.size === 0) {
      return {
        status: 'idle',
        isRunning: false,
        isPaused: false,
        statistics: null,
        sessions: []
      };
    }

    const sessions = activeManager.getSessionStats();
    const primaryStats = sessions[0]?.stats || null;
    const isRunning = activeManager.isRunning || sessions.some(s => s.stats?.isRunning);
    const isPaused = sessions.some(s => s.stats?.isPaused);
    const status = sessions.length === 1
      ? (primaryStats?.phase || 'running')
      : 'multi';

    return {
      status,
      isRunning,
      isPaused,
      statistics: primaryStats,
      sessions
    };
  }

  // ─────────────────────────────────────────────────────────────
  // SSE Endpoint
  // ─────────────────────────────────────────────────────────────

  router.get('/sse/multi-modal/progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    sendSseEvent(res, { type: 'connected', timestamp: new Date().toISOString() });

    const statusPayload = getStatusPayload();
    if (statusPayload.statistics || statusPayload.sessions.length > 0) {
      sendSseEvent(res, {
        type: 'state',
        value: statusPayload.statistics,
        sessions: statusPayload.sessions
      });
    }

    activeSseClients.add(res);

    // Keepalive
    const keepaliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(':keepalive\n\n');
      }
    }, 30000);

    req.on('close', () => {
      clearInterval(keepaliveTimer);
      activeSseClients.delete(res);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // API Endpoints
  // ─────────────────────────────────────────────────────────────

  router.get('/api/multi-modal/status', (req, res) => {
    const payload = getStatusPayload();
    res.json({
      success: true,
      ...payload
    });
  });

  router.post('/api/multi-modal/start', async (req, res) => {
    if (activeManager?.isRunning || activeManager?.sessions?.size) {
      return res.status(409).json({
        success: false,
        error: 'A multi-modal crawl is already running'
      });
    }

    const {
      domain,
      domains,
      maxParallel = 2,
      batchSize = 1000,
      historicalRatio = 0.3,
      maxTotalBatches = null,
      maxTotalPages = null,
      hubDiscoveryPerBatch = true,
      balancingStrategy,
      balancerStrategy,
      hubRefreshIntervalMs = 60 * 60 * 1000,
      pauseBetweenBatchesMs = 5000,
      analysisVersion = 1
    } = req.body;

    const domainList = Array.isArray(domains) ? domains : (domain ? [domain] : []);
    if (domainList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Domain or domains list is required'
      });
    }

    try {
      const db = getDbRW();

      // Create crawl operations if not provided
      let ops = crawlOperations;
      if (!ops) {
        try {
          const { CrawlOperations } = require('../../../core/crawler/CrawlOperations');
          ops = new CrawlOperations({ logger: { log: () => {}, warn: logger.warn, error: logger.error } });
        } catch (e) {
          logger.warn('[multi-modal] Could not create CrawlOperations:', e.message);
        }
      }

      const config = {
        batchSize,
        historicalRatio,
        maxTotalBatches: maxTotalBatches || null,
        maxTotalPages: maxTotalPages || null,
        hubDiscoveryPerBatch,
        balancingStrategy: balancingStrategy || balancerStrategy || 'adaptive',
        hubRefreshIntervalMs,
        pauseBetweenBatchesMs,
        analysisVersion
      };

      activeManager = new MultiModalCrawlManager({
        maxParallel,
        logger,
        createOrchestrator: (overrides = {}) => createMultiModalCrawl({
          db,
          crawlOperations: ops,
          config: { ...config, ...overrides },
          logger
        })
      });

      wireManagerEvents(activeManager);

      activeManager.start(domainList, config, { maxParallel })
        .then((results) => {
          broadcastSse({ type: 'complete', value: { results, domains: domainList } });
          activeManager = null;
        })
        .catch((err) => {
          logger.error('[multi-modal] Crawl error:', err);
          broadcastSse({ type: 'error', error: err.message || String(err) });
          activeManager = null;
        });

      res.json({
        success: true,
        domains: domainList,
        maxParallel,
        config
      });

    } catch (error) {
      logger.error('[multi-modal] Start error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/api/multi-modal/stop', (req, res) => {
    if (!activeManager || activeManager.sessions.size === 0) {
      return res.json({
        success: true,
        message: 'No active crawl to stop'
      });
    }

    const { domain } = req.body || {};
    activeManager.stop(domain || null);
    broadcastSse({ type: 'stopping', domain: domain || null, timestamp: new Date().toISOString() });

    res.json({
      success: true,
      message: domain ? `Stop requested for ${domain}` : 'Stop requested'
    });
  });

  router.post('/api/multi-modal/pause', (req, res) => {
    if (!activeManager || activeManager.sessions.size === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active crawl to pause'
      });
    }

    const { domain } = req.body || {};
    activeManager.pause(domain || null);
    broadcastSse({ type: 'paused', domain: domain || null, timestamp: new Date().toISOString() });

    res.json({
      success: true,
      message: domain ? `Crawl paused for ${domain}` : 'Crawl paused'
    });
  });

  router.post('/api/multi-modal/resume', (req, res) => {
    if (!activeManager || activeManager.sessions.size === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active crawl to resume'
      });
    }

    const { domain } = req.body || {};
    activeManager.resume(domain || null);
    broadcastSse({ type: 'resumed', domain: domain || null, timestamp: new Date().toISOString() });

    res.json({
      success: true,
      message: domain ? `Crawl resumed for ${domain}` : 'Crawl resumed'
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  function wireManagerEvents(manager) {
    if (!manager || manager.__sseWired) return;

    const withPhase = (payload) => ({
      ...payload,
      phase: payload.phase || payload.to
    });

    const withPattern = (payload) => ({
      ...payload,
      pattern: payload.pattern || payload.significantPatterns?.[0]?.hash || null
    });

    const withHub = (payload) => {
      const hub = Array.isArray(payload.newHubs) ? payload.newHubs[0] : null;
      return {
        ...payload,
        url: payload.url || hub?.url || null,
        confidence: payload.confidence ?? hub?.confidence ?? null
      };
    };

    const withBatch = (payload) => ({
      ...payload,
      batchNumber: payload.batchNumber ?? payload.batch
    });

    const forward = (type, transform = null) => {
      manager.on(type, (payload) => {
        const value = transform ? transform(payload) : payload;
        broadcastSse({ type, value });
      });
    };

    forward('phase-change', withPhase);
    forward('batch-complete', withBatch);
    forward('pattern-learned', withPattern);
    forward('hub-discovered', withHub);
    forward('reanalysis-triggered');
    forward('progress', withBatch);
    forward('analysis-progress');
    forward('crawl-started');
    forward('crawl-complete');
    forward('crawl-error');

    manager.on('error', (payload) => {
      broadcastSse({
        type: 'error',
        error: payload?.error || payload?.message || 'Unknown error',
        value: payload
      });
    });

    manager.__sseWired = true;
  }

  function sendSseEvent(res, data) {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // Ignore write errors
    }
  }

  function broadcastSse(data) {
    const message = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    };

    for (const client of activeSseClients) {
      sendSseEvent(client, message);
    }
  }

  // Cleanup function
  function close() {
    // Close all SSE connections
    for (const client of activeSseClients) {
      try {
        client.end();
      } catch (_) {}
    }
    activeSseClients.clear();

    // Stop any active manager
    if (activeManager) {
      activeManager.stop();
      activeManager = null;
    }
  }

  return { router, close };
}

module.exports = { createMultiModalCrawlRouter };
