'use strict';

/**
 * @fileoverview Classification Aggregator
 * 
 * Combines results from multiple classification stages (URL, Content, Puppeteer)
 * into a final classification with provenance tracking.
 * 
 * Part of the Classification Cascade architecture.
 * 
 * @example
 * const { StageAggregator } = require('./StageAggregator');
 * const aggregator = new StageAggregator();
 * const urlResult = urlClassifier.classify(url);
 * const contentResult = contentClassifier.classify(html);
 * const final = aggregator.aggregate(urlResult, contentResult);
 * // { classification: 'article', confidence: 0.92, provenance: {...} }
 */

/**
 * @typedef {Object} StageResult
 * @property {string} classification - 'article' | 'hub' | 'nav' | 'unknown'
 * @property {number} confidence - Confidence score 0.0-1.0
 * @property {string} reason - Reason for classification
 * @property {Object} [signals] - Stage-specific signals
 */

/**
 * @typedef {Object} Provenance
 * @property {StageResult|null} url - URL stage result
 * @property {StageResult|null} content - Content stage result
 * @property {StageResult|null} puppeteer - Puppeteer stage result
 * @property {Object} aggregator - Aggregation decision info
 * @property {string} aggregator.decision - Decision type (e.g., 'url-only', 'content-override')
 * @property {string} aggregator.reason - Human-readable explanation
 */

/**
 * @typedef {Object} AggregatedResult
 * @property {string} classification - Final classification
 * @property {number} confidence - Final confidence score
 * @property {Provenance} provenance - Full decision trail
 */

/**
 * Default aggregation options
 */
const DEFAULT_OPTIONS = {
  // Confidence threshold for trusting a single stage
  highConfidenceThreshold: 0.9,
  
  // Minimum confidence delta for content to override URL
  contentOverrideMargin: 0.15,
  
  // Weight multipliers for each stage
  weights: {
    url: 1.0,
    content: 1.2,      // Slightly prefer content when available
    puppeteer: 1.5     // Prefer Puppeteer when available (most accurate)
  },
  
  // Classification priority when confidence is tied
  // Higher index = higher priority in case of tie
  classificationPriority: ['unknown', 'nav', 'hub', 'article']
};

class StageAggregator {
  /**
   * @param {Object} options
   * @param {number} [options.highConfidenceThreshold] - Threshold for trusting single stage
   * @param {number} [options.contentOverrideMargin] - Margin for content to override URL
   * @param {Object} [options.weights] - Stage weight multipliers
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    if (options.weights) {
      this.options.weights = { ...DEFAULT_OPTIONS.weights, ...options.weights };
    }
  }

  /**
   * Aggregate classification results from multiple stages
   * 
   * @param {StageResult|null} urlResult - Stage 1 result
   * @param {StageResult|null} contentResult - Stage 2 result
   * @param {StageResult|null} puppeteerResult - Stage 3 result
   * @returns {AggregatedResult}
   */
  aggregate(urlResult, contentResult = null, puppeteerResult = null) {
    const provenance = {
      url: urlResult ? this._summarizeStage(urlResult) : null,
      content: contentResult ? this._summarizeStage(contentResult) : null,
      puppeteer: puppeteerResult ? this._summarizeStage(puppeteerResult) : null,
      aggregator: { decision: null, reason: null }
    };

    // Collect valid results
    const stages = [];
    if (urlResult && urlResult.classification !== 'unknown') {
      stages.push({ name: 'url', result: urlResult, weight: this.options.weights.url });
    }
    if (contentResult && contentResult.classification !== 'unknown') {
      stages.push({ name: 'content', result: contentResult, weight: this.options.weights.content });
    }
    if (puppeteerResult && puppeteerResult.classification !== 'unknown') {
      stages.push({ name: 'puppeteer', result: puppeteerResult, weight: this.options.weights.puppeteer });
    }

    // No valid results
    if (stages.length === 0) {
      provenance.aggregator = {
        decision: 'no-valid-stages',
        reason: 'All stages returned unknown or were not provided'
      };
      return {
        classification: 'unknown',
        confidence: 0.5,
        provenance
      };
    }

    // Single stage
    if (stages.length === 1) {
      const stage = stages[0];
      provenance.aggregator = {
        decision: `${stage.name}-only`,
        reason: `Only ${stage.name} stage provided a classification`
      };
      return {
        classification: stage.result.classification,
        confidence: stage.result.confidence,
        provenance
      };
    }

    // Multiple stages - apply decision logic
    return this._aggregateMultiple(stages, provenance);
  }

  /**
   * Aggregate when multiple stages have results
   * @private
   */
  _aggregateMultiple(stages, provenance) {
    const opts = this.options;
    
    // Check for high-confidence single stage
    const highConfidence = stages.filter(s => s.result.confidence >= opts.highConfidenceThreshold);
    if (highConfidence.length === 1) {
      const winner = highConfidence[0];
      provenance.aggregator = {
        decision: `${winner.name}-high-confidence`,
        reason: `${winner.name} stage has confidence >= ${opts.highConfidenceThreshold}`
      };
      return {
        classification: winner.result.classification,
        confidence: winner.result.confidence,
        provenance
      };
    }

    // Check for unanimous agreement
    const classifications = [...new Set(stages.map(s => s.result.classification))];
    if (classifications.length === 1) {
      // All stages agree
      const avgConfidence = stages.reduce((sum, s) => sum + s.result.confidence, 0) / stages.length;
      provenance.aggregator = {
        decision: 'unanimous',
        reason: `All ${stages.length} stages agree on ${classifications[0]}`
      };
      return {
        classification: classifications[0],
        confidence: Math.min(1, avgConfidence + 0.05), // Small boost for agreement
        provenance
      };
    }

    // Stages disagree - apply override logic
    return this._resolveDisagreement(stages, provenance);
  }

  /**
   * Resolve disagreement between stages
   * @private
   */
  _resolveDisagreement(stages, provenance) {
    const opts = this.options;
    
    // Find URL and content stages for override check
    const urlStage = stages.find(s => s.name === 'url');
    const contentStage = stages.find(s => s.name === 'content');
    const puppeteerStage = stages.find(s => s.name === 'puppeteer');
    
    // Puppeteer override (if present and confident)
    if (puppeteerStage && puppeteerStage.result.confidence >= 0.7) {
      provenance.aggregator = {
        decision: 'puppeteer-override',
        reason: `Puppeteer stage overrides (confidence ${puppeteerStage.result.confidence.toFixed(2)})`
      };
      return {
        classification: puppeteerStage.result.classification,
        confidence: puppeteerStage.result.confidence,
        provenance
      };
    }
    
    // Content override check
    if (urlStage && contentStage) {
      const delta = contentStage.result.confidence - urlStage.result.confidence;
      if (delta > opts.contentOverrideMargin) {
        provenance.aggregator = {
          decision: 'content-override',
          reason: `Content confidence exceeds URL by ${delta.toFixed(2)} (> ${opts.contentOverrideMargin})`
        };
        return {
          classification: contentStage.result.classification,
          confidence: contentStage.result.confidence,
          provenance
        };
      }
    }
    
    // Weighted voting
    const votes = {};
    for (const stage of stages) {
      const cls = stage.result.classification;
      const weight = stage.result.confidence * stage.weight;
      votes[cls] = (votes[cls] || 0) + weight;
    }
    
    // Find winner
    let winner = null;
    let maxVotes = -1;
    for (const [cls, weight] of Object.entries(votes)) {
      if (weight > maxVotes) {
        maxVotes = weight;
        winner = cls;
      } else if (weight === maxVotes) {
        // Tie-breaker: use priority
        const currentPriority = opts.classificationPriority.indexOf(winner);
        const newPriority = opts.classificationPriority.indexOf(cls);
        if (newPriority > currentPriority) {
          winner = cls;
        }
      }
    }
    
    // Calculate combined confidence
    const winningStages = stages.filter(s => s.result.classification === winner);
    const avgConfidence = winningStages.reduce((sum, s) => sum + s.result.confidence, 0) / winningStages.length;
    
    provenance.aggregator = {
      decision: 'weighted-voting',
      reason: `Weighted voting: ${Object.entries(votes).map(([c, w]) => `${c}=${w.toFixed(2)}`).join(', ')}`
    };
    
    return {
      classification: winner,
      confidence: avgConfidence,
      provenance
    };
  }

  /**
   * Create a minimal summary of a stage result for provenance
   * @private
   */
  _summarizeStage(result) {
    return {
      classification: result.classification,
      confidence: result.confidence,
      reason: result.reason
    };
  }
}

module.exports = { StageAggregator };
