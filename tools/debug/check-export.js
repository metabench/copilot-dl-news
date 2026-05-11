'use strict';

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const { getPagesExportDatabaseInspectionSnapshot } = resolveNewsCrawlerDbModule();

function toMb(value) {
  if (value == null) return null;
  return (Number(value) / 1024 / 1024).toFixed(2);
}

async function main() {
  const dbPath = process.argv[2] || path.resolve(process.cwd(), 'full-export-brotli-24threads.db');
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });

  try {
    const snapshot = getPagesExportDatabaseInspectionSnapshot(db);

    console.log('=== SCHEMA ===');
    console.log('Tables:', snapshot.tables);

    console.log('\n=== ARTICLES TABLE STRUCTURE ===');
    console.log('Columns:', snapshot.articleColumns);

    console.log('\n=== SAMPLE ARTICLE ===');
    console.log('Sample:', snapshot.sampleArticle);

    console.log('\n=== TOTAL SIZES ===');
    const stats = snapshot.compressionSizeStats;
    console.log('Stats:', {
      count: stats.count,
      total_html_mb: toMb(stats.total_html),
      total_compressed_mb: toMb(stats.total_compressed),
      avg_ratio: stats.avg_ratio == null ? null : Number(stats.avg_ratio).toFixed(2)
    });
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
});
