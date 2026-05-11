'use strict';

const { resolveNewsCrawlerDbModule } = require('../../db/openNewsCrawlerDb');

function getDatabaseExporterModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.DatabaseExporter !== 'function') {
    throw new Error('news-crawler-db does not export DatabaseExporter. Build ../news-crawler-db first.');
  }
  return dbModule;
}

class DatabaseExporter extends getDatabaseExporterModule().DatabaseExporter {}

async function runExportCLI() {
  const { runDatabaseExportCli } = getDatabaseExporterModule();
  if (typeof runDatabaseExportCli !== 'function') {
    throw new Error('news-crawler-db does not export runDatabaseExportCli. Build ../news-crawler-db first.');
  }
  await runDatabaseExportCli(process.argv.slice(2), process.env);
}

if (require.main === module) {
  runExportCLI().catch((err) => {
    console.error('Export failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  DatabaseExporter,
  runExportCLI
};
