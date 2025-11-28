'use strict';

/**
 * @server Crawl API (Express)
 * @description Express-based implementation of the Crawl API v1.
 */

const express = require('express');
const { registerOperationRoutes } = require('./routes/operations');

function createServer(options = {}) {
  const {
    port = 0,
    logger = console,
    registerRoutes = defaultRegisterRoutes,
    createApp = () => express()
  } = options;

  const app = createApp();
  if (app.disable) {
    app.disable('x-powered-by');
  }

  registerRoutes(app, {
    ...options,
    logger,
    version: options.version || 'v1'
  });

  let server;

  return {
    framework: 'express',
    version: options.version || 'v1',
    app,
    async start() {
      if (server) {
        throw new Error('Express crawl API server already started.');
      }

      await new Promise((resolve, reject) => {
        server = app
          .listen(port, () => {
            const address = server.address();
            if (logger && typeof logger.info === 'function') {
              logger.info(`Express crawl API listening on ${address.port}`);
            }
            resolve();
          })
          .on('error', reject);
      });

      const address = server.address();
      return { port: address && address.port ? address.port : port };
    },
    async stop() {
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
    }
  };
}

function defaultRegisterRoutes(app, context) {
  app.get('/healthz', (req, res) => {
    res.json({
      status: 'ok',
      service: 'crawl-api',
      framework: 'express',
      version: context.version || 'v1'
    });
  });

  registerOperationRoutes(app, {
    ...context,
    version: context.version || 'v1'
  });
}

module.exports = {
  createServer
};
