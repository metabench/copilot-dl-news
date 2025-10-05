'use strict';

const express = require('express');
const { renderGazetteerProgressPage } = require('../views/gazetteerProgressPage');
const progressData = require('../data/gazetteerProgressData');

/**
 * GET /gazetteer/progress
 * Server-side rendered gazetteer progress page
 */
function createGazetteerProgressSsrRouter({ getDbRO, renderNav, gazetteerScheduler }) {
  const router = express.Router();

  router.get('/gazetteer/progress', async (req, res) => {
    try {
      const db = getDbRO();
      
      // Get full progress summary from data helper
      const summary = progressData.getProgressSummary(db, gazetteerScheduler);

      const navigation = renderNav(req.path);
      const html = renderGazetteerProgressPage({
        progress: summary,
        counts: {
          total: summary.totalPlaces,
          byKind: summary.placeCountsByKind.reduce((acc, item) => {
            acc[item.kind] = item.count;
            return acc;
          }, {})
        },
        navigation
      });

      res.type('html').send(html);
    } catch (error) {
      console.error('[ssr.gazetteer.progress] Error:', error.message);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body>
          <h1>Error Loading Gazetteer Progress</h1>
          <p>${error.message}</p>
        </body>
        </html>
      `);
    }
  });

  return router;
}

module.exports = { createGazetteerProgressSsrRouter };
