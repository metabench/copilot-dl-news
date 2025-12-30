'use strict';

/**
 * WebSocket Server - Bidirectional Event Streaming
 *
 * Provides ws://localhost:4000/api/v1/ws for real-time bidirectional communication.
 * Supports subscribe/unsubscribe protocol and filtering by event type and domain.
 *
 * Features:
 * - API key authentication in upgrade request
 * - Subscribe/unsubscribe actions
 * - Event type and domain filtering
 * - Ping/pong heartbeat (disconnect after 3 missed pongs)
 * - Event replay on subscribe
 * - Graceful cleanup on disconnect
 *
 * Protocol:
 *   Subscribe:   { action: 'subscribe', types: ['article:new'], domains: ['example.com'] }
 *   Unsubscribe: { action: 'unsubscribe', types: ['article:new'] }
 *   Event:       { type: 'article:new', timestamp: '...', payload: {...} }
 *
 * @module streaming/WebSocketServer
 */

const WebSocket = require('ws');
const { getBroadcaster, ALL_EVENT_TYPES } = require('./EventBroadcaster');

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL_MS = 30000;

// Max missed pongs before disconnect
const MAX_MISSED_PONGS = 3;

// Default replay limit
const DEFAULT_REPLAY_LIMIT = 50;

/**
 * WebSocket connection wrapper
 */
class WSConnection {
  constructor(ws, options = {}) {
    this.ws = ws;
    this.id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.apiKey = options.apiKey || null;
    this.subscribedTypes = new Set();
    this.subscribedDomains = new Set();
    this.subscription = null;
    this.connectedAt = new Date().toISOString();
    this.eventsSent = 0;
    this.lastEventAt = null;
    this.missedPongs = 0;
    this.isAlive = true;
    this.logger = options.logger || console;
    this.broadcaster = options.broadcaster || getBroadcaster();
    this.replayLimit = options.replayLimit || DEFAULT_REPLAY_LIMIT;

    // Setup ping/pong
    ws.on('pong', () => {
      this.isAlive = true;
      this.missedPongs = 0;
    });

    // Handle messages
    ws.on('message', (data) => this._handleMessage(data));

    // Handle close
    ws.on('close', () => this._cleanup());
    ws.on('error', () => this._cleanup());
  }

  /**
   * Send JSON message
   * @param {Object} data - Data to send
   */
  send(data) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (err) {
      this.logger.error('[WS] Send error:', err);
      return false;
    }
  }

  /**
   * Send event to client (if matches filters)
   * @param {Object} event - Event object
   * 
   * Filter logic:
   * - If neither types nor domains subscribed: no events received (unsubscribed state)
   * - If only types subscribed: filter by type only
   * - If only domains subscribed: all types pass, filter by domain
   * - If both subscribed: must match type AND domain
   */
  sendEvent(event) {
    const hasTypes = this.subscribedTypes.size > 0;
    const hasDomains = this.subscribedDomains.size > 0;

    // Not subscribed to anything - no events
    if (!hasTypes && !hasDomains) {
      return;
    }

    // Check type filter (only if types are subscribed)
    if (hasTypes && !this.subscribedTypes.has(event.type)) {
      return;
    }

    // Check domain filter (only if domains are subscribed)
    if (hasDomains) {
      const eventDomain = event.domain || event.payload?.host;
      if (!eventDomain) {
        return;
      }
      let matches = false;
      for (const domain of this.subscribedDomains) {
        if (eventDomain.includes(domain)) {
          matches = true;
          break;
        }
      }
      if (!matches) {
        return;
      }
    }

    // Send event
    if (this.send(event)) {
      this.eventsSent++;
      this.lastEventAt = new Date().toISOString();
    }
  }

  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      this.send({
        type: 'error',
        error: 'INVALID_JSON',
        message: 'Could not parse message as JSON'
      });
      return;
    }

    const { action } = message;

    switch (action) {
      case 'subscribe':
        this._handleSubscribe(message);
        break;

      case 'unsubscribe':
        this._handleUnsubscribe(message);
        break;

      case 'ping':
        // Application-level ping
        this.send({ type: 'pong', timestamp: new Date().toISOString() });
        break;

      case 'get-stats':
        this.send({
          type: 'stats',
          stats: {
            connectionId: this.id,
            connectedAt: this.connectedAt,
            eventsSent: this.eventsSent,
            subscribedTypes: Array.from(this.subscribedTypes),
            subscribedDomains: Array.from(this.subscribedDomains)
          }
        });
        break;

      default:
        this.send({
          type: 'error',
          error: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action}`
        });
    }
  }

  /**
   * Handle subscribe action
   * @private
   */
  _handleSubscribe(message) {
    const { types = [], domains = [], replay = true } = message;

    // Add types to subscription
    for (const type of types) {
      if (typeof type === 'string') {
        this.subscribedTypes.add(type);
      }
    }

    // Add domains to subscription
    for (const domain of domains) {
      if (typeof domain === 'string') {
        this.subscribedDomains.add(domain);
      }
    }

    // Ensure we have a subscription to the broadcaster
    if (!this.subscription) {
      this.subscription = this.broadcaster.subscribe(
        (event) => this.sendEvent(event),
        {} // No filter here - we filter in sendEvent()
      );
    }

    // Replay history if requested
    if (replay) {
      const history = this.broadcaster.getHistory({
        limit: this.replayLimit,
        types: this.subscribedTypes.size > 0 ? Array.from(this.subscribedTypes) : undefined,
        domains: this.subscribedDomains.size > 0 ? Array.from(this.subscribedDomains) : undefined
      });

      for (const event of history) {
        this.send({ ...event, replayed: true });
        this.eventsSent++;
      }
    }

    // Acknowledge
    this.send({
      type: 'subscribed',
      types: Array.from(this.subscribedTypes),
      domains: Array.from(this.subscribedDomains),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle unsubscribe action
   * @private
   */
  _handleUnsubscribe(message) {
    const { types = [], domains = [] } = message;

    // Remove types
    for (const type of types) {
      this.subscribedTypes.delete(type);
    }

    // Remove domains
    for (const domain of domains) {
      this.subscribedDomains.delete(domain);
    }

    // Acknowledge
    this.send({
      type: 'unsubscribed',
      removedTypes: types,
      removedDomains: domains,
      remainingTypes: Array.from(this.subscribedTypes),
      remainingDomains: Array.from(this.subscribedDomains),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check heartbeat - returns false if should disconnect
   * @returns {boolean}
   */
  checkHeartbeat() {
    if (!this.isAlive) {
      this.missedPongs++;
      if (this.missedPongs >= MAX_MISSED_PONGS) {
        return false;
      }
    }

    this.isAlive = false;
    try {
      this.ws.ping();
    } catch {
      return false;
    }
    return true;
  }

  /**
   * Get connection info
   * @returns {Object}
   */
  getInfo() {
    return {
      id: this.id,
      connectedAt: this.connectedAt,
      eventsSent: this.eventsSent,
      lastEventAt: this.lastEventAt,
      subscribedTypes: Array.from(this.subscribedTypes),
      subscribedDomains: Array.from(this.subscribedDomains),
      hasApiKey: !!this.apiKey
    };
  }

  /**
   * Cleanup on disconnect
   * @private
   */
  _cleanup() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  /**
   * Close connection
   */
  close(code = 1000, reason = 'Server closing') {
    this._cleanup();
    try {
      this.ws.close(code, reason);
    } catch {
      // Ignore
    }
  }
}

/**
 * WebSocket Server Manager
 */
class WebSocketServerManager {
  /**
   * @param {Object} options - Options
   * @param {http.Server|https.Server} options.server - HTTP server to attach to
   * @param {string} [options.path] - WebSocket path (default: /api/v1/ws)
   * @param {Function} [options.validateApiKey] - API key validation function
   * @param {EventBroadcaster} [options.broadcaster] - Broadcaster instance
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.heartbeatMs] - Heartbeat interval
   * @param {number} [options.replayLimit] - Max events to replay
   */
  constructor(options = {}) {
    this.path = options.path || '/api/v1/ws';
    this.validateApiKey = options.validateApiKey || null;
    this.broadcaster = options.broadcaster || getBroadcaster();
    this.logger = options.logger || console;
    this.heartbeatMs = options.heartbeatMs || HEARTBEAT_INTERVAL_MS;
    this.replayLimit = options.replayLimit || DEFAULT_REPLAY_LIMIT;

    this.connections = new Map();
    this.wss = null;
    this.heartbeatTimer = null;

    if (options.server) {
      this.attach(options.server);
    }
  }

  /**
   * Attach to HTTP server
   * @param {http.Server} server - HTTP server
   */
  attach(server) {
    this.wss = new WebSocket.Server({
      server,
      path: this.path,
      verifyClient: (info, callback) => this._verifyClient(info, callback)
    });

    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => this._heartbeat(), this.heartbeatMs);

    this.logger.log(`[WS] WebSocket server attached at ${this.path}`);
  }

  /**
   * Verify client during upgrade
   * @private
   */
  _verifyClient(info, callback) {
    // Extract API key from headers or query
    const req = info.req;
    const apiKey = req.headers['x-api-key'] ||
      new URL(req.url, 'http://localhost').searchParams.get('api_key');

    // If no validation function, accept all
    if (!this.validateApiKey) {
      info.req.apiKey = apiKey || null;
      callback(true);
      return;
    }

    // Validate key
    if (!apiKey) {
      callback(false, 401, 'Unauthorized: API key required');
      return;
    }

    try {
      const keyData = this.validateApiKey(apiKey);
      if (!keyData || !keyData.isActive) {
        callback(false, 401, 'Unauthorized: Invalid API key');
        return;
      }
      info.req.apiKey = keyData;
      callback(true);
    } catch (err) {
      this.logger.error('[WS] API key validation error:', err);
      callback(false, 500, 'Internal error');
    }
  }

  /**
   * Handle new connection
   * @private
   */
  _handleConnection(ws, req) {
    const connection = new WSConnection(ws, {
      apiKey: req.apiKey,
      broadcaster: this.broadcaster,
      logger: this.logger,
      replayLimit: this.replayLimit
    });

    this.connections.set(connection.id, connection);

    // Send welcome message
    connection.send({
      type: 'connected',
      connectionId: connection.id,
      timestamp: new Date().toISOString(),
      message: 'WebSocket connected. Send subscribe action to receive events.'
    });

    ws.on('close', () => {
      this.connections.delete(connection.id);
      if (this.logger.debug) {
        this.logger.debug(`[WS] Client disconnected: ${connection.id}`);
      }
    });

    if (this.logger.debug) {
      this.logger.debug(`[WS] Client connected: ${connection.id}`);
    }
  }

  /**
   * Run heartbeat check on all connections
   * @private
   */
  _heartbeat() {
    for (const [id, connection] of this.connections) {
      if (!connection.checkHeartbeat()) {
        this.logger.log(`[WS] Disconnecting unresponsive client: ${id}`);
        connection.close(1001, 'Heartbeat timeout');
        this.connections.delete(id);
      }
    }
  }

  /**
   * Get stats
   * @returns {Object}
   */
  getStats() {
    const connections = Array.from(this.connections.values()).map(c => c.getInfo());
    return {
      activeConnections: connections.length,
      path: this.path,
      connections,
      broadcaster: this.broadcaster.getStats()
    };
  }

  /**
   * Broadcast message to all connections
   * @param {Object} message - Message to send
   */
  broadcast(message) {
    for (const connection of this.connections.values()) {
      connection.send(message);
    }
  }

  /**
   * Close all connections and stop server
   */
  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const connection of this.connections.values()) {
      connection.close(1001, 'Server shutting down');
    }
    this.connections.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}

/**
 * Create WebSocket server manager
 * @param {Object} options - Options
 * @returns {WebSocketServerManager}
 */
function createWebSocketServer(options = {}) {
  return new WebSocketServerManager(options);
}

module.exports = {
  WebSocketServerManager,
  WSConnection,
  createWebSocketServer,
  HEARTBEAT_INTERVAL_MS,
  MAX_MISSED_PONGS,
  DEFAULT_REPLAY_LIMIT
};
