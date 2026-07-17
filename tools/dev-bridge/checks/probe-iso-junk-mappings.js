'use strict';
// READ-ONLY (A4 scoping): find place_page_mappings whose URL tail is a bare
// 2-letter token — the ISO-code junk pattern (…/topic/ad ↦ Andorra). Join to
// places to show what they claim to be, with status + hub linkage.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });

const rows = db.prepare(`
  SELECT m.id, m.place_id, m.host, m.url, m.page_kind, m.status, m.verified_at,
         p.country_code, p.kind AS place_kind_gaz,
         (SELECT pn.name FROM place_names pn WHERE pn.id = p.canonical_name_id) AS place_name
  FROM place_page_mappings m
  JOIN places p ON p.id = m.place_id
  WHERE m.url GLOB '*/[a-z][a-z]'
     OR m.url GLOB '*/[a-z][a-z]/'
  ORDER BY m.host, m.url
`).all();

console.log(`bare 2-letter-tail mappings: ${rows.length}`);
for (const r of rows) {
  const tail = r.url.replace(/\/$/, '').split('/').pop();
  const isoMatch = r.country_code && tail.toUpperCase() === r.country_code ? 'ISO-MATCH' : 'other';
  console.log(`  [${r.id}] ${r.host} ${r.url} → ${r.place_name || '?'} (${r.country_code || '-'}) ${r.page_kind}/${r.status}${r.verified_at ? ' VERIFIED' : ''} ${isoMatch}`);
}

console.log('audit rows now:', db.prepare('SELECT COUNT(*) n FROM place_hub_audit').get().n);
db.close();
console.log('PROBE DONE');
