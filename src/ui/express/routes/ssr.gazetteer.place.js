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

function formatNumber(value) {
  if (value == null) return '';
  try {
    return Number(value).toLocaleString();
  } catch (_) {
    return String(value);
  }
}

function formatBytes(value) {
  if (value == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = Number(value) || 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return (index === 0 ? String(current | 0) : current.toFixed(1)) + ' ' + units[index];
}

function safeTracePre(trace, name) {
  if (!trace || typeof trace.pre !== 'function') return () => {};
  try {
    return trace.pre(name) || (() => {});
  } catch (_) {
    return () => {};
  }
}

function createSizeCalculator(db) {
  const dbstatStmt = db.prepare(`WITH
    t_places(rowid) AS (SELECT id FROM places WHERE id = ?),
    t_names(rowid) AS (SELECT rowid FROM place_names WHERE place_id = ?),
    t_ext(rowid) AS (SELECT rowid FROM place_external_ids WHERE place_id = ?),
    t_hier(rowid) AS (SELECT rowid FROM place_hierarchy WHERE parent_id = ? OR child_id = ?),
    idx_places AS (SELECT name FROM pragma_index_list('places')),
    idx_names AS (SELECT name FROM pragma_index_list('place_names')),
    idx_ext AS (SELECT name FROM pragma_index_list('place_external_ids')),
    idx_hier AS (SELECT name FROM pragma_index_list('place_hierarchy'))
  SELECT (
    COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='places' AND rowid IN (SELECT rowid FROM t_places)) OR (name IN (SELECT name FROM idx_places) AND rowid IN (SELECT rowid FROM t_places))),0)
    + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_names' AND rowid IN (SELECT rowid FROM t_names)) OR (name IN (SELECT name FROM idx_names) AND rowid IN (SELECT rowid FROM t_names))),0)
    + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_external_ids' AND rowid IN (SELECT rowid FROM t_ext)) OR (name IN (SELECT name FROM idx_ext) AND rowid IN (SELECT rowid FROM t_ext))),0)
    + COALESCE((SELECT SUM(payload) FROM dbstat WHERE (name='place_hierarchy' AND rowid IN (SELECT rowid FROM t_hier)) OR (name IN (SELECT name FROM idx_hier) AND rowid IN (SELECT rowid FROM t_hier))),0)
  ) AS bytes`);
  const fallbackA = db.prepare(`SELECT COALESCE(LENGTH(kind),0)+COALESCE(LENGTH(country_code),0)+COALESCE(LENGTH(adm1_code),0)+COALESCE(LENGTH(adm2_code),0)+COALESCE(LENGTH(timezone),0)+COALESCE(LENGTH(bbox),0)+COALESCE(LENGTH(source),0)+COALESCE(LENGTH(extra),0) AS total FROM places WHERE id=?`);
  const fallbackB = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(name),0)+COALESCE(LENGTH(normalized),0)+COALESCE(LENGTH(lang),0)+COALESCE(LENGTH(script),0)+COALESCE(LENGTH(name_kind),0)+COALESCE(LENGTH(source),0)),0) AS total FROM place_names WHERE place_id=?`);
  const fallbackC = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(source),0)+COALESCE(LENGTH(ext_id),0)),0) AS total FROM place_external_ids WHERE place_id=?`);
  const fallbackD = db.prepare(`SELECT COALESCE(SUM(COALESCE(LENGTH(relation),0)),0) AS total FROM place_hierarchy WHERE parent_id=? OR child_id=?`);

  return (id) => {
    try {
      const row = dbstatStmt.get(id, id, id, id, id);
      if (row && typeof row.bytes === 'number') {
        return { size: row.bytes | 0, method: 'dbstat' };
      }
    } catch (_) {
      // ignore, fall back below
    }
    try {
      const a = fallbackA.get(id)?.total || 0;
      const b = fallbackB.get(id)?.total || 0;
      const c = fallbackC.get(id)?.total || 0;
      const d = fallbackD.get(id, id)?.total || 0;
      return { size: (a + b + c + d) | 0, method: 'approx' };
    } catch (_) {
      return { size: 0, method: 'approx' };
    }
  };
}

function createGazetteerPlaceRouter(options = {}) {
  const { urlsDbPath, startTrace } = options;
  if (!urlsDbPath) throw new Error('createGazetteerPlaceRouter requires urlsDbPath');
  if (typeof startTrace !== 'function') throw new Error('createGazetteerPlaceRouter requires startTrace(req, tag)');

  const router = express.Router();

  router.get('/gazetteer/place/:id', (req, res) => {
    const trace = startTrace(req, 'gazetteer');
    const endTrace = () => {
      try { trace.end(); } catch (_) { /* noop */ }
    };

    const id = parseInt(req.params.id, 10);
    if (!id) {
      endTrace();
      res.status(400).send('<!doctype html><title>Bad id</title><body><p>Invalid place id</p></body></html>');
      return;
    }

    let openDbReadOnly;
    try {
      ({ openDbReadOnly } = require('../../../ensure_db'));
    } catch (err) {
      endTrace();
      res.status(503).send('<!doctype html><title>Gazetteer</title><body><h1>Gazetteer</h1><p>Database unavailable.</p></body></html>');
      return;
    }

    let db;
    try {
      const doneOpen = safeTracePre(trace, 'db-open');
      db = openDbReadOnly(urlsDbPath);
      doneOpen();

      const donePlace = safeTracePre(trace, 'get-place');
      const place = db.prepare('SELECT * FROM places WHERE id = ?').get(id);
      donePlace();
      if (!place) {
        db.close();
        endTrace();
        res.status(404).send('<!doctype html><title>Not found</title><body><p>Place not found</p></body></html>');
        return;
      }

      const doneNames = safeTracePre(trace, 'get-names');
      const names = db.prepare('SELECT * FROM place_names WHERE place_id = ? ORDER BY is_official DESC, is_preferred DESC, name').all(id);
      doneNames();

      const doneExt = safeTracePre(trace, 'get-ext');
      const external = db.prepare('SELECT * FROM place_external_ids WHERE place_id = ?').all(id);
      doneExt();

      const doneParents = safeTracePre(trace, 'parents');
      const parents = db.prepare(`
        SELECT ph.parent_id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM place_hierarchy ph
        JOIN places p ON p.id = ph.parent_id
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ph.child_id = ?
        ORDER BY ph.parent_id
      `).all(id);
      doneParents();

      const doneChildren = safeTracePre(trace, 'children');
      const children = db.prepare(`
        SELECT ph.child_id, p.kind, p.country_code, p.adm1_code,
               COALESCE(cn.name, pn.name) AS name
        FROM place_hierarchy ph
        JOIN places p ON p.id = ph.child_id
        LEFT JOIN place_names pn ON pn.place_id = p.id
        LEFT JOIN place_names cn ON cn.id = p.canonical_name_id
        WHERE ph.parent_id = ?
        ORDER BY ph.child_id
        LIMIT 200
      `).all(id);
      doneChildren();

      const doneArticles = safeTracePre(trace, 'articles');
      let articles = [];
      const canonicalName = place.canonical_name_id ? db.prepare('SELECT name FROM place_names WHERE id = ?').get(place.canonical_name_id)?.name : null;
      if (canonicalName) {
        articles = db.prepare(`
          SELECT a.url, a.title, a.date
          FROM article_places ap JOIN articles a ON a.url = ap.article_url
          WHERE ap.place = ?
          ORDER BY (a.date IS NULL) ASC, a.date DESC
          LIMIT 10
        `).all(canonicalName);
      }
      doneArticles();

      const doneHubs = safeTracePre(trace, 'hubs');
      let hubs = [];
      if (canonicalName) {
        const slug = canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (slug) {
          hubs = db.prepare('SELECT host, url, topic_slug, topic_label, last_seen_at FROM place_hubs WHERE place_slug = ? ORDER BY last_seen_at DESC LIMIT 10').all(slug);
        }
      }
      doneHubs();

      const sizeInfo = createSizeCalculator(db)(id);
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

      const externalHtml = external.map((row) => `<li>${escapeHtml(row.source || 'source')}: <span class="meta">${escapeHtml(row.ext_id || '')}</span></li>`).join('') || '<li class="meta">No external ids</li>';

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
  <div>Storage: ${formatBytes(sizeInfo.size)} <span class="meta">(${escapeHtml(sizeInfo.method)})</span></div>
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
      res.status(500).send(`<!doctype html><title>Error</title><pre>${escapeHtml(msg)}</pre>`);
    }
  });

  return router;
}

module.exports = {
  createGazetteerPlaceRouter
};
