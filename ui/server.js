#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

function buildArgs(body) {
  const args = ['src/crawl.js'];
  const url = body.startUrl || 'https://www.theguardian.com';
  args.push(url);
  if (body.depth != null) args.push(`--depth=${parseInt(body.depth, 10)}`);
  if (body.maxPages != null) args.push(`--max-pages=${parseInt(body.maxPages, 10)}`);
  if (body.maxAge) args.push(`--max-age=${String(body.maxAge)}`);
  if (body.concurrency != null) args.push(`--concurrency=${parseInt(body.concurrency, 10)}`);
  if (body.maxQueue != null) args.push(`--max-queue=${parseInt(body.maxQueue, 10)}`);
  if (body.noDb === true) args.push('--no-db');
  if (body.dbPath) args.push(`--db=${body.dbPath}`);
  return args;
}

function defaultRunner() {
  return {
    start(args) {
      const node = process.execPath;
      const cp = spawn(node, args, { cwd: path.join(__dirname, '..'), env: process.env });
      return cp;
    }
  };
}

function createApp(options = {}) {
  const runner = options.runner || defaultRunner();
  const app = express();
  const sseClients = new Set();
  let child = null;
  let startedAt = null;
  let lastExit = null;
  let stdoutBuf = '';
  let stderrBuf = '';

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
      res.write(payload);
    }
  }

  app.get('/api/status', (req, res) => {
    res.json({
      running: !!child,
      pid: child?.pid || null,
      startedAt,
      lastExit
    });
  });

  app.post('/api/crawl', (req, res) => {
    if (child) return res.status(409).json({ error: 'Crawler already running' });

    const args = buildArgs(req.body || {});
    child = runner.start(args);
    // Normalize interface: ensure stdout/stderr are EventEmitters that emit 'data'
    if (!child.stdout) child.stdout = new EventEmitter();
    if (!child.stderr) child.stderr = new EventEmitter();

    startedAt = new Date().toISOString();
    lastExit = null;

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (!line) continue;
        broadcast('log', { stream: 'stdout', line: line + '\n' });
        if (line.startsWith('PROGRESS ')) {
          try {
            const obj = JSON.parse(line.slice('PROGRESS '.length));
            broadcast('progress', obj);
            continue;
          } catch (_) {}
        }
        const m = line.match(/Final stats: (\d+) pages visited, (\d+) pages downloaded, (\d+) articles found, (\d+) articles saved/);
        if (m) {
          broadcast('progress', {
            visited: parseInt(m[1], 10),
            downloaded: parseInt(m[2], 10),
            found: parseInt(m[3], 10),
            saved: parseInt(m[4], 10)
          });
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      let idx;
      while ((idx = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, idx);
        stderrBuf = stderrBuf.slice(idx + 1);
        if (!line) continue;
        broadcast('log', { stream: 'stderr', line: line + '\n' });
      }
    });

    const onExit = (code, signal) => {
      lastExit = { code, signal, endedAt: new Date().toISOString() };
      broadcast('done', lastExit);
      stdoutBuf = '';
      stderrBuf = '';
      child = null;
      startedAt = null;
    };

    if (typeof child.on === 'function') {
      child.on('exit', onExit);
      // Some fake runners might emit 'close' instead
      child.on('close', (code, signal) => onExit(code, signal));
    }

    res.status(202).json({ pid: child.pid || null, args });
  });

  app.post('/api/stop', (req, res) => {
    if (!child) return res.status(200).json({ stopped: false });
    try {
      if (typeof child.kill === 'function') child.kill('SIGTERM');
      res.status(202).json({ stopped: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Catch-all for SPA
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  return app;
}

function startServer() {
  const PORT = process.env.PORT || 3000;
  const app = createApp();
  return app.listen(PORT, () => {
    console.log(`GUI server listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer };
