'use strict';

/**
 * TelemetryIntegration - Server-side integration for crawler telemetry.
 * 
 * This module provides ready-to-use integration between the crawler
 * telemetry system and Express/SSE endpoints. It handles:
 * 
 * - Creating and managing the telemetry bridge
 * - Setting up SSE endpoints
 * - Managing connected clients
 * - Providing history for late-joining clients
 * 
 * Usage:
 * 
 *   const { TelemetryIntegration } = require('./telemetry');
 *   const integration = new TelemetryIntegration();
 *   
 *   // Mount SSE endpoint
 *   integration.mountSSE(app, '/api/crawl-events');
 *   
 *   // Connect a crawler
 *   const orchestrator = new CrawlOrchestrator(...);
 *   integration.connectCrawler(orchestrator);
 *   
 *   // Or emit events manually
 *   integration.bridge.emitProgress({ jobId, visited: 100 });
 *   
 *   // Cleanup
 *   integration.destroy();
 * 
 * @module src/crawler/telemetry/TelemetryIntegration
 */

const { CrawlTelemetryBridge } = require('./CrawlTelemetryBridge');
const { TaskEventWriter } = require('../../db/TaskEventWriter');

function createSafeJsonReplacer() {
  const seen = new WeakSet();
  return function safeJsonReplacer(key, value) {
    if (typeof value === 'bigint') {
      return String(value);
    }

    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}

function safeJsonStringify(value) {
  try {
    const json = JSON.stringify(value, createSafeJsonReplacer());
    return typeof json === 'string' ? json : null;
  } catch (_) {
    return null;
  }
}

function buildTelemetrySerializationErrorEvent({ error, originalEvent }) {
  const now = new Date();
  const timestampMs = now.getTime();
  const originalType = originalEvent && typeof originalEvent.type === 'string' ? originalEvent.type : null;
  const jobId = originalEvent && (originalEvent.jobId || (originalEvent.data && originalEvent.data.jobId)) ? (originalEvent.jobId || originalEvent.data.jobId) : null;
  const crawlType = originalEvent && typeof originalEvent.crawlType === 'string' ? originalEvent.crawlType : 'unknown';

  return {
    schemaVersion: 1,
    id: `crawl:telemetry:error-${timestampMs}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'crawl:telemetry:error',
    topic: 'telemetry',
    tags: ['telemetry', 'serialization'],
    timestamp: now.toISOString(),
    timestampMs,
    jobId,
    crawlType,
    severity: 'error',
    message: 'Telemetry serialization failed; event was sanitized.',
    source: 'TelemetryIntegration',
    data: Object.freeze({
      error: error && error.message ? error.message : String(error || 'unknown error'),
      originalType,
      originalId: originalEvent && originalEvent.id ? String(originalEvent.id) : null
    })
  };
}

class TelemetryIntegration {
  /**
   * @param {Object} options
   * @param {number} [options.historyLimit=500] - Max events to keep for late-joining clients
   * @param {number} [options.maxHistorySize] - Deprecated alias for historyLimit
   * @param {number} [options.heartbeatInterval=30000] - Heartbeat interval for SSE (ms)
   * @param {string|null} [options.allowOrigin=null] - Optional Access-Control-Allow-Origin value
   * @param {Object} [options.bridgeOptions] - Extra options forwarded to CrawlTelemetryBridge
   * @param {Object} [options.db] - Optional better-sqlite3 database handle for event persistence
   * @param {Object} [options.eventWriterOptions] - Options forwarded to TaskEventWriter
   */
  constructor(options = {}) {
    this.historyLimit = options.historyLimit ?? options.maxHistorySize ?? 500;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
    this.allowOrigin = options.allowOrigin ?? null;
    
    /** @type {Set<import('http').ServerResponse>} */
    this.sseClients = new Set();

    /** @type {Set<import('http').ServerResponse>} */
    this.remoteObservableClients = new Set();
    
    /** @type {NodeJS.Timeout|null} */
    this.heartbeatTimer = null;
    
    /** @type {Function[]} Disconnect functions for connected crawlers */
    this.crawlerDisconnects = [];

    // Create TaskEventWriter for database persistence if db is provided
    /** @type {TaskEventWriter|null} */
    this.eventWriter = null;
    if (options.db) {
      this.eventWriter = new TaskEventWriter(options.db, options.eventWriterOptions || {});
    }

    const bridgeOptions = options.bridgeOptions && typeof options.bridgeOptions === 'object'
      ? options.bridgeOptions
      : {};
    
    // Create the bridge with our broadcast function
    this.bridge = new CrawlTelemetryBridge({
      ...bridgeOptions,
      historyLimit: this.historyLimit,
      broadcast: this._broadcast.bind(this)
    });
  }
  
  /**
   * Broadcast an event to all connected SSE clients.
   * @param {Object} event - Telemetry event
   * @private
   */
  _broadcast(event) {
    // Write event to database if we have a writer
    if (this.eventWriter) {
      this.eventWriter.writeTelemetryEvent(event);
    }

    const payload = { type: 'crawl:telemetry', data: event };
    let json = safeJsonStringify(payload);

    if (!json) {
      // If we can't serialize a telemetry event, emit a sanitized error event instead.
      // Never let serialization failures break the SSE stream.
      if (event && event.type === 'crawl:telemetry:error') {
        return;
      }

      const fallback = {
        type: 'crawl:telemetry',
        data: buildTelemetrySerializationErrorEvent({ error: new Error('JSON.stringify failed'), originalEvent: event })
      };
      json = safeJsonStringify(fallback);
      if (!json) {
        return;
      }
    }

    const message = `data: ${json}\n\n`;
    const deadClients = [];
    
    for (const client of this.sseClients) {
      try {
        if (client.writable) {
          client.write(message);
        } else {
          deadClients.push(client);
        }
      } catch (err) {
        deadClients.push(client);
      }
    }
    
    // Clean up dead clients
    for (const client of deadClients) {
      this.sseClients.delete(client);
    }

    // Also broadcast as a remote-observable stream (Lab 042/043 compatible).
    // Consumers will receive `next` payloads where `value` is the telemetry event.
    if (this.remoteObservableClients.size) {
      const remoteTimestampMs = event && Number.isFinite(event.timestampMs) ? event.timestampMs : Date.now();
      const remotePayload = { type: 'next', value: event, timestampMs: remoteTimestampMs };
      let remoteJson = safeJsonStringify(remotePayload);
      if (!remoteJson) {
        const fallbackEvent = buildTelemetrySerializationErrorEvent({
          error: new Error('JSON.stringify failed (remote-observable broadcast)'),
          originalEvent: event
        });
        remoteJson = safeJsonStringify({ type: 'next', value: fallbackEvent, timestampMs: fallbackEvent.timestampMs });
      }

      if (remoteJson) {
        const remoteMessage = `data: ${remoteJson}\n\n`;
        const deadRemoteClients = [];
        for (const client of this.remoteObservableClients) {
          try {
            if (client.writable) {
              client.write(remoteMessage);
            } else {
              deadRemoteClients.push(client);
            }
          } catch (_) {
            deadRemoteClients.push(client);
          }
        }

        for (const client of deadRemoteClients) {
          this.remoteObservableClients.delete(client);
        }
      }
    }
  }
  
  /**
   * Start heartbeat for SSE clients.
   * @private
   */
  _startHeartbeat() {
    if (this.heartbeatTimer) return;
    
    this.heartbeatTimer = setInterval(() => {
      const heartbeat = `:heartbeat ${Date.now()}\n\n`;
      const deadClients = [];
      
      for (const client of this.sseClients) {
        try {
          if (client.writable) {
            client.write(heartbeat);
          } else {
            deadClients.push(client);
          }
        } catch (err) {
          deadClients.push(client);
        }
      }
      
      for (const client of deadClients) {
        this.sseClients.delete(client);
      }

      const deadRemoteClients = [];
      for (const client of this.remoteObservableClients) {
        try {
          if (client.writable) {
            client.write(heartbeat);
          } else {
            deadRemoteClients.push(client);
          }
        } catch (_) {
          deadRemoteClients.push(client);
        }
      }

      for (const client of deadRemoteClients) {
        this.remoteObservableClients.delete(client);
      }
    }, this.heartbeatInterval);
    
    this.heartbeatTimer.unref();
  }
  
  /**
   * Mount the SSE endpoint on an Express app.
   * 
   * @param {import('express').Application} app - Express app
   * @param {string} path - Endpoint path (e.g., '/api/crawl-events')
   * @returns {import('express').Router}
   */
  mountSSE(app, path = '/api/crawl-events') {
    this._startHeartbeat();
    
    app.get(path, (req, res) => {
      // Set SSE headers
      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      };

      if (this.allowOrigin) {
        headers['Access-Control-Allow-Origin'] = this.allowOrigin;
      }

      res.writeHead(200, headers);
      
      // Send initial data
      res.write(':ok\n\n');
      
      // Replay history so late-joining clients reconstruct state.
      // (Each item is already a telemetry event from the bridge.)
      const history = this.bridge.getHistory();
      for (const event of history) {
        const payload = { type: 'crawl:telemetry', data: event };
        let json = safeJsonStringify(payload);
        if (!json) {
          if (event && event.type === 'crawl:telemetry:error') {
            continue;
          }
          const fallback = {
            type: 'crawl:telemetry',
            data: buildTelemetrySerializationErrorEvent({ error: new Error('JSON.stringify failed (history replay)'), originalEvent: event })
          };
          json = safeJsonStringify(fallback);
          if (!json) {
            continue;
          }
        }
        try {
          res.write(`data: ${json}\n\n`);
        } catch (_) {
          // Ignore; client may have disconnected mid-replay.
        }
      }
      
      // Add to clients set
      this.sseClients.add(res);
      
      // Handle client disconnect
      req.on('close', () => {
        this.sseClients.delete(res);
      });
    });
    
    return app;
  }

  /**
   * Mount a Lab 042/043 compatible remote-observable SSE endpoint.
   *
   * The stream emits messages shaped like:
   *   { type: 'next', value: <telemetryEvent>, timestampMs }
   *
   * This allows UIs to consume canonical crawl telemetry through
   * the shared RemoteObservable client adapters.
   *
   * @param {import('express').Application} app
   * @param {string} basePath - Base path; the endpoint will be `${basePath}/events`
   * @returns {import('express').Application}
   */
  mountRemoteObservable(app, basePath = '/api/crawl-telemetry/remote-obs') {
    this._startHeartbeat();

    const base = typeof basePath === 'string' ? basePath.replace(/\/$/, '') : '/api/crawl-telemetry/remote-obs';
    const eventsPath = `${base}/events`;
    const commandPath = `${base}/command`;

    app.get(eventsPath, (req, res) => {
      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      };

      if (this.allowOrigin) {
        headers['Access-Control-Allow-Origin'] = this.allowOrigin;
      }

      res.writeHead(200, headers);
      res.write(':ok\n\n');

      const history = this.bridge.getHistory();
      for (const event of history) {
        const ts = event && Number.isFinite(event.timestampMs) ? event.timestampMs : Date.now();
        let json = safeJsonStringify({ type: 'next', value: event, timestampMs: ts });
        if (!json) {
          const fallbackEvent = buildTelemetrySerializationErrorEvent({
            error: new Error('JSON.stringify failed (remote-observable history replay)'),
            originalEvent: event
          });
          json = safeJsonStringify({ type: 'next', value: fallbackEvent, timestampMs: fallbackEvent.timestampMs });
        }
        if (!json) continue;
        try {
          res.write(`data: ${json}\n\n`);
        } catch (_) {
          // Ignore; client may have disconnected mid-replay.
        }
      }

      this.remoteObservableClients.add(res);
      req.on('close', () => {
        this.remoteObservableClients.delete(res);
      });
    });

    // Optional command endpoint for adapter compatibility.
    app.post(commandPath, (req, res) => {
      res.status(400).json({ ok: false, error: 'Remote observable commands are not supported for crawl telemetry.' });
    });

    return app;
  }
  
  /**
   * Connect a crawler to the telemetry system.
   * 
   * @param {EventEmitter} crawler - Crawler instance (e.g., CrawlOrchestrator)
   * @param {Object} [options] - Connection options
   * @param {string} [options.jobId] - Override job ID
   * @param {string} [options.crawlType] - Crawl type identifier
   * @returns {Function} Disconnect function
   */
  connectCrawler(crawler, options = {}) {
    const disconnect = this.bridge.connectCrawler(crawler, options);
    this.crawlerDisconnects.push(disconnect);
    return disconnect;
  }

  /**
   * Get the in-process observable stream of telemetry events.
   * @returns {any}
   */
  getObservable() {
    return this.bridge.getObservable();
  }

  /**
   * Subscribe to in-process telemetry events.
   *
   * @param {(event: object) => void} onNext
   * @param {object} [options]
   * @param {boolean} [options.replayHistory=true]
   * @returns {() => void}
   */
  subscribe(onNext, options = {}) {
    return this.bridge.subscribe(onNext, options);
  }
  
  /**
   * Disconnect all crawlers and clean up.
   */
  disconnectAll() {
    for (const disconnect of this.crawlerDisconnects) {
      try {
        disconnect();
      } catch (e) {
        // Ignore
      }
    }
    this.crawlerDisconnects = [];
  }
  
  /**
   * Get number of connected SSE clients.
   * @returns {number}
   */
  getClientCount() {
    return this.sseClients.size;
  }
  
  /**
   * Clean up all resources.
   */
  destroy() {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    // Disconnect crawlers
    this.disconnectAll();
    
    // Close all SSE clients
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch (e) {
        // Ignore
      }
    }
    this.sseClients.clear();

    for (const client of this.remoteObservableClients) {
      try {
        client.end();
      } catch (_) {
        // Ignore
      }
    }
    this.remoteObservableClients.clear();
    
    // Flush and destroy event writer
    if (this.eventWriter) {
      this.eventWriter.destroy();
      this.eventWriter = null;
    }
    
    // Destroy bridge
    this.bridge.destroy();
  }

  /**
   * Get the TaskEventWriter for direct access (AI query helpers, etc.).
   * @returns {TaskEventWriter|null}
   */
  getEventWriter() {
    return this.eventWriter;
  }
}

module.exports = { TelemetryIntegration };
