const express = require('express');
const {
  listQueues,
  getLatestQueueId,
  getQueueDetail
} = require('../data/queues');
const {
  renderQueuesListPage
} = require('../views/queuesListPage');
const {
  renderQueueDetailPage
} = require('../views/queueDetailPage');
const { resolveStaleQueueJobs } = require('../services/queueJanitor');

function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '';
}

function escapeHtml(value) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, (match) => map[match] || match);
}

function createQueuesSsrRouter({ getDbRW, renderNav, jobRegistry = null, logger = null }) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createQueuesSsrRouter requires getDbRW');
  }

  const router = express.Router();
  const navRenderer = ensureRenderNav(renderNav);

  router.get('/queues', (req, res) => {
    res.redirect('/queues/ssr');
  });

  router.get('/queues/ssr', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) {
        res.status(503).send('<!doctype html><title>Queues</title><body><p>Database unavailable.</p></body></html>');
        return;
      }
      try {
        resolveStaleQueueJobs({ db, jobRegistry, logger });
      } catch (_) {}
      const rows = listQueues(db, { limit: req.query.limit });
      const html = renderQueuesListPage({
        rows,
        renderNav: navRenderer
      });
      res.type('html').send(html);
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Queues</title><body><p>Failed to load queues: ${message}</p></body></html>`);
    }
  });

  router.get('/queues/latest', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) {
        res.redirect('/queues/ssr');
        return;
      }
      try {
        resolveStaleQueueJobs({ db, jobRegistry, logger });
      } catch (_) {}
      const latestId = getLatestQueueId(db);
      if (!latestId) {
        res.redirect('/queues/ssr');
        return;
      }
      res.redirect(`/queues/${encodeURIComponent(latestId)}/ssr`);
    } catch (_) {
      res.redirect('/queues/ssr');
    }
  });

  router.get('/queues/:id/ssr', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).send('<!doctype html><title>Queue</title><body><p>Missing queue id.</p></body></html>');
      return;
    }
    try {
      const db = getDbRW();
      if (!db) {
        res.status(503).send('<!doctype html><title>Queue</title><body><p>Database unavailable.</p></body></html>');
        return;
      }
      try {
        resolveStaleQueueJobs({ db, jobRegistry, logger });
      } catch (_) {}
      const detail = getQueueDetail(db, {
        id,
        action: req.query.action,
        before: req.query.before,
        after: req.query.after,
        limit: req.query.limit
      });
      if (!detail.job) {
        res.status(404).send('<!doctype html><title>Queue</title><body><p>Queue not found.</p></body></html>');
        return;
      }

      const baseUrl = `/queues/${encodeURIComponent(detail.job.id)}/ssr`;
      const baseParams = new URLSearchParams();
      if (detail.filters.action) baseParams.set('action', detail.filters.action);
      if (detail.filters.limit) baseParams.set('limit', detail.filters.limit);

      const buildHref = (extra = {}) => {
        const params = new URLSearchParams(baseParams);
        if (extra.before) params.set('before', String(extra.before)); else params.delete('before');
        if (extra.after) params.set('after', String(extra.after)); else params.delete('after');
        const search = params.toString();
        return search ? `${baseUrl}?${search}` : baseUrl;
      };

  const { pagination } = detail;
      const latestHref = buildHref({});
      let newerHref = null;
      let olderHref = null;
      if (pagination.newestId != null && pagination.maxId != null && pagination.newestId < pagination.maxId) {
        newerHref = buildHref({ after: pagination.newestId });
      }
      if (pagination.oldestId != null && pagination.minId != null && pagination.oldestId > pagination.minId) {
        olderHref = buildHref({ before: pagination.oldestId });
      }
      const summaryParts = [];
      if (pagination.newestId != null && pagination.oldestId != null) {
        summaryParts.push(` (#${pagination.newestId}–#${pagination.oldestId})`);
      }
      if (pagination.maxId != null && pagination.minId != null) {
        summaryParts.push(` of #${pagination.maxId}…#${pagination.minId}`);
      }
      const paginationInfo = {
        latestHref,
        newerHref,
        olderHref,
        summary: summaryParts.join('')
      };

      const html = renderQueueDetailPage({
        job: detail.job,
        events: detail.events,
        filters: {
          action: detail.filters.action || '',
          limit: detail.filters.limit != null ? String(detail.filters.limit) : '',
          before: detail.filters.before,
          after: detail.filters.after
        },
        pagination: paginationInfo,
        neighbors: detail.neighbors,
        renderNav: navRenderer
      });
      res.type('html').send(html);
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Queue</title><body><p>Failed to load queue: ${message}</p></body></html>`);
    }
  });

  return router;
}

module.exports = {
  createQueuesSsrRouter
};
