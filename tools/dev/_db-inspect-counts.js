'use strict';

const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main() {
  const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshot = db.databaseIntrospection.getDownloadRelatedTableInspectionSnapshot();

    console.log('TABLES:', snapshot.tables.join(', '));
    console.log('COUNTS:', JSON.stringify(snapshot.counts, null, 2));

    for (const entry of snapshot.recentByTable) {
      if (entry.dateColumn) {
        console.log(`\n${entry.table} (using ${entry.dateColumn}) - last 7 days with data:`, entry.rows);
      } else {
        console.log(`\n${entry.table} - no obvious date column. Cols:`, entry.columns.join(','));
      }
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
