'use strict';

/**
 * FactCheckService - Main fact-checking orchestrator
 * 
 * Coordinates fact-check integration:
 * - Extracts claims from articles using ClaimExtractor
 * - Matches claims against local fact-check database
 * - Optionally queries Google Fact Check API
 * - Calculates overall credibility using CredibilityScorer
 * 
 * Data sources:
 * - Local database: fact_checks table populated from RSS feeds
 * - Google Fact Check API: Optional external verification
 * 
 * @module FactCheckService
 */

const { ClaimExtractor } = require('./ClaimExtractor');
const { SourceRater } = require('./SourceRater');
const { CredibilityScorer } = require('./CredibilityScorer');

// Google Fact Check API base URL
const GOOGLE_FC_API = 'https://factchecktools.googleapis.com/v1alpha1/claims:search';

// Cache TTL for API responses (24 hours)
const API_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * FactCheckService class for fact-checking integration
 */
class FactCheckService {
  /**
   * Create a FactCheckService instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} [options.trustAdapter] - Database adapter for fact-checks
   * @param {Object} [options.articlesAdapter] - Articles adapter
   * @param {Object} [options.sentimentAnalyzer] - SentimentAnalyzer instance
   * @param {string} [options.googleApiKey] - Google Fact Check API key
   * @param {Object} [options.logger] - Logger instance
   * @param {boolean} [options.useGoogleApi=false] - Enable Google API queries
   */
  constructor(options = {}) {
    this.trustAdapter = options.trustAdapter || null;
    this.articlesAdapter = options.articlesAdapter || null;
    this.sentimentAnalyzer = options.sentimentAnalyzer || null;
    this.googleApiKey = options.googleApiKey || process.env.GOOGLE_FACT_CHECK_API_KEY;
    this.useGoogleApi = options.useGoogleApi || false;
    this.logger = options.logger || console;
    
    // Initialize sub-components
    this.claimExtractor = new ClaimExtractor({ logger: this.logger });
    this.sourceRater = new SourceRater({ 
      trustAdapter: this.trustAdapter,
      logger: this.logger 
    });
    this.credibilityScorer = new CredibilityScorer({
      sourceRater: this.sourceRater,
      sentimentAnalyzer: this.sentimentAnalyzer,
      claimExtractor: this.claimExtractor,
      trustAdapter: this.trustAdapter,
      logger: this.logger
    });
    
    // API response cache
    this.apiCache = new Map();
  }
  
  /**
   * Analyze article credibility
   * 
   * @param {Object} article - Article to analyze
   * @param {number} [article.contentId] - Content ID
   * @param {string} article.host - Source hostname
   * @param {string} article.text - Article text
   * @param {string} [article.title] - Article title
   * @param {Object} [options] - Options
   * @param {boolean} [options.useCache=true] - Use cached results
   * @param {boolean} [options.queryApi=false] - Query Google API
   * @returns {Promise<Object>} Credibility analysis
   */
  async analyzeArticle(article, options = {}) {
    const { useCache = true, queryApi = false } = options;
    
    if (!article || !article.host) {
      return this._errorResult('Article with host required');
    }
    
    // Check cache
    if (useCache && article.contentId && this.trustAdapter) {
      const cached = this.trustAdapter.getArticleCredibility(article.contentId);
      if (cached) {
        return { ...cached, cached: true };
      }
    }
    
    const text = article.text || '';
    
    // 1. Extract claims from article
    const claims = this.claimExtractor.extract(text);
    
    // 2. Match claims against local fact-check database
    let matchedFactChecks = [];
    if (claims.claims.length > 0 && this.trustAdapter) {
      matchedFactChecks = await this._matchClaimsLocally(claims.claims);
    }
    
    // 3. Optionally query Google Fact Check API
    if ((queryApi || this.useGoogleApi) && this.googleApiKey) {
      const apiMatches = await this._queryGoogleApi(claims.claims.slice(0, 5));
      matchedFactChecks = this._mergeFactCheckResults(matchedFactChecks, apiMatches);
    }
    
    // 4. Get sentiment if analyzer available
    let sentiment = null;
    if (this.sentimentAnalyzer && text) {
      sentiment = this.sentimentAnalyzer.analyze(text);
    }
    
    // 5. Calculate credibility score
    const credibility = this.credibilityScorer.score(article, {
      matchedFactChecks,
      sentiment,
      claims
    });
    
    // 6. Build final result
    const result = {
      contentId: article.contentId,
      host: article.host,
      overallScore: credibility.overallScore,
      badge: credibility.badge,
      source: {
        credibilityScore: credibility.factors.source?.score,
        mbfcRating: credibility.factors.source?.mbfcRating,
        biasLabel: credibility.factors.source?.biasLabel
      },
      claims: {
        total: claims.summary.totalClaims,
        matched: matchedFactChecks.length,
        highConfidence: claims.summary.highConfidence
      },
      matchedFactChecks: matchedFactChecks.slice(0, 10).map(m => ({
        claim: m.factCheck?.claim_text?.substring(0, 150),
        rating: m.factCheck?.rating,
        source: m.factCheck?.source,
        url: m.factCheck?.source_url,
        confidence: m.matchConfidence
      })),
      flags: credibility.flags,
      factors: {
        source: credibility.factors.source?.score,
        factChecks: credibility.factors.factChecks?.score,
        claims: credibility.factors.claims?.score,
        tone: credibility.factors.tone?.score
      },
      analyzedAt: new Date().toISOString(),
      cached: false
    };
    
    // 7. Cache the result
    if (article.contentId && this.trustAdapter) {
      this.trustAdapter.saveArticleCredibility({
        contentId: article.contentId,
        overallScore: result.overallScore,
        matchedFactChecks: JSON.stringify(result.matchedFactChecks),
        sourceScore: result.source.credibilityScore,
        claimCount: result.claims.total
      });
    }
    
    return result;
  }
  
  /**
   * Match claims against local database
   * @private
   */
  async _matchClaimsLocally(claims) {
    if (!this.trustAdapter) {
      return [];
    }
    
    const matches = [];
    
    // Get all fact-checks from database
    const factChecks = this.trustAdapter.getAllFactChecks({ limit: 1000 });
    
    for (const claim of claims) {
      const claimMatches = this.claimExtractor.matchClaim(
        claim.text, 
        factChecks,
        { maxDistance: 5, minKeywordOverlap: 3 }
      );
      
      if (claimMatches.length > 0) {
        matches.push(...claimMatches);
      }
    }
    
    // Deduplicate by fact-check ID
    const seen = new Set();
    return matches.filter(m => {
      const id = m.factCheck?.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  
  /**
   * Query Google Fact Check API
   * @private
   */
  async _queryGoogleApi(claims) {
    if (!this.googleApiKey || claims.length === 0) {
      return [];
    }
    
    const matches = [];
    
    for (const claim of claims) {
      // Check cache
      const cacheKey = claim.text?.substring(0, 100);
      if (this.apiCache.has(cacheKey)) {
        const cached = this.apiCache.get(cacheKey);
        if (Date.now() - cached.timestamp < API_CACHE_TTL_MS) {
          matches.push(...cached.results);
          continue;
        }
      }
      
      try {
        // Query keywords (first 50 chars of claim)
        const query = encodeURIComponent(claim.text?.substring(0, 50) || '');
        const url = `${GOOGLE_FC_API}?query=${query}&key=${this.googleApiKey}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        
        if (!response.ok) {
          this.logger.warn(`[FactCheckService] Google API error: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.claims) {
          const apiMatches = data.claims.map(c => ({
            factCheck: {
              claim_text: c.text,
              rating: c.claimReview?.[0]?.textualRating,
              source: c.claimReview?.[0]?.publisher?.name,
              source_url: c.claimReview?.[0]?.url,
              published_at: c.claimReview?.[0]?.reviewDate
            },
            matchConfidence: 0.6, // Lower confidence for API matches
            source: 'google_api'
          }));
          
          matches.push(...apiMatches);
          
          // Cache results
          this.apiCache.set(cacheKey, {
            timestamp: Date.now(),
            results: apiMatches
          });
        }
      } catch (err) {
        this.logger.error(`[FactCheckService] Google API query failed:`, err.message);
      }
    }
    
    return matches;
  }
  
  /**
   * Merge fact-check results from multiple sources
   * @private
   */
  _mergeFactCheckResults(localMatches, apiMatches) {
    const merged = [...localMatches];
    const seenClaims = new Set(
      localMatches.map(m => m.factCheck?.claim_text?.toLowerCase().substring(0, 50))
    );
    
    for (const apiMatch of apiMatches) {
      const key = apiMatch.factCheck?.claim_text?.toLowerCase().substring(0, 50);
      if (!seenClaims.has(key)) {
        merged.push(apiMatch);
        seenClaims.add(key);
      }
    }
    
    // Sort by confidence
    return merged.sort((a, b) => (b.matchConfidence || 0) - (a.matchConfidence || 0));
  }
  
  /**
   * Analyze article by content ID
   * 
   * @param {number} contentId - Article content ID
   * @param {Object} [options] - Options
   * @returns {Promise<Object>} Credibility analysis
   */
  async analyzeById(contentId, options = {}) {
    if (!this.articlesAdapter) {
      throw new Error('articlesAdapter required for analyzeById');
    }
    
    const article = this.articlesAdapter.getArticleById 
      ? this.articlesAdapter.getArticleById(contentId)
      : this.articlesAdapter.getArticle(contentId);
      
    if (!article) {
      throw new Error(`Article not found: ${contentId}`);
    }
    
    return this.analyzeArticle({
      contentId,
      host: article.host || new URL(article.url).hostname,
      text: article.bodyText || article.body_text || article.content || '',
      title: article.title
    }, options);
  }
  
  /**
   * Get source credibility
   * 
   * @param {string} host - Source hostname
   * @returns {Object} Source credibility data
   */
  getSourceCredibility(host) {
    return this.sourceRater.getSourceCredibility(host);
  }
  
  /**
   * Update source credibility
   * 
   * @param {string} host - Source hostname
   * @param {Object} data - Credibility data
   * @returns {Object} Updated data
   */
  updateSourceCredibility(host, data) {
    return this.sourceRater.updateSource(host, data);
  }
  
  /**
   * Add fact-check to database
   * 
   * @param {Object} factCheck - Fact-check data
   * @param {string} factCheck.claimText - The claim being checked
   * @param {string} factCheck.rating - Rating (true, false, mostly-true, etc.)
   * @param {string} factCheck.source - Fact-checker name
   * @param {string} [factCheck.sourceUrl] - URL to fact-check article
   * @param {string} [factCheck.publishedAt] - Publication date
   * @returns {Object} Saved fact-check with ID
   */
  addFactCheck(factCheck) {
    if (!this.trustAdapter) {
      throw new Error('trustAdapter required for addFactCheck');
    }
    
    const SimHasher = require('../intelligence/analysis/similarity/SimHasher');
    const simHash = SimHasher.toHexString(SimHasher.compute(factCheck.claimText || ''));
    
    return this.trustAdapter.saveFactCheck({
      claimText: factCheck.claimText,
      claimSimhash: simHash,
      rating: factCheck.rating,
      source: factCheck.source,
      sourceUrl: factCheck.sourceUrl,
      publishedAt: factCheck.publishedAt
    });
  }
  
  /**
   * Search fact-checks
   * 
   * @param {string} query - Search query
   * @param {Object} [options] - Options
   * @param {number} [options.limit=20] - Maximum results
   * @returns {Array} Matching fact-checks
   */
  searchFactChecks(query, options = {}) {
    if (!this.trustAdapter) {
      return [];
    }
    
    return this.trustAdapter.searchFactChecks(query, options);
  }
  
  /**
   * Get all sources with credibility ratings
   * 
   * @param {Object} [options] - Filter options
   * @returns {Array} Sources with ratings
   */
  getAllSources(options = {}) {
    return this.sourceRater.getAllSources(options);
  }
  
  /**
   * Invalidate article credibility cache
   * 
   * @param {number} contentId - Article content ID
   * @returns {Object} Result
   */
  invalidateCache(contentId) {
    if (!this.trustAdapter) {
      return { deleted: 0 };
    }
    
    return this.trustAdapter.deleteArticleCredibility(contentId);
  }
  
  /**
   * Clear API cache
   */
  clearApiCache() {
    this.apiCache.clear();
  }
  
  /**
   * Error result for invalid input
   * @private
   */
  _errorResult(message) {
    return {
      overallScore: 50,
      badge: { emoji: '⚠️', label: 'Unknown', level: 'unknown' },
      error: message,
      analyzedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    const stats = {
      hasAdapter: !!this.trustAdapter,
      hasArticlesAdapter: !!this.articlesAdapter,
      hasSentimentAnalyzer: !!this.sentimentAnalyzer,
      useGoogleApi: this.useGoogleApi,
      hasGoogleApiKey: !!this.googleApiKey,
      apiCacheSize: this.apiCache.size,
      sourceRaterStats: this.sourceRater.getStats(),
      claimExtractorStats: this.claimExtractor.getStats(),
      credibilityScorerStats: this.credibilityScorer.getStats()
    };
    
    if (this.trustAdapter) {
      stats.factCheckCount = this.trustAdapter.getFactCheckCount?.() || 0;
      stats.sourceCount = this.trustAdapter.getSourceCount?.() || 0;
    }
    
    return stats;
  }
}

module.exports = { FactCheckService };
