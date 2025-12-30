'use strict';

/**
 * SSE Controller - Server-Sent Events Endpoint Handler
 *
 * Provides GET /api/v1/stream endpoint for real-time event streaming.
 * Supports filtering by event type and domain.
 *
 * Features:
 * - SSE format with proper headers
 * - Keepalive every 30s
 * - Event replay on connect
 * - Type and domain filtering via query params
 * - Graceful client cleanup on disconnect
 *
 * Usage:
 *   GET /api/v1/stream
 *   GET /api/v1/stream?types=article:new,crawl:completed
 *   GET /api/v1/stream?types=article:new&domains=example.com,news.org
 *
 * @module streaming/SSEController
 */

const { getBroadcaster } = require('./EventBroadcaster');

// Default keepalive interval (30 seconds)
const KEEPALIVE_INTERVAL_MS = 30000;

// Default replay limit
const DEFAULT_REPLAY_LIMIT = 50;

/**
 * Create SSE router/middleware
 * @param {Object} options - Options
 * @param {EventBroadcaster} [options.broadcaster] - Broadcaster instance
 * @param {number} [options.keepaliveMs] - Keepalive interval in ms
 * @param {number} [options.replayLimit] - Max events to replay on connect
 * @param {Object} [options.logger] - Logger instance
 * @returns {Function} Express middleware
 */
function createSSEHandler(options = {}) {
  const broadcaster = options.broadcaster || getBroadcaster();
  const keepaliveMs = options.keepaliveMs || KEEPALIVE_INTERVAL_MS;
  const replayLimit = options.replayLimit || DEFAULT_REPLAY_LIMIT;
  const logger = options.logger || console;

  // Track active connections for stats
  const activeConnections = new Set();

  /**
   * SSE handler middleware
   */
  function sseHandler(req, res) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Disable response timeout
    res.setTimeout(0);

    // Parse filter options from query string
    const types = parseArrayParam(req.query.types);
    const domains = parseArrayParam(req.query.domains);
    const replay = req.query.replay !== 'false'; // Default to true

    // Connection metadata
    const connectionId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const connection = {
      id: connectionId,
      types,
      domains,
      connectedAt: new Date().toISOString(),
      eventsSent: 0,
      lastEventAt: null
    };
    activeConnections.add(connection);

    if (logger.debug) {
      logger.debug(`[SSE] Client connected: ${connectionId}`, { types, domains });
    }

    // Send initial connection event
    sendEvent(res, {
      type: 'connected',
      timestamp: new Date().toISOString(),
      payload: {
        connectionId,
        filters: { types, domains }
      }
    });

    // Replay recent history if enabled
    if (replay) {
      const history = broadcaster.getHistory({
        limit: replayLimit,
        types: types.length > 0 ? types : undefined,
        domains: domains.length > 0 ? domains : undefined
      });

      for (const event of history) {
        sendEvent(res, { ...event, replayed: true });
        connection.eventsSent++;
      }
    }

    // Subscribe to broadcaster
    const subscription = broadcaster.subscribe(
      (event) => {
        sendEvent(res, event);
        connection.eventsSent++;
        connection.lastEventAt = new Date().toISOString();
      },
      { types, domains }
    );

    // Keepalive interval
    const keepaliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(':keepalive\n\n');
      }
    }, keepaliveMs);

    // Cleanup on close
    const cleanup = () => {
      clearInterval(keepaliveTimer);
      subscription.unsubscribe();
      activeConnections.delete(connection);

      if (logger.debug) {
        logger.debug(`[SSE] Client disconnected: ${connectionId}`, {
          eventsSent: connection.eventsSent
        });
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('error', cleanup);
  }

  // Stats endpoint handler
  function statsHandler(req, res) {
    const connections = Array.from(activeConnections).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      eventsSent: c.eventsSent,
      lastEventAt: c.lastEventAt,
      filters: {
        types: c.types,
        domains: c.domains
      }
    }));

    res.json({
      success: true,
      stats: {
        activeConnections: connections.length,
        broadcaster: broadcaster.getStats(),
        connections
      }
    });
  }

  // Attach stats handler to main handler for router composition
  sseHandler.stats = statsHandler;
  sseHandler.getActiveConnections = () => activeConnections.size;

  return sseHandler;
}

/**
 * Create Express router for SSE endpoints
 * @param {Object} options - Options
 * @returns {express.Router}
 */
function createSSERouter(options = {}) {
  const express = require('express');
  const router = express.Router();
  const handler = createSSEHandler(options);

  // Main stream endpoint
  router.get('/stream', handler);

  // Stats endpoint (no auth for now, could add admin check)
  router.get('/stream/stats', handler.stats);

  return router;
}

/**
 * Send SSE event to response
 * @param {Response} res - Express response
 * @param {Object} event - Event object
 */
function sendEvent(res, event) {
  if (res.writableEnded) {
    return;
  }

  try {
    const data = JSON.stringify(event);
    res.write(`data: ${data}\n\n`);
  } catch (err) {
    console.error('[SSE] Error sending event:', err);
  }
}

/**
 * Parse comma-separated query param to array
 * @param {string} param - Query param value
 * @returns {string[]} Array of values
 */
function parseArrayParam(param) {
  if (!param) return [];
  if (Array.isArray(param)) return param;
  return param.split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = {
  createSSEHandler,
  createSSERouter,
  sendEvent,
  parseArrayParam,
  KEEPALIVE_INTERVAL_MS,
  DEFAULT_REPLAY_LIMIT
};
