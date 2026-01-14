const express = require('express');
const { renderNav } = require('../services/navigation');
const { escapeHtml, formatNumber, formatBytes, safeTracePre, createRenderContext } = require('../../../shared/utils/html');
const { errorPage } = require('../components/base');
const {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubsBySlug
} = require('../../../data/gazetteerPlace');

function createGazetteerPlaceRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) throw new Error('createGazetteerPlaceRouter requires urlsDbPath');
  if (typeof startTrace !== 'function') throw new Error('createGazetteerPlaceRouter requires startTrace(req, tag)');

  const router = express.Router();
  const context = createRenderContext({ renderNav });

  router.get('/gazetteer/place/:id', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try { trace.end(); } catch (_) { /* noop */ }
    };

    const id = parseInt(req.params.id, 10);
    if (!id) {
      endTrace();
      res.status(400).type('html').send(errorPage({ status: 400, message: 'Invalid place id.' }, context));
      return;
    }

    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../data/db/sqlite'));
    } catch (err) {
      endTrace();
      res.status(503).type('html').send(errorPage({ status: 503, message: 'Database unavailable.' }, context));
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const details = fetchPlaceDetails(db, id, { trace });
      if (!details) {
        db.close();
        endTrace();
        res.status(404).type('html').send(errorPage({ status: 404, message: 'Place not found.' }, context));
        return;
      }

      const {
        place,
        names,
        externalIds,
        parents,
        children,
        canonicalName,
        canonicalSlug,
        sizeBytes,
        sizeMethod
      } = details;

      const doneArticles = safeTracePre(trace, 'articles');
      const articles = canonicalName
        ? fetchPlaceArticles(db, id, { limit: 10, canonicalName })
        : [];
      doneArticles();

      const doneHubs = safeTracePre(trace, 'hubs');
      const hubs = canonicalSlug
        ? listPlaceHubsBySlug(db, canonicalSlug, { limit: 10 })
        : [];
      doneHubs();

      const doneClose = safeTracePre(trace, 'db-close');
      db.close();
      doneClose();

      const title = names.find((n) => n.id === place.canonical_name_id)?.name
        || names[0]?.name
        || '(unnamed place)';

      const namesHtml = names.map((n) => {
        const tags = [];
        if (n.is_official) tags.push('official');
        if (n.is_preferred) tags.push('preferred');
        if (n.lang) tags.push(n.lang.toUpperCase());
        return `<li><strong>${escapeHtml(n.name)}</strong>${tags.length ? ` <span class="meta">(${escapeHtml(tags.join(', '))})</span>` : ''}</li>`;
      }).join('') || '<li class="meta">No alternative names recorded.</li>';

      const parentsHtml = parents.map((p) => `<li><a href="/gazetteer/place/${p.parent_id}">${escapeHtml(p.name || '(unnamed)')}</a> <span class="meta">${escapeHtml(p.kind || '')}</span></li>`).join('') || '<li class="meta">No parents</li>';
      const childrenHtml = children.map((c) => `<li><a href="/gazetteer/place/${c.child_id}">${escapeHtml(c.name || '(unnamed)')}</a> <span class="meta">${escapeHtml(c.kind || '')}</span></li>`).join('') || '<li class="meta">No children</li>';

  const externalHtml = externalIds.map((row) => `<li>${escapeHtml(row.source || 'source')}: <span class="meta">${escapeHtml(row.ext_id || '')}</span></li>`).join('') || '<li class="meta">No external ids</li>';

      const articlesHtml = articles.map((a) => `<li><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.title || a.url)}</a>${a.date ? ` <span class="meta">${escapeHtml(a.date)}</span>` : ''}</li>`).join('') || '<li class="meta">No recent mentions</li>';

      const hubsHtml = hubs.map((hub) => `<li><a href="${escapeHtml(hub.url)}" target="_blank" rel="noopener">${escapeHtml(hub.url)}</a>${hub.topic_label ? ` <span class="meta">${escapeHtml(hub.topic_label)}</span>` : ''}</li>`).join('') || '<li class="meta">No hubs</li>';

      const html = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)} — Gazetteer</title>
<style>
  :root{--fg:#0f172a;--muted:#64748b;--border:#e5e7eb;--bg:#ffffff;--bg-soft:#f8fafc}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:var(--bg);color:var(--fg)}
  .container{max-width:960px;margin:18px auto;padding:0 16px}
  header{display:flex;align-items:baseline;justify-content:space-between;margin:6px 0 12px}
  header h1{margin:0;font-size:24px}
  header nav a{color:var(--muted);text-decoration:none;margin-left:10px}
  header nav a:hover{color:var(--fg);text-decoration:underline}
  .meta{color:var(--muted);font-size:13px}
  .card{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px}
  h2{margin:0 0 8px;font-size:18px}
  ul{margin:6px 0 0 18px}
  li{margin:2px 0;font-size:14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width: 860px){ .grid{grid-template-columns:1fr} }
  .section{margin-top:12px}
  .badge{display:inline-block;padding:2px 8px;border:1px solid var(--border);border-radius:999px;background:#fff;margin-left:6px;font-size:12px;color:#334155}
</style>
</head><body>
  <div class="container">
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${renderNav('gazetteer')}
    </header>
    <section class="card">
  <div><span class="meta">Kind:</span> <strong>${escapeHtml(place.kind || '')}</strong></div>
  <div><span class="meta">Country:</span> <strong>${escapeHtml(place.country_code || '')}</strong>${place.adm1_code ? ` <span class="meta">· ADM1 ${escapeHtml(place.adm1_code)}</span>` : ''}</div>
  <div><span class="meta">Population:</span> <strong>${formatNumber(place.population)}</strong></div>
  <div>Storage: ${formatBytes(sizeBytes)} <span class="meta">(${escapeHtml(sizeMethod)})</span></div>
      <div class="meta" style="margin-top:6px"><a href="/gazetteer">Summary</a> · <a href="/gazetteer/places">All places</a></div>
    </section>

    <section class="card section">
      <h2>Names</h2>
      <ul>${namesHtml}</ul>
    </section>

    <section class="card section">
      <h2>Hierarchy</h2>
      <div class="grid">
        <div>
          <h3 class="meta">Parents</h3>
          <ul>${parentsHtml}</ul>
        </div>
        <div>
          <h3 class="meta">Children</h3>
          <ul>${childrenHtml}</ul>
        </div>
      </div>
    </section>

    <section class="card section">
      <h2>External IDs</h2>
      <ul>${externalHtml}</ul>
    </section>

    <section class="card section">
      <h2>Recent articles</h2>
      <ul>${articlesHtml}</ul>
    </section>

    <section class="card section">
      <h2>Hubs</h2>
      <ul>${hubsHtml}</ul>
    </section>
  </div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      endTrace();
    } catch (err) {
      try { if (db) db.close(); } catch (_) { /* noop */ }
      endTrace();
      const msg = err && err.message ? err.message : String(err);
      res.status(500).type('html').send(errorPage({ status: 500, message: msg }, context));
    }
  });

  return router;
}

module.exports = {
  createGazetteerPlaceRouter
};
