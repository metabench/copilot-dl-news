/**
 * Analysis Server - Express server with SSE endpoint for analysis progress
 */
'use strict';

const express = require('express');
const path = require('path');
const { createAnalysisObservable } = require('./analysis-observable');
const { getAnalysisVersionStats, getPendingCount, resolveTargetVersion } = require('./analysis-version');

/**
 * Create the analysis server
 * @param {Object} options
 * @param {number} [options.port] - Server port (default 3099)
 * @param {number} [options.limit] - Analysis page limit
 * @param {boolean} [options.verbose] - Verbose logging
 * @param {boolean} [options.dryRun] - Dry run mode
 * @param {boolean} [options.autoStart] - Start analysis on first SSE connection
 * @param {number} [options.analysisVersion] - Target analysis version (pages with lower version will be analyzed)
 * @param {boolean} [options.forceNewVersion] - Force a new version iteration
 */
function createAnalysisServer(options = {}) {
  const {
    port = 3099,
    limit = null,
    verbose = false,
    dryRun = false,
    autoStart = true,
    analysisVersion = null,
    timeout = 5000,
    logSpeed = false,
    forceNewVersion = false,
    immediateStart = false,
    onNext = null,
    onComplete = null,
    onError = null
  } = options;

  const stats = getAnalysisVersionStats();
  const resolvedAnalysisVersion = analysisVersion ?? resolveTargetVersion(stats, forceNewVersion);

  const app = express();
  let server = null;
  let analysisObs = null;
  let analysisPromise = null;
  const sseClients = new Set();

  // Serve static files
  app.use(express.static(path.join(__dirname, 'public')));

  // Kiosk mode: big progress bar view (useful for long runs)
  app.get('/kiosk', (_req, res) => {
    res.redirect('/?view=kiosk&autostart=1');
  });
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      analysisRunning: analysisObs?.isRunning || false,
      connectedClients: sseClients.size
    });
  });

  // Version info
  app.get('/api/version-info', (req, res) => {
    try {
      const stats = getAnalysisVersionStats();
      const targetVersion = resolvedAnalysisVersion;
      const pendingCount = getPendingCount(targetVersion);
      res.json({
        currentMaxVersion: stats.maxVersion,
        targetVersion,
        nextVersion: stats.nextVersion,
        totalRecords: stats.totalRecords,
        pendingRecords: pendingCount,
        topHosts: stats.topHosts.slice(0, 5),
        versionDistribution: stats.versionDistribution.slice(0, 5)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SSE endpoint for progress
  app.get('/sse/analysis-progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'info', message: 'connected' })}\n\n`);

    sseClients.add(res);

    // Send current state if available
    if (analysisObs) {
      const state = analysisObs.getState();
      if (state) {
        res.write(`data: ${JSON.stringify({ type: 'next', value: state })}\n\n`);
      }
    }

    // Auto-start analysis on first connection
    if (autoStart && !analysisObs && sseClients.size === 1) {
      startAnalysis();
    }

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // API to start analysis manually
  app.post('/api/analysis/start', (req, res) => {
    if (analysisObs?.isRunning) {
      return res.status(409).json({ error: 'Analysis already running' });
    }

    const requestLimit = req.body?.limit || limit;
    const analysisOptions = req.body?.analysisOptions || {};
    startAnalysis(requestLimit, analysisOptions);
    res.json({ status: 'started', limit: requestLimit });
  });

  // API to get current state
  app.get('/api/analysis/state', (req, res) => {
    if (!analysisObs) {
      return res.json({ state: null, running: false });
    }
    res.json({
      state: analysisObs.getState(),
      running: analysisObs.isRunning
    });
  });

  // API to stop analysis
  app.post('/api/analysis/stop', (req, res) => {
    if (analysisObs) {
      analysisObs.stop();
      res.json({ status: 'stopping' });
    } else {
      res.json({ status: 'not-running' });
    }
  });

  /**
   * Broadcast message to all SSE clients
   */
  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of sseClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (e) {
        sseClients.delete(client);
      }
    }
  }

  /**
   * Start the analysis with observable
   */
  function startAnalysis(analysisLimit = limit, analysisOptions = {}) {
    analysisObs = createAnalysisObservable({
      limit: analysisLimit,
      verbose,
      dryRun,
      emitIntervalMs: 100,
      analysisVersion: resolvedAnalysisVersion,
      analysisOptions,
      timeout,
      logSpeed
    });

    // Subscribe and broadcast to all SSE clients
    analysisObs.subscribe({
      next: (msg) => {
        broadcast(msg);
        if (onNext) onNext(msg);
      },
      complete: (msg) => {
        broadcast(msg);
        if (onComplete) onComplete(msg);
      },
      error: (msg) => {
        broadcast(msg);
        if (onError) onError(msg);
      }
    });

    // Start and capture promise for cleanup
    analysisPromise = analysisObs.start().catch((err) => {
      console.error('[analysis-server] Analysis failed:', err.message);
    });

    return analysisPromise;
  }

  /**
   * Start the server
   */
  async function start() {
    return new Promise((resolve) => {
      server = app.listen(port, () => {
        console.log(`[analysis-server] Listening on http://localhost:${port}`);
        if (immediateStart) {
          startAnalysis();
        }
        resolve({ port, url: `http://localhost:${port}` });
      });
    });
  }

  /**
   * Stop the server
   */
  async function stop() {
    // Close all SSE connections
    for (const client of sseClients) {
      try {
        client.end();
      } catch (_) {}
    }
    sseClients.clear();

    // Stop analysis if running
    if (analysisObs) {
      analysisObs.stop();
    }

    // Wait for analysis to complete
    if (analysisPromise) {
      try {
        await Promise.race([
          analysisPromise,
          new Promise(r => setTimeout(r, 2000))
        ]);
      } catch (_) {}
    }

    // Close server
    if (server) {
      return new Promise((resolve) => {
        server.close(() => {
          console.log('[analysis-server] Server closed');
          resolve();
        });
      });
    }
  }

  return {
    app,
    start,
    stop,
    startAnalysis,
    get isRunning() { return analysisObs?.isRunning || false; }
  };
}

// Run standalone
if (require.main === module) {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1], 10) 
    : null;
  const verbose = args.includes('--verbose');
  const dryRun = args.includes('--dry-run');
  const port = args.includes('--port')
    ? parseInt(args[args.indexOf('--port') + 1], 10)
    : 3099;

  const server = createAnalysisServer({ port, limit, verbose, dryRun });
  
  server.start().then(({ url }) => {
    console.log(`Open ${url} in browser to view progress`);
    console.log('Analysis will start when browser connects');
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

module.exports = { createAnalysisServer };
