const express = require('express');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('../services/analysisRuns');
const {
  renderAnalysisListPage
} = require('../views/analysisListPage');
const {
  renderAnalysisDetailPage
} = require('../views/analysisDetailPage');

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

function createAnalysisSsrRouter({ getDbRW, renderNav } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createAnalysisSsrRouter requires getDbRW');
  }

  const router = express.Router();
  const navRenderer = ensureRenderNav(renderNav);

  router.get('/analysis', (req, res) => {
    res.redirect('/analysis/ssr');
  });

  router.get('/analysis/ssr', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis runs: ${message}</p></body></html>`);
      return;
    }

    if (!db) {
      res.status(503).send('<!doctype html><title>Analysis</title><body><p>Database unavailable.</p></body></html>');
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10) || 50));
      const { items, total } = listAnalysisRuns(db, { limit });
      const html = renderAnalysisListPage({
        items,
        total,
        limit,
        renderNav: navRenderer
      });
      res.type('html').send(html);
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis runs: ${message}</p></body></html>`);
    }
  });

  router.get('/analysis/:id/ssr', (req, res) => {
    const runId = String(req.params.id || '').trim();
    if (!runId) {
      res.status(400).send('<!doctype html><title>Analysis</title><body><p>Missing analysis run id.</p></body></html>');
      return;
    }

    let db;
    try {
      db = getDbRW();
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis run: ${message}</p></body></html>`);
      return;
    }

    if (!db) {
      res.status(503).send('<!doctype html><title>Analysis</title><body><p>Database unavailable.</p></body></html>');
      return;
    }

    try {
      ensureAnalysisRunSchema(db);
      const detail = getAnalysisRun(db, runId);
      if (!detail) {
        res.status(404).send('<!doctype html><title>Analysis</title><body><p>Analysis run not found.</p></body></html>');
        return;
      }
      const html = renderAnalysisDetailPage({
        run: detail.run,
        events: detail.events,
        payload: detail,
        renderNav: navRenderer
      });
      res.type('html').send(html);
    } catch (err) {
      const message = escapeHtml(err?.message || err);
      res.status(500).send(`<!doctype html><title>Analysis</title><body><p>Failed to load analysis run: ${message}</p></body></html>`);
    }
  });

  return router;
}

module.exports = {
  createAnalysisSsrRouter
};
