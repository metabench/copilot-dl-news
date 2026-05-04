/**
 * Unified Progress Server
 * 
 * Combines crawl and analysis progress monitoring in a single dashboard.
 * Both processes auto-start on first SSE connection.
 * 
 * Usage:
 *   node labs/crawler-progress-integration/server.js
 *   node labs/crawler-progress-integration/server.js --port 3100
 *   node labs/crawler-progress-integration/server.js --crawl-url https://example.com
 */
'use strict';

const express = require('express');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// ─────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    port: 3100,
    crawlUrl: 'https://www.bbc.com/news',
    crawlPages: 5,
    analysisLimit: 10,
    autoStart: true,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    switch (arg) {
      case '--port':
        flags.port = parseInt(next, 10);
        i++;
        break;
      case '--crawl-url':
        flags.crawlUrl = next;
        i++;
        break;
      case '--crawl-pages':
        flags.crawlPages = parseInt(next, 10);
        i++;
        break;
      case '--analysis-limit':
        flags.analysisLimit = parseInt(next, 10);
        i++;
        break;
      case '--no-auto-start':
        flags.autoStart = false;
        break;
      case '-v':
      case '--verbose':
        flags.verbose = true;
        break;
    }
  }

  return flags;
}

const config = parseArgs(process.argv);

// ─────────────────────────────────────────────────────────────
// Process managers
// ─────────────────────────────────────────────────────────────

/**
 * Creates an observable-like wrapper around a child process with output parsing
 */
function createProcessObservable(processBuilder, options = {}) {
  const { onProgress, onComplete, onError, verbose = false } = options;
  
  let process = null;
  let isRunning = false;
  let startTime = null;
  let lastState = null;

  function start() {
    if (isRunning) return Promise.reject(new Error('Already running'));
    
    return new Promise((resolve, reject) => {
      isRunning = true;
      startTime = Date.now();

      try {
        process = processBuilder();
      } catch (err) {
        isRunning = false;
        if (onError) onError(err);
        return reject(err);
      }

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        if (verbose) console.log('[process stdout]', text.trim());
        
        // Parse progress from output
        const progressState = parseProgressFromOutput(text, lastState);
        if (progressState) {
          lastState = progressState;
          if (onProgress) onProgress(progressState);
        }
      });

      process.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        if (verbose) console.error('[process stderr]', text.trim());
      });

      process.on('error', (err) => {
        isRunning = false;
        if (onError) onError(err);
        reject(err);
      });

      process.on('close', (code) => {
        isRunning = false;
        const result = {
          exitCode: code,
          elapsedMs: Date.now() - startTime,
          stdout,
          stderr
        };
        if (onComplete) onComplete(result);
        resolve(result);
      });
    });
  }

  function stop() {
    if (process && isRunning) {
      process.kill('SIGTERM');
    }
  }

  function getState() {
    return lastState;
  }

  return { start, stop, getState, get isRunning() { return isRunning; } };
}

/**
 * Parse progress information from process output
 */
function parseProgressFromOutput(text, prevState) {
  const lines = text.split('\n');
  let state = prevState ? { ...prevState } : {
    phase: 'running',
    processed: 0,
    total: 0,
    message: '',
    elapsedMs: 0
  };

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Parse PAGE events (crawl)
    const pageMatch = trimmed.match(/PAGE\s+(\d+)/i);
    if (pageMatch) {
      state.processed = parseInt(pageMatch[1], 10);
      state.message = trimmed;
    }
    
    // Parse progress percentages
    const percentMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      const percent = parseFloat(percentMatch[1]);
      if (state.total > 0) {
        state.processed = Math.round((percent / 100) * state.total);
      }
    }

    // Parse counts like "10/50" or "processed: 10"
    const countMatch = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
    if (countMatch) {
      state.processed = parseInt(countMatch[1], 10);
      state.total = parseInt(countMatch[2], 10);
    }

    // Parse completion
    if (/complete|finished|done/i.test(trimmed)) {
      state.phase = 'complete';
    }
    if (/error|failed/i.test(trimmed)) {
      state.phase = 'error';
    }
  }

  return state;
}

// ─────────────────────────────────────────────────────────────
// Express server
// ─────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// SSE clients
const sseClients = {
  crawl: new Set(),
  analysis: new Set(),
  unified: new Set()
};

// Process observables
let crawlObservable = null;
let analysisObservable = null;

// Latest states for late-joining clients
let crawlState = { phase: 'idle', processed: 0, total: 0, message: 'Waiting to start...' };
let analysisState = { phase: 'idle', processed: 0, total: 0, message: 'Waiting to start...' };

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    crawlRunning: crawlObservable?.isRunning || false,
    analysisRunning: analysisObservable?.isRunning || false,
    clients: {
      crawl: sseClients.crawl.size,
      analysis: sseClients.analysis.size,
      unified: sseClients.unified.size
    }
  });
});

// Configuration
app.get('/api/config', (req, res) => {
  res.json({
    crawlUrl: config.crawlUrl,
    crawlPages: config.crawlPages,
    analysisLimit: config.analysisLimit,
    autoStart: config.autoStart
  });
});

// ─────────────────────────────────────────────────────────────
// SSE Endpoints
// ─────────────────────────────────────────────────────────────

function setupSSE(res, clientSet) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  clientSet.add(res);

  res.on('close', () => {
    clientSet.delete(res);
  });

  return res;
}

function broadcast(clientSet, message) {
  const data = JSON.stringify(message);
  for (const client of clientSet) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (e) {
      clientSet.delete(client);
    }
  }
}

// Unified SSE endpoint (both crawl + analysis)
app.get('/sse/progress', (req, res) => {
  setupSSE(res, sseClients.unified);
  
  // Send current states
  res.write(`data: ${JSON.stringify({ type: 'crawl', value: crawlState })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: 'analysis', value: analysisState })}\n\n`);
  
  // Auto-start on first connection
  if (config.autoStart && sseClients.unified.size === 1) {
    setTimeout(() => {
      if (!crawlObservable?.isRunning) startCrawl();
    }, 500);
  }
});

// Crawl-only SSE
app.get('/sse/crawl', (req, res) => {
  setupSSE(res, sseClients.crawl);
  res.write(`data: ${JSON.stringify({ type: 'crawl', value: crawlState })}\n\n`);
});

// Analysis-only SSE
app.get('/sse/analysis', (req, res) => {
  setupSSE(res, sseClients.analysis);
  res.write(`data: ${JSON.stringify({ type: 'analysis', value: analysisState })}\n\n`);
});

// ─────────────────────────────────────────────────────────────
// Process control API
// ─────────────────────────────────────────────────────────────

function startCrawl() {
  if (crawlObservable?.isRunning) return;
  
  crawlState = {
    phase: 'starting',
    processed: 0,
    total: config.crawlPages,
    message: `Starting crawl: ${config.crawlUrl}`,
    startedAt: Date.now()
  };
  broadcastCrawlState();

  crawlObservable = createProcessObservable(
    () => spawn('node', [
      path.join(__dirname, '../../tools/dev/mini-crawl.js'),
      config.crawlUrl,
      '--max-pages', String(config.crawlPages),
      '--downloads-only'
    ], { cwd: path.join(__dirname, '../..') }),
    {
      verbose: config.verbose,
      onProgress: (state) => {
        crawlState = { ...crawlState, ...state, phase: 'crawling' };
        broadcastCrawlState();
      },
      onComplete: (result) => {
        crawlState = {
          ...crawlState,
          phase: result.exitCode === 0 ? 'complete' : 'error',
          message: result.exitCode === 0 ? 'Crawl complete' : 'Crawl failed',
          elapsedMs: result.elapsedMs
        };
        broadcastCrawlState();
        
        // Auto-start analysis after crawl completes
        if (result.exitCode === 0 && config.autoStart) {
          setTimeout(() => startAnalysis(), 1000);
        }
      },
      onError: (err) => {
        crawlState = { ...crawlState, phase: 'error', message: err.message };
        broadcastCrawlState();
      }
    }
  );

  crawlObservable.start().catch((err) => {
    console.error('[crawl] Failed:', err.message);
  });
}

function startAnalysis() {
  if (analysisObservable?.isRunning) return;
  
  analysisState = {
    phase: 'starting',
    processed: 0,
    total: config.analysisLimit,
    message: 'Starting analysis...',
    startedAt: Date.now()
  };
  broadcastAnalysisState();

  analysisObservable = createProcessObservable(
    () => spawn('node', [
      path.join(__dirname, '../analysis-observable/run-lab.js'),
      '--limit', String(config.analysisLimit),
      '--headless'
    ], { cwd: path.join(__dirname, '../..') }),
    {
      verbose: config.verbose,
      onProgress: (state) => {
        analysisState = { ...analysisState, ...state, phase: 'analyzing' };
        broadcastAnalysisState();
      },
      onComplete: (result) => {
        analysisState = {
          ...analysisState,
          phase: result.exitCode === 0 ? 'complete' : 'error',
          message: result.exitCode === 0 ? 'Analysis complete' : 'Analysis failed',
          elapsedMs: result.elapsedMs
        };
        broadcastAnalysisState();
      },
      onError: (err) => {
        analysisState = { ...analysisState, phase: 'error', message: err.message };
        broadcastAnalysisState();
      }
    }
  );

  analysisObservable.start().catch((err) => {
    console.error('[analysis] Failed:', err.message);
  });
}

function broadcastCrawlState() {
  const msg = { type: 'crawl', value: crawlState, timestampMs: Date.now() };
  broadcast(sseClients.crawl, msg);
  broadcast(sseClients.unified, msg);
}

function broadcastAnalysisState() {
  const msg = { type: 'analysis', value: analysisState, timestampMs: Date.now() };
  broadcast(sseClients.analysis, msg);
  broadcast(sseClients.unified, msg);
}

// Control endpoints
app.post('/api/crawl/start', (req, res) => {
  if (crawlObservable?.isRunning) {
    return res.status(409).json({ error: 'Crawl already running' });
  }
  startCrawl();
  res.json({ status: 'started' });
});

app.post('/api/crawl/stop', (req, res) => {
  if (crawlObservable) {
    crawlObservable.stop();
    res.json({ status: 'stopping' });
  } else {
    res.json({ status: 'not-running' });
  }
});

app.post('/api/analysis/start', (req, res) => {
  if (analysisObservable?.isRunning) {
    return res.status(409).json({ error: 'Analysis already running' });
  }
  startAnalysis();
  res.json({ status: 'started' });
});

app.post('/api/analysis/stop', (req, res) => {
  if (analysisObservable) {
    analysisObservable.stop();
    res.json({ status: 'stopping' });
  } else {
    res.json({ status: 'not-running' });
  }
});

app.post('/api/stop-all', (req, res) => {
  if (crawlObservable) crawlObservable.stop();
  if (analysisObservable) analysisObservable.stop();
  res.json({ status: 'stopping' });
});

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`\n🚀 Unified Progress Server`);
  console.log(`   URL:         http://localhost:${config.port}`);
  console.log(`   Crawl URL:   ${config.crawlUrl}`);
  console.log(`   Crawl Pages: ${config.crawlPages}`);
  console.log(`   Analysis:    ${config.analysisLimit} pages`);
  console.log(`   Auto-Start:  ${config.autoStart ? 'Yes' : 'No'}`);
  console.log(`\n   Open http://localhost:${config.port} in your browser\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (crawlObservable) crawlObservable.stop();
  if (analysisObservable) analysisObservable.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, config };
