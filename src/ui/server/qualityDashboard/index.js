'use strict';

/**
 * Quality Dashboard index - exports all public APIs
 */

const { QualityMetricsService } = require('./QualityMetricsService');
const { createApp, startServer, closeServer, initDb, SummaryCard, QualityTiers } = require('./server');
const { 
  DomainQualityTable, 
  ConfidenceHistogram, 
  RegressionAlerts,
  getConfidenceLevel,
  formatConfidence,
  getBucketColor,
  getSeverity,
  getSeverityEmoji
} = require('./controls');

module.exports = {
  // Service
  QualityMetricsService,
  
  // Server
  createApp,
  startServer,
  closeServer,
  initDb,
  
  // Controls
  DomainQualityTable,
  ConfidenceHistogram,
  RegressionAlerts,
  SummaryCard,
  QualityTiers,
  
  // Utilities
  getConfidenceLevel,
  formatConfidence,
  getBucketColor,
  getSeverity,
  getSeverityEmoji
};
