const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getDbModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (!dbModule || typeof dbModule.getContentCompressionDiagnosticReport !== 'function') {
    throw new Error('news-crawler-db diagnostic report helpers are unavailable. Rebuild news-crawler-db.');
  }
  return dbModule;
}

function checkCompressionStats() {
  const db = openNewsCrawlerDb('./data/news.db', { readonly: true, fileMustExist: true });

  try {
    const { algorithms, storage } = getDbModule().getContentCompressionDiagnosticReport(db);

    console.log('Compression statistics:');
    algorithms.forEach(s => {
      console.log(`${s.algorithm}_${s.level}: ${s.count} articles`);
    });

    console.log(`Total articles: ${storage.totalArticles}`);

    console.log(`Average uncompressed size: ${((storage.avgUncompressed || 0) / 1024).toFixed(1)} KB`);
    console.log(`Average compressed size: ${((storage.avgCompressed || 0) / 1024).toFixed(1)} KB`);
    console.log(`Average compression ratio: ${storage.avgRatio?.toFixed(3) || 'N/A'}`);

  } finally {
    db.close();
  }
}

checkCompressionStats();
