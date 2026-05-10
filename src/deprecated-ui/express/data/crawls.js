const crawlQueries = require('../../../data/db/sqlite/v1/queries/ui/crawls");

module.exports = {
  listRecentCrawls: (db, options) => crawlQueries.listRecentCrawls(db, options),
  listCompletedCrawls: (db, options) => crawlQueries.listCompletedCrawls(db, options)
};
