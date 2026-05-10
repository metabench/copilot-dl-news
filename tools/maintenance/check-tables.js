const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
	const db = openNewsCrawlerDb('./data/news.db', { readonly: true });
	try {
		console.log('Tables:', await db.maintenance.listTables());
	} finally {
		await db.close();
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});