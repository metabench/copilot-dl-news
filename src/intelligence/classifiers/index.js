'use strict';

/**
 * Classifiers Module
 * 
 * Central hub for all classification logic in the system.
 * 
 * Structure:
 * - boolean/   - Individual yes/no classifiers (atomic building blocks)
 * - Stage1UrlClassifier     - URL-only classification (pre-download)
 * - Stage2ContentClassifier - Content-only classification (post-download)
 * - Stage3PuppeteerClassifier - Puppeteer-based classification (rendered DOM)
 * - StageAggregator         - Combines stage results with provenance
 * 
 * Classification Cascade:
 * Stage 1 (URL) → Stage 2 (Content) → Stage 3 (Puppeteer) → Aggregator
 * Each stage is independent and returns: { classification, confidence, reason, signals }
 * 
 * Note: For the new Fact-based classification system, see:
 * - src/facts/           - Objective boolean observations
 * - src/classifications/ - Rules that consume facts
 * - docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md
 */

const boolean = require('./boolean');
const { Stage1UrlClassifier } = require('./Stage1UrlClassifier');
const { Stage2ContentClassifier } = require('./Stage2ContentClassifier');
const { Stage3PuppeteerClassifier } = require('./Stage3PuppeteerClassifier');
const { StageAggregator } = require('./StageAggregator');

module.exports = {
  // Namespace
  boolean,
  
  // Stage classifiers (Classification Cascade)
  Stage1UrlClassifier,
  Stage2ContentClassifier,
  Stage3PuppeteerClassifier,
  StageAggregator,
  
  // Direct exports for convenience (legacy boolean classifiers)
  BooleanClassifierBase: boolean.BooleanClassifierBase,
  UrlClassifier: boolean.UrlClassifier,
  HtmlClassifier: boolean.HtmlClassifier,
  SchemaClassifier: boolean.SchemaClassifier,
  CompositeClassifier: boolean.CompositeClassifier
};
