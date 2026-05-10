'use strict';

const {
  listIncompleteCrawlJobs,
  clearIncompleteCrawlJobs,
  listQueues,
  getLatestQueueId,
  getQueueJob,
  getQueueEventBounds,
  getQueueNeighbors,
  fetchQueueEvents,
  getQueueDetail
} = require('news-crawler-db');

module.exports = {
  listIncompleteCrawlJobs,
  clearIncompleteCrawlJobs,
  listQueues,
  getLatestQueueId,
  getQueueJob,
  getQueueEventBounds,
  getQueueNeighbors,
  fetchQueueEvents,
  getQueueDetail
};
