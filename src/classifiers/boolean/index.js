'use strict';

/**
 * Boolean Classifiers Module
 * 
 * Provides reusable boolean classifier functions for page/URL/content classification.
 * Each classifier answers a single yes/no question with confidence and evidence.
 * 
 * Type hierarchy:
 * - BooleanClassifierBase  - Abstract base for all boolean classifiers
 *   ├── UrlClassifier      - URL string analysis (cheap)
 *   ├── HtmlClassifier     - DOM/HTML analysis (expensive)
 *   ├── SchemaClassifier   - Structured data analysis (cheap)
 *   └── CompositeClassifier - Aggregates multiple classifier results (cheap)
 * 
 * Note: For the new Fact-based system, see src/facts/
 */

const { BooleanClassifierBase } = require('./BooleanClassifierBase');
const { UrlClassifier } = require('./UrlClassifier');
const { HtmlClassifier } = require('./HtmlClassifier');
const { SchemaClassifier } = require('./SchemaClassifier');
const { CompositeClassifier } = require('./CompositeClassifier');

module.exports = {
  // Base classes
  BooleanClassifierBase,
  UrlClassifier,
  HtmlClassifier,
  SchemaClassifier,
  CompositeClassifier
};
