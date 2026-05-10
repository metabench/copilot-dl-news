const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
// Quick database verification script
const path = require('path');

const dbPath = path.join(__dirname, '../../data/news.db');
console.log('Checking:', dbPath);

async function main() {
    const db = openNewsCrawlerDb(dbPath, { readonly: true });
    console.log('Connection: OK');

    try {
        const tables = await db.maintenance.listTables();
        console.log(`Tables: ${tables.length}`);

        const checks = [
            'urls',
            'articles',
            'domains',
            'links',
            'http_responses',
            'news_websites',
            'crawl_jobs',
            'places'
        ];

        const counts = await db.maintenance.getTableCounts(checks);
        for (const result of counts) {
            const value = result.exists ? result.count.toLocaleString() : '(table not found)';
            console.log(`   ${result.table}: ${value}`);
        }

        const integrity = await db.maintenance.integrityCheck();
        console.log(`Integrity: ${integrity}`);

        console.log('\nDatabase is working properly.');
    } finally {
        await db.close();
    }
}

main().catch((err) => {
    console.error('Database check failed:', err.message);
    process.exit(1);
});
