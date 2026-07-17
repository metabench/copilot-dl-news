'use strict';
// READ-ONLY: scope the place_hubs dedupe (A2). Duplicate groups, reference
// holders on place_hubs.id, and the pageKind vocabulary spread.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true });
const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return [{ ERR: e.message.slice(0, 100) }]; } };

console.log('— duplicate groups (host, place_slug, place_kind) —');
console.log(JSON.stringify(q(`
  SELECT host, place_slug, place_kind, COUNT(*) n, GROUP_CONCAT(id) ids
  FROM place_hubs WHERE place_slug IS NOT NULL
  GROUP BY host, place_slug, place_kind HAVING n > 1 ORDER BY n DESC LIMIT 20`), null, 1));

console.log('— null url_id rows —');
console.log(JSON.stringify(q('SELECT id, host, place_slug, place_kind FROM place_hubs WHERE url_id IS NULL LIMIT 10')));

console.log('— who references place_hubs.id? hub_validations columns —');
console.log(JSON.stringify(q("PRAGMA table_info(hub_validations)").map(c => c.name)));
console.log('hub_validations w/ place_hub_id set:', JSON.stringify(q('SELECT COUNT(*) n FROM hub_validations WHERE place_hub_id IS NOT NULL')));
console.log('validation refs to dup ids:', JSON.stringify(q(`
  SELECT hv.place_hub_id, COUNT(*) n FROM hub_validations hv WHERE hv.place_hub_id IN (
    SELECT id FROM place_hubs WHERE (host, place_slug, place_kind) IN (
      SELECT host, place_slug, place_kind FROM place_hubs WHERE place_slug IS NOT NULL
      GROUP BY host, place_slug, place_kind HAVING COUNT(*) > 1)) GROUP BY hv.place_hub_id`)));

console.log('— other tables with a place_hub_id column —');
const tables = q("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
for (const t of tables) {
  const cols = q(`PRAGMA table_info(${JSON.stringify(t).slice(1, -1)})`).map(c => c.name);
  if (cols.includes('place_hub_id') || cols.includes('hub_id')) console.log(t, '→', cols.filter(c => /hub_id/.test(c)).join(','));
}

console.log('— page_kind vocabulary in place_page_mappings —');
console.log(JSON.stringify(q('SELECT page_kind, COUNT(*) n FROM place_page_mappings GROUP BY page_kind ORDER BY n DESC')));
db.close();
console.log('PROBE DONE');
