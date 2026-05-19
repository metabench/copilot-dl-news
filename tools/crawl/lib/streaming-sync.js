'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Streaming Sync Client — SSE-based page-level sync.
 *
 * Connects to the remote server's /api/events SSE endpoint, listens for
 * page:complete events, accumulates URL IDs into a batch buffer, and
 * flushes them to the local DB via /api/sync/pull when batch thresholds
 * are reached (either by count or time window).
 *
 * This replaces the poll-based sync loop for low-latency, page-at-a-time
 * ingestion — ideal for small-batch crawls like "2 new pages per site".
 *
 * @module tools/crawl/lib/streaming-sync
 */

/**
 * Create a streaming sync client.
 *
 * @param {object} options
 * @param {string} options.remoteHost - Remote host:port
 * @param {number} [options.batchSize=1] - Flush after N pages (1 = immediate)
 * @param {number} [options.batchWindowMs=500] - Flush after N ms
 * @param {function} options.onBatch - Called with { urlIds, urls } when a batch is ready to pull
 * @param {function} [options.onEvent] - Called with raw SSE events for telemetry
 * @param {function} [options.onError] - Called on connection errors
 * @param {function} [options.onConnect] - Called when SSE connection is established
 * @returns {{ start: Function, stop: Function, stats: Function }}
 */
function createStreamingSync(options = {}) {
  let {
    batchSize = 1,
    batchWindowMs = 500,
  } = options;
  const {
    remoteHost,
    onBatch,
    onEvent,
    onError,
    onConnect,
  } = options;

  if (!remoteHost) throw new Error('remoteHost is required');
  if (typeof onBatch !== 'function') throw new Error('onBatch callback is required');

  let sseRequest = null;
  let running = false;
  let batchBuffer = []; // { urlId, url, domain, ts }
  let flushTimer = null;
  let reconnectTimer = null;
  const stats = {
    connected: false,
    eventsReceived: 0,
    batchesFlushed: 0,
    pagesSynced: 0,
    errors: 0,
    lastEventAt: null,
    lastFlushAt: null,
    reconnects: 0,
  };

  function setBatchSize(size) {
    if (size > 0) batchSize = size;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBatch('timer');
    }, batchWindowMs);
  }

  async function flushBatch(reason) {
    if (batchBuffer.length === 0) return;
    const batch = batchBuffer.splice(0);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const urlIds = batch.map(b => b.urlId);
    const urls = batch.map(b => b.url);

    try {
      await onBatch({ urlIds, urls, reason, count: batch.length });
      stats.batchesFlushed++;
      stats.pagesSynced += batch.length;
      stats.lastFlushAt = new Date().toISOString();
    } catch (err) {
      stats.errors++;
      if (onError) onError(err);
      // Put items back at the front so they can be retried
      batchBuffer.unshift(...batch);
    }
  }

  function processEvent(eventType, data) {
    stats.eventsReceived++;
    stats.lastEventAt = new Date().toISOString();

    if (onEvent) onEvent(eventType, data);

    if (eventType === 'page:complete' && data?.urlId) {
      batchBuffer.push({
        urlId: data.urlId,
        url: data.url,
        domain: data.domain,
        ts: data.ts,
      });

      if (batchBuffer.length >= batchSize) {
        flushBatch('size');
      } else {
        scheduleFlush();
      }
    }
  }

  function connect() {
    const baseUrl = remoteHost.startsWith('http') ? remoteHost : `http://${remoteHost}`;
    const url = new URL('/api/events', baseUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.get(url.href, {
      headers: { 'Accept': 'text/event-stream' },
      timeout: 0, // no timeout for SSE
    }, (res) => {
      if (res.statusCode !== 200) {
        stats.errors++;
        if (onError) onError(new Error(`SSE connection failed: HTTP ${res.statusCode}`));
        scheduleReconnect();
        return;
      }

      stats.connected = true;
      if (onConnect) onConnect();

      let buffer = '';
      let currentEvent = '';
      let currentData = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '') {
            // End of event
            if (currentEvent && currentData) {
              try {
                const parsed = JSON.parse(currentData);
                processEvent(currentEvent, parsed);
              } catch (_) {
                // Non-JSON data, skip
              }
            }
            currentEvent = '';
            currentData = '';
          }
        }
      });

      res.on('end', () => {
        stats.connected = false;
        if (running) scheduleReconnect();
      });

      res.on('error', (err) => {
        stats.connected = false;
        stats.errors++;
        if (onError) onError(err);
        if (running) scheduleReconnect();
      });
    });

    req.on('error', (err) => {
      stats.connected = false;
      stats.errors++;
      if (onError) onError(err);
      if (running) scheduleReconnect();
    });

    sseRequest = req;
  }

  function scheduleReconnect() {
    if (reconnectTimer || !running) return;
    stats.reconnects++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (running) connect();
    }, 3000);
  }

  function start() {
    running = true;
    connect();
  }

  function stop() {
    running = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (sseRequest) {
      sseRequest.destroy();
      sseRequest = null;
    }
    stats.connected = false;
    // Flush any remaining items
    if (batchBuffer.length > 0) {
      return flushBatch('shutdown');
    }
    return Promise.resolve();
  }

  function getStats() {
    return { ...stats, pendingInBuffer: batchBuffer.length, batchSize };
  }

  return { start, stop, stats: getStats, setBatchSize };
}

module.exports = { createStreamingSync };
