'use strict';

// DEPRECATED SHIM — the analysisRuns service now lives in news-crawler-db
// (coordination-point migration, 2026-07-17). This file only re-exports for
// the remaining deprecated-ui internal consumers (api.analysis.js,
// ssr.analysis.js, AnalysisRunManager.js) and dies with the deprecated-ui
// tree. Do NOT import this from live code — require('news-crawler-db').
const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  listAnalysisRuns,
  getAnalysisRun
} = require('news-crawler-db');

module.exports = {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  listAnalysisRuns,
  getAnalysisRun
};
