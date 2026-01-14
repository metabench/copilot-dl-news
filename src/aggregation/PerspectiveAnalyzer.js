'use strict';

/**
 * PerspectiveAnalyzer - Analyze different perspectives across sources
 * 
 * Identifies how different sources cover the same story:
 * - Tone: critical / neutral / supportive (via sentiment analysis)
 * - Focus: what keywords are emphasized differently
 * - Entity coverage: which entities are prominent in each source
 * 
 * Uses existing:
 * - SentimentAnalyzer for tone analysis
 * - KeywordExtractor for focus analysis
 * - EntityRecognizer for entity coverage
 * 
 * @module PerspectiveAnalyzer
 */

const { SentimentAnalyzer } = require('../intelligence/analysis/sentiment/SentimentAnalyzer');

// Tone thresholds
const TONE_THRESHOLDS = {
  critical: -0.3,
  supportive: 0.3
};

/**
 * PerspectiveAnalyzer class for cross-source perspective comparison
 */
class PerspectiveAnalyzer {
  /**
   * Create a PerspectiveAnalyzer instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} options.sentimentAnalyzer - SentimentAnalyzer instance
   * @param {Object} options.tagAdapter - Tag adapter for entities/keywords
   * @param {Object} options.articlesAdapter - Articles adapter for content
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.sentimentAnalyzer = options.sentimentAnalyzer || new SentimentAnalyzer();
    this.tagAdapter = options.tagAdapter;
    this.articlesAdapter = options.articlesAdapter;
    this.logger = options.logger || console;
  }
  
  /**
   * Analyze perspective for a single article
   * 
   * @param {Object} article - Article to analyze
   * @param {number} article.id - Content ID
   * @param {string} article.title - Article title
   * @param {string} article.text - Article body text
   * @param {string} [article.host] - Source host/domain
   * @returns {Object} Perspective analysis
   */
  analyzeArticle(article) {
    const { id: contentId, title, text, host } = article;
    
    // Analyze tone using sentiment
    const tone = this._analyzeTone(title, text);
    
    // Get focus keywords
    const focusKeywords = this._extractFocusKeywords(contentId, text);
    
    // Get prominent entities
    const prominentEntities = this._getProminentEntities(contentId, text);
    
    return {
      articleId: contentId,
      host,
      tone: tone.label,
      toneScore: tone.score,
      toneConfidence: tone.confidence,
      focusKeywords,
      prominentEntities,
      analyzedAt: new Date().toISOString()
    };
  }
  
  /**
   * Analyze perspectives for all articles in a story cluster
   * 
   * @param {Object} options - Options
   * @param {number[]} options.articleIds - Article IDs in the cluster
   * @returns {Object} Cluster perspective analysis
   */
  async analyzeCluster(options) {
    const { articleIds } = options;
    
    const perspectives = [];
    const allFocusKeywords = new Map();
    const allEntities = new Map();
    const tonesBySource = new Map();
    
    for (const contentId of articleIds) {
      // Get article content
      let article = null;
      if (this.articlesAdapter) {
        article = this.articlesAdapter.getArticle 
          ? this.articlesAdapter.getArticle(contentId)
          : this.articlesAdapter.getArticleById(contentId);
      }
      
      if (!article) continue;
      
      const perspective = this.analyzeArticle({
        id: contentId,
        title: article.title,
        text: article.body_text || article.bodyText || article.content || '',
        host: article.domain || article.host
      });
      
      perspectives.push(perspective);
      
      // Aggregate focus keywords
      for (const kw of perspective.focusKeywords) {
        const count = allFocusKeywords.get(kw) || 0;
        allFocusKeywords.set(kw, count + 1);
      }
      
      // Aggregate entities
      for (const entity of perspective.prominentEntities) {
        const key = entity.text.toLowerCase();
        if (!allEntities.has(key)) {
          allEntities.set(key, { ...entity, sources: [perspective.host], count: 1 });
        } else {
          const existing = allEntities.get(key);
          existing.count++;
          if (!existing.sources.includes(perspective.host)) {
            existing.sources.push(perspective.host);
          }
        }
      }
      
      // Track tones by source
      if (perspective.host) {
        const existing = tonesBySource.get(perspective.host) || [];
        existing.push(perspective.toneScore);
        tonesBySource.set(perspective.host, existing);
      }
    }
    
    // Calculate tone distribution
    const toneDistribution = this._calculateToneDistribution(perspectives);
    
    // Find consensus and divergence
    const consensus = this._findConsensus(perspectives);
    const divergence = this._findDivergence(perspectives);
    
    // Identify unique focus areas per source
    const uniqueFocus = this._identifyUniqueFocus(perspectives, allFocusKeywords);
    
    return {
      articleCount: perspectives.length,
      perspectives,
      toneDistribution,
      consensus,
      divergence,
      uniqueFocus,
      sharedKeywords: this._getSharedKeywords(allFocusKeywords),
      sharedEntities: Array.from(allEntities.values())
        .filter(e => e.count >= 2)
        .sort((a, b) => b.count - a.count)
    };
  }
  
  /**
   * Compare perspectives between two specific articles
   * 
   * @param {Object} article1 - First article
   * @param {Object} article2 - Second article
   * @returns {Object} Comparison result
   */
  comparePerspectives(article1, article2) {
    const p1 = this.analyzeArticle(article1);
    const p2 = this.analyzeArticle(article2);
    
    // Calculate keyword overlap
    const keywords1 = new Set(p1.focusKeywords);
    const keywords2 = new Set(p2.focusKeywords);
    const sharedKeywords = [...keywords1].filter(k => keywords2.has(k));
    const uniqueToSource1 = [...keywords1].filter(k => !keywords2.has(k));
    const uniqueToSource2 = [...keywords2].filter(k => !keywords1.has(k));
    
    // Calculate entity overlap
    const entities1 = new Set(p1.prominentEntities.map(e => e.text.toLowerCase()));
    const entities2 = new Set(p2.prominentEntities.map(e => e.text.toLowerCase()));
    const sharedEntities = [...entities1].filter(e => entities2.has(e));
    
    // Tone difference
    const toneDifference = Math.abs(p1.toneScore - p2.toneScore);
    const toneAgreement = toneDifference < 0.2 ? 'high' : toneDifference < 0.5 ? 'moderate' : 'low';
    
    return {
      source1: {
        host: p1.host,
        tone: p1.tone,
        toneScore: p1.toneScore
      },
      source2: {
        host: p2.host,
        tone: p2.tone,
        toneScore: p2.toneScore
      },
      comparison: {
        toneAgreement,
        toneDifference,
        sharedKeywords,
        uniqueToSource1,
        uniqueToSource2,
        sharedEntities,
        keywordOverlap: sharedKeywords.length / Math.max(keywords1.size, keywords2.size, 1)
      }
    };
  }
  
  /**
   * Analyze tone using sentiment
   * @private
   */
  _analyzeTone(title, text) {
    const fullText = `${title || ''}\n\n${text || ''}`;
    const sentiment = this.sentimentAnalyzer.analyze(fullText);
    
    let label = 'neutral';
    if (sentiment.overallScore < TONE_THRESHOLDS.critical) {
      label = 'critical';
    } else if (sentiment.overallScore > TONE_THRESHOLDS.supportive) {
      label = 'supportive';
    }
    
    return {
      label,
      score: sentiment.overallScore,
      confidence: sentiment.confidence
    };
  }
  
  /**
   * Extract focus keywords
   * @private
   */
  _extractFocusKeywords(contentId, text) {
    // Try to get from database first
    if (this.tagAdapter && contentId) {
      try {
        const keywords = this.tagAdapter.getKeywords 
          ? this.tagAdapter.getKeywords(contentId)
          : null;
        
        if (keywords && keywords.length > 0) {
          return keywords
            .slice(0, 5)
            .map(k => k.keyword || k.text || k);
        }
      } catch (err) {
        // Fall through to text extraction
      }
    }
    
    // Simple keyword extraction from text
    return this._simpleKeywordExtraction(text).slice(0, 5);
  }
  
  /**
   * Simple keyword extraction (TF-based)
   * @private
   */
  _simpleKeywordExtraction(text) {
    if (!text) return [];
    
    const STOPWORDS = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
      'that', 'these', 'those', 'it', 'its', 'they', 'their', 'he', 'she',
      'him', 'her', 'we', 'our', 'you', 'your', 'said', 'says', 'told'
    ]);
    
    // Tokenize and count
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w));
    
    const counts = new Map();
    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    
    // Sort by frequency
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }
  
  /**
   * Get prominent entities
   * @private
   */
  _getProminentEntities(contentId, text) {
    // Try to get from database first
    if (this.tagAdapter && contentId) {
      try {
        const entities = this.tagAdapter.getEntities(contentId);
        
        if (entities && entities.length > 0) {
          return entities
            .slice(0, 5)
            .map(e => ({
              text: e.entity_text || e.text,
              type: e.entity_type || e.type
            }));
        }
      } catch (err) {
        // Fall through
      }
    }
    
    return [];
  }
  
  /**
   * Calculate tone distribution across perspectives
   * @private
   */
  _calculateToneDistribution(perspectives) {
    let critical = 0;
    let neutral = 0;
    let supportive = 0;
    
    for (const p of perspectives) {
      switch (p.tone) {
        case 'critical': critical++; break;
        case 'supportive': supportive++; break;
        default: neutral++;
      }
    }
    
    const total = perspectives.length || 1;
    
    return {
      critical: Math.round((critical / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      supportive: Math.round((supportive / total) * 100)
    };
  }
  
  /**
   * Find areas of consensus
   * @private
   */
  _findConsensus(perspectives) {
    if (perspectives.length < 2) {
      return { toneConsensus: 'insufficient_data', keywordConsensus: [] };
    }
    
    // Check tone consensus
    const tones = perspectives.map(p => p.tone);
    const toneMode = this._mode(tones);
    const toneAgreement = tones.filter(t => t === toneMode).length / tones.length;
    
    // Find keywords mentioned by majority
    const keywordCounts = new Map();
    for (const p of perspectives) {
      for (const kw of p.focusKeywords) {
        keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
      }
    }
    
    const majorityThreshold = perspectives.length / 2;
    const consensusKeywords = [...keywordCounts.entries()]
      .filter(([, count]) => count >= majorityThreshold)
      .map(([kw]) => kw);
    
    return {
      toneConsensus: toneAgreement >= 0.6 ? toneMode : 'mixed',
      toneAgreementPct: Math.round(toneAgreement * 100),
      keywordConsensus: consensusKeywords
    };
  }
  
  /**
   * Find areas of divergence
   * @private
   */
  _findDivergence(perspectives) {
    if (perspectives.length < 2) {
      return { toneDivergence: false, focusDivergence: [] };
    }
    
    // Check for tone divergence (both critical and supportive present)
    const tones = new Set(perspectives.map(p => p.tone));
    const toneDivergence = tones.has('critical') && tones.has('supportive');
    
    // Find outlier perspectives (tone differs from majority)
    const toneMode = this._mode(perspectives.map(p => p.tone));
    const outliers = perspectives
      .filter(p => p.tone !== toneMode)
      .map(p => ({
        host: p.host,
        tone: p.tone,
        toneScore: p.toneScore
      }));
    
    return {
      toneDivergence,
      outlierSources: outliers,
      divergenceLevel: toneDivergence ? 'high' : outliers.length > 0 ? 'moderate' : 'low'
    };
  }
  
  /**
   * Identify unique focus areas per source
   * @private
   */
  _identifyUniqueFocus(perspectives, allKeywordCounts) {
    const uniqueFocus = [];
    
    for (const p of perspectives) {
      // Find keywords unique to this source (only mentioned once across cluster)
      const unique = p.focusKeywords.filter(kw => allKeywordCounts.get(kw) === 1);
      
      if (unique.length > 0) {
        uniqueFocus.push({
          host: p.host,
          articleId: p.articleId,
          uniqueKeywords: unique
        });
      }
    }
    
    return uniqueFocus;
  }
  
  /**
   * Get shared keywords (mentioned by multiple sources)
   * @private
   */
  _getSharedKeywords(keywordCounts) {
    return [...keywordCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([keyword, count]) => ({ keyword, sourceCount: count }));
  }
  
  /**
   * Calculate mode of array
   * @private
   */
  _mode(arr) {
    const counts = new Map();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    
    let mode = null;
    let maxCount = 0;
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        mode = item;
      }
    }
    
    return mode;
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      toneThresholds: TONE_THRESHOLDS,
      hasSentimentAnalyzer: !!this.sentimentAnalyzer,
      hasTagAdapter: !!this.tagAdapter,
      hasArticlesAdapter: !!this.articlesAdapter
    };
  }
}

module.exports = {
  PerspectiveAnalyzer,
  TONE_THRESHOLDS
};
