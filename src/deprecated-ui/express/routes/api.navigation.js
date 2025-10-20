const express = require('express');
const { getNavLinks, renderNav } = require('../services/navigation');

function createNavigationApiRouter() {
  const router = express.Router();

  router.get('/api/navigation/links', (req, res) => {
    res.json({ links: getNavLinks() });
  });

  router.get('/api/navigation/bar', (req, res) => {
    const active = typeof req.query.active === 'string' ? req.query.active : '';
    const variant = typeof req.query.variant === 'string' ? req.query.variant : undefined;
    const html = renderNav(active, { variant });
    res.json({ html });
  });

  return router;
}

module.exports = {
  createNavigationApiRouter
};
