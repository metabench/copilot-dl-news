'use strict';

const {
  DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS,
  createTimedDb,
  instrumentStatement,
  timedQuery
} = require('news-crawler-db');

module.exports = {
  timedQuery,
  instrumentStatement,
  createTimedDb,
  DEFAULT_THRESHOLD_MS: DEFAULT_QUERY_TIME_BUDGET_THRESHOLD_MS
};
