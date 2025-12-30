'use strict';

/**
 * Alert & Notification System
 * 
 * Real-time article alert engine with rule-based matching,
 * breaking news detection, and multi-channel notification delivery.
 * 
 * @module alerts
 */

const { AlertEngine } = require('./AlertEngine');
const { RuleEvaluator, CONDITION_TYPES, OPERATORS, LOGICAL } = require('./RuleEvaluator');
const { BreakingNewsDetector, BREAKING_THRESHOLDS } = require('./BreakingNewsDetector');
const { NotificationService, CHANNELS, THROTTLE } = require('./NotificationService');

module.exports = {
  // Main orchestrator
  AlertEngine,
  
  // Rule evaluation
  RuleEvaluator,
  CONDITION_TYPES,
  OPERATORS,
  LOGICAL,
  
  // Breaking news detection
  BreakingNewsDetector,
  BREAKING_THRESHOLDS,
  
  // Notification delivery
  NotificationService,
  CHANNELS,
  THROTTLE
};
