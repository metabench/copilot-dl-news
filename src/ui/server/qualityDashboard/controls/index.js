'use strict';

/**
 * Controls index for Quality Dashboard
 */

const { DomainQualityTable, getConfidenceLevel, formatConfidence } = require('./DomainQualityTable');
const { ConfidenceHistogram, getBucketColor } = require('./ConfidenceHistogram');
const { RegressionAlerts, getSeverity, getSeverityEmoji } = require('./RegressionAlerts');

module.exports = {
  DomainQualityTable,
  ConfidenceHistogram,
  RegressionAlerts,
  // Utilities
  getConfidenceLevel,
  formatConfidence,
  getBucketColor,
  getSeverity,
  getSeverityEmoji
};
