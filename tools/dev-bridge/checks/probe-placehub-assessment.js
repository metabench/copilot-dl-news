'use strict';
// READ-ONLY assessment probe: place-hub detection/storage/indexing/search.
// Opens news.db read-only (safe beside the live app in WAL mode).
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const DB = path.join(REPO_ROOT, 'data', 'news.db');
const db = new Database(DB, { readonly: true });
const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return [{ ERROR: e.message.slice(0, 120) }]; } };
const one = (sql, ...a) => { try { return db.prepare(sql).get(...a); } catch (e) { return { ERROR: e.message.slice(0, 120) }; } };

console.log('— place_hubs —');
console.log('total:', JSON.stringify(one('SELECT COUNT(*) n FROM place_hubs')));
console.log('by kind:', JSON.stringify(q("SELECT COALESCE(place_kind,'(null)') k, COUNT(*) n FROM place_hubs GROUP BY place_kind ORDER BY n DESC")));
console.log('by host:', JSON.stringify(q('SELECT host, COUNT(*) n FROM place_hubs GROUP BY host ORDER BY n DESC LIMIT 8')));
console.log('null place_slug:', JSON.stringify(one('SELECT COUNT(*) n FROM place_hubs WHERE place_slug IS NULL')));
console.log('topic rows (topic_slug set):', JSON.stringify(one('SELECT COUNT(*) n FROM place_hubs WHERE topic_slug IS NOT NULL')));
console.log('slug->gazetteer join misses:', JSON.stringify(one(`
  SELECT COUNT(*) n FROM place_hubs ph WHERE ph.place_slug IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM place_names pn WHERE pn.normalized = REPLACE(ph.place_slug,'-',' ') OR pn.normalized = ph.place_slug)`)));

console.log('— places (gazetteer) —');
console.log('by kind:', JSON.stringify(q('SELECT kind, COUNT(*) n FROM places GROUP BY kind ORDER BY n DESC')));

console.log('— validation / patterns / review surfaces —');
console.log('hub_validations:', JSON.stringify(one('SELECT COUNT(*) n, MAX(validated_at) latest FROM hub_validations')));
console.log('validation methods:', JSON.stringify(q('SELECT validation_method m, COUNT(*) n FROM hub_validations GROUP BY m')));
console.log('place_hub_url_patterns:', JSON.stringify(q('SELECT scope_domain, COUNT(*) n, ROUND(AVG(accuracy),2) acc FROM place_hub_url_patterns GROUP BY scope_domain ORDER BY n DESC LIMIT 8')));
console.log('place_hub_candidates:', JSON.stringify(q('SELECT verdict, COUNT(*) n FROM place_hub_candidates GROUP BY verdict')));
console.log('unknown_terms open:', JSON.stringify(one('SELECT COUNT(*) n FROM place_hub_unknown_terms WHERE resolution IS NULL')));
console.log('place_page_mappings:', JSON.stringify(one('SELECT COUNT(*) n FROM place_page_mappings')));
console.log('audit rows:', JSON.stringify(one('SELECT COUNT(*) n FROM place_hub_audit')));

console.log('— indexes on place_hubs —');
console.log(JSON.stringify(q("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='place_hubs'")));

console.log('— search sanity: andorra —');
console.log('hubs for andorra:', JSON.stringify(q("SELECT host, place_slug, place_kind FROM place_hubs WHERE place_slug LIKE '%andorra%' LIMIT 5")));
db.close();
console.log('PROBE DONE (read-only)');
