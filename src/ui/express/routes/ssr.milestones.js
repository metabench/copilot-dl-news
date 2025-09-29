const express = require('express');
const {
  fetchMilestones
} = require('../data/milestones');
const {
  renderMilestonesPage
} = require('../views/milestonesPage');

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

function createMilestonesSsrRouter({ getDbRW, renderNav } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createMilestonesSsrRouter requires getDbRW');
  }

  const router = express.Router();
  const navRenderer = ensureRenderNav(renderNav);

  router.get('/milestones/ssr', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Milestones</title><body><p>Failed to load milestones: ${message}</p></body></html>`);
      return;
    }

    if (!db) {
      res.status(503).send('<!doctype html><title>Milestones</title><body><p>Database unavailable.</p></body></html>');
      return;
    }

    try {
      const {
        items,
        cursors,
        appliedFilters
      } = fetchMilestones(db, {
        job: req.query.job,
        kind: req.query.kind,
        scope: req.query.scope,
        limit: req.query.limit,
        before: req.query.before,
        after: req.query.after
      });

      const html = renderMilestonesPage({
        items,
        filters: {
          job: appliedFilters.job || '',
          kind: appliedFilters.kind || '',
          scope: appliedFilters.scope || '',
          limit: appliedFilters.limit
        },
        cursors,
        renderNav: navRenderer
      });

      res.type('html').send(html);
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Milestones</title><body><p>Failed to load milestones: ${message}</p></body></html>`);
    }
  });

  return router;
}

module.exports = {
  createMilestonesSsrRouter
};
