const express = require('express');
const { getNavLinks, renderNav } = require('../services/navigation');

function createNavigationApiRouter() {
  const router = express.Router();

  router.get('/api/navigation/links', (req, res) => {
    res.json({ links: getNavLinks() });
  });

  router.get('/api/navigation/bar', (req, res) => {
    const active = typeof req.query.active === 'string' ? req.query.active : '';
    const html = renderNav(active);
    res.json({ html });
  });

  return router;
}

module.exports = {
  createNavigationApiRouter
};
