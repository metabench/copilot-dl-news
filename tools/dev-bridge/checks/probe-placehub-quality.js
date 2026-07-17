'use strict';
// Read-only: quantify place-hub recognition/categorization quality in news.db.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });
const q = (label, sql) => {
  try { console.log(label, JSON.stringify(db.prepare(sql).all())); }
  catch (e) { console.log(label, 'ERR', e.message); }
};
q('hubs.byKind:', "SELECT place_kind, COUNT(*) n FROM place_hubs GROUP BY place_kind ORDER BY n DESC");
q('hubs.byHost:', "SELECT host, COUNT(*) n FROM place_hubs GROUP BY host ORDER BY n DESC LIMIT 12");
q('cand.status:', "SELECT status, validation_status, COUNT(*) n FROM place_hub_candidates GROUP BY 1,2");
q('mappings.status:', "SELECT status, page_kind, COUNT(*) n FROM place_page_mappings GROUP BY 1,2 ORDER BY n DESC LIMIT 10");
q('hub_validations:', "SELECT COUNT(*) n FROM hub_validations");
q('site_url_patterns:', "SELECT host, pattern_type, COUNT(*) n FROM site_url_patterns GROUP BY 1,2 LIMIT 12");
q('phup.exists:', "SELECT name FROM sqlite_master WHERE name='place_hub_url_patterns'");
q('phup.rows:', "SELECT domain, pattern_type, place_kind, sample_count, accuracy FROM place_hub_url_patterns ORDER BY accuracy DESC LIMIT 12");
q('unknown.top:', "SELECT term_slug, SUM(occurrences) o FROM place_hub_unknown_terms GROUP BY term_slug ORDER BY o DESC LIMIT 15");
q('apr.count:', "SELECT COUNT(*) n, COUNT(DISTINCT place_id) places FROM article_place_relations");
q('determ:', "SELECT determination, COUNT(*) n FROM place_hub_determinations GROUP BY 1");
q('hubs.stale:', "SELECT COUNT(*) n FROM place_hubs WHERE last_seen_at < '2026-01-01'");
db.close();
const fs = require('fs');
const dsplDir = path.join(REPO_ROOT, 'data', 'dspls');
console.log('dspl files:', fs.existsSync(dsplDir) ? fs.readdirSync(dsplDir).slice(0, 20).join(', ') : '(none)');
