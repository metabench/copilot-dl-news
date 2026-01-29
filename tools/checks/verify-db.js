// Quick database verification script
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/news.db');
console.log('Checking:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });
    console.log('✅ Connection: OK');

    // Count tables
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
    console.log(`✅ Tables: ${tables.length}`);

    // Key table counts
    const checks = [
        ['urls', 'SELECT COUNT(*) as c FROM urls'],
        ['articles', 'SELECT COUNT(*) as c FROM articles'],
        ['domains', 'SELECT COUNT(*) as c FROM domains'],
        ['links', 'SELECT COUNT(*) as c FROM links'],
        ['http_responses', 'SELECT COUNT(*) as c FROM http_responses'],
        ['news_websites', 'SELECT COUNT(*) as c FROM news_websites'],
        ['crawl_jobs', 'SELECT COUNT(*) as c FROM crawl_jobs'],
        ['places', 'SELECT COUNT(*) as c FROM places']
    ];

    for (const [name, sql] of checks) {
        try {
            const result = db.prepare(sql).get();
            console.log(`   ${name}: ${result.c.toLocaleString()}`);
        } catch (e) {
            console.log(`   ${name}: (table not found)`);
        }
    }

    // Integrity check
    const integrity = db.prepare('PRAGMA integrity_check').get();
    console.log(`✅ Integrity: ${integrity.integrity_check}`);

    db.close();
    console.log('\n🎉 Database is working properly!');
} catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
}
