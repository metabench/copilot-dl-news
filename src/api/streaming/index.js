'use strict';

/**
 * Streaming Module Index
 *
 * Real-time event streaming via SSE and WebSocket.
 *
 * @module streaming
 */

const {
  EventBroadcaster,
  getBroadcaster,
  resetBroadcaster,
  EVENT_TYPES,
  ALL_EVENT_TYPES,
  broadcaster
} = require('./EventBroadcaster');

const {
  createSSEHandler,
  createSSERouter,
  sendEvent,
  parseArrayParam,
  KEEPALIVE_INTERVAL_MS,
  DEFAULT_REPLAY_LIMIT: SSE_REPLAY_LIMIT
} = require('./SSEController');

const {
  WebSocketServerManager,
  WSConnection,
  createWebSocketServer,
  HEARTBEAT_INTERVAL_MS,
  MAX_MISSED_PONGS,
  DEFAULT_REPLAY_LIMIT: WS_REPLAY_LIMIT
} = require('./WebSocketServer');

module.exports = {
  // EventBroadcaster
  EventBroadcaster,
  getBroadcaster,
  resetBroadcaster,
  EVENT_TYPES,
  ALL_EVENT_TYPES,
  broadcaster,

  // SSE
  createSSEHandler,
  createSSERouter,
  sendEvent,
  parseArrayParam,
  KEEPALIVE_INTERVAL_MS,
  SSE_REPLAY_LIMIT,

  // WebSocket
  WebSocketServerManager,
  WSConnection,
  createWebSocketServer,
  HEARTBEAT_INTERVAL_MS,
  MAX_MISSED_PONGS,
  WS_REPLAY_LIMIT
};
