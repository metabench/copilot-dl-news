'use strict';

const { BooleanClassifierBase } = require('./BooleanClassifierBase');

/**
 * Base class for composite boolean classifiers.
 * 
 * Composite classifiers aggregate results from multiple other classifiers.
 * They implement voting, weighting, and combination strategies.
 * 
 * Input shape: { results: BooleanClassifierResult[] }
 * 
 * @extends BooleanClassifierBase
 */
class CompositeClassifier extends BooleanClassifierBase {
  /**
   * @param {Object} options - Options passed to BooleanClassifierBase
   * @param {string} [options.strategy='majority'] - Aggregation strategy
   * @param {number} [options.threshold=0.5] - Threshold for weighted strategies
   */
  constructor(options = {}) {
    const { strategy = 'majority', threshold = 0.5, ...baseOptions } = options;
    
    super({
      ...baseOptions,
      category: 'composite'
    });
    
    /** @type {'cheap'} */
    this.cost = 'cheap';
    
    /** @type {string} Aggregation strategy */
    this.strategy = strategy;
    
    /** @type {number} Threshold for weighted strategies */
    this.threshold = threshold;
  }

  /**
   * Validate composite input.
   * 
   * @protected
   * @param {Object} input
   * @param {BooleanClassifierResult[]} input.results - Array of classifier results
   * @returns {{ results: BooleanClassifierResult[] } | null}
   */
  parseInput(input) {
    if (!input || !Array.isArray(input.results)) {
      return null;
    }

    const validResults = input.results.filter(r => 
      r && typeof r.value === 'boolean' && typeof r.classifier === 'string'
    );

    if (validResults.length === 0) {
      return null;
    }

    return { results: validResults };
  }

  /**
   * Count positive and negative votes.
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ positive: number, negative: number, total: number }}
   */
  countVotes(results) {
    let positive = 0;
    let negative = 0;

    for (const result of results) {
      // For negative classifiers, a true value means rejection
      const effectiveValue = result.isNegative ? !result.value : result.value;
      if (effectiveValue) {
        positive++;
      } else {
        negative++;
      }
    }

    return { positive, negative, total: results.length };
  }

  /**
   * Calculate weighted score.
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ score: number, maxScore: number, ratio: number }}
   */
  weightedScore(results) {
    let score = 0;
    let maxScore = 0;

    for (const result of results) {
      const weight = result.weight || 1;
      maxScore += weight;
      
      // For negative classifiers, a true value means rejection (subtract)
      const effectiveValue = result.isNegative ? !result.value : result.value;
      if (effectiveValue) {
        score += weight * result.confidence;
      }
    }

    return {
      score,
      maxScore,
      ratio: maxScore > 0 ? score / maxScore : 0
    };
  }

  /**
   * Apply majority voting strategy.
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ value: boolean, confidence: number }}
   */
  majorityVote(results) {
    const { positive, negative, total } = this.countVotes(results);
    const value = positive > negative;
    const confidence = total > 0 ? Math.max(positive, negative) / total : 0;
    
    return { value, confidence };
  }

  /**
   * Apply unanimous voting strategy (all must agree).
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ value: boolean, confidence: number }}
   */
  unanimousVote(results) {
    const { positive, total } = this.countVotes(results);
    const value = positive === total;
    const confidence = value ? 1 : 0;
    
    return { value, confidence };
  }

  /**
   * Apply weighted threshold strategy.
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @param {number} [threshold] - Override threshold
   * @returns {{ value: boolean, confidence: number, score: number }}
   */
  weightedVote(results, threshold = this.threshold) {
    const { score, maxScore, ratio } = this.weightedScore(results);
    const value = ratio >= threshold;
    
    return {
      value,
      confidence: ratio,
      score
    };
  }

  /**
   * Apply any-positive strategy (OR logic).
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ value: boolean, confidence: number }}
   */
  anyPositive(results) {
    const { positive, total } = this.countVotes(results);
    const value = positive > 0;
    const confidence = value ? positive / total : 0;
    
    return { value, confidence };
  }

  /**
   * Apply any-negative strategy (veto power).
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {{ value: boolean, confidence: number }}
   */
  anyNegative(results) {
    const { negative, total } = this.countVotes(results);
    const value = negative === 0;
    const confidence = value ? 1 : negative / total;
    
    return { value, confidence };
  }

  /**
   * Get breakdown of results by category.
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {Object.<string, BooleanClassifierResult[]>}
   */
  groupByCategory(results) {
    const groups = {};
    
    for (const result of results) {
      const category = result.category || 'unknown';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(result);
    }
    
    return groups;
  }

  /**
   * Get reasons for the decision (positive contributors).
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {string[]}
   */
  getPositiveReasons(results) {
    return results
      .filter(r => r.isNegative ? !r.value : r.value)
      .map(r => r.reason)
      .filter(Boolean);
  }

  /**
   * Get rejections (negative contributors).
   * 
   * @protected
   * @param {BooleanClassifierResult[]} results
   * @returns {string[]}
   */
  getNegativeReasons(results) {
    return results
      .filter(r => r.isNegative ? r.value : !r.value)
      .map(r => r.reason)
      .filter(Boolean);
  }
}

module.exports = { CompositeClassifier };
