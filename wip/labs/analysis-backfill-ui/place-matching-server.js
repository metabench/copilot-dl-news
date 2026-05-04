/**
 * Place Matching Server - Express server with SSE endpoint for place matching progress
 */
'use strict';

const express = require('express');
const path = require('path');
const { createPlaceMatchingObservable } = require('./place-matching-observable');

function createPlaceMatchingServer(options = {}) {
  const {
    port = 3098,
    limit = null,
    autoStart = true,
    ruleLevel = 1
  } = options;

  const app = express();
  let server = null;
  let matchingObs = null;
  let matchingPromise = null;
  const sseClients = new Set();

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // SSE endpoint
  app.get('/sse/place-matching-progress', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'info', message: 'connected' })}\n\n`);
    sseClients.add(res);

    if (matchingObs) {
      const state = matchingObs.getState();
      if (state) {
        res.write(`data: ${JSON.stringify({ type: 'next', value: state })}\n\n`);
      }
    }

    if (autoStart && !matchingObs && sseClients.size === 1) {
      startMatching();
    }

    req.on('close', () => sseClients.delete(res));
  });

  app.post('/api/start', (req, res) => {
    if (matchingObs?.isRunning) return res.status(409).json({ error: 'Running' });
    startMatching(req.body?.limit || limit);
    res.json({ status: 'started' });
  });

  app.post('/api/stop', (req, res) => {
    if (matchingObs) matchingObs.stop();
    res.json({ status: 'stopping' });
  });

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of sseClients) {
      try { client.write(`data: ${data}\n\n`); } catch (e) { sseClients.delete(client); }
    }
  }

  function startMatching(runLimit = limit) {
    matchingObs = createPlaceMatchingObservable({
      limit: runLimit,
      ruleLevel
    });

    matchingObs.subscribe({
      next: (msg) => broadcast(msg),
      complete: (msg) => broadcast(msg),
      error: (msg) => broadcast(msg)
    });

    matchingPromise = matchingObs.start().catch(err => console.error('Matching failed:', err));
    return matchingPromise;
  }

  async function start() {
    return new Promise(resolve => {
      server = app.listen(port, () => {
        console.log(`[place-matching-server] Listening on http://localhost:${port}`);
        resolve({ port, url: `http://localhost:${port}/place-matching.html` });
      });
    });
  }

  async function stop() {
    if (matchingObs) matchingObs.stop();
    if (server) server.close();
  }

  return { app, start, stop };
}

if (require.main === module) {
  const server = createPlaceMatchingServer({ port: 3098 });
  server.start().then(({ url }) => console.log(`Open ${url}`));
}

module.exports = { createPlaceMatchingServer };
