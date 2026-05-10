'use strict';

function pruneExportedPayload(db, options = {}) {
  if (!db.remoteCrawler) {
    throw new Error('news-crawler-db remoteCrawler access is not available');
  }
  return db.remoteCrawler.pruneRemoteCrawlerExportedPayload(options);
}

module.exports = { pruneExportedPayload };
