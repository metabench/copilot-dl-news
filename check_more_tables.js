const Database = require('better-sqlite3');
const db = new Database('data/news.db');

const targetTables = ['aliases', 'place_names', 'languages', 'transliterations', 'normalization_rules'];

targetTables.forEach(t => {
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t}'`).get();
    if (schema) {
        console.log(`--- ${t} ---`);
        console.log(schema.sql);
    } else {
        console.log(`--- ${t} NOT FOUND ---`);
    }
});
