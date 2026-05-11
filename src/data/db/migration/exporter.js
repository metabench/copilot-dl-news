'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../db/openNewsCrawlerDb');

const { LegacyNdjsonDatabaseExporter } = resolveNewsCrawlerDbModule();

if (typeof LegacyNdjsonDatabaseExporter !== 'function') {
  throw new Error('news-crawler-db does not export LegacyNdjsonDatabaseExporter. Build ../news-crawler-db first.');
}

module.exports = {
  DatabaseExporter: LegacyNdjsonDatabaseExporter
};
