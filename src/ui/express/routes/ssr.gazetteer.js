const express = require('express');
const { renderNav } = require('../services/navigation');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function createGazetteerRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) {
    throw new Error('createGazetteerRouter requires urlsDbPath');
  }
  if (typeof startTrace !== 'function') {
    throw new Error('createGazetteerRouter requires startTrace(req, tag)');
  }

  const router = express.Router();

  router.get('/gazetteer', (req, res) => {
    const trace = startTrace(req, 'gazetteer');

    const finishTrace = () => {
      try {
        trace.end();
      } catch (_) {
        // ignore trace errors
      }
    };

    try {
      let openDbReadOnly;
      try {
        ({ openDbReadOnly } = require('../../../ensure_db'));
      } catch (e) {
        res.status(503).send('<!doctype html><title>Gazetteer</title><h1>Gazetteer</h1><p>Database unavailable.</p>');
        finishTrace();
        return;
      }

      const doneOpen = trace.pre('db-open');
      const db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const doneCounts = trace.pre('counts');
      let countries = 0;
      let regions = 0;
      let cities = 0;
      let names = 0;
      let sources = 0;
      try {
        countries = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='country'").get().c;
      } catch (_) {
        countries = 0;
      }
      try {
        regions = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='region'").get().c;
      } catch (_) {
        regions = 0;
      }
      try {
        cities = db.prepare("SELECT COUNT(*) c FROM places WHERE kind='city'").get().c;
      } catch (_) {
        cities = 0;
      }
      try {
        names = db.prepare('SELECT COUNT(*) c FROM place_names').get().c;
      } catch (_) {
        names = 0;
      }
      try {
        sources = db.prepare('SELECT COUNT(*) c FROM place_sources').get().c;
      } catch (_) {
        sources = 0;
      }
      doneCounts();

      const doneClose = trace.pre('db-close');
      db.close();
      doneClose();

      const allZero = (Number(countries) || 0) === 0
        && (Number(regions) || 0) === 0
        && (Number(cities) || 0) === 0
        && (Number(names) || 0) === 0
        && (Number(sources) || 0) === 0;

      const emptyState = allZero ? `
        <section class="card" style="margin-top:10px">
          <div class="meta">Getting started</div>
          <p style="margin:6px 0">Your gazetteer looks empty. Populate it with the built-in tool:</p>
          <pre style="background:#0f172a;color:#e5e7eb;padding:10px;border-radius:8px;overflow:auto"><code>npm run populate:gazetteer</code></pre>
          <div class="meta" style="margin-top:6px">This will import countries, regions (ADM1), and a sample of cities. You can re-run safely; the importer is idempotent.</div>
        </section>
      ` : '';

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:900px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:22px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px}
  .meta{color:var(--muted);font-size:13px}
  ul{margin:6px 0 0 16px}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>Gazetteer</h1>
  ${renderNav('gazetteer')}
    </header>
    <section class="card">
      <div class="meta">Summary</div>
      <div style="margin-top:6px">Countries: <strong>${countries}</strong> · Regions: <strong>${regions}</strong> · Cities: <strong>${cities}</strong></div>
      <div class="meta" style="margin-top:6px">Names: ${names} · Sources: ${sources}</div>
      <div style="margin-top:10px">
        <a href="/gazetteer/countries">Countries</a> ·
        <a href="/gazetteer/places">All places</a>
      </div>
    </section>
    ${emptyState}
  </div>
</body></html>`;

      const doneRender = trace.pre('render');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      doneRender();
      finishTrace();
    } catch (err) {
      finishTrace();
      res.status(500).send('<!doctype html><title>Error</title><pre>' + escapeHtml(err && err.message ? err.message : String(err)) + '</pre>');
    }
  });

  return router;
}

module.exports = {
  createGazetteerRouter
};
