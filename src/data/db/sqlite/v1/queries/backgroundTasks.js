'use strict';

const {
  ensureBackgroundTaskSchema,
  createBackgroundTask,
  updateBackgroundTask,
  getBackgroundTaskById,
  normalizeBackgroundTaskRow
} = require('news-crawler-db');

module.exports = {
  ensureBackgroundTaskSchema,
  createBackgroundTask,
  updateBackgroundTask,
  getBackgroundTaskById,
  normalizeBackgroundTaskRow
};
