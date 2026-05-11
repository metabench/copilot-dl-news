
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const db = openNewsCrawlerDb('data/db.sqlite');
  const { fixArticlePlaceRelationsForeignKey } = resolveNewsCrawlerDbModule();

  try {
    console.log('Fixing foreign key constraint...');
    const report = fixArticlePlaceRelationsForeignKey(db);

    console.log('Foreign key fixed successfully');
    console.log(`Rows before: ${report.beforeCount}`);
    console.log(`Rows after: ${report.afterCount}`);
    console.log(`Rows copied: ${report.copiedRows}`);
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
