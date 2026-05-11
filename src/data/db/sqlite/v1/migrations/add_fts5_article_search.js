'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../../../db/openNewsCrawlerDb');

function getMigrationModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'SQLITE_FTS5_ARTICLE_SEARCH_MIGRATION_VERSION',
    'SQLITE_FTS5_ARTICLE_SEARCH_MIGRATION_NAME',
    'runSqliteFts5ArticleSearchMigrationUp',
    'runSqliteFts5ArticleSearchMigrationDown',
    'isSqliteFts5ArticleSearchMigrationApplied'
  ];
  for (const key of required) {
    if (!(key in dbModule)) {
      throw new Error(`news-crawler-db does not export ${key}. Build ../news-crawler-db first.`);
    }
  }
  return dbModule;
}

function up(db) {
  return getMigrationModule().runSqliteFts5ArticleSearchMigrationUp(db);
}

function down(db) {
  return getMigrationModule().runSqliteFts5ArticleSearchMigrationDown(db);
}

function isApplied(db) {
  return getMigrationModule().isSqliteFts5ArticleSearchMigrationApplied(db);
}

module.exports = {
  MIGRATION_VERSION: getMigrationModule().SQLITE_FTS5_ARTICLE_SEARCH_MIGRATION_VERSION,
  MIGRATION_NAME: getMigrationModule().SQLITE_FTS5_ARTICLE_SEARCH_MIGRATION_NAME,
  up,
  down,
  isApplied
};
