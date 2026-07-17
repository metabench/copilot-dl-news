'use strict';
// Print column lists for places/place_names in news.db and the archived gazetteer.db.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const show = (label, file) => {
  try {
    const db = new Database(file, { readonly: true, timeout: 5000 });
    for (const t of ['places', 'place_names']) {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
      console.log(`[${label}] ${t}: ${cols.join(', ')}`);
    }
    db.close();
  } catch (e) { console.log(`[${label}] ERR ${e.message}`); }
};
show('news.db', path.join(REPO_ROOT, 'data', 'news.db'));
show('archived-gazetteer', path.join(REPO_ROOT, 'data', 'backups', 'stale-dbs-2026-07-16', 'gazetteer.db'));
