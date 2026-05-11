const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });

  try {
    if (!db.maintenance?.getContentStorageSchemaSnapshot) {
      throw new Error('news-crawler-db maintenance access is missing getContentStorageSchemaSnapshot');
    }

    const snapshot = await db.maintenance.getContentStorageSchemaSnapshot({ duplicateLimit: 5 });

    console.log('=== Content Storage Schema ===');
    console.log(snapshot.schema);

    console.log('\n=== Content Storage Indexes ===');
    console.log(snapshot.indexes);

    console.log('\n=== Foreign Keys ===');
    console.log(snapshot.foreignKeys);

    console.log('\n=== Sample duplicate content_storage records ===');
    console.log(snapshot.duplicateRows);
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
