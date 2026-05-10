'use strict';

const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  getAnalysisRunById,
  getAnalysisRunEvents,
  getLatestAnalysisRunVersion
} = require('news-crawler-db');

module.exports = {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  getAnalysisRunById,
  getAnalysisRunEvents,
  getLatestAnalysisRunVersion
};
