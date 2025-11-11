#!/usr/bin/env node

/**
 * API Server with Swagger/OpenAPI Documentation
 *
 * Standalone API server providing comprehensive REST endpoints for:
 * - Crawl management
 * - Background tasks
 * - Article analysis
 * - Place hub discovery and validation
 * - Gazetteer management
 *
 * Swagger UI available at: http://localhost:3000/api-docs
 * OpenAPI spec download: http://localhost:3000/api-docs.json
 */

'use strict';

const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { createWritableDbAccessor } = require('../deprecated-ui/express/db/writableDb');

// Load OpenAPI specification
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiSpec = YAML.load(fs.readFileSync(openApiPath, 'utf8'));

// Import route modules
const { createHealthRouter } = require('./routes/health');
const { createPlaceHubsRouter } = require('./routes/place-hubs');
const { createBackgroundTasksRouter } = require('./routes/background-tasks');
const { createAnalysisRouter } = require('./routes/analysis');
const { createCrawlsRouter } = require('./routes/crawls');

/**
 * Create and configure the API server
 * @param {Object} options - Server configuration options
 * @param {string} options.dbPath - Path to SQLite database
 * @param {number} options.port - Server port (default: 3000)
 * @param {boolean} options.verbose - Enable verbose logging
 * @param {Console} [options.logger=console] - Logger forwarded to request logging and crawl routes
 * @param {Function} [options.createCrawlService] - Factory used to create the crawl service
 * @param {Object} [options.crawlService] - Preconfigured crawl service instance
 * @param {Object} [options.crawlServiceOptions] - Options passed to the crawl service factory
 * @param {string} [options.crawlBasePath='/api/v1/crawl'] - Base path used for crawl API routes
 * @param {Object} [options.backgroundTaskManager] - BackgroundTaskManager instance for task routes
 * @param {Function} [options.getDbRW] - Function returning the writable database handle
 * @param {Object} [options.jobRegistry] - Job registry instance for crawl job routes
 * @param {Function} [options.broadcastProgress] - Broadcast function for crawl job progress updates
 * @param {Function} [options.broadcastJobs] - Broadcast function for crawl job snapshots
 * @returns {express.Application} Configured Express app
 */
function createApiServer(options = {}) {
  const app = express();
  const port = options.port || process.env.PORT || 3000;
  const dbPath = options.dbPath || path.join(process.cwd(), 'data', 'news.db');
  const logger = options.logger || console;
  const registerCrawlApiV1Routes = require('./route-loaders/crawl-v1').registerCrawlApiV1Routes;
  const getDbRW = typeof options.getDbRW === 'function'
    ? options.getDbRW
    : createWritableDbAccessor({
        ensureDb,
        urlsDbPath: dbPath,
        verbose: Boolean(options.verbose),
        logger
      });

  // Middleware
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (options.verbose) {
        const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
        if (logger && typeof logger.info === 'function') {
          logger.info(message);
        } else if (logger && typeof logger.log === 'function') {
          logger.log(message);
        } else {
          console.log(message);
        }
      }
    });
    next();
  });

  // CORS headers (allow all origins for now)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Attach database path to app locals
  app.locals.dbPath = dbPath;
  app.locals.verbose = options.verbose || false;
  app.locals.logger = logger;
  app.locals.getDbRW = getDbRW;
  app.locals.backgroundTaskManager = options.backgroundTaskManager || null;
  app.locals.jobRegistry = options.jobRegistry || null;

  // Swagger UI customization options
  const swaggerOptions = {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'News Crawler API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true
    }
  };

  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(openApiSpec, swaggerOptions));

  // Serve OpenAPI spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.json(openApiSpec);
  });

  // Serve OpenAPI spec as YAML
  app.get('/api-docs.yaml', (req, res) => {
    res.type('text/yaml');
    res.send(fs.readFileSync(openApiPath, 'utf8'));
  });

  // Mount API routes
  app.use('/api', createHealthRouter({ dbPath }));
  app.use('/api/place-hubs', createPlaceHubsRouter({ dbPath }));
  app.use('/api/background-tasks', createBackgroundTasksRouter({
    taskManager: options.backgroundTaskManager,
    getDbRW,
    logger
  }));
  app.use('/api/analysis', createAnalysisRouter({
    getDbRW,
    logger
  }));
  app.use('/api/crawls', createCrawlsRouter({
    jobRegistry: options.jobRegistry,
    broadcastProgress: options.broadcastProgress,
    broadcastJobs: options.broadcastJobs,
    logger
  }));
  registerCrawlApiV1Routes(app, {
    basePath: options.crawlBasePath || '/api/v1/crawl',
    logger,
    crawlService: options.crawlService,
    createCrawlService: options.createCrawlService,
    serviceOptions: options.crawlServiceOptions
  });

  // Root endpoint - redirect to API docs
  app.get('/', (req, res) => {
    res.redirect('/api-docs');
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString()
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    if (logger && typeof logger.error === 'function') {
      logger.error('API Error:', err);
    } else {
      console.error('API Error:', err);
    }
    res.status(err.status || 500).json({
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}


/**
 * Start the API server
 * @param {Object} options - Server options
 * @returns {Promise<Object>} Server instance with close() method
 */
async function startApiServer(options = {}) {
  const app = createApiServer(options);
  const port = options.port || 3000;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err) => {
      if (err) {
        return reject(err);
      }

      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│                                                             │');
      console.log('│  🚀 News Crawler API Server                                │');
      console.log('│                                                             │');
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│  Server:          http://localhost:${port}                        │`);
      console.log(`│  API Docs:        http://localhost:${port}/api-docs              │`);
      console.log(`│  OpenAPI Spec:    http://localhost:${port}/api-docs.json         │`);
      console.log('│                                                             │');
      console.log(`│  Database:        ${options.dbPath || 'data/news.db'}${' '.repeat(Math.max(0, 27 - (options.dbPath || 'data/news.db').length))}│`);
      console.log('└─────────────────────────────────────────────────────────────┘');

      resolve({
        app,
        server,
        port,
        getDbRW: app.locals.getDbRW,
        close: () => new Promise((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        })
      });
    });
  });
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.PORT || '3000', 10),
    dbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--db' && args[i + 1]) {
      options.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
News Crawler API Server

Usage: node src/api/server.js [options]

Options:
  --port <number>     Server port (default: 3000, env: PORT)
  --db <path>         Database path (default: data/news.db, env: DB_PATH)
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

Environment Variables:
  PORT                Server port
  DB_PATH             Database file path
  NODE_ENV            Environment (development|production)

Examples:
  node src/api/server.js
  node src/api/server.js --port 8080 --db data/test.db --verbose
  PORT=3001 DB_PATH=data/news.db node src/api/server.js

API Documentation:
  Once started, visit http://localhost:3000/api-docs for interactive API documentation.
`);
      process.exit(0);
    }
  }

  startApiServer(options).catch((err) => {
    console.error('Failed to start API server:', err);
    process.exit(1);
  });
}

module.exports = {
  createApiServer,
  startApiServer
};
