'use strict';

/**
 * Self-Healing Crawler Module
 * 
 * Provides automatic error diagnosis and remediation for crawler failures.
 * 
 * @module crawler/healing
 */

const { DiagnosticEngine, FailureTypes, DETECTION_PATTERNS } = require('./DiagnosticEngine');
const { RemediationStrategies, DEFAULT_STRATEGIES } = require('./RemediationStrategies');
const { HealingReport } = require('./HealingReport');
const { SelfHealingService } = require('./SelfHealingService');

module.exports = {
  // Main service
  SelfHealingService,
  
  // Core components
  DiagnosticEngine,
  RemediationStrategies,
  HealingReport,
  
  // Constants
  FailureTypes,
  DETECTION_PATTERNS,
  DEFAULT_STRATEGIES
};
