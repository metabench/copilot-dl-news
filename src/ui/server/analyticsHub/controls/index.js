'use strict';

/**
 * Controls index for Analytics Hub
 */

const { TrendChart, formatDate, formatNumber } = require('./TrendChart');
const { DomainLeaderboard, formatRelativeDate } = require('./DomainLeaderboard');
const { ActivityHeatmap, getHeatColor, DAY_NAMES } = require('./ActivityHeatmap');
const { PeriodSelector, DEFAULT_PERIODS } = require('./PeriodSelector');
const { SummaryCard } = require('./SummaryCard');
const { DownloadHistoryChart, getDailyDownloads, DOWNLOAD_HISTORY_CHART_CSS } = require('./DownloadHistoryChart');

module.exports = {
  TrendChart,
  DomainLeaderboard,
  ActivityHeatmap,
  PeriodSelector,
  SummaryCard,
  DownloadHistoryChart,
  // Utilities
  formatDate,
  formatNumber,
  formatRelativeDate,
  getHeatColor,
  getDailyDownloads,
  DAY_NAMES,
  DEFAULT_PERIODS,
  DOWNLOAD_HISTORY_CHART_CSS
};
