'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../src/db/openNewsCrawlerDb');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function ingestV2Batch(db, batch) {
  return getDbApi('ingestRemoteCrawlV2Batch')(db, batch);
}

module.exports = { ingestV2Batch };
