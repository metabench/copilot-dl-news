'use strict';

const { EventEmitter } = require('events');

const express = require('express');

const { TelemetryIntegration } = require('../../../../src/crawler/telemetry');

describe('TelemetryIntegration (SSE robustness)', () => {
  test('broadcast emits fallback telemetry error when event cannot be serialized', () => {
    const integration = new TelemetryIntegration({ historyLimit: 5 });

    const writes = [];
    const client = {
      writable: true,
      write(chunk) {
        writes.push(String(chunk));
      }
    };

    integration.sseClients.add(client);

    const badEvent = {
      type: 'crawl:progress',
      timestampMs: Date.now(),
      jobId: 'job-1',
      crawlType: 'standard',
      toJSON() {
        throw new Error('boom');
      },
      data: { visited: 1, queued: 2, errors: 0 }
    };

    expect(() => integration._broadcast(badEvent)).not.toThrow();

    const out = writes.join('');
    expect(out).toContain('data:');
    expect(out).toContain('crawl:telemetry');
    expect(out).toContain('crawl:telemetry:error');
  });

  test('mountSSE replays history safely when history contains an unserializable event', () => {
    const integration = new TelemetryIntegration({ historyLimit: 5, heartbeatInterval: 1e9 });

    const badEvent = {
      type: 'crawl:progress',
      timestampMs: Date.now(),
      jobId: 'job-1',
      crawlType: 'standard',
      toJSON() {
        throw new Error('boom');
      },
      data: { visited: 1, queued: 2, errors: 0 }
    };

    // Inject into history directly to simulate a broken event that was recorded earlier.
    integration.bridge._history = [badEvent];

    const app = express();

    let capturedHandler = null;
    const origGet = app.get.bind(app);
    app.get = (routePath, handler) => {
      if (routePath === '/events') {
        capturedHandler = handler;
      }
      return origGet(routePath, handler);
    };

    integration.mountSSE(app, '/events');

    expect(typeof capturedHandler).toBe('function');

    const req = new EventEmitter();

    const writes = [];
    const res = {
      writable: true,
      writeHead() {},
      write(chunk) {
        writes.push(String(chunk));
      },
      end() {}
    };

    expect(() => capturedHandler(req, res)).not.toThrow();

    const out = writes.join('');
    expect(out).toContain(':ok');
    expect(out).toContain('crawl:telemetry');
    expect(out).toContain('crawl:telemetry:error');
  });
});
