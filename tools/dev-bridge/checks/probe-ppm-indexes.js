'use strict';
// READ-ONLY: post-crash state check — did dedupe commit? + real unique
// indexes on place_page_mappings (live DB has one drizzle doesn't declare).
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
const q = (sql, ...a) => db.prepare(sql).all(...a);

console.log('place_hubs total:', db.prepare('SELECT COUNT(*) n FROM place_hubs').get().n);
console.log('remaining dup groups:', db.prepare(`
  SELECT COUNT(*) n FROM (SELECT 1 FROM place_hubs WHERE place_slug IS NOT NULL
  GROUP BY host, place_slug, place_kind HAVING COUNT(*) > 1)`).get().n);
console.log('page_kind vocab:', JSON.stringify(q('SELECT page_kind, COUNT(*) n FROM place_page_mappings GROUP BY page_kind ORDER BY n DESC')));
console.log('ppm indexes:');
for (const ix of q("PRAGMA index_list('place_page_mappings')")) {
  const cols = q(`PRAGMA index_info('${ix.name}')`).map(c => c.name).join(',');
  console.log(` ${ix.name} unique=${ix.unique} → (${cols})`);
}
// Collision preview: bare rows whose suffixed twin already exists under the
// unique key — these must be MERGED (delete bare) not renamed.
console.log('bare rows w/ suffixed twin (collisions):', JSON.stringify(q(`
  SELECT COUNT(*) n FROM place_page_mappings b
  WHERE b.page_kind IN ('country','region','city','subcontinent')
    AND EXISTS (SELECT 1 FROM place_page_mappings s
      WHERE s.place_id = b.place_id AND s.host = b.host AND s.page_kind = b.page_kind || '-hub')`)));
db.close();
console.log('PROBE DONE');
