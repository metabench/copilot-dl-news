const Database = require('better-sqlite3');
const db = new Database('data/news.db');
try {
    const s1 = db.prepare("PRAGMA table_info(news_websites)").all();
    console.log('news_websites:', s1.map(c => c.name).join(', '));
} catch (e) { console.error(e); }
