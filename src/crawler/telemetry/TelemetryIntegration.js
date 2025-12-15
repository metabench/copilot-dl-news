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

class TelemetryIntegration {
  /**
   * @param {Object} options
   * @param {number} [options.historyLimit=500] - Max events to keep for late-joining clients
   * @param {number} [options.maxHistorySize] - Deprecated alias for historyLimit
   * @param {number} [options.heartbeatInterval=30000] - Heartbeat interval for SSE (ms)
   * @param {string|null} [options.allowOrigin=null] - Optional Access-Control-Allow-Origin value
   * @param {Object} [options.bridgeOptions] - Extra options forwarded to CrawlTelemetryBridge
   */
  constructor(options = {}) {
    this.historyLimit = options.historyLimit ?? options.maxHistorySize ?? 500;
    this.heartbeatInterval = options.heartbeatInterval ?? 30000;
    this.allowOrigin = options.allowOrigin ?? null;
    
    /** @type {Set<import('http').ServerResponse>} */
    this.sseClients = new Set();
    
    /** @type {NodeJS.Timeout|null} */
    this.heartbeatTimer = null;
    
    /** @type {Function[]} Disconnect functions for connected crawlers */
    this.crawlerDisconnects = [];

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
    const payload = {
      type: 'crawl:telemetry',
      data: event
    };

    const message = `data: ${JSON.stringify(payload)}\n\n`;
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
        res.write(`data: ${JSON.stringify({
          type: 'crawl:telemetry',
          data: event
        })}\n\n`);
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
    
    // Destroy bridge
    this.bridge.destroy();
  }
}

module.exports = { TelemetryIntegration };
