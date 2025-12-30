"use strict";

const { observable } = require('fnl');
const {
  MESSAGE_TYPES,
  normalizeCommand
} = require('./shared');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSseDataLine(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * Creates a server-side remote observable endpoint.
 *
 * Contract:
 * - SSE stream emits { type, value?, message?, timestampMs }
 * - Command endpoint (POST JSON) accepts { name, payload? }
 *
 * This is deliberately transport-agnostic:
 * - For Express: use mountExpress(app, basePath)
 * - For jsgui3-server: use mountJsgui3(server, basePath)
 */
function createRemoteObservableServer({ makeObservable } = {}) {

  const clients = new Set();
  let started = false;
  let stopped = false;

  // Local control plane.
  let paused = false;
  let cancelled = false;
  let tickMs = 120;

  // Snapshot for late joiners.
  let latest = {
    counter: 0,
    status: 'idle'
  };

  const broadcast = (msg) => {
    const line = toSseDataLine(msg);
    for (const res of clients) {
      try {
        res.write(line);
      } catch {
        // ignore
      }
    }
  };

  const emitInfo = (message, extra) => {
    broadcast({
      type: MESSAGE_TYPES.INFO,
      message: String(message || ''),
      value: extra,
      timestampMs: Date.now()
    });
  };

  // We build the fnl observable once, lazily, when the first client connects.
  // If makeObservable is supplied, it should return an fnl observable.
  const obs = typeof makeObservable === 'function'
    ? makeObservable({
      getState: () => ({ paused, cancelled, tickMs, latest }),
      emitInfo
    })
    : observable(async (next, complete, error) => {
      latest.status = 'running';
      next({ counter: latest.counter, status: latest.status, tickMs });

      try {
        while (!cancelled) {
          if (paused) {
            latest.status = 'paused';
            next({ counter: latest.counter, status: latest.status, tickMs });
            await sleep(80);
            continue;
          }

          latest.status = 'running';
          latest.counter += 1;
          next({ counter: latest.counter, status: latest.status, tickMs });
          await sleep(tickMs);
        }

        latest.status = 'cancelled';
        next({ counter: latest.counter, status: latest.status, tickMs });
        complete();
      } catch (e) {
        error(e);
      }

      return () => {
        cancelled = true;
        latest.status = 'stopped';
        try {
          complete();
        } catch (_) {}
      };
    });

  function startIfNeeded() {
    if (started || stopped) return;
    started = true;

    obs.on('next', (value) => {
      latest = value && typeof value === 'object' ? value : latest;
      broadcast({ type: MESSAGE_TYPES.NEXT, value: latest, timestampMs: Date.now() });
    });

    obs.on('error', (err) => {
      broadcast({ type: MESSAGE_TYPES.ERROR, message: String((err && err.message) || err), timestampMs: Date.now() });
    });

    obs.on('complete', () => {
      broadcast({ type: MESSAGE_TYPES.COMPLETE, timestampMs: Date.now() });
    });

    emitInfo('remote-observable-started', { tickMs });
  }

  function handleSse(req, res) {
    if (stopped) {
      res.statusCode = 503;
      res.end('stopped');
      return;
    }

    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    };

    if (typeof res.writeHead === 'function') {
      res.writeHead(200, headers);
    } else {
      res.statusCode = 200;
      for (const [k, v] of Object.entries(headers)) {
        try {
          if (typeof res.setHeader === 'function') res.setHeader(k, v);
        } catch {
          // ignore
        }
      }
    }

    if (typeof res.flushHeaders === 'function') {
      try {
        res.flushHeaders();
      } catch {
        // ignore
      }
    }

    clients.add(res);
    startIfNeeded();

    // initial seed
    try {
      res.write(toSseDataLine({ type: MESSAGE_TYPES.NEXT, value: latest, timestampMs: Date.now() }));
    } catch {
      // ignore
    }

    // Heartbeat comment (keeps certain proxies / runtimes from buffering).
    let heartbeat = null;
    try {
      heartbeat = setInterval(() => {
        try {
          res.write(`:hb ${Date.now()}\n\n`);
        } catch {
          // ignore
        }
      }, 15000);
      if (heartbeat && typeof heartbeat.unref === 'function') heartbeat.unref();
    } catch {
      // ignore
    }

    req.on('close', () => {
      clients.delete(res);
      if (heartbeat) {
        try {
          clearInterval(heartbeat);
        } catch {
          // ignore
        }
        heartbeat = null;
      }
    });
  }

  async function readJsonBody(req) {
    if (!req) return null;
    return await new Promise((resolve) => {
      let buf = '';
      req.setEncoding('utf8');
      req.on('data', (d) => (buf += d));
      req.on('end', () => {
        try {
          resolve(JSON.parse(buf || '{}'));
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }

  async function handleCommand(req, res) {
    if (stopped) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'stopped' }));
      return;
    }

    const body = await readJsonBody(req);
    const cmd = normalizeCommand(body);
    if (!cmd) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'invalid-command' }));
      return;
    }

    if (cmd.name === 'pause') {
      paused = true;
      emitInfo('paused');
    } else if (cmd.name === 'resume') {
      paused = false;
      emitInfo('resumed');
    } else if (cmd.name === 'cancel') {
      cancelled = true;
      emitInfo('cancelled');
    } else if (cmd.name === 'setTickMs') {
      const nextTickMs = Number(cmd.payload && cmd.payload.tickMs);
      if (Number.isFinite(nextTickMs) && nextTickMs >= 10 && nextTickMs <= 2000) {
        tickMs = Math.floor(nextTickMs);
        emitInfo('tickMs-updated', { tickMs });
      }
    } else {
      emitInfo('unknown-command', { name: cmd.name });
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, latest }));
  }

  function stop() {
    stopped = true;
    cancelled = true;
    for (const res of clients) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    clients.clear();
  }

  function mountExpress(app, basePath = '/api/remote-obs') {
    app.get(`${basePath}/events`, handleSse);
    app.post(`${basePath}/command`, handleCommand);
    app.get(`${basePath}/state`, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, latest }));
    });
  }

  function mountJsgui3(server, basePath = '/api/remote-obs') {
    // jsgui3-server route API: server.router.set_route(path, ctx, handler)
    // Prefer a publisher object (fits jsgui3-server's publisher model) while
    // keeping the underlying handlers transport-agnostic.
    let DelegatingHttpPublisher = null;
    try {
      ({ DelegatingHttpPublisher } = require('./jsgui3/DelegatingHttpPublisher'));
    } catch {
      // ignore
    }

    const ssePublisher = DelegatingHttpPublisher
      ? new DelegatingHttpPublisher({ type: 'remote-observable-sse', handler: handleSse })
      : null;
    const commandPublisher = DelegatingHttpPublisher
      ? new DelegatingHttpPublisher({ type: 'remote-observable-command', handler: handleCommand })
      : null;

    server.router.set_route(
      `${basePath}/events`,
      ssePublisher,
      (ssePublisher && ssePublisher.handle_http) || handleSse
    );
    server.router.set_route(
      `${basePath}/command`,
      commandPublisher,
      (commandPublisher && commandPublisher.handle_http) || handleCommand
    );
    server.router.set_route(`${basePath}/state`, null, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, latest }));
    });
  }

  return {
    handleSse,
    handleCommand,
    mountExpress,
    mountJsgui3,
    stop
  };
}

module.exports = {
  createRemoteObservableServer
};
