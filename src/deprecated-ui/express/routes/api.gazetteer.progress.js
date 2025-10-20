'use strict';

const express = require('express');
const progressData = require('../data/gazetteerProgressData');

/**
 * GET /api/gazetteer/progress
 * Returns current gazetteer crawl progress with stage information
 */
function createGazetteerProgressRouter({ getDbRO, gazetteerScheduler }) {
  const router = express.Router();

  router.get('/api/gazetteer/progress', async (req, res) => {
    try {
      const db = getDbRO();
      
      // Get full progress summary from data helper
      const summary = progressData.getProgressSummary(db, gazetteerScheduler);

      res.json({
        ...summary,
        counts: {
          total: summary.totalPlaces,
          byKind: summary.placeCountsByKind.reduce((acc, item) => {
            acc[item.kind] = item.count;
            return acc;
          }, {})
        },
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[api.gazetteer.progress] Error:', error.message);
      res.status(500).json({
        error: 'Failed to get gazetteer progress',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = { createGazetteerProgressRouter };
