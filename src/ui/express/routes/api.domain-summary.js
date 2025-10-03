const express = require('express');
const { fetchDomainSummary } = require('../data/domainSummary');

function createDomainSummaryApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createDomainSummaryApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/domain-summary', (req, res) => {
    const host = String(req.query.host || '').trim().toLowerCase();
    if (!host) {
      return res.status(400).json({ error: 'Missing host' });
    }

    let NewsDatabase;
    try {
      NewsDatabase = require('../../../db');
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
    }

    let db;
    try {
      db = new NewsDatabase(urlsDbPath);

      const summary = fetchDomainSummary(db.db, host);

      return res.json(summary);
    } catch (err) {
      return res.status(500).json({
        error: err && err.message ? err.message : String(err)
      });
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close failures
        }
      }
    }
  });

  return router;
}

module.exports = {
  createDomainSummaryApiRouter
};