const db = require('better-sqlite3')('data/news.db');
console.log('--- place_hubs ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='place_hubs'").get()?.sql);
console.log('--- place_hub_candidates ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='place_hub_candidates'").get()?.sql);
