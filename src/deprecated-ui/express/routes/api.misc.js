const express = require('express');
const { listRecentErrors } = require('../data/errors');
const { listCrawlTypes } = require('../data/crawlTypes');
const { ServiceUnavailableError, InternalServerError } = require('../errors/HttpError');

function createMiscApiRouter(options = {}) {
  const {
    getLegacy,
    getMetrics,
    getDbRW,
    metricsFormatter = null
  } = options;
  const router = express.Router();

  if (typeof getLegacy !== 'function' || typeof getMetrics !== 'function' || typeof getDbRW !== 'function') {
    throw new Error('createMiscApiRouter requires getLegacy, getMetrics, and getDbRW');
  }

  function buildStatus() {
    const legacy = getLegacy() || {};
    const metrics = getMetrics() || {};
    const running = !!(metrics.running > 0);
    const stage = metrics.stage || (running ? 'running' : 'idle');
    return {
      running,
      paused: !!legacy.paused,
      stage,
      startedAt: legacy.startedAt || null,
      lastExit: legacy.lastExit || null,
      queueSize: metrics.queueSize || 0,
      lastProgressAt: metrics._lastSampleTime || 0
    };
  }

  router.get('/api/status', (req, res) => {
    res.json(buildStatus());
  });

  router.get('/health', (req, res) => {
    res.json(buildStatus());
  });

  router.get('/metrics', (req, res) => {
    if (metricsFormatter && typeof metricsFormatter.getSnapshot === 'function') {
      const snapshot = metricsFormatter.getSnapshot();
      res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('ETag', snapshot.etag);
      res.set('Last-Modified', snapshot.lastModified);
      if (req.fresh) {
        return res.status(304).end();
      }
      const body = Buffer.isBuffer(snapshot.buffer) ? snapshot.buffer : snapshot.text;
      return res.type('text/plain').send(body);
    }
    const metrics = getMetrics();
    const legacy = getLegacy();
    const lines = [];
    const text = (name, value, type = 'gauge') => {
      if (value == null) return;
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(`${name} ${value}`);
    };

    text('crawler_running', metrics.running);
    text('crawler_paused', legacy.paused ? 1 : 0);
    text('crawler_visited_total', metrics.visited, 'counter');
    text('crawler_downloaded_total', metrics.downloaded, 'counter');
    text('crawler_found_total', metrics.found, 'counter');
    text('crawler_saved_total', metrics.saved, 'counter');
    text('crawler_errors_total', metrics.errors, 'counter');
    text('crawler_queue_size', metrics.queueSize);
    text('crawler_requests_per_sec', metrics.requestsPerSec.toFixed(2));
    text('crawler_downloads_per_sec', metrics.downloadsPerSec.toFixed(2));
    text('crawler_bytes_per_sec', metrics.bytesPerSec.toFixed(0));

    res.type('text/plain').send(lines.join('\n'));
  });

  router.get('/api/recent-errors', (req, res, next) => {
    try {
      const db = getDbRW();
      if (!db) return res.json({ errors: [] });

      const rows = listRecentErrors(db, { limit: 200 });

      const grouped = new Map();
      for (const row of rows) {
        const host = (row.host || '').trim() || '(unknown)';
        const status = row.code != null ? String(row.code) : (row.kind || 'other');
        const key = `${host}|${status}`;
        const entry = grouped.get(key) || {
          host,
          status,
          kind: row.kind || null,
          latestAt: row.at || null,
          count: 0,
          messages: new Set(),
          examples: []
        };
        entry.count += 1;
        if (!entry.latestAt || (row.at && row.at > entry.latestAt)) {
          entry.latestAt = row.at;
        }
        if (row.message) entry.messages.add(row.message);
        if (entry.examples.length < 3) {
          entry.examples.push({
            url: row.url || null,
            message: row.message || null,
            kind: row.kind || null,
            at: row.at || null
          });
        }
        grouped.set(key, entry);
      }

      const errors = Array.from(grouped.values())
        .map((entry) => ({
          host: entry.host,
          status: entry.status,
          kind: entry.kind,
          count: entry.count,
          latestAt: entry.latestAt,
          messages: Array.from(entry.messages).slice(0, 5),
          examples: entry.examples
        }))
        .sort((a, b) => {
          if (a.latestAt && b.latestAt && a.latestAt !== b.latestAt) {
            return a.latestAt > b.latestAt ? -1 : 1;
          }
          return b.count - a.count;
        })
        .slice(0, 50);

      return res.json({ errors });
    } catch (err) {
      next(new InternalServerError(err.message));
    }
  });

  router.get('/api/crawl-types', (req, res, next) => {
    try {
      const db = getDbRW();
      if (!db) {
        return next(new ServiceUnavailableError('Database unavailable'));
      }
      const raw = listCrawlTypes(db);
      const items = raw.map((row) => {
        const { declarationError, ...rest } = row;
        return declarationError
          ? { ...rest, error: declarationError }
          : rest;
      });
      res.json({
        items
      });
    } catch (err) {
      next(new InternalServerError(err.message));
    }
  });

  router.get('/api/insights', (req, res) => {
    // Stub endpoint for pattern insights
    // TODO: Implement proper pattern insights aggregation
    res.json({
      details: {
        patterns: [],
        sections: [],
        hints: [],
        lastUpdated: null
      }
    });
  });

  return router;
}

module.exports = {
  createMiscApiRouter
};
