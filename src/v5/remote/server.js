'use strict';

const express = require('express');
const { createBootstrapRuntime, loadDomainConfigs } = require('./runtime');

function createApp(options = {}) {
  const runtime = options.runtime || createBootstrapRuntime(options);
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v5', (_req, res) => {
    res.json({
      ok: true,
      service: 'remote-crawler-v5',
      version: '5.0.0-alpha',
      mode: 'bootstrap',
      endpoints: [
        '/api/v5/health',
        '/api/v5/status',
        '/api/v5/config',
        '/api/v5/domains',
        '/api/v5/domains/:domain',
        '/api/v5/crawl/start',
        '/api/v5/crawl/stop',
        '/api/v5/hub-suggestions',
      ],
    });
  });

  app.get('/api/v5/health', (_req, res) => {
    const status = runtime.getStatus();
    res.json({
      ok: true,
      healthy: true,
      service: 'remote-crawler-v5',
      version: status.version,
      mode: status.mode,
      domains: status.orchestrator.totalDomains,
      running: status.orchestrator.currentlyRunning,
      uptimeMs: status.uptimeMs,
    });
  });

  app.get('/api/v5/status', (_req, res) => {
    res.json(runtime.getStatus());
  });

  app.get('/api/v5/config', (_req, res) => {
    res.json(runtime.getConfig());
  });

  app.get('/api/v5/domains', (_req, res) => {
    res.json({
      domains: runtime.listDomains(),
    });
  });

  app.get('/api/v5/domains/:domain', (req, res) => {
    try {
      res.json(runtime.getDomainStatus(req.params.domain));
    } catch (error) {
      if (error && error.code === 'NOT_FOUND') {
        res.status(404).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post('/api/v5/crawl/start', (req, res) => {
    res.json(runtime.start(req.body || {}));
  });

  app.post('/api/v5/crawl/stop', (req, res) => {
    res.json(runtime.stop(req.body || {}));
  });

  app.get('/api/v5/hub-suggestions', async (req, res, next) => {
    const domain = String(req.query.domain || '').trim();
    const kind = String(req.query.kind || 'all').trim();

    if (!domain) {
      res.status(400).json({ error: 'domain query parameter required' });
      return;
    }

    try {
      const payload = await runtime.getSuggestions({ domain, kind });
      res.json(payload);
    } catch (error) {
      if (error && error.code === 'NOT_FOUND') {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({
      error: error && error.message ? error.message : String(error),
    });
  });

  return app;
}

function createServer(options = {}) {
  const {
    port = 0,
    host = '127.0.0.1',
    logger = console,
  } = options;

  const runtime = options.runtime || createBootstrapRuntime(options);
  const app = createApp({ ...options, runtime });
  let server;

  return {
    app,
    runtime,
    async start() {
      if (server) {
        throw new Error('V5 remote server already started.');
      }

      await new Promise((resolve, reject) => {
        server = app
          .listen(port, host, () => resolve())
          .on('error', reject);
      });

      const address = server.address();
      if (logger && typeof logger.info === 'function') {
        logger.info(`V5 remote server listening on http://${host}:${address.port}`);
      }

      return {
        host,
        port: address.port,
      };
    },
    async stop() {
      await runtime.close();
      if (!server) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      server = undefined;
    },
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const eqIndex = token.indexOf('=');
    if (eqIndex !== -1) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
      continue;
    }

    args[key] = true;
  }
  return args;
}

function printHelp() {
  console.log('remote server v5 bootstrap');
  console.log('');
  console.log('Usage:');
  console.log('  node src/v5/remote/server.js --domains bbc.com,reuters.com --port 3410');
  console.log('  node src/v5/remote/server.js --config deploy/remote-crawler-v2/domains.json');
  console.log('');
  console.log('Options:');
  console.log('  --domains <list>         Comma-separated domain list');
  console.log('  --config <file>          JSON config file containing domains');
  console.log('  --port <n>               Port to bind (default: 3210)');
  console.log('  --host <ip>              Host to bind (default: 127.0.0.1)');
  console.log('  --max-pages <n>          Default max pages per domain');
  console.log('  --max-concurrent <n>     Concurrency cap for runtime state');
  console.log('  --help                   Show this help');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);

  if (args.help || args.h) {
    printHelp();
    return 0;
  }

  const maxPagesDefault = Number(args['max-pages'] || 50);
  const domainConfigs = loadDomainConfigs({
    domains: args.domains,
    configPath: args.config,
    maxPagesDefault,
  });

  if (domainConfigs.length === 0) {
    throw new Error('No domains specified. Use --domains or --config.');
  }

  const server = createServer({
    host: args.host || '127.0.0.1',
    port: Number(args.port || 3210),
    maxPagesDefault,
    maxConcurrent: Number(args['max-concurrent'] || 5),
    domainConfigs,
  });

  const address = await server.start();
  console.log(`V5 remote bootstrap listening on http://${address.host}:${address.port}`);
  console.log('Endpoints: /api/v5, /api/v5/health, /api/v5/status, /api/v5/domains');

  let stopped = false;
  const handleSignal = async (signal) => {
    if (stopped) {
      return;
    }
    stopped = true;
    console.log(`Stopping V5 remote bootstrap after ${signal}...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  return 0;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  createApp,
  createServer,
  main,
  parseCliArgs,
};
