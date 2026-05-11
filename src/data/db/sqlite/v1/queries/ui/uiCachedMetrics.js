'use strict';

const {
  resolveUiCachedMetricsDbHandle,
  ensureUiCachedMetricsTable,
  selectMetricRow,
  upsertCachedMetricRow
} = require('news-crawler-db');

module.exports = {
  resolveDbHandle: resolveUiCachedMetricsDbHandle,
  ensureUiCachedMetricsTable,
  selectMetricRow,
  upsertCachedMetricRow
};
