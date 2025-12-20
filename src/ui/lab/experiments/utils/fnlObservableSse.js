"use strict";

/**
 * Tiny helper to expose an `fnl` observable over SSE.
 *
 * Pattern extracted from lab 028 (crawl telemetry SSE), generalized:
 * - Lazily starts the observable when the first client connects
 * - Broadcasts each `next` payload as SSE JSON `data:` lines
 * - Cleans up clients on disconnect
 * - Supports `stop()` for server shutdown
 */

class ObservableSseResponder {
  constructor({ observableFactory, initialPayloadsProvider, mapPayload }) {
    this._clients = new Set();
    this._observableFactory = observableFactory;
    this._initialPayloadsProvider = initialPayloadsProvider;
    this._mapPayload = typeof mapPayload === 'function' ? mapPayload : (x) => x;

    this._started = false;
    this._subscription = null;
  }

  _broadcast(payload) {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of this._clients) {
      try {
        res.write(line);
      } catch {
        // ignore (client likely disconnected)
      }
    }
  }

  _startIfNeeded() {
    if (this._started) return;
    this._started = true;

    if (!this._observableFactory) return;

    try {
      const obs = this._observableFactory();
      if (!obs || typeof obs.on !== 'function') return;

      this._subscription = obs;

      obs.on('next', (value) => {
        const mapped = this._mapPayload(value);
        this._broadcast(mapped);
      });

      obs.on('error', (err) => {
        this._broadcast({ type: 'error', message: String((err && err.message) || err) });
      });

      obs.on('complete', () => {
        this._broadcast({ type: 'complete' });
      });
    } catch (e) {
      this._broadcast({ type: 'error', message: String((e && e.message) || e) });
    }
  }

  handle_http(req, res) {
    if (!req || !res) return;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });

    this._clients.add(res);
    this._startIfNeeded();

    try {
      const initial = this._initialPayloadsProvider ? this._initialPayloadsProvider() : [];
      for (const payload of initial) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch {
      // ignore initial send failures
    }

    req.on('close', () => {
      this._clients.delete(res);
    });
  }

  closeAll() {
    for (const res of this._clients) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    this._clients.clear();
  }

  stop() {
    this.closeAll();
    // fnl doesn't have a standard unsubscribe contract across versions.
    // We rely on the observableFactory to create an observable that can
    // terminate itself when the server shuts down.
    this._subscription = null;
  }
}

module.exports = {
  ObservableSseResponder
};
