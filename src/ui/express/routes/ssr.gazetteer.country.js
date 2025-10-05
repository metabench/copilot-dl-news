const express = require('express');
const { createGazetteerCountryMinimalRouter } = require('./ssr.gazetteer.country.minimal');
const { createGazetteerCountryFullRouter } = require('./ssr.gazetteer.country.full');

function createGazetteerCountryRouter(options = {}) {
  const router = express.Router();

  const minimalRouter = createGazetteerCountryMinimalRouter(options);
  const fullRouter = createGazetteerCountryFullRouter(options);

  router.get('/gazetteer/country/:cc', (req, res, next) => {
    const view = String(req.query.view || '').toLowerCase();
    const storage = String(req.query.storage || '0');

    if (view === 'full' || view === 'all' || storage === '1') {
      return fullRouter(req, res, next);
    }

    return minimalRouter(req, res, next);
  });

  router.get('/gazetteer/country/:cc/full', (req, res) => {
    const cc = String(req.params.cc || '').trim().toUpperCase();
    res.redirect(302, `/gazetteer/country/${encodeURIComponent(cc)}?view=full`);
  });

  return router;
}

module.exports = {
  createGazetteerCountryRouter,
  createGazetteerCountryMinimalRouter,
  createGazetteerCountryFullRouter
};
