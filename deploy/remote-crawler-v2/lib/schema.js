'use strict';

const SCHEMA_VERSION = 4;

function initSchema(db) {
  if (!db.remoteCrawler) {
    throw new Error('news-crawler-db remoteCrawler access is not available');
  }
  db.remoteCrawler.ensureRemoteCrawlerSchema(SCHEMA_VERSION);
}

function getSchemaVersion(db) {
  if (!db.remoteCrawler) {
    throw new Error('news-crawler-db remoteCrawler access is not available');
  }
  return db.remoteCrawler.getRemoteCrawlerSchemaVersion(SCHEMA_VERSION);
}

module.exports = {
  SCHEMA_VERSION,
  getSchemaVersion,
  initSchema,
};
