'use strict';

const { resolveNewsCrawlerDbModule } = require('../../../../db/openNewsCrawlerDb');

function getDbModule() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (!dbModule || typeof dbModule.RateLimitAnalysisQueries !== 'function') {
    throw new Error('news-crawler-db rate limit analysis helpers are unavailable. Rebuild news-crawler-db.');
  }
  return dbModule;
}

class RateLimitAnalysisQueries extends getDbModule().RateLimitAnalysisQueries {}

module.exports = {
  RateLimitAnalysisQueries
};
