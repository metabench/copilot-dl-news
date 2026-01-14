const express = require('express');
const { renderBenchmarkListPage } = require('../views/benchmarkListPage');
const { renderBenchmarkDetailPage } = require('../views/benchmarkDetailPage');
const { createRenderContext } = require('../../../shared/utils/html');
const { errorPage } = require('../components/base');

/**
 * Creates SSR routes for benchmark pages
 */
function createBenchmarksSsrRouter({ benchmarkManager, renderNav } = {}) {
  if (!benchmarkManager) {
    throw new Error('createBenchmarksSsrRouter requires benchmarkManager');
  }

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  // Redirect /benchmarks to /benchmarks/ssr
  router.get('/benchmarks', (req, res) => {
    res.redirect('/benchmarks/ssr');
  });

  /**
   * GET /benchmarks/ssr - List all benchmark runs
   */
  router.get('/benchmarks/ssr', (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10) || 50));
      const { items, total } = benchmarkManager.listRuns({ limit });
      
      const html = renderBenchmarkListPage({
        items,
        total,
        limit,
        renderNav: context.renderNav
      });
      
      res.type('html').send(html);
    } catch (err) {
      res.status(500).type('html').send(
        errorPage({ 
          status: 500, 
          message: `Failed to load benchmark runs: ${err?.message || err}` 
        }, context)
      );
    }
  });

  /**
   * GET /benchmarks/:id/ssr - Show a specific benchmark run
   */
  router.get('/benchmarks/:id/ssr', (req, res) => {
    const runId = String(req.params.id || '').trim();
    
    if (!runId) {
      res.status(400).type('html').send(
        errorPage({ 
          status: 400, 
          message: 'Missing benchmark run ID.' 
        }, context)
      );
      return;
    }

    try {
      const run = benchmarkManager.getRun(runId);
      
      if (!run) {
        res.status(404).type('html').send(
          errorPage({ 
            status: 404, 
            message: `Benchmark run not found: ${runId}` 
          }, context)
        );
        return;
      }
      
      const html = renderBenchmarkDetailPage({
        run,
        renderNav: context.renderNav
      });
      
      res.type('html').send(html);
    } catch (err) {
      res.status(500).type('html').send(
        errorPage({ 
          status: 500, 
          message: `Failed to load benchmark run: ${err?.message || err}` 
        }, context)
      );
    }
  });

  return router;
}

module.exports = { createBenchmarksSsrRouter };
