const express = require('express');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('../services/analysisRuns');
const {
  ensurePlaceHubGuessRunsSchema,
  listPlaceHubGuessRuns,
  getPlaceHubGuessRun
} = require('../services/placeHubGuessRuns');
const {
  renderAnalysisListPage
} = require('../views/analysisListPage');
const {
  renderAnalysisDetailPage
} = require('../views/analysisDetailPage');
const { createRenderContext } = require('../utils/html');
const { errorPage } = require('../components/base');

function createAnalysisSsrRouter({ getDbRW, renderNav } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createAnalysisSsrRouter requires getDbRW');
  }

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  router.get('/analysis', (req, res) => {
    res.redirect('/analysis/ssr');
  });

  router.get('/analysis/ssr', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      res.status(500).type('html').send(errorPage({ status: 500, message: `Failed to load analysis runs: ${err?.message || err}` }, context));
      return;
    }

    if (!db) {
      res.status(503).type('html').send(errorPage({ status: 503, message: 'Database unavailable.' }, context));
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      ensurePlaceHubGuessRunsSchema(db);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10) || 50));

      // Fetch both analysis runs and hub guessing runs
      const analysisRuns = listAnalysisRuns(db, { limit: Math.ceil(limit / 2) });
      const hubGuessRuns = listPlaceHubGuessRuns(db, { limit: Math.ceil(limit / 2) });

      // Combine and sort by started time (most recent first)
      const combinedItems = [
        ...analysisRuns.items,
        ...hubGuessRuns.items
      ].sort((a, b) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return bTime - aTime;
      }).slice(0, limit);

      const totalCombined = analysisRuns.total + hubGuessRuns.total;

      const html = renderAnalysisListPage({
        items: combinedItems,
        total: totalCombined,
        limit,
        renderNav: context.renderNav
      });
      res.type('html').send(html);
    } catch (err) {
      res.status(500).type('html').send(errorPage({ status: 500, message: `Failed to load analysis runs: ${err?.message || err}` }, context));
    }
  });

  router.get('/analysis/:id/ssr', (req, res) => {
    const runId = String(req.params.id || '').trim();
    if (!runId) {
      res.status(400).type('html').send(errorPage({ status: 400, message: 'Missing analysis run id.' }, context));
      return;
    }

    let db;
    try {
      db = getDbRW();
    } catch (err) {
      res.status(500).type('html').send(errorPage({ status: 500, message: `Failed to load analysis run: ${err?.message || err}` }, context));
      return;
    }

    if (!db) {
      res.status(503).type('html').send(errorPage({ status: 503, message: 'Database unavailable.' }, context));
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      ensurePlaceHubGuessRunsSchema(db);
      const detail = getAnalysisRun(db, runId) || getPlaceHubGuessRun(db, runId);
      if (!detail) {
        res.status(404).type('html').send(errorPage({ status: 404, message: 'Analysis run not found.' }, context));
        return;
      }
      const html = renderAnalysisDetailPage({
        run: detail.run,
        events: detail.events,
        payload: detail,
        renderNav: context.renderNav
      });
      res.type('html').send(html);
    } catch (err) {
      res.status(500).type('html').send(errorPage({ status: 500, message: `Failed to load analysis run: ${err?.message || err}` }, context));
    }
  });

  return router;
}

module.exports = {
  createAnalysisSsrRouter
};
