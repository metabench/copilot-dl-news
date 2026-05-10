
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
async function main() {
	const db = openNewsCrawlerDb('data/news.db', { readonly: true });
	try {
		const schema = await db.maintenance.getTableInfo('urls');
		console.log(schema.map(c => c.name).join(', '));
	} finally {
		await db.close();
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
