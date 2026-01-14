const express = require('express');
const { listRecentCrawls } = require('../../../data/crawls');
const { renderCrawlsListPage, streamCrawlsListPage } = require('../views/crawlsListPage');
const { createCrawlsViewModel } = require('../views/crawls/createCrawlsViewModel');
const { createRenderContext } = require('../../../shared/utils/html');
const { errorPage } = require('../components/base');

function parseArgs(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return raw.split(/\s+/g).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}
  return [];
}

function deriveCrawlType(rawArgs, fallback) {
  const args = parseArgs(rawArgs);
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--crawl-type' && args[i + 1]) {
      return args[i + 1];
    }
    if (typeof token === 'string' && token.startsWith('--crawl-type=')) {
      return token.slice('--crawl-type='.length);
    }
  }
  return fallback || null;
}

const STREAMING_THRESHOLD = 150;

function createCrawlsSsrRouter({ jobRegistry, renderNav, getDbRW } = {}) {
  if (!jobRegistry) {
    throw new Error('createCrawlsSsrRouter requires jobRegistry');
  }
  if (typeof renderNav !== 'function') {
    throw new Error('createCrawlsSsrRouter requires renderNav function');
  }
  if (typeof getDbRW !== 'function') {
    throw new Error('createCrawlsSsrRouter requires getDbRW');
  }

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  router.get('/crawls', (req, res) => {
    res.redirect('/crawls/ssr');
  });

  router.get('/crawls/ssr', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) {
        res.status(503).type('html').send(errorPage({ status: 503, message: 'Database unavailable.' }, context));
        return;
      }

      const historyRows = listRecentCrawls(db, { limit: req.query.limit });
      const jobs = jobRegistry.getJobs();
      const activeMap = new Map();

      for (const [id, j] of jobs.entries()) {
        const metrics = j.metrics || {};
        const stage = j.stage || (j.child ? 'running' : 'done');
        const status = j.child ? (j.paused ? 'paused' : stage) : stage;
        const crawlType = deriveCrawlType(j.args, null);
        const item = {
          id,
          pid: j.child?.pid || null,
          url: j.url || null,
          startedAt: j.startedAt || null,
          endedAt: (j.lastExit && j.lastExit.endedAt) ? j.lastExit.endedAt : null,
          paused: !!j.paused,
          status,
          stage,
          stageChangedAt: j.stageChangedAt || null,
          lastActivityAt: metrics._lastProgressWall || null,
          metrics: {
            visited: metrics.visited || 0,
            downloaded: metrics.downloaded || 0,
            found: metrics.found || 0,
            saved: metrics.saved || 0,
            errors: metrics.errors || 0,
            queueSize: metrics.queueSize || 0,
            requestsPerSec: metrics.requestsPerSec || 0,
            downloadsPerSec: metrics.downloadsPerSec || 0
          },
          crawlType,
          rawArgs: j.args || null,
          isActive: true
        };
        activeMap.set(id, item);
      }

      const items = [];

      for (const row of historyRows) {
        const id = String(row.id || '').trim();
        if (!id) continue;
        const active = activeMap.get(id);
        const derivedType = deriveCrawlType(row.args, row.crawlType);
        if (active) {
          if (!active.crawlType && derivedType) {
            active.crawlType = derivedType;
          }
          if (!active.startedAt && row.startedAt) {
            active.startedAt = row.startedAt;
          }
          if (!active.endedAt && row.endedAt) {
            active.endedAt = row.endedAt;
          }
          active.historyArgs = row.args || null;
          active.historyStatus = row.status || null;
          activeMap.delete(id);
          items.push(active);
          continue;
        }

        items.push({
          id,
          url: row.url || null,
          startedAt: row.startedAt || null,
          endedAt: row.endedAt || null,
          status: row.status || (row.endedAt ? 'done' : 'unknown'),
          stage: row.status || null,
          paused: row.status === 'paused',
          pid: row.pid || null,
          crawlType: derivedType,
          metrics: {
            visited: null,
            downloaded: null,
            errors: null,
            queueSize: null
          },
          isActive: false
        });
      }

      for (const active of activeMap.values()) {
        items.unshift(active);
      }

      const sorted = items.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        const aKey = a.endedAt || a.startedAt || '';
        const bKey = b.endedAt || b.startedAt || '';
        return String(bKey).localeCompare(String(aKey));
      });

      const viewModel = createCrawlsViewModel(sorted);
      if (viewModel.rows.length > STREAMING_THRESHOLD) {
        res.status(200);
        res.set('Content-Type', 'text/html; charset=utf-8');
        streamCrawlsListPage({
          res,
          renderNav: context.renderNav,
          viewModel
        });
        return;
      } else {
        const html = renderCrawlsListPage({
          viewModel,
          renderNav: context.renderNav
        });
        res.type('html').send(html);
      }
    } catch (err) {
      res.status(500).type('html').send(errorPage({ 
        status: 500, 
        message: `Failed to load crawls: ${err?.message || err}` 
      }, context));
    }
  });

  return router;
}

module.exports = {
  createCrawlsSsrRouter
};
