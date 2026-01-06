'use strict';

/**
 * Standalone crawl API server for the Electron crawler app.
 * Runs as a separate Node.js process and exposes HTTP endpoints.
 * 
 * Logs are sent to the MCP memory server for AI agent access.
 */

const { createCrawlApiServer } = require('../src/server/crawl-api');
const { createMcpLogger } = require('../src/utils/mcpLogger');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = parseInt(process.env.CRAWL_API_PORT, 10) || 3099;
const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

// Create a session ID based on current date
const sessionId = `crawl-${new Date().toISOString().slice(0, 10)}`;

// Create logger with MCP integration
// vitalOnly: only warn/error to console, but full logging to file/MCP for agent access
const logger = createMcpLogger({
  app: 'CRWL',
  session: sessionId,
  console: true,
  vitalOnly: true,  // Keep console clean - agents can read full logs via MCP
  file: true,
  mcp: false        // Use file-based logging (faster, no HTTP overhead)
});

// Track active crawl job
let activeJob = null;

// Simple in-process job registry for tracking the single active crawl
const inProcessJobRegistry = {
  jobs: new Map(),
  
  startOperation({ logger, operationName, startUrl, overrides }) {
    const jobId = `job-${Date.now()}`;
    const { createCrawlService } = require('../src/server/crawl-api/core/crawlService');
    const service = createCrawlService();
    
    const job = {
      id: jobId,
      operationName,
      startUrl,
      overrides,
      status: 'running',
      startedAt: new Date().toISOString(),
      progress: { downloaded: 0, errors: 0 },
      stopRequested: false
    };
    
    this.jobs.set(jobId, job);
    activeJob = job;
    
    // Run the operation asynchronously
    (async () => {
      try {
        // Inject progress tracking into overrides
        const trackingOverrides = {
          ...overrides,
          onProgress: (data) => {
            job.progress = { ...job.progress, ...data };
          }
        };
        
        const result = await service.runOperation({
          logger,
          operationName,
          startUrl,
          overrides: trackingOverrides
        });
        
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date().toISOString();
      } catch (err) {
        job.status = 'error';
        job.error = err.message;
        job.completedAt = new Date().toISOString();
      }
    })();
    
    return { jobId, job };
  },
  
  list() {
    return Array.from(this.jobs.values());
  },
  
  get(jobId) {
    return this.jobs.get(jobId);
  },
  
  async stop(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.stopRequested = true;
    job.status = 'stopping';
    return true;
  },
  
  async pause(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.status = 'paused';
    return true;
  },
  
  async resume(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.status = 'running';
    return true;
  }
};

async function main() {
  logger.info('Starting crawl API server', { port: PORT, session: sessionId });
  
  const server = createCrawlApiServer({
    port: PORT,
    framework: 'express',
    version: 'v1',
    inProcessJobRegistry,
    logger: {
      info: (msg, data) => logger.info(msg, data),
      warn: (msg, data) => logger.warn(msg, data),
      error: (msg, data) => logger.error(msg, data),
      debug: () => {} // suppress debug
    }
  });
  
  // Add extra endpoints for Electron app
  server.app.get('/api/stats', (req, res) => {
    try {
      const db = new Database(DB_PATH, { readonly: true });
      
      const dailyStats = db.prepare(`
        SELECT date(fetched_at) as day, COUNT(*) as count 
        FROM http_responses 
        WHERE fetched_at IS NOT NULL 
        GROUP BY date(fetched_at) 
        ORDER BY day DESC 
        LIMIT 30
      `).all();
      
      const total = db.prepare('SELECT COUNT(*) as count FROM http_responses').get();
      
      db.close();
      
      res.json({
        status: 'ok',
        total: total.count,
        daily: dailyStats.reverse()
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: err.message });
    }
  });
  
  server.app.get('/api/active-job', (req, res) => {
    res.json({ status: 'ok', job: activeJob });
  });
  
  await server.start();
  logger.info('Crawl API server started', { 
    url: `http://localhost:${PORT}`,
    endpoints: [
      'GET /v1/availability',
      'POST /v1/operations/:name/start',
      'GET /v1/jobs/:id',
      'GET /api/stats',
      'GET /api/active-job'
    ]
  });
}

main().catch(err => {
  logger.error('Failed to start crawl API server', { error: err.message });
  process.exit(1);
});
