'use strict';

/**
 * Crawl worker - runs as a spawned Node.js process (not Electron fork)
 * Reads config from stdin, outputs JSON messages to stdout
 */

const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');

// Suppress stdout from crawler internals - we use structured JSON output
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = () => {};
console.warn = () => {};
// Keep console.error for debugging (goes to stderr, not captured as messages)
console.error = (...args) => {
  originalError('[worker]', ...args);
};

let stopRequested = false;
let telemetry = null;

// Output JSON message to stdout (parent reads these)
function send(type, data) {
  const msg = type === 'log' 
    ? { type: 'log', text: data }
    : { type, data };
  originalLog(JSON.stringify(msg));
}

// Read config from stdin (sent by parent)
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === 'start') {
      rl.close();
      try {
        await runCrawl(msg.config);
      } catch (err) {
        originalError('runCrawl failed:', err);
        send('error', err.message || String(err));
        process.exit(1);
      }
    } else if (msg.type === 'stop') {
      stopRequested = true;
      send('log', '🛑 Stopping...');
    }
  } catch (e) {
    originalError('Failed to parse stdin:', e);
  }
});

rl.on('close', () => {
  // stdin closed, that's fine
});

async function runCrawl(config) {
  send('log', '📦 Loading crawler modules...');
  
  let CrawlTelemetryBridge, TaskEventWriter, createCrawlService;
  
  try {
    CrawlTelemetryBridge = require('../src/crawler/telemetry/CrawlTelemetryBridge').CrawlTelemetryBridge;
    send('log', '  ✓ CrawlTelemetryBridge');
  } catch (err) {
    send('error', `Failed to load CrawlTelemetryBridge: ${err.message}`);
    throw err;
  }
  
  try {
    TaskEventWriter = require('../src/db/TaskEventWriter').TaskEventWriter;
    send('log', '  ✓ TaskEventWriter');
  } catch (err) {
    send('error', `Failed to load TaskEventWriter: ${err.message}`);
    throw err;
  }
  
  try {
    createCrawlService = require('../src/server/crawl-api').createCrawlService;
    send('log', '  ✓ createCrawlService');
  } catch (err) {
    send('error', `Failed to load createCrawlService: ${err.message}`);
    throw err;
  }
  
  const dbPath = path.join(process.cwd(), 'data', 'news.db');
  send('log', `📂 Opening database: ${dbPath}`);
  const db = new Database(dbPath);
  
  const jobId = `crawler-app-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  
  send('log', `📋 Job ID: ${jobId}`);
  
  // Track progress
  let downloaded = 0;
  let errors = 0;
  let lastUrl = '';
  
  // Create event writer for persistence
  const eventWriter = new TaskEventWriter(db, { batchWrites: true });
  
  // Create bridge with custom broadcast that captures progress
  const bridge = new CrawlTelemetryBridge({
    broadcastUrlEvents: true,
    urlEventBatchInterval: 200,
    urlEventBatchSize: 5,
    broadcast: (event) => {
      // Persist to DB
      eventWriter.writeTelemetryEvent(event);
      
      // Extract progress from events
      if (event.type === 'crawl:url:batch' && Array.isArray(event.data?.urls)) {
        downloaded += event.data.urls.length;
        lastUrl = event.data.urls[event.data.urls.length - 1]?.url || lastUrl;
        send('progress', { downloaded, errors, lastUrl, target: config.maxPages });
      } else if (event.type === 'crawl:url:visited') {
        downloaded++;
        lastUrl = event.data?.url || lastUrl;
        send('progress', { downloaded, errors, lastUrl, target: config.maxPages });
      } else if (event.type === 'crawl:url:error') {
        errors++;
        send('progress', { downloaded, errors, lastUrl, target: config.maxPages });
      } else if (event.type === 'crawl:progress') {
        // Use progress events for more accurate counts
        const d = event.data || {};
        if (d.downloaded != null) downloaded = d.downloaded;
        if (d.errors != null) errors = d.errors;
        send('progress', { downloaded, errors, lastUrl, target: config.maxPages });
      }
    }
  });
  
  // Create a minimal telemetry object that the crawl service expects
  telemetry = {
    bridge,
    connectCrawler: (crawler) => bridge.connectCrawler(crawler),
    getEventWriter: () => eventWriter,
    destroy: () => {
      bridge.destroy();
      eventWriter.flush();
    }
  };

  const service = createCrawlService({ telemetryIntegration: telemetry });

  try {
    send('log', `🌐 Crawling ${config.url}`);
    
    const result = await service.runOperation({
      logger: {
        info: () => {},
        warn: (msg) => send('log', `⚠️ ${msg}`),
        error: (msg) => send('log', `❌ ${msg}`),
        debug: () => {}
      },
      operationName: 'basicArticleCrawl',
      startUrl: config.url,
      overrides: {
        maxPagesPerDomain: config.maxPages,
        maxDepth: config.maxDepth || 3,
        crawlTimeoutMs: 600000, // 10 minutes
        jobId,
        concurrency: config.concurrency || 2,
        outputVerbosity: 'extra-terse'
      }
    });

    send('complete', { 
      downloaded, 
      errors,
      status: result?.status || 'complete'
    });

  } catch (err) {
    originalError('[worker] Crawl error:', err);
    originalError('[worker] Stack:', err.stack);
    send('error', err.message || String(err));
  } finally {
    await new Promise(r => setTimeout(r, 600));
    if (telemetry) telemetry.destroy();
    db.close();
    process.exit(0);
  }
}

process.on('uncaughtException', (err) => {
  send('error', `Uncaught: ${err.message}`);
  process.exit(1);
});
