'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../db/openNewsCrawlerDb');

const { DataValidator } = resolveNewsCrawlerDbModule();

if (typeof DataValidator !== 'function') {
  throw new Error('news-crawler-db does not export DataValidator. Build ../news-crawler-db first.');
}

module.exports = { DataValidator };
