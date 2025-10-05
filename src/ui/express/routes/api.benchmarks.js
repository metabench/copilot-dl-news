const express = require('express');

/**
 * Creates API routes for benchmarks
 */
function createBenchmarksApiRouter({ benchmarkManager } = {}) {
  if (!benchmarkManager) {
    throw new Error('createBenchmarksApiRouter requires benchmarkManager');
  }

  const router = express.Router();

  /**
   * GET /api/benchmarks - List all benchmark runs
   */
  router.get('/api/benchmarks', (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10) || 50));
      const result = benchmarkManager.listRuns({ limit });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to list benchmark runs',
        message: err.message
      });
    }
  });

  /**
   * GET /api/benchmarks/:id - Get a specific benchmark run
   */
  router.get('/api/benchmarks/:id', (req, res) => {
    try {
      const runId = String(req.params.id || '').trim();
      if (!runId) {
        return res.status(400).json({
          error: 'Missing run ID'
        });
      }

      const run = benchmarkManager.getRun(runId);
      if (!run) {
        return res.status(404).json({
          error: 'Benchmark run not found'
        });
      }

      res.json({ run });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to get benchmark run',
        message: err.message
      });
    }
  });

  /**
   * POST /api/benchmarks - Start a new benchmark run
   */
  router.post('/api/benchmarks', async (req, res) => {
    try {
      const iterations = Math.max(1, Math.min(20, parseInt(req.body?.iterations || '5', 10) || 5));
      const runId = req.body?.runId || null;

      const result = await benchmarkManager.startBenchmark({ iterations, runId });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to start benchmark',
        message: err.message
      });
    }
  });

  return router;
}

module.exports = { createBenchmarksApiRouter };
