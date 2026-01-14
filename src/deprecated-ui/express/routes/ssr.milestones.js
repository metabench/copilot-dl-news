const express = require('express');
const {
  fetchMilestones
} = require('../../../data/milestones');
const {
  renderMilestonesPage
} = require('../views/milestonesPage');
const { escapeHtml } = require('../../../shared/utils/html');
const { errorPage } = require('../components/base');

/**
 * Create router for milestones SSR routes
 * @param {Object} options - Router options
 * @param {Function} options.getDbRW - Database getter
 * @param {Function} options.renderNav - Navigation renderer
 * @returns {express.Router} Router instance
 */
function createMilestonesSsrRouter({ getDbRW, renderNav } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createMilestonesSsrRouter requires getDbRW');
  }

  const router = express.Router();

  router.get('/milestones/ssr', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      const context = { escapeHtml, renderNav };
      res.status(500).send(errorPage({
        status: 500,
        message: `Failed to load milestones: ${err?.message || err}`
      }, context));
      return;
    }

    if (!db) {
      const context = { escapeHtml, renderNav };
      res.status(503).send(errorPage({
        status: 503,
        message: 'Database unavailable.'
      }, context));
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
        renderNav
      });

      res.type('html').send(html);
    } catch (err) {
      const context = { escapeHtml, renderNav };
      res.status(500).send(errorPage({
        status: 500,
        message: `Failed to load milestones: ${err?.message || err}`
      }, context));
    }
  });

  return router;
}

module.exports = {
  createMilestonesSsrRouter
};
