'use strict';
// READ-ONLY (A-quirks scoping): quebec mislabel, malformed mapping, bare
// 'hub' page_kind rows — the facts needed to fix-or-document each.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
const q = (sql, ...a) => db.prepare(sql).all(...a);

console.log('— quebec-like mislabels: place_hubs kind vs gazetteer kind —');
console.log(JSON.stringify(q(`
  SELECT ph.id, ph.host, ph.place_slug, ph.place_kind AS hub_kind, p.kind AS gaz_kind
  FROM place_hubs ph
  JOIN place_names pn ON pn.normalized IN (REPLACE(ph.place_slug,'-',' '), ph.place_slug)
  JOIN places p ON p.id = pn.place_id
  WHERE ph.place_kind IS NOT NULL AND p.kind != ph.place_kind
    AND p.kind != 'planet'
  GROUP BY ph.id ORDER BY ph.host, ph.place_slug LIMIT 25`), null, 1));

console.log('— malformed mapping URLs (plus-sign compound paths) —');
console.log(JSON.stringify(q(`
  SELECT id, place_id, host, url, page_kind, status FROM place_page_mappings
  WHERE url LIKE '%+%' LIMIT 10`)));

console.log('— bare hub page_kind rows —');
console.log(JSON.stringify(q(`
  SELECT m.id, m.host, m.url, m.status, p.kind AS gaz_kind
  FROM place_page_mappings m JOIN places p ON p.id = m.place_id
  WHERE m.page_kind = 'hub' ORDER BY m.host LIMIT 40`), null, 1));
db.close();
console.log('PROBE DONE');
