const Database = require('better-sqlite3');
const db = new Database('data/news.db');

const targetTables = ['places', 'place_hierarchy', 'article_place_relations', 'admin_areas', 'admin_parents', 'place_parents'];

targetTables.forEach(t => {
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`).get();
    if (schema) {
        console.log(`--- ${t} ---`);
        console.log(schema.sql);
    } else {
        console.log(`--- ${t} NOT FOUND ---`);
    }
});
