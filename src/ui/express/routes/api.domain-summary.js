const express = require('express');

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

      const articlesRow = db.db.prepare(`
        SELECT COUNT(*) AS c
        FROM articles a
        JOIN urls u ON u.url = a.url
        WHERE LOWER(u.host) = ?
      `).get(host);
      const articles = (articlesRow && typeof articlesRow.c === 'number') ? articlesRow.c : 0;

      let fetches = 0;
      try {
        const fetchRow = db.db.prepare('SELECT COUNT(*) AS c FROM fetches WHERE LOWER(host) = ?').get(host);
        fetches = (fetchRow && typeof fetchRow.c === 'number') ? fetchRow.c : 0;
      } catch (_) {
        try {
          const fallbackRow = db.db.prepare(`
            SELECT COUNT(*) AS c
            FROM fetches f
            JOIN urls u ON u.url = f.url
            WHERE LOWER(u.host) = ?
          `).get(host);
          fetches = (fallbackRow && typeof fallbackRow.c === 'number') ? fallbackRow.c : 0;
        } catch (_) {
          fetches = 0;
        }
      }

      return res.json({
        host,
        articles,
        fetches
      });
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