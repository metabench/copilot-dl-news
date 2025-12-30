'use strict';

/**
 * CredibilityScorer - Calculate article credibility scores
 * 
 * Combines multiple signals to assess article credibility:
 * - Source credibility (from SourceRater)
 * - Matched fact-checks (claims verified/debunked)
 * - Claim analysis (checkable claims with sources)
 * - Sentiment tone (extreme sentiment may indicate bias)
 * 
 * Output:
 * - overallScore: 0-100 credibility score
 * - badge: ✅ High (80+), ⚠️ Mixed (50-79), ❌ Low (<50)
 * - breakdown: Individual factor scores
 * - flags: Specific concerns identified
 * 
 * @module CredibilityScorer
 */

const { SourceRater } = require('./SourceRater');

// Scoring weights for credibility factors
const DEFAULT_WEIGHTS = {
  source: 0.40,        // Source credibility (MBFC rating, history)
  factChecks: 0.30,    // Matched fact-check results
  claims: 0.15,        // Quality of claims (attributed, verifiable)
  tone: 0.15           // Sentiment balance (extreme = lower score)
};

// Fact-check rating to score mapping
const FACT_CHECK_SCORES = {
  'true': 100,
  'mostly-true': 85,
  'half-true': 60,
  'mostly-false': 30,
  'false': 10,
  'pants-on-fire': 0,
  // Alternative ratings
  'correct': 100,
  'accurate': 100,
  'verified': 100,
  'misleading': 40,
  'unverified': 50,
  'disputed': 45,
  'debunked': 15,
  'satire': 80  // Satire is intentionally false
};

// Flags for specific credibility concerns
const FLAG_TYPES = {
  KNOWN_FALSE_CLAIM: { severity: 'high', message: 'Contains claim rated false by fact-checkers' },
  UNVERIFIED_CLAIMS: { severity: 'medium', message: 'Multiple unverified claims without attribution' },
  LOW_SOURCE_CREDIBILITY: { severity: 'high', message: 'Source has low credibility rating' },
  EXTREME_TONE: { severity: 'low', message: 'Article has extreme positive or negative tone' },
  NO_ATTRIBUTED_CLAIMS: { severity: 'medium', message: 'Claims lack clear attribution' },
  CONSPIRACY_SOURCE: { severity: 'high', message: 'Source is classified as conspiracy/pseudoscience' },
  SATIRE: { severity: 'info', message: 'Source is classified as satire' }
};

/**
 * CredibilityScorer class for article credibility assessment
 */
class CredibilityScorer {
  /**
   * Create a CredibilityScorer instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.sourceRater] - SourceRater instance
   * @param {Object} [options.sentimentAnalyzer] - SentimentAnalyzer instance
   * @param {Object} [options.claimExtractor] - ClaimExtractor instance
   * @param {Object} [options.trustAdapter] - Database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.weights] - Custom scoring weights
   */
  constructor(options = {}) {
    this.sourceRater = options.sourceRater || new SourceRater();
    this.sentimentAnalyzer = options.sentimentAnalyzer || null;
    this.claimExtractor = options.claimExtractor || null;
    this.trustAdapter = options.trustAdapter || null;
    this.logger = options.logger || console;
    
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  }
  
  /**
   * Score article credibility
   * 
   * @param {Object} article - Article to score
   * @param {string} article.host - Source hostname
   * @param {string} [article.text] - Article text (for claim extraction)
   * @param {number} [article.contentId] - Content ID (for caching)
   * @param {Object} [options] - Options
   * @param {Array} [options.matchedFactChecks] - Pre-matched fact-checks
   * @param {Object} [options.sentiment] - Pre-computed sentiment
   * @param {Object} [options.claims] - Pre-extracted claims
   * @returns {Object} Credibility assessment
   */
  score(article, options = {}) {
    const { matchedFactChecks, sentiment, claims } = options;
    
    if (!article || !article.host) {
      return this._defaultResult('No article or source provided');
    }
    
    const factors = {
      source: null,
      factChecks: null,
      claims: null,
      tone: null
    };
    
    const flags = [];
    
    // 1. Source credibility
    const sourceCredibility = this.sourceRater.getSourceCredibility(article.host);
    factors.source = {
      score: sourceCredibility.credibilityScore,
      mbfcRating: sourceCredibility.mbfcRating,
      biasLabel: sourceCredibility.biasLabel
    };
    
    // Flag low credibility or questionable sources
    if (sourceCredibility.credibilityScore < 40) {
      flags.push(FLAG_TYPES.LOW_SOURCE_CREDIBILITY);
    }
    if (sourceCredibility.biasLabel === 'conspiracy-pseudoscience' ||
        sourceCredibility.biasLabel === 'questionable') {
      flags.push(FLAG_TYPES.CONSPIRACY_SOURCE);
    }
    if (sourceCredibility.biasLabel === 'satire') {
      flags.push(FLAG_TYPES.SATIRE);
    }
    
    // 2. Fact-check matches
    if (matchedFactChecks && matchedFactChecks.length > 0) {
      factors.factChecks = this._scoreFactChecks(matchedFactChecks, flags);
    } else {
      // No fact-checks = neutral (neither good nor bad)
      factors.factChecks = { score: 70, matchCount: 0, details: [] };
    }
    
    // 3. Claim quality
    if (claims) {
      factors.claims = this._scoreClaimQuality(claims, flags);
    } else if (article.text && this.claimExtractor) {
      const extracted = this.claimExtractor.extract(article.text);
      factors.claims = this._scoreClaimQuality(extracted, flags);
    } else {
      factors.claims = { score: 70, claimCount: 0 };
    }
    
    // 4. Tone/sentiment balance
    if (sentiment) {
      factors.tone = this._scoreTone(sentiment, flags);
    } else if (article.text && this.sentimentAnalyzer) {
      const sentimentResult = this.sentimentAnalyzer.analyze(article.text);
      factors.tone = this._scoreTone(sentimentResult, flags);
    } else {
      factors.tone = { score: 70 };
    }
    
    // Calculate weighted overall score
    const overallScore = this._calculateOverallScore(factors);
    
    // Get badge
    const badge = this.sourceRater.getBadge(overallScore);
    
    return {
      overallScore,
      badge,
      factors,
      flags,
      host: article.host,
      analyzedAt: new Date().toISOString()
    };
  }
  
  /**
   * Score fact-check matches
   * @private
   */
  _scoreFactChecks(matchedFactChecks, flags) {
    if (!matchedFactChecks || matchedFactChecks.length === 0) {
      return { score: 70, matchCount: 0, details: [] };
    }
    
    let totalScore = 0;
    const details = [];
    let hasKnownFalse = false;
    
    for (const match of matchedFactChecks) {
      const fc = match.factCheck || match;
      const rating = (fc.rating || '').toLowerCase().replace(/\s+/g, '-');
      const ratingScore = FACT_CHECK_SCORES[rating] ?? 50;
      
      // Weight by match confidence
      const confidence = match.matchConfidence || 0.5;
      totalScore += ratingScore * confidence;
      
      details.push({
        claim: fc.claim_text?.substring(0, 100),
        rating: fc.rating,
        source: fc.source,
        score: ratingScore,
        confidence
      });
      
      if (ratingScore <= 30) {
        hasKnownFalse = true;
      }
    }
    
    // Average score weighted by confidence
    const totalConfidence = matchedFactChecks.reduce(
      (sum, m) => sum + (m.matchConfidence || 0.5), 
      0
    );
    const avgScore = totalConfidence > 0 ? totalScore / totalConfidence : 70;
    
    // Flag if false claims found
    if (hasKnownFalse) {
      flags.push(FLAG_TYPES.KNOWN_FALSE_CLAIM);
    }
    
    return {
      score: Math.round(avgScore),
      matchCount: matchedFactChecks.length,
      details
    };
  }
  
  /**
   * Score claim quality (attribution, verifiability)
   * @private
   */
  _scoreClaimQuality(claims, flags) {
    if (!claims || (!claims.claims && !claims.length)) {
      return { score: 70, claimCount: 0 };
    }
    
    const claimsList = claims.claims || claims;
    if (claimsList.length === 0) {
      return { score: 70, claimCount: 0 };
    }
    
    // Calculate attribution rate
    const withSpeaker = claimsList.filter(c => c.speaker).length;
    const attributionRate = withSpeaker / claimsList.length;
    
    // Calculate average checkability
    const avgCheckability = claimsList.reduce(
      (sum, c) => sum + (c.checkabilityScore || 0.5), 
      0
    ) / claimsList.length;
    
    // Score: higher attribution and checkability = more credible
    // (Credible articles cite sources, make verifiable claims)
    const score = Math.round((attributionRate * 50) + (avgCheckability * 50));
    
    // Flag if no attributed claims
    if (attributionRate < 0.2 && claimsList.length >= 3) {
      flags.push(FLAG_TYPES.NO_ATTRIBUTED_CLAIMS);
    }
    
    // Flag if many low-checkability claims
    if (avgCheckability < 0.4 && claimsList.length >= 5) {
      flags.push(FLAG_TYPES.UNVERIFIED_CLAIMS);
    }
    
    return {
      score,
      claimCount: claimsList.length,
      attributionRate: Math.round(attributionRate * 100) / 100,
      avgCheckability: Math.round(avgCheckability * 100) / 100
    };
  }
  
  /**
   * Score sentiment/tone balance
   * @private
   */
  _scoreTone(sentiment, flags) {
    if (!sentiment) {
      return { score: 70 };
    }
    
    const overallScore = sentiment.overallScore || 0;
    const absScore = Math.abs(overallScore);
    
    // Neutral tone (close to 0) is most credible
    // Extreme tone (>0.6 either direction) is less credible
    // Score: 100 for neutral, drops as extremity increases
    const toneScore = Math.round(100 - (absScore * 50));
    
    // Flag extreme tone
    if (absScore > 0.6) {
      flags.push(FLAG_TYPES.EXTREME_TONE);
    }
    
    return {
      score: Math.max(30, toneScore),
      sentimentScore: overallScore,
      direction: overallScore > 0.2 ? 'positive' : 
                 overallScore < -0.2 ? 'negative' : 'neutral'
    };
  }
  
  /**
   * Calculate weighted overall score
   * @private
   */
  _calculateOverallScore(factors) {
    let weightedSum = 0;
    let totalWeight = 0;
    
    if (factors.source && factors.source.score !== null) {
      weightedSum += factors.source.score * this.weights.source;
      totalWeight += this.weights.source;
    }
    
    if (factors.factChecks && factors.factChecks.score !== null) {
      weightedSum += factors.factChecks.score * this.weights.factChecks;
      totalWeight += this.weights.factChecks;
    }
    
    if (factors.claims && factors.claims.score !== null) {
      weightedSum += factors.claims.score * this.weights.claims;
      totalWeight += this.weights.claims;
    }
    
    if (factors.tone && factors.tone.score !== null) {
      weightedSum += factors.tone.score * this.weights.tone;
      totalWeight += this.weights.tone;
    }
    
    if (totalWeight === 0) {
      return 50; // Default neutral score
    }
    
    return Math.round(weightedSum / totalWeight);
  }
  
  /**
   * Score article by content ID (with caching)
   * 
   * @param {number} contentId - Article content ID
   * @param {Object} [options] - Options
   * @param {boolean} [options.regenerate=false] - Force regeneration
   * @returns {Promise<Object>} Credibility assessment
   */
  async scoreArticle(contentId, options = {}) {
    const { regenerate = false } = options;
    
    // Check cache
    if (this.trustAdapter && !regenerate) {
      const cached = this.trustAdapter.getArticleCredibility(contentId);
      if (cached) {
        return { ...cached, cached: true };
      }
    }
    
    // Would need articles adapter to fetch article data
    throw new Error('scoreArticle requires articlesAdapter - use score() with article data instead');
  }
  
  /**
   * Batch score multiple articles
   * 
   * @param {Array} articles - Articles to score
   * @param {Object} [options] - Options
   * @returns {Array} Array of credibility assessments
   */
  batchScore(articles, options = {}) {
    return articles.map(article => {
      try {
        return this.score(article, options);
      } catch (err) {
        this.logger.error(`[CredibilityScorer] Failed to score article:`, err.message);
        return {
          host: article.host,
          overallScore: 50,
          badge: this.sourceRater.getBadge(50),
          error: err.message
        };
      }
    });
  }
  
  /**
   * Default result for invalid input
   * @private
   */
  _defaultResult(message) {
    return {
      overallScore: 50,
      badge: { emoji: '⚠️', label: 'Unknown', level: 'mixed', color: 'gray' },
      factors: {},
      flags: [],
      error: message,
      analyzedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get flag types
   * @returns {Object}
   */
  getFlagTypes() {
    return { ...FLAG_TYPES };
  }
  
  /**
   * Get fact-check score mapping
   * @returns {Object}
   */
  getFactCheckScores() {
    return { ...FACT_CHECK_SCORES };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      weights: this.weights,
      flagCount: Object.keys(FLAG_TYPES).length,
      ratingCount: Object.keys(FACT_CHECK_SCORES).length,
      hasSourceRater: !!this.sourceRater,
      hasSentimentAnalyzer: !!this.sentimentAnalyzer,
      hasClaimExtractor: !!this.claimExtractor,
      hasTrustAdapter: !!this.trustAdapter
    };
  }
}

module.exports = { 
  CredibilityScorer,
  DEFAULT_WEIGHTS,
  FACT_CHECK_SCORES,
  FLAG_TYPES
};
