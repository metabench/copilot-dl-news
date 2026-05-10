'use strict';

const path = require('path');

function resolveNewsCrawlerDbModule() {
  const candidates = [
    'news-crawler-db',
    path.resolve(__dirname, '..', '..', '..', 'news-crawler-db', 'dist', 'db')
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      if (err && err.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
    }
  }

  throw new Error('Unable to resolve news-crawler-db. Run npm install and build ../news-crawler-db.');
}

function openNewsCrawlerDb(dbPath, options = {}) {
  const { createDbAdapter } = resolveNewsCrawlerDbModule();
  if (typeof createDbAdapter !== 'function') {
    throw new Error('news-crawler-db does not export createDbAdapter');
  }

  return createDbAdapter({
    type: 'sqlite',
    path: dbPath,
    readonly: options.readonly || false,
    fileMustExist: options.fileMustExist || false,
    timeout: options.timeout
  });
}

module.exports = {
  openNewsCrawlerDb,
  resolveNewsCrawlerDbModule
};