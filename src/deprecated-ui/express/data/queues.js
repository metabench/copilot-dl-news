const queueQueries = require('../../../data/db/sqlite/v1/queries/ui/queues");

module.exports = {
  listIncompleteCrawlJobs: (db, options) => queueQueries.listIncompleteCrawlJobs(db, options),
  listQueues: (db, options) => queueQueries.listQueues(db, options),
  getLatestQueueId: (db) => queueQueries.getLatestQueueId(db),
  getQueueDetail: (db, options) => queueQueries.getQueueDetail(db, options),
  clearIncompleteCrawlJobs: (db) => queueQueries.clearIncompleteCrawlJobs(db)
};
