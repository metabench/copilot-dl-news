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
   * @param {Object} [options.toneThresholds] - Custom critical/supportive cutoffs
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.sentimentAnalyzer = options.sentimentAnalyzer || new SentimentAnalyzer();
    this.tagAdapter = options.tagAdapter;
    this.articlesAdapter = options.articlesAdapter;
    this.logger = options.logger || console;
    // c204: instance-level thresholds (the designed API the suite pins) so
    // callers can tune where critical/supportive cut over.
    this.toneThresholds = options.toneThresholds || { ...TONE_THRESHOLDS };
  }
  
  /**
   * Analyze perspective for a single article
   * 
   * @param {Object} article - Article to analyze
   * @param {number} article.id - Content ID
   * @param {string} article.title - Article title
   * @param {string} [article.text] - Article body (body/bodyText/body_text/content accepted too)
   * @param {string} [article.host] - Source host/domain
   * @returns {Object} Perspective analysis
   */
  analyzeArticle(article) {
    const { id: contentId, title, host } = article;
    // c204: accept the same body-field family FactExtractor.extract() takes —
    // in-memory callers pass body, db flows pass text/body_text.
    const text = article.text || article.body || article.bodyText ||
      article.body_text || article.content || '';

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
   * Analyze perspectives for all articles in a story cluster.
   *
   * Synchronous by design (c204): the adapters are synchronous and the old
   * gratuitous `async` let unawaited rejections escape jest and kill whole
   * batch runs. `await analyzeCluster(...)` at existing call sites still
   * works — awaiting a plain value is a no-op.
   *
   * @param {Object|Array<Object>} input - Either an array of in-memory
   *   article objects ({id, title, body|text, host}), or an options object
   *   with {articles} (same in-memory shape) or {articleIds} (loaded via
   *   the articles adapter — the db-backed path CoverageMap uses).
   * @returns {Object} Cluster perspective analysis
   */
  analyzeCluster(input) {
    // c204: designed in-memory path — accept inline article arrays,
    // bypassing adapters (FactExtractor precedent).
    const options = Array.isArray(input) ? { articles: input } : (input || {});
    const { articleIds } = options;

    const articles = [];
    if (Array.isArray(options.articles)) {
      articles.push(...options.articles.filter(Boolean));
    } else if (Array.isArray(articleIds)) {
      for (const contentId of articleIds) {
        let article = null;
        if (this.articlesAdapter) {
          article = this.articlesAdapter.getArticle
            ? this.articlesAdapter.getArticle(contentId)
            : this.articlesAdapter.getArticleById(contentId);
        }

        if (!article) continue;

        articles.push({
          id: contentId,
          title: article.title,
          text: article.body_text || article.bodyText || article.content || '',
          host: article.domain || article.host
        });
      }
    }

    const perspectives = [];
    const allFocusKeywords = new Map();
    const allEntities = new Map();

    for (const article of articles) {
      const perspective = this.analyzeArticle(article);

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
    }

    // Calculate tone distribution
    const toneDistribution = this._calculateToneDistribution(perspectives);
    
    // Find consensus and divergence
    const consensus = this._findConsensus(perspectives);
    const divergence = this._findDivergence(perspectives);
    
    // Identify unique focus areas per source
    const uniqueFocus = this._identifyUniqueFocus(perspectives, allFocusKeywords);

    const toneScores = perspectives.map(p => p.toneScore);
    const averageToneScore = toneScores.length > 0
      ? toneScores.reduce((a, b) => a + b, 0) / toneScores.length
      : 0;

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
        .sort((a, b) => b.count - a.count),
      // c204: designed roll-up block (pinned by the suite); additive, so the
      // CoverageMap consumers of the flat fields above are unaffected.
      summary: {
        totalArticles: perspectives.length,
        uniqueHosts: new Set(perspectives.map(p => p.host).filter(Boolean)).size,
        averageToneScore: Math.round(averageToneScore * 1000) / 1000,
        toneDistribution
      }
    };
  }
  
  /**
   * Compare two perspectives.
   *
   * c204: the designed contract (pinned by the suite) — inputs are the
   * OUTPUT of analyzeArticle ({tone, toneScore, focusKeywords,
   * prominentEntities, ...}) and the result is flat. Article-shaped inputs
   * are analyzed first, so callers holding raw articles can pass those too.
   *
   * @param {Object} first - Perspective (or article to analyze)
   * @param {Object} second - Perspective (or article to analyze)
   * @returns {Object} Flat comparison result
   */
  comparePerspectives(first, second) {
    const p1 = this._toPerspective(first);
    const p2 = this._toPerspective(second);

    // Calculate keyword overlap
    const keywords1 = new Set(p1.focusKeywords || []);
    const keywords2 = new Set(p2.focusKeywords || []);
    const sharedKeywords = [...keywords1].filter(k => keywords2.has(k));

    // Calculate entity overlap
    const entities1 = new Set((p1.prominentEntities || []).map(e => e.text.toLowerCase()));
    const entities2 = new Set((p2.prominentEntities || []).map(e => e.text.toLowerCase()));
    const sharedEntities = [...entities1].filter(e => entities2.has(e));

    return {
      article1: { articleId: p1.articleId, host: p1.host, tone: p1.tone, toneScore: p1.toneScore },
      article2: { articleId: p2.articleId, host: p2.host, tone: p2.tone, toneScore: p2.toneScore },
      toneAgreement: p1.tone === p2.tone,
      toneDifference: Math.abs((p1.toneScore || 0) - (p2.toneScore || 0)),
      sharedKeywords,
      uniqueKeywords: {
        article1: [...keywords1].filter(k => !keywords2.has(k)),
        article2: [...keywords2].filter(k => !keywords1.has(k))
      },
      sharedEntities,
      keywordOverlap: sharedKeywords.length / Math.max(keywords1.size, keywords2.size, 1)
    };
  }

  /**
   * Coerce an input into a perspective: pass analyzeArticle output through,
   * analyze anything article-shaped.
   * @private
   */
  _toPerspective(input) {
    if (input && typeof input === 'object' &&
        typeof input.toneScore === 'number' && Array.isArray(input.focusKeywords)) {
      return input;
    }
    return this.analyzeArticle(input || {});
  }
  
  /**
   * Analyze tone using sentiment
   * @private
   */
  _analyzeTone(title, text) {
    const fullText = `${title || ''}\n\n${text || ''}`;
    const sentiment = this.sentimentAnalyzer.analyze(fullText);

    return {
      label: this._getToneFromScore(sentiment.overallScore),
      score: sentiment.overallScore,
      confidence: sentiment.confidence
    };
  }

  /**
   * Classify a sentiment score into a tone label using this analyzer's
   * thresholds. Boundary values are neutral (strict comparison).
   *
   * @param {number} score - Sentiment score in [-1, 1]
   * @returns {string} 'critical' | 'neutral' | 'supportive'
   */
  _getToneFromScore(score) {
    if (score < this.toneThresholds.critical) {
      return 'critical';
    }
    if (score > this.toneThresholds.supportive) {
      return 'supportive';
    }
    return 'neutral';
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
    return this._extractKeywords(text, 5);
  }

  /**
   * TF-based keyword extraction from raw text (c204: promoted from the old
   * _simpleKeywordExtraction to the designed name, with a limit parameter).
   *
   * @param {string} text - Text to extract from
   * @param {number} [limit=10] - Max keywords to return
   * @returns {string[]} Keywords, most frequent first
   */
  _extractKeywords(text, limit = 10) {
    if (!text) return [];

    const STOPWORDS = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
      'that', 'these', 'those', 'it', 'its', 'they', 'their', 'he', 'she',
      'him', 'her', 'we', 'our', 'you', 'your', 'said', 'says', 'told',
      // c204: function words the >3-char filter let through
      'over', 'under', 'into', 'onto', 'upon', 'about', 'above', 'below',
      'between', 'through', 'during', 'while', 'than', 'then', 'them',
      'when', 'where', 'which', 'what', 'there', 'here', 'also', 'more',
      'most', 'some', 'such', 'very', 'just'
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
      .slice(0, limit)
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
   * Rank an in-memory entity list by prominence (c204: the designed offline
   * companion to _getProminentEntities, which needs the tag adapter).
   * Prominence = mention count first, then earliest position.
   *
   * @param {Array<{text: string, type: string, start: number}>} entities
   * @param {number} [limit=10] - Max entities to return
   * @returns {Array<{text, type, count, firstPosition}>}
   */
  _findProminentEntities(entities, limit = 10) {
    if (!Array.isArray(entities) || entities.length === 0) return [];

    const byText = new Map();
    for (const entity of entities) {
      if (!entity || !entity.text) continue;
      const key = entity.text.toLowerCase();
      const start = Number.isFinite(entity.start) ? entity.start : Infinity;
      const existing = byText.get(key);
      if (existing) {
        existing.count++;
        existing.firstPosition = Math.min(existing.firstPosition, start);
      } else {
        byText.set(key, {
          text: entity.text,
          type: entity.type,
          count: 1,
          firstPosition: start
        });
      }
    }

    return [...byText.values()]
      .sort((a, b) => b.count - a.count || a.firstPosition - b.firstPosition)
      .slice(0, limit);
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
      toneThresholds: this.toneThresholds,
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
