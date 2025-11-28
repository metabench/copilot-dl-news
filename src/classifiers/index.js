'use strict';

/**
 * Classifiers Module
 * 
 * Central hub for all classification logic in the system.
 * 
 * Structure:
 * - boolean/   - Individual yes/no classifiers (atomic building blocks)
 * - (future)   - Multi-class classifiers, aggregators, decision trees
 * 
 * Note: For the new Fact-based classification system, see:
 * - src/facts/           - Objective boolean observations
 * - src/classifications/ - Rules that consume facts
 * - docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md
 */

const boolean = require('./boolean');

module.exports = {
  // Namespace
  boolean,
  
  // Direct exports for convenience
  BooleanClassifierBase: boolean.BooleanClassifierBase,
  UrlClassifier: boolean.UrlClassifier,
  HtmlClassifier: boolean.HtmlClassifier,
  SchemaClassifier: boolean.SchemaClassifier,
  CompositeClassifier: boolean.CompositeClassifier
};
