const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const db = openNewsCrawlerDb('data/news.db');
  const { resetSqlitePlaceHubCandidatesSchema } = resolveNewsCrawlerDbModule();

  try {
    console.log('Resetting place_hub_candidates schema...');
    const report = resetSqlitePlaceHubCandidatesSchema(db);
    console.log(`Table ready: ${report.tableName}`);
    report.indexes.forEach(indexName => console.log(`Index ready: ${indexName}`));
    console.log('Schema migration complete.');
  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exitCode = 1;
});
