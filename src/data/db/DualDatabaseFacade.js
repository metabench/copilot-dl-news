'use strict';

/**
 * Compatibility re-export for the side-by-side database facade.
 *
 * SQLite/Postgres adapter construction, table export, batching, and insert SQL
 * live in news-crawler-db.
 */

const { resolveNewsCrawlerDbModule } = require('../../db/openNewsCrawlerDb');

const {
  DualDatabaseFacade,
  createDualDatabase,
  loadConfigFromEnv,
  MODES
} = resolveNewsCrawlerDbModule();

if (typeof DualDatabaseFacade !== 'function') {
  throw new Error('news-crawler-db does not export DualDatabaseFacade. Build ../news-crawler-db first.');
}

module.exports = {
  DualDatabaseFacade,
  createDualDatabase,
  loadConfigFromEnv,
  MODES
};
