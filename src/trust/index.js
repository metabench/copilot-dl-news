'use strict';

/**
 * Trust Module - Fact-Check Integration
 * 
 * Provides fact-checking and credibility assessment for articles:
 * - FactCheckService: Main orchestrator for fact-check integration
 * - ClaimExtractor: Extract checkable claims from articles
 * - SourceRater: Manage source credibility ratings
 * - CredibilityScorer: Calculate article credibility scores
 * 
 * Usage:
 * ```javascript
 * const { FactCheckService } = require('./trust');
 * 
 * const service = new FactCheckService({
 *   trustAdapter: createTrustAdapter(db),
 *   sentimentAnalyzer
 * });
 * 
 * const result = await service.analyzeArticle({
 *   host: 'example.com',
 *   text: 'Article content...'
 * });
 * 
 * console.log(result.badge); // { emoji: '✅', label: 'High' }
 * ```
 * 
 * @module trust
 */

const { FactCheckService } = require('./FactCheckService');
const { ClaimExtractor } = require('./ClaimExtractor');
const { SourceRater, MBFC_SCORES, BIAS_LABELS, KNOWN_SOURCES, DEFAULT_CREDIBILITY } = require('./SourceRater');
const { CredibilityScorer, DEFAULT_WEIGHTS, FACT_CHECK_SCORES, FLAG_TYPES } = require('./CredibilityScorer');

module.exports = {
  // Main service
  FactCheckService,
  
  // Components
  ClaimExtractor,
  SourceRater,
  CredibilityScorer,
  
  // Constants
  MBFC_SCORES,
  BIAS_LABELS,
  KNOWN_SOURCES,
  DEFAULT_CREDIBILITY,
  DEFAULT_WEIGHTS,
  FACT_CHECK_SCORES,
  FLAG_TYPES
};
