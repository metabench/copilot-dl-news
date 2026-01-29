'use strict';

/**
 * Topics Analysis Module
 * 
 * Provides topic modeling, story clustering, and trend detection
 * for news article analysis.
 * 
 * Components:
 * - TopicModeler: Seed-based topic classification
 * - StoryClustering: Group related articles into story threads
 * - TrendDetector: Detect emerging and trending topics
 * 
 * @module topics
 */

const { TopicModeler, tokenize, calculateTermFrequencies } = require('./TopicModeler');
const { StoryClustering, calculateEntityOverlap, timeDiffHours } = require('./StoryClustering');
const { TrendDetector, mean, stddev, toDateString, daysAgo } = require('./TrendDetector');

module.exports = {
  // Main services
  TopicModeler,
  StoryClustering,
  TrendDetector,
  
  // Utilities from TopicModeler
  tokenize,
  calculateTermFrequencies,
  
  // Utilities from StoryClustering
  calculateEntityOverlap,
  timeDiffHours,
  
  // Utilities from TrendDetector
  mean,
  stddev,
  toDateString,
  daysAgo
};
