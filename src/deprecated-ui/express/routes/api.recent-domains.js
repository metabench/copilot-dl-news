const express = require('express');
const { getRecentDomains } = require('../../../data/recentDomains');

function createRecentDomainsApiRouter({ urlsDbPath }) {
  const router = express.Router();

  router.get('/api/recent-domains', (req, res) => {
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '20', 10) || 20, 100));
    const result = getRecentDomains(urlsDbPath, limit);
    res.json(result);
  });

  return router;
}

module.exports = {
  createRecentDomainsApiRouter
};