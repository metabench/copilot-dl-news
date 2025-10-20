const express = require('express');
const { fetchBootstrapDbStatus, getBootstrapDatasetPath } = require('../data/bootstrapDb');
const { renderBootstrapDbPage } = require('../views/bootstrapDbPage');
const { escapeHtml } = require('../utils/html');
const { errorPage } = require('../components/base');

function createBootstrapDbRouter({ getDbRW, renderNav, datasetPath = null } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createBootstrapDbRouter requires getDbRW');
  }

  const router = express.Router();
  const resolvedDatasetPath = getBootstrapDatasetPath(datasetPath);

  router.get('/bootstrap-db', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      const context = { escapeHtml, renderNav };
      res.status(500).send(errorPage({
        status: 500,
        message: `Unable to open database: ${err?.message || err}`
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
      const status = fetchBootstrapDbStatus(db);
      const html = renderBootstrapDbPage({
        status,
        renderNav,
        datasetPath: resolvedDatasetPath
      });
      res.type('html').send(html);
    } catch (err) {
      const context = { escapeHtml, renderNav };
      res.status(500).send(errorPage({
        status: 500,
        message: `Failed to render bootstrap DB page: ${err?.message || err}`
      }, context));
    }
  });

  return router;
}

module.exports = {
  createBootstrapDbRouter
};
