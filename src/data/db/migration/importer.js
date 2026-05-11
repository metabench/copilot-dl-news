'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../db/openNewsCrawlerDb');

const { DatabaseImporter } = resolveNewsCrawlerDbModule();

if (typeof DatabaseImporter !== 'function') {
  throw new Error('news-crawler-db does not export DatabaseImporter. Build ../news-crawler-db first.');
}

module.exports = { DatabaseImporter };
