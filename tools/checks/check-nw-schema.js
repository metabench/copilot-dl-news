
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
async function main() {
    const db = openNewsCrawlerDb('data/news.db', { readonly: true });
    try {
        const schema = await db.maintenance.getTableInfo('news_websites');
        console.log('news_websites:', schema.map(c => c.name).join(', '));
    } finally {
        await db.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
