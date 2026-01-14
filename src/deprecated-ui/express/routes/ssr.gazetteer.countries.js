const express = require('express');
const { fetchGazetteerCountries } = require('../../../data/gazetteerCountries');
const { renderGazetteerCountriesPage } = require('../views/gazetteer/countriesPage');
const { escapeHtml, safeTracePre } = require('../views/gazetteer/helpers');

function ensureRenderNav(fn) {
  if (typeof fn === 'function') return fn;
  return () => '';
}

function createGazetteerCountriesRouter(options = {}) {
  const { urlsDbPath, startTrace, renderNav } = options;
  if (!urlsDbPath) {
    throw new Error('createGazetteerCountriesRouter requires urlsDbPath');
  }
  if (typeof startTrace !== 'function') {
    throw new Error('createGazetteerCountriesRouter requires startTrace(req, tag)');
  }

  const router = express.Router();
  const navRenderer = ensureRenderNav(renderNav);

  router.get('/gazetteer/countries', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try {
        trace.end();
      } catch (_) {
        // ignore trace errors
      }
    };

    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../data/db/sqlite'));
    } catch (err) {
      endTrace();
      res.status(503).send('<!doctype html><title>Countries</title><h1>Countries</h1><p>Database unavailable.</p>');
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const doneFetch = safeTracePre(trace, 'list-countries');
      const rows = fetchGazetteerCountries(db);
      doneFetch();

      const doneClose = safeTracePre(trace, 'db-close');
      db.close();
      doneClose();

      const html = renderGazetteerCountriesPage({ rows, renderNav: navRenderer });
      const doneRender = safeTracePre(trace, 'render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      endTrace();
    } catch (err) {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close errors
        }
      }
      const message = escapeHtml(err && err.message ? err.message : String(err));
      res.status(500).send(`<!doctype html><title>Error</title><pre>${message}</pre>`);
      endTrace();
    }
  });

  return router;
}

module.exports = {
  createGazetteerCountriesRouter
};
