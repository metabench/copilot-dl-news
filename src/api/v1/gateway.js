'use strict';

/**
 * REST API Gateway Server
 * 
 * Versioned REST API at port 4000 with:
 * - API key authentication (X-API-Key header)
 * - Per-key rate limiting (100/min free, 1000/min premium)
 * - OpenAPI 3.0 specification with Swagger UI
 * 
 * Endpoints:
 * - GET /health - Health check
 * - GET /api/v1/articles - List articles
 * - GET /api/v1/articles/:id - Single article
 * - GET /api/v1/articles/search - Full-text search
 * - GET /api/v1/articles/:id/similar - Similar articles
 * - GET /api/v1/domains - List domains
 * - GET /api/v1/domains/:host/articles - Domain articles
 * - GET /api/v1/stats - Overall statistics
 * - GET /api/v1/stats/daily - Daily crawl counts
 * - GET /api/docs - Swagger UI
 * 
 * Usage:
 *   node src/api/v1/gateway.js
 *   Open http://localhost:4000/api/docs
 * 
 * @module gateway
 */

const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');

const { ensureDb } = require('../../data/db/sqlite/ensureDb');
const { createApiKeyAdapter } = require('../../data/db/sqlite/v1/queries/apiKeyAdapter');
const { createArticlesAdapter } = require('../../data/db/sqlite/v1/queries/articlesAdapter');
const { createSimilarityAdapter } = require('../../data/db/sqlite/v1/queries/similarityAdapter');
const { createAuthMiddleware } = require('./middleware/auth');
const { createRateLimitMiddleware, cleanupStaleEntries } = require('./middleware/rateLimit');
const { createArticlesRouter } = require('./routes/articles');
const { createDomainsRouter } = require('./routes/domains');
const { createStatsRouter } = require('./routes/stats');
const { createExportRouter, createFeedRouter } = require('./routes/export');
const { DuplicateDetector } = require('../../intelligence/analysis/similarity/DuplicateDetector');
const { createSSEHandler, getBroadcaster } = require('../streaming');
const { createWebSocketServer } = require('../streaming');
const { Summarizer } = require('../../intelligence/analysis/summarization');
const { createSummaryAdapter } = require('../../data/db/sqlite/v1/queries/summaryAdapter');

// Default configuration
const DEFAULT_PORT = 4000;
const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'news.db');

// Read package.json for version
let packageVersion = '0.0.0';
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8')
  );
  packageVersion = packageJson.version;
} catch {
  // Ignore
}

/**
 * Load OpenAPI spec from YAML file
 * @returns {Object} OpenAPI spec
 */
function loadOpenApiSpec() {
  const specPath = path.join(__dirname, 'openapi.yaml');
  try {
    return YAML.load(fs.readFileSync(specPath, 'utf8'));
  } catch (err) {
    console.warn('[gateway] Failed to load OpenAPI spec:', err.message);
    return {
      openapi: '3.0.0',
      info: {
        title: 'News Crawler REST API',
        version: packageVersion,
        description: 'OpenAPI spec not available'
      },
      paths: {}
    };
  }
}

/**
 * Create the REST API Gateway application
 * @param {Object} options - Server options
 * @param {string} [options.dbPath] - Path to database
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {Object} [options.logger] - Logger instance
 * @param {boolean} [options.requireAuth=true] - Require API key authentication
 * @param {Object} [options.db] - Pre-opened database handle
 * @returns {Object} Express app and adapters
 */
function createGatewayApp(options = {}) {
  const {
    dbPath = DEFAULT_DB_PATH,
    verbose = false,
    logger = console,
    requireAuth = process.env.NODE_ENV !== 'test'
  } = options;

  const app = express();
  const startTime = Date.now();

  // Open database (needs write access for API key tracking)
  let db;
  if (options.db) {
    db = options.db;
  } else {
    try {
      db = ensureDb(dbPath, { readonly: false });
    } catch (err) {
      logger.error('[gateway] Failed to open database:', err);
      throw err;
    }
  }

  // Create adapters
  const apiKeyAdapter = createApiKeyAdapter(db);
  const articlesAdapter = createArticlesAdapter(db);
  const similarityAdapter = createSimilarityAdapter(db);

  // Try to load search adapter if available
  let searchAdapter = null;
  try {
    const { createSearchAdapter } = require('../../data/db/sqlite/v1/queries/searchAdapter');
    searchAdapter = createSearchAdapter(db);
  } catch {
    if (verbose) {
      logger.log('[gateway] Search adapter not available (FTS5 not configured)');
    }
  }

  // Create DuplicateDetector for similarity endpoint
  let duplicateDetector = null;
  try {
    duplicateDetector = new DuplicateDetector({
      similarityAdapter,
      articlesAdapter,
      logger
    });
    // Initialize in background (don't block startup)
    duplicateDetector.initialize().catch(err => {
      logger.error('[gateway] Failed to initialize DuplicateDetector:', err);
    });
    if (verbose) {
      logger.log('[gateway] DuplicateDetector initialized');
    }
  } catch (err) {
    if (verbose) {
      logger.log('[gateway] DuplicateDetector not available:', err.message);
    }
  }

  // Create Summarizer for article summaries
  let summarizer = null;
  try {
    const summaryAdapter = createSummaryAdapter(db);
    summarizer = new Summarizer({
      summaryAdapter,
      articlesAdapter,
      logger
    });
    if (verbose) {
      logger.log('[gateway] Summarizer initialized');
    }
  } catch (err) {
    if (verbose) {
      logger.log('[gateway] Summarizer not available:', err.message);
    }
  }

  // Store adapters for testing
  app.locals.db = db;
  app.locals.apiKeyAdapter = apiKeyAdapter;
  app.locals.articlesAdapter = articlesAdapter;
  app.locals.searchAdapter = searchAdapter;
  app.locals.similarityAdapter = similarityAdapter;
  app.locals.duplicateDetector = duplicateDetector;
  app.locals.summarizer = summarizer;
  app.locals.startTime = startTime;

  // Event broadcaster for streaming
  const broadcaster = options.broadcaster || getBroadcaster();
  app.locals.broadcaster = broadcaster;

  // Middleware
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.header('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging
  if (verbose) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    res.json({
      status: 'ok',
      uptime: uptimeSeconds,
      version: packageVersion,
      timestamp: new Date().toISOString()
    });
  });

  // OpenAPI/Swagger UI (no auth required)
  const openApiSpec = loadOpenApiSpec();
  app.use('/api/docs', swaggerUi.serve);
  app.get('/api/docs', swaggerUi.setup(openApiSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'News Crawler REST API',
    swaggerOptions: {
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true
    }
  }));
  app.get('/api/docs.json', (req, res) => res.json(openApiSpec));
  app.get('/api/docs.yaml', (req, res) => {
    res.type('text/yaml');
    res.send(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
  });

  // Auth middleware for /api/v1/*
  const authMiddleware = createAuthMiddleware({
    apiKeyAdapter,
    required: requireAuth
  });

  // Rate limit middleware
  const rateLimitMiddleware = createRateLimitMiddleware({
    apiKeyAdapter
  });

  // Apply auth and rate limit to all /api/v1 routes
  app.use('/api/v1', authMiddleware, rateLimitMiddleware);

  // SSE stream endpoint (after auth/rate limit)
  const sseHandler = createSSEHandler({
    broadcaster,
    logger
  });
  app.get('/api/v1/stream', sseHandler);
  app.get('/api/v1/stream/stats', sseHandler.stats);

  // Mount API routes
  app.use('/api/v1/articles', createArticlesRouter({
    articlesAdapter,
    searchAdapter,
    duplicateDetector,
    summarizer,
    logger
  }));

  app.use('/api/v1/domains', createDomainsRouter({
    articlesAdapter,
    logger
  }));

  app.use('/api/v1/stats', createStatsRouter({
    articlesAdapter,
    logger
  }));

  // Export endpoints
  app.use('/api/v1/export', createExportRouter({
    articlesAdapter,
    domainsAdapter: articlesAdapter,
    logger
  }));

  // Feed endpoints (RSS/Atom)
  app.use('/api/v1/feed', createFeedRouter({
    articlesAdapter,
    logger
  }));

  // API key management endpoints (admin only - for now, no auth)
  app.post('/api/admin/keys', (req, res) => {
    try {
      const { tier = 'free', name = null, ownerEmail = null } = req.body || {};
      const result = apiKeyAdapter.createKey({ tier, name, ownerEmail });
      res.status(201).json({
        success: true,
        message: 'API key created. Save this key - it cannot be retrieved later!',
        ...result
      });
    } catch (err) {
      logger.error('[gateway] Error creating API key:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to create API key'
      });
    }
  });

  app.get('/api/admin/keys', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const keys = apiKeyAdapter.listKeys(limit);
      res.json({
        success: true,
        keys
      });
    } catch (err) {
      logger.error('[gateway] Error listing API keys:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list API keys'
      });
    }
  });

  app.get('/api/admin/keys/stats', (req, res) => {
    try {
      const stats = apiKeyAdapter.getStats();
      res.json({
        success: true,
        stats
      });
    } catch (err) {
      logger.error('[gateway] Error getting key stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get stats'
      });
    }
  });

  app.delete('/api/admin/keys/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { reason } = req.body || {};
      const success = apiKeyAdapter.revokeKey(id, reason);
      if (success) {
        res.json({ success: true, message: 'API key revoked' });
      } else {
        res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'API key not found'
        });
      }
    } catch (err) {
      logger.error('[gateway] Error revoking API key:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to revoke API key'
      });
    }
  });

  // Root redirect
  app.get('/', (req, res) => {
    res.redirect('/api/docs');
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('[gateway] Error:', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred'
    });
  });

  return {
    app,
    db,
    apiKeyAdapter,
    articlesAdapter,
    searchAdapter
  };
}

/**
 * Start the REST API Gateway server
 * @param {Object} options - Server options
 * @returns {Promise<Object>} Server handle with close method
 */
async function startGatewayServer(options = {}) {
  const port = options.port || process.env.API_GATEWAY_PORT || DEFAULT_PORT;
  const { app, db, apiKeyAdapter, articlesAdapter } = createGatewayApp(options);
  const broadcaster = app.locals.broadcaster;
  const logger = options.logger || console;

  // Start periodic cleanup of rate limit store
  const cleanupInterval = setInterval(() => {
    cleanupStaleEntries();
  }, 60 * 1000); // Every minute

  return new Promise((resolve, reject) => {
    const server = app.listen(port, (err) => {
      if (err) {
        clearInterval(cleanupInterval);
        return reject(err);
      }

      // Create WebSocket server attached to HTTP server
      const wsServer = createWebSocketServer({
        server,
        path: '/api/v1/ws',
        broadcaster,
        logger,
        validateApiKey: options.requireAuth !== false
          ? (key) => apiKeyAdapter.validateKey(key)
          : null
      });
      app.locals.wsServer = wsServer;

      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│                                                             │');
      console.log('│  🌐 News Crawler REST API Gateway                          │');
      console.log('│                                                             │');
      console.log('├─────────────────────────────────────────────────────────────┤');
      console.log(`│  Server:          http://localhost:${port}                        │`);
      console.log(`│  API Docs:        http://localhost:${port}/api/docs              │`);
      console.log(`│  Health:          http://localhost:${port}/health                │`);
      console.log(`│  SSE Stream:      http://localhost:${port}/api/v1/stream         │`);
      console.log(`│  WebSocket:       ws://localhost:${port}/api/v1/ws               │`);
      console.log('│                                                             │');
      console.log('│  Authentication:  X-API-Key header required                 │');
      console.log('│  Rate Limits:     100/min (free), 1000/min (premium)        │');
      console.log('│                                                             │');
      console.log(`│  Database:        ${(options.dbPath || 'data/news.db').slice(0, 27).padEnd(27)}│`);
      console.log('└─────────────────────────────────────────────────────────────┘');

      resolve({
        app,
        server,
        port,
        db,
        apiKeyAdapter,
        articlesAdapter,
        broadcaster,
        wsServer,
        close: async () => {
          clearInterval(cleanupInterval);
          wsServer.close();
          return new Promise((resolveClose) => {
            server.close(() => {
              try {
                db.close();
              } catch {
                // Ignore
              }
              resolveClose();
            });
          });
        }
      });
    });
  });
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    port: parseInt(process.env.API_GATEWAY_PORT || '4000', 10),
    dbPath: process.env.DB_PATH || DEFAULT_DB_PATH,
    verbose: args.includes('--verbose') || args.includes('-v')
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--db' && args[i + 1]) {
      options.dbPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
News Crawler REST API Gateway

Usage: node src/api/v1/gateway.js [options]

Options:
  --port <number>     Server port (default: 4000, env: API_GATEWAY_PORT)
  --db <path>         Database path (default: data/news.db, env: DB_PATH)
  --verbose, -v       Enable verbose logging
  --help, -h          Show this help message

API Authentication:
  All /api/v1/* endpoints require an X-API-Key header.
  Create a key: POST /api/admin/keys
  
Rate Limits:
  free tier:      100 requests/minute
  premium tier:   1000 requests/minute
  unlimited tier: no limit

Endpoints:
  GET /health                     Health check (no auth)
  GET /api/docs                   Swagger UI (no auth)
  GET /api/v1/articles            List articles
  GET /api/v1/articles/:id        Get article
  GET /api/v1/articles/search     Search articles
  GET /api/v1/articles/:id/similar Similar articles
  GET /api/v1/domains             List domains
  GET /api/v1/domains/:host/articles Domain articles
  GET /api/v1/stats               Overall stats
  GET /api/v1/stats/daily         Daily counts

Real-Time Streaming:
  GET /api/v1/stream              SSE event stream
  GET /api/v1/stream?types=article:new,crawl:completed
  GET /api/v1/stream?domains=example.com
  ws://localhost:4000/api/v1/ws   WebSocket (bidirectional)

Event Types:
  crawl:started, crawl:completed, crawl:failed, crawl:progress
  article:new, article:updated, article:classified
  system:healthcheck, system:stats
`);
      process.exit(0);
    }
  }

  startGatewayServer(options)
    .then((handle) => {
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await handle.close();
        process.exit(0);
      });
    })
    .catch((err) => {
      console.error('Failed to start gateway:', err);
      process.exit(1);
    });
}

module.exports = {
  createGatewayApp,
  startGatewayServer,
  DEFAULT_PORT,
  DEFAULT_DB_PATH
};
