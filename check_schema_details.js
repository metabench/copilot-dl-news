const Database = require('better-sqlite3');
const db = new Database('data/news.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

tables.forEach(t => {
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${t.name}'`).get();
    console.log('---------------------------------------------------');
    console.log(schema.sql);
});
