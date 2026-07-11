'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../../../db/openNewsCrawlerDb');

function getMigrationModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  const required = [
    'SQLITE_PLACE_HUBS_HOST_DEDUPE_MIGRATION_VERSION',
    'SQLITE_PLACE_HUBS_HOST_DEDUPE_MIGRATION_NAME',
    'runSqlitePlaceHubsHostDedupeMigrationUp',
    'runSqlitePlaceHubsHostDedupeMigrationDown',
    'isSqlitePlaceHubsHostDedupeMigrationApplied'
  ];
  for (const key of required) {
    if (!(key in dbModule)) {
      throw new Error(`news-crawler-db does not export ${key}. Build ../news-crawler-db first.`);
    }
  }
  return dbModule;
}

function up(db) {
  return getMigrationModule().runSqlitePlaceHubsHostDedupeMigrationUp(db);
}

function down(db) {
  return getMigrationModule().runSqlitePlaceHubsHostDedupeMigrationDown(db);
}

function isApplied(db) {
  return getMigrationModule().isSqlitePlaceHubsHostDedupeMigrationApplied(db);
}

module.exports = {
  MIGRATION_VERSION: getMigrationModule().SQLITE_PLACE_HUBS_HOST_DEDUPE_MIGRATION_VERSION,
  MIGRATION_NAME: getMigrationModule().SQLITE_PLACE_HUBS_HOST_DEDUPE_MIGRATION_NAME,
  up,
  down,
  isApplied
};
