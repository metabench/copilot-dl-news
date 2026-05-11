'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../db/openNewsCrawlerDb');

const { SchemaVersionManager } = resolveNewsCrawlerDbModule();

if (typeof SchemaVersionManager !== 'function') {
  throw new Error('news-crawler-db does not export SchemaVersionManager. Build ../news-crawler-db first.');
}

module.exports = { SchemaVersionManager };
