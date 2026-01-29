'use strict';

/**
 * Base class for boolean classifiers.
 * 
 * Boolean classifiers evaluate a single aspect of a page/URL/content and return
 * a boolean result with optional confidence and evidence.
 * 
 * Design principles:
 * - Single responsibility: each classifier answers ONE question
 * - Pure functions: no side effects, deterministic output
 * - Self-documenting: includes metadata about what it detects
 * - Composable: can be combined via aggregators
 * 
 * @abstract
 */
class BooleanClassifierBase {
  /**
   * @param {Object} options
   * @param {string} options.name - Unique identifier for this classifier (e.g., 'hasDateSegment')
   * @param {string} options.category - Classification category ('url', 'schema', 'content', 'metadata', 'negative')
   * @param {string} options.description - Human-readable description of what this classifier detects
   * @param {number} [options.weight=1] - Default weight when aggregating (higher = more influential)
   * @param {boolean} [options.isNegative=false] - If true, a positive result indicates rejection
   */
  constructor({ name, category, description, weight = 1, isNegative = false } = {}) {
    if (!name) throw new Error('BooleanClassifierBase requires a name');
    if (!category) throw new Error('BooleanClassifierBase requires a category');
    if (!description) throw new Error('BooleanClassifierBase requires a description');

    this.name = name;
    this.category = category;
    this.description = description;
    this.weight = weight;
    this.isNegative = isNegative;
  }

  /**
   * Evaluate the input and return a boolean classification result.
   * 
   * @abstract
   * @param {Object} input - The input to classify (structure depends on category)
   * @param {Object} [context={}] - Additional context (e.g., thresholds, config)
   * @returns {BooleanClassifierResult}
   */
  classify(input, context = {}) {
    throw new Error(`${this.constructor.name}.classify() must be implemented`);
  }

  /**
   * Create a standardized result object.
   * 
   * @protected
   * @param {boolean} value - The boolean classification result
   * @param {Object} [options={}]
   * @param {number} [options.confidence=1] - Confidence in the result (0-1)
   * @param {string} [options.reason] - Human-readable explanation
   * @param {Object} [options.evidence] - Supporting data for the decision
   * @returns {BooleanClassifierResult}
   */
  createResult(value, { confidence = 1, reason = null, evidence = null } = {}) {
    return {
      classifier: this.name,
      category: this.category,
      value: Boolean(value),
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: reason || (value ? `${this.name}: positive` : `${this.name}: negative`),
      evidence,
      weight: this.weight,
      isNegative: this.isNegative
    };
  }

  /**
   * Get metadata about this classifier for documentation/introspection.
   * 
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      category: this.category,
      description: this.description,
      weight: this.weight,
      isNegative: this.isNegative,
      className: this.constructor.name
    };
  }
}

/**
 * @typedef {Object} BooleanClassifierResult
 * @property {string} classifier - Name of the classifier that produced this result
 * @property {string} category - Category of the classifier
 * @property {boolean} value - The boolean classification result
 * @property {number} confidence - Confidence in the result (0-1)
 * @property {string} reason - Human-readable explanation
 * @property {Object|null} evidence - Supporting data for the decision
 * @property {number} weight - Weight for aggregation
 * @property {boolean} isNegative - Whether positive result indicates rejection
 */

module.exports = { BooleanClassifierBase };
