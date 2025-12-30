'use strict';

/**
 * Controls index for Analytics Hub
 */

const { TrendChart, formatDate, formatNumber } = require('./TrendChart');
const { DomainLeaderboard, formatRelativeDate } = require('./DomainLeaderboard');
const { ActivityHeatmap, getHeatColor, DAY_NAMES } = require('./ActivityHeatmap');
const { PeriodSelector, DEFAULT_PERIODS } = require('./PeriodSelector');
const { SummaryCard } = require('./SummaryCard');

module.exports = {
  TrendChart,
  DomainLeaderboard,
  ActivityHeatmap,
  PeriodSelector,
  SummaryCard,
  // Utilities
  formatDate,
  formatNumber,
  formatRelativeDate,
  getHeatColor,
  DAY_NAMES,
  DEFAULT_PERIODS
};
