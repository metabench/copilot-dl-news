'use strict';

/**
 * ClaimExtractor - Extract checkable claims from articles
 * 
 * Extends FactExtractor to focus on claims suitable for fact-checking:
 * - Assertions with verifiable statements
 * - Claims with attributions (X said, according to Y)
 * - Statements with statistics or specific facts
 * - Generates SimHash fingerprints for matching
 * 
 * @module ClaimExtractor
 */

const { FactExtractor } = require('../aggregation/FactExtractor');
const SimHasher = require('../analysis/similarity/SimHasher');

// Patterns for identifying checkable claims
const CLAIM_PATTERNS = {
  // Assertions with "is", "are", "was", "were" + fact
  assertions: /([A-Z][^.!?]*(?:is|are|was|were|has been|have been)\s+[^.!?]+[.!?])/g,
  
  // Claims with numbers/statistics
  statisticalClaims: /([^.!?]*\d+(?:,\d{3})*(?:\.\d+)?(?:\s*%|\s*percent|\s*million|\s*billion)[^.!?]*[.!?])/gi,
  
  // Comparisons (more than, less than, higher, lower)
  comparisons: /([^.!?]*(?:more than|less than|higher than|lower than|greater than|fewer than|increased|decreased|doubled|tripled)[^.!?]*[.!?])/gi,
  
  // Definitive statements (always, never, all, none, every)
  definitiveStatements: /([A-Z][^.!?]*(?:\b(?:always|never|all|none|every|no one|everyone|nothing|everything)\b)[^.!?]*[.!?])/gi,
  
  // Cause-effect claims (because, caused, leads to, results in)
  causalClaims: /([^.!?]*(?:because|caused|leads to|results in|due to|responsible for)[^.!?]*[.!?])/gi
};

// Keywords that strengthen claim checkability
const CHECKABILITY_BOOSTERS = [
  'percent', '%', 'million', 'billion', 'thousand',
  'study', 'research', 'according', 'evidence', 'data',
  'report', 'survey', 'poll', 'statistics', 'analysis',
  'confirmed', 'verified', 'proven', 'fact', 'true', 'false'
];

// Keywords that weaken checkability (opinions, predictions)
const CHECKABILITY_REDUCERS = [
  'might', 'maybe', 'perhaps', 'possibly', 'could be',
  'seems', 'appears', 'likely', 'probably', 'believe',
  'think', 'feel', 'opinion', 'hope', 'expect', 'predict'
];

/**
 * ClaimExtractor class for extracting fact-checkable claims
 */
class ClaimExtractor {
  /**
   * Create a ClaimExtractor instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.minClaimLength=30] - Minimum claim length
   * @param {number} [options.maxClaimLength=500] - Maximum claim length
   * @param {number} [options.minCheckabilityScore=0.3] - Minimum score to include claim
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.minClaimLength = options.minClaimLength || 30;
    this.maxClaimLength = options.maxClaimLength || 500;
    this.minCheckabilityScore = options.minCheckabilityScore || 0.3;
    
    // Use FactExtractor for basic extraction
    this.factExtractor = new FactExtractor({
      logger: this.logger,
      minQuoteLength: 20,
      maxQuoteLength: 500
    });
  }
  
  /**
   * Extract checkable claims from text
   * 
   * @param {string} text - Article text
   * @param {Object} [options] - Extraction options
   * @param {boolean} [options.includeSimHash=true] - Include SimHash fingerprints
   * @param {boolean} [options.includeKeywords=false] - Include extracted keywords
   * @returns {Object} Extracted claims with metadata
   */
  extract(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this._emptyResult();
    }
    
    const { includeSimHash = true, includeKeywords = false } = options;
    
    // Get base facts from FactExtractor
    const baseFacts = this.factExtractor.extract(text);
    
    // Extract additional claim patterns
    const patternClaims = this._extractPatternClaims(text);
    
    // Merge claims from FactExtractor and patterns
    const allClaims = this._mergeClaims(baseFacts.claims, patternClaims);
    
    // Score each claim for checkability
    const scoredClaims = allClaims.map(claim => this._scoreClaim(claim));
    
    // Filter by minimum checkability score
    const checkableClaims = scoredClaims.filter(
      c => c.checkabilityScore >= this.minCheckabilityScore
    );
    
    // Add SimHash fingerprints
    if (includeSimHash) {
      for (const claim of checkableClaims) {
        claim.simHash = SimHasher.toHexString(SimHasher.compute(claim.text));
      }
    }
    
    // Extract keywords if requested
    if (includeKeywords) {
      for (const claim of checkableClaims) {
        claim.keywords = this._extractKeywords(claim.text);
      }
    }
    
    // Also include statistics as claims (they're very checkable)
    const statisticsClaims = baseFacts.statistics
      .filter(s => s.context && s.context.length >= this.minClaimLength)
      .map(s => ({
        text: s.context,
        type: 'statistic',
        value: s.value,
        unit: s.unit,
        checkabilityScore: 0.8,
        simHash: includeSimHash 
          ? SimHasher.toHexString(SimHasher.compute(s.context)) 
          : undefined
      }));
    
    return {
      claims: checkableClaims,
      statistics: statisticsClaims,
      quotes: baseFacts.quotes.slice(0, 10), // Top 10 quotes
      summary: {
        totalClaims: checkableClaims.length,
        statisticsClaims: statisticsClaims.length,
        highConfidence: checkableClaims.filter(c => c.checkabilityScore >= 0.7).length,
        mediumConfidence: checkableClaims.filter(c => c.checkabilityScore >= 0.5 && c.checkabilityScore < 0.7).length,
        lowConfidence: checkableClaims.filter(c => c.checkabilityScore < 0.5).length
      },
      extractedAt: new Date().toISOString()
    };
  }
  
  /**
   * Extract pattern-based claims
   * @private
   */
  _extractPatternClaims(text) {
    const claims = [];
    const seen = new Set();
    
    for (const [patternName, pattern] of Object.entries(CLAIM_PATTERNS)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        const claimText = match[1].trim();
        const normalized = claimText.toLowerCase().substring(0, 50);
        
        if (claimText.length >= this.minClaimLength &&
            claimText.length <= this.maxClaimLength &&
            !seen.has(normalized)) {
          seen.add(normalized);
          
          claims.push({
            text: claimText,
            type: patternName,
            speaker: this._findSpeaker(text, match.index)
          });
        }
      }
    }
    
    return claims;
  }
  
  /**
   * Merge claims from multiple sources, deduplicating
   * @private
   */
  _mergeClaims(factClaims, patternClaims) {
    const merged = [];
    const seen = new Set();
    
    // Add FactExtractor claims first (they have speaker info)
    for (const claim of factClaims) {
      const normalized = (claim.text || '').toLowerCase().substring(0, 50);
      if (!seen.has(normalized) && claim.text) {
        seen.add(normalized);
        merged.push({
          text: claim.text,
          type: 'attributed',
          speaker: claim.speaker || claim.source
        });
      }
    }
    
    // Add pattern claims
    for (const claim of patternClaims) {
      const normalized = claim.text.toLowerCase().substring(0, 50);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        merged.push(claim);
      }
    }
    
    return merged;
  }
  
  /**
   * Score claim for checkability (0-1)
   * @private
   */
  _scoreClaim(claim) {
    let score = 0.4; // Base score
    
    const text = claim.text.toLowerCase();
    
    // Boost for checkability keywords
    for (const booster of CHECKABILITY_BOOSTERS) {
      if (text.includes(booster)) {
        score += 0.1;
      }
    }
    
    // Reduce for opinion/prediction keywords
    for (const reducer of CHECKABILITY_REDUCERS) {
      if (text.includes(reducer)) {
        score -= 0.1;
      }
    }
    
    // Boost for attributed claims
    if (claim.speaker) {
      score += 0.15;
    }
    
    // Boost for claims with numbers
    if (/\d+/.test(claim.text)) {
      score += 0.1;
    }
    
    // Boost for proper length (not too short, not too long)
    const len = claim.text.length;
    if (len >= 50 && len <= 200) {
      score += 0.1;
    }
    
    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));
    
    return {
      ...claim,
      checkabilityScore: Math.round(score * 100) / 100
    };
  }
  
  /**
   * Find speaker/source before a claim
   * @private
   */
  _findSpeaker(text, claimIndex) {
    const before = text.substring(Math.max(0, claimIndex - 100), claimIndex);
    const speakerPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|says|claimed|stated|told|added|noted),?\s*$/;
    const match = before.match(speakerPattern);
    
    if (match) {
      return match[1];
    }
    
    // Check for "according to X"
    const accordingPattern = /according to\s+([^,]+),?\s*$/i;
    const accordingMatch = before.match(accordingPattern);
    if (accordingMatch) {
      return accordingMatch[1].trim();
    }
    
    return null;
  }
  
  /**
   * Extract keywords from claim text
   * @private
   */
  _extractKeywords(text) {
    // Simple keyword extraction: nouns and important words
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    
    // Remove common stopwords
    const stopwords = new Set([
      'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they',
      'their', 'there', 'about', 'would', 'could', 'should', 'which',
      'what', 'when', 'where', 'will', 'than', 'then', 'more', 'some'
    ]);
    
    return [...new Set(words.filter(w => !stopwords.has(w)))].slice(0, 10);
  }
  
  /**
   * Match a claim against fact-check database using SimHash
   * 
   * @param {string} claimText - Claim text to match
   * @param {Array} factChecks - Array of {claim_text, claim_simhash, rating, source}
   * @param {Object} [options] - Options
   * @param {number} [options.maxDistance=5] - Maximum SimHash distance
   * @param {number} [options.minKeywordOverlap=3] - Minimum keyword overlap
   * @returns {Array} Matching fact-checks with similarity scores
   */
  matchClaim(claimText, factChecks, options = {}) {
    const { maxDistance = 5, minKeywordOverlap = 3 } = options;
    
    if (!claimText || !factChecks || factChecks.length === 0) {
      return [];
    }
    
    const claimSimHash = SimHasher.compute(claimText);
    const claimKeywords = new Set(this._extractKeywords(claimText));
    
    const matches = [];
    
    for (const fc of factChecks) {
      // Calculate SimHash distance
      let distance = 64; // Max distance
      if (fc.claim_simhash) {
        try {
          const fcSimHash = SimHasher.fromHexString(fc.claim_simhash);
          distance = SimHasher.hammingDistance(claimSimHash, fcSimHash);
        } catch (err) {
          // Invalid hash, skip distance check
        }
      }
      
      // Calculate keyword overlap
      const fcKeywords = new Set(this._extractKeywords(fc.claim_text || ''));
      const overlap = [...claimKeywords].filter(k => fcKeywords.has(k)).length;
      
      // Match if SimHash distance low OR keyword overlap high
      if (distance <= maxDistance || overlap >= minKeywordOverlap) {
        const similarity = 1 - (distance / 64);
        matches.push({
          factCheck: fc,
          distance,
          keywordOverlap: overlap,
          similarity: Math.round(similarity * 100) / 100,
          matchConfidence: this._calculateMatchConfidence(distance, overlap)
        });
      }
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.matchConfidence - a.matchConfidence);
    
    return matches;
  }
  
  /**
   * Calculate match confidence
   * @private
   */
  _calculateMatchConfidence(distance, overlap) {
    // Distance contributes 60%, overlap 40%
    const distanceScore = 1 - (distance / 64);
    const overlapScore = Math.min(1, overlap / 5);
    
    return Math.round((distanceScore * 0.6 + overlapScore * 0.4) * 100) / 100;
  }
  
  /**
   * Empty result for missing text
   * @private
   */
  _emptyResult() {
    return {
      claims: [],
      statistics: [],
      quotes: [],
      summary: {
        totalClaims: 0,
        statisticsClaims: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0
      },
      extractedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      minClaimLength: this.minClaimLength,
      maxClaimLength: this.maxClaimLength,
      minCheckabilityScore: this.minCheckabilityScore,
      patternCount: Object.keys(CLAIM_PATTERNS).length,
      boosterCount: CHECKABILITY_BOOSTERS.length,
      reducerCount: CHECKABILITY_REDUCERS.length
    };
  }
}

module.exports = { ClaimExtractor };
