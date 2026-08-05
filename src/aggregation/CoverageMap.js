'use strict';

/**
 * CoverageMap - Generate coverage visualization data for stories
 * 
 * Tracks which sources covered a story and how:
 * - Source list with article metadata
 * - Timeline of coverage
 * - Tone distribution across sources
 * - Geographic coverage (if locations available)
 * 
 * @module CoverageMap
 */

const { PerspectiveAnalyzer } = require('./PerspectiveAnalyzer');
const { FactExtractor } = require('./FactExtractor');

/**
 * CoverageMap class for visualizing multi-source coverage
 */
class CoverageMap {
  /**
   * Create a CoverageMap instance
   * 
   * @param {Object} [options] - Configuration
   * @param {Object} options.topicAdapter - Topic database adapter
   * @param {Object} options.articlesAdapter - Articles adapter
   * @param {Object} options.perspectiveAnalyzer - PerspectiveAnalyzer instance
   * @param {Object} options.factExtractor - FactExtractor instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.topicAdapter = options.topicAdapter;
    this.articlesAdapter = options.articlesAdapter;
    this.perspectiveAnalyzer = options.perspectiveAnalyzer || new PerspectiveAnalyzer(options);
    this.factExtractor = options.factExtractor || new FactExtractor();
    this.logger = options.logger || console;
  }
  
  /**
   * Generate coverage map for a story cluster.
   *
   * Synchronous by design (c204): the adapters are synchronous and the old
   * gratuitous `async` let unawaited rejections escape jest and kill whole
   * batch runs. `await generateCoverageMap(...)` at existing call sites
   * still works — awaiting a plain value is a no-op.
   *
   * @param {number|Object} storyIdOrCluster - Story cluster ID (db-backed
   *   path, needs the topic adapter), or an in-memory cluster object
   *   {storyId, articles: [{id, title, body|bodyText, host, publishedAt}]}
   *   which is analyzed directly, bypassing adapters (c204 designed path).
   * @returns {Object} Coverage map data
   */
  generateCoverageMap(storyIdOrCluster) {
    if (this._isInlineCluster(storyIdOrCluster)) {
      return this._generateInlineCoverageMap(storyIdOrCluster);
    }

    const storyId = storyIdOrCluster;
    if (!this.topicAdapter) {
      throw new Error('TopicAdapter required for generateCoverageMap');
    }

    const cluster = this.topicAdapter.getStoryCluster(storyId);
    if (!cluster) {
      throw new Error(`Story cluster ${storyId} not found`);
    }

    const articleIds = JSON.parse(cluster.article_ids || '[]');

    if (articleIds.length === 0) {
      return this._emptyCoverageMap(storyId, cluster.headline);
    }

    // Get article details
    const articles = this._getArticleDetails(articleIds);

    // Generate source breakdown
    const sources = this._generateSourceBreakdown(articles);

    // Generate timeline
    const timeline = this._generateTimeline(articles);

    // Analyze perspectives if analyzer available
    let perspectives = null;
    if (this.perspectiveAnalyzer) {
      perspectives = this.perspectiveAnalyzer.analyzeCluster({ articleIds });
    }

    // Extract and compare facts
    let factComparison = null;
    if (this.factExtractor && articles.length >= 2) {
      factComparison = this.factExtractor.compareArticles(
        articles.map(a => ({
          id: a.id,
          text: a.bodyText || a.body_text || a.content || '',
          host: a.host || a.domain
        }))
      );
    }
    
    return {
      storyId,
      headline: cluster.headline,
      summary: cluster.summary,
      articleCount: articleIds.length,
      sourceCount: sources.length,
      firstSeen: cluster.first_seen,
      lastUpdated: cluster.last_updated,
      sources,
      timeline,
      perspectives: perspectives ? {
        toneDistribution: perspectives.toneDistribution,
        consensus: perspectives.consensus,
        divergence: perspectives.divergence,
        sharedKeywords: perspectives.sharedKeywords,
        sharedEntities: perspectives.sharedEntities
      } : null,
      factComparison: factComparison ? {
        agreement: factComparison.agreement,
        conflicts: factComparison.conflicts,
        sharedQuotes: factComparison.quotes?.shared?.length || 0,
        sharedStatistics: factComparison.statistics?.shared?.length || 0
      } : null,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * True when the input is an in-memory cluster object rather than a story id.
   * @private
   */
  _isInlineCluster(input) {
    return !!input && typeof input === 'object' && Array.isArray(input.articles);
  }

  /**
   * Normalize an in-memory article to the field names the breakdown/timeline
   * helpers use (same body-field family as FactExtractor.extract, c203).
   * @private
   */
  _normalizeInlineArticle(article) {
    return {
      id: article.id,
      title: article.title,
      host: article.host || article.domain || 'unknown',
      publishedAt: article.publishedAt || article.published_at || article.created_at,
      bodyText: article.body || article.bodyText || article.body_text ||
        article.content || article.text || '',
      wordCount: article.wordCount || article.word_count || 0
    };
  }

  /**
   * Coverage map for an in-memory cluster (c204: the designed offline path —
   * no adapters involved; per-article facts, flat chronological timeline,
   * and a stats summary, as pinned by the suite).
   * @private
   */
  _generateInlineCoverageMap(cluster) {
    const articles = cluster.articles.filter(Boolean).map(a => this._normalizeInlineArticle(a));

    const sources = this._generateSourceBreakdown(articles);

    // Flat chronological timeline (publishedAt strings preserved verbatim)
    const sorted = [...articles].sort((a, b) =>
      new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0));
    const timeline = sorted.map((article, index) => ({
      order: index + 1,
      articleId: article.id,
      title: article.title,
      source: article.host,
      publishedAt: article.publishedAt,
      isFirst: index === 0,
      isLatest: index === sorted.length - 1
    }));

    // Full perspective analysis on the inline articles
    const perspectives = this.perspectiveAnalyzer
      ? this.perspectiveAnalyzer.analyzeCluster(cluster.articles)
      : null;

    // Per-article fact extraction (title + body, extract() normalizes)
    const facts = this.factExtractor
      ? cluster.articles.filter(Boolean).map(a => this.factExtractor.extract(a))
      : [];

    // Summary statistics
    const toneScores = perspectives
      ? perspectives.perspectives.map(p => p.toneScore)
      : [];
    const averageTone = toneScores.length > 0
      ? toneScores.reduce((a, b) => a + b, 0) / toneScores.length
      : 0;
    const toneVariance = toneScores.length > 0
      ? toneScores.reduce((sum, s) => sum + Math.pow(s - averageTone, 2), 0) / toneScores.length
      : 0;

    let timeSpanHours = 0;
    if (timeline.length >= 2) {
      const first = new Date(timeline[0].publishedAt || 0);
      const last = new Date(timeline[timeline.length - 1].publishedAt || 0);
      timeSpanHours = Math.round(((last - first) / (1000 * 60 * 60)) * 100) / 100;
    }

    return {
      storyId: cluster.storyId,
      headline: cluster.headline,
      articleCount: articles.length,
      sourceCount: sources.length,
      sources,
      timeline,
      perspectives,
      facts,
      summary: {
        totalSources: sources.length,
        totalArticles: articles.length,
        timeSpanHours,
        averageTone: Math.round(averageTone * 1000) / 1000,
        toneVariance: Math.round(toneVariance * 1000) / 1000
      },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get article which story an article belongs to
   *
   * @param {number} contentId - Article content ID
   * @returns {Object|null} Story info or null
   */
  getArticleStory(contentId) {
    if (!this.topicAdapter) {
      return null;
    }
    
    // Search through active clusters
    const clusters = this.topicAdapter.getStoryClusters({
      activeOnly: true,
      limit: 1000
    });
    
    for (const cluster of clusters) {
      const articleIds = JSON.parse(cluster.article_ids || '[]');
      if (articleIds.includes(contentId)) {
        return {
          storyId: cluster.id,
          headline: cluster.headline,
          articleCount: cluster.article_count,
          firstSeen: cluster.first_seen,
          lastUpdated: cluster.last_updated
        };
      }
    }
    
    return null;
  }
  
  /**
   * Get full coverage analysis for a story
   * Combines coverage map with detailed perspective and fact analysis
   *
   * Synchronous by design (c204) — see generateCoverageMap.
   *
   * @param {number|Object} storyIdOrCluster - Story cluster ID, or an
   *   in-memory cluster object {storyId, articles} (c204 designed path)
   * @returns {Object} Full coverage analysis
   */
  getFullCoverageAnalysis(storyIdOrCluster) {
    if (this._isInlineCluster(storyIdOrCluster)) {
      return this._getInlineCoverageAnalysis(storyIdOrCluster);
    }

    const storyId = storyIdOrCluster;
    const coverageMap = this.generateCoverageMap(storyId);

    if (!coverageMap || coverageMap.articleCount === 0) {
      return coverageMap;
    }

    // Get cluster for article IDs
    const cluster = this.topicAdapter.getStoryCluster(storyId);
    const articleIds = JSON.parse(cluster.article_ids || '[]');

    // Get detailed perspective analysis
    let detailedPerspectives = null;
    if (this.perspectiveAnalyzer && articleIds.length >= 2) {
      detailedPerspectives = this.perspectiveAnalyzer.analyzeCluster({ articleIds });
    }

    // Get detailed fact comparison
    let detailedFacts = null;
    if (this.factExtractor && articleIds.length >= 2) {
      const articles = this._getArticleDetails(articleIds);
      detailedFacts = this.factExtractor.compareArticles(
        articles.map(a => ({
          id: a.id,
          text: a.bodyText || a.body_text || a.content || '',
          host: a.host || a.domain
        }))
      );
    }

    return {
      ...coverageMap,
      detailedPerspectives,
      detailedFacts
    };
  }

  /**
   * Full coverage analysis for an in-memory cluster (c204 designed path):
   * coverage map plus pairwise perspective comparisons, cross-article fact
   * comparison, and an overall assessment.
   * @private
   */
  _getInlineCoverageAnalysis(cluster) {
    const coverageMap = this._generateInlineCoverageMap(cluster);

    // Compare every pair of perspectives — C(n,2) comparisons
    const perspectiveList = coverageMap.perspectives
      ? coverageMap.perspectives.perspectives
      : [];
    const perspectiveComparisons = [];
    if (this.perspectiveAnalyzer) {
      for (let i = 0; i < perspectiveList.length; i++) {
        for (let j = i + 1; j < perspectiveList.length; j++) {
          perspectiveComparisons.push(
            this.perspectiveAnalyzer.comparePerspectives(perspectiveList[i], perspectiveList[j])
          );
        }
      }
    }

    // Cross-article fact comparison (body text, as at the db call sites)
    const inlineArticles = cluster.articles.filter(Boolean);
    const factComparisons = this.factExtractor && inlineArticles.length >= 2
      ? this.factExtractor.compareArticles(
          inlineArticles.map(a => ({
            id: a.id,
            text: a.body || a.bodyText || a.body_text || a.content || a.text || '',
            host: a.host || a.domain
          }))
        )
      : null;

    return {
      storyId: cluster.storyId,
      coverageMap,
      perspectiveComparisons,
      factComparisons,
      overallAssessment: this._assessInlineCoverage(coverageMap, factComparisons)
    };
  }

  /**
   * Overall assessment for an in-memory cluster analysis.
   * @private
   */
  _assessInlineCoverage(coverageMap, factComparisons) {
    const perspectiveList = coverageMap.perspectives
      ? coverageMap.perspectives.perspectives
      : [];
    const distinctTones = new Set(perspectiveList.map(p => p.tone)).size;
    const factualConsistency = factComparisons && factComparisons.agreement
      ? factComparisons.agreement.score
      : null;

    return {
      // How many independent sources covered the story
      coverageBreadth: coverageMap.sources.length,
      // How many distinct tone labels appear across sources (1..3)
      perspectiveDiversity: distinctTones,
      // Cross-source fact agreement score (0..1), null when <2 articles
      factualConsistency,
      // Confidence grows with independent sources; capped at 1
      confidence: Math.round(Math.min(1, coverageMap.sources.length / 4) * 100) / 100
    };
  }
  
  /**
   * Get article details
   * @private
   */
  _getArticleDetails(articleIds) {
    if (!this.articlesAdapter) {
      return [];
    }
    
    const articles = [];
    for (const id of articleIds) {
      const article = this.articlesAdapter.getArticle 
        ? this.articlesAdapter.getArticle(id)
        : this.articlesAdapter.getArticleById(id);
      
      if (article) {
        articles.push({
          id,
          title: article.title,
          url: article.url,
          host: article.domain || article.host,
          publishedAt: article.published_at || article.publishedAt || article.created_at,
          bodyText: article.body_text || article.bodyText || article.content,
          wordCount: article.word_count || article.wordCount
        });
      }
    }
    
    return articles;
  }
  
  /**
   * Generate source breakdown
   * @private
   */
  _generateSourceBreakdown(articles) {
    const byHost = new Map();
    
    for (const article of articles) {
      const host = article.host || 'unknown';
      
      if (!byHost.has(host)) {
        byHost.set(host, {
          host,
          articles: [],
          articleCount: 0,
          firstPublished: null,
          lastPublished: null,
          totalWordCount: 0
        });
      }
      
      const source = byHost.get(host);
      source.articles.push({
        id: article.id,
        title: article.title,
        publishedAt: article.publishedAt,
        wordCount: article.wordCount || 0
      });
      source.articleCount++;
      source.totalWordCount += article.wordCount || 0;
      
      const pubDate = new Date(article.publishedAt);
      if (!source.firstPublished || pubDate < new Date(source.firstPublished)) {
        source.firstPublished = article.publishedAt;
      }
      if (!source.lastPublished || pubDate > new Date(source.lastPublished)) {
        source.lastPublished = article.publishedAt;
      }
    }
    
    // Sort by article count
    return [...byHost.values()]
      .sort((a, b) => b.articleCount - a.articleCount)
      .map(source => ({
        host: source.host,
        articleCount: source.articleCount,
        firstPublished: source.firstPublished,
        lastPublished: source.lastPublished,
        avgWordCount: Math.round(source.totalWordCount / source.articleCount),
        articles: source.articles.map(a => ({
          id: a.id,
          title: a.title,
          publishedAt: a.publishedAt
        }))
      }));
  }
  
  /**
   * Generate timeline of coverage
   * @private
   */
  _generateTimeline(articles) {
    // Sort articles by publication date
    const sorted = [...articles].sort((a, b) => {
      const dateA = new Date(a.publishedAt || 0);
      const dateB = new Date(b.publishedAt || 0);
      return dateA - dateB;
    });
    
    // Create timeline events
    const events = sorted.map((article, index) => ({
      order: index + 1,
      articleId: article.id,
      title: article.title,
      source: article.host,
      publishedAt: article.publishedAt,
      isFirst: index === 0,
      isLatest: index === sorted.length - 1
    }));
    
    // Calculate time spans
    let firstToLast = null;
    let avgGap = null;
    
    if (events.length >= 2) {
      const first = new Date(events[0].publishedAt);
      const last = new Date(events[events.length - 1].publishedAt);
      firstToLast = {
        hours: Math.round((last - first) / (1000 * 60 * 60)),
        firstSource: events[0].source,
        lastSource: events[events.length - 1].source
      };
      
      // Calculate average gap between articles
      let totalGap = 0;
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].publishedAt);
        const curr = new Date(events[i].publishedAt);
        totalGap += (curr - prev);
      }
      avgGap = Math.round(totalGap / (events.length - 1) / (1000 * 60)); // in minutes
    }
    
    // Group by hour for visualization
    const byHour = new Map();
    for (const event of events) {
      const hour = new Date(event.publishedAt);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();
      
      if (!byHour.has(hourKey)) {
        byHour.set(hourKey, []);
      }
      byHour.get(hourKey).push(event);
    }
    
    const hourlyBreakdown = [...byHour.entries()]
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .map(([hour, hourEvents]) => ({
        hour,
        count: hourEvents.length,
        sources: [...new Set(hourEvents.map(e => e.source))]
      }));
    
    return {
      events,
      span: firstToLast,
      avgGapMinutes: avgGap,
      hourlyBreakdown,
      peakHour: hourlyBreakdown.length > 0 
        ? hourlyBreakdown.reduce((max, curr) => curr.count > max.count ? curr : max)
        : null
    };
  }
  
  /**
   * Empty coverage map for empty clusters
   * @private
   */
  _emptyCoverageMap(storyId, headline) {
    return {
      storyId,
      headline,
      articleCount: 0,
      sourceCount: 0,
      sources: [],
      timeline: { events: [], span: null, hourlyBreakdown: [] },
      perspectives: null,
      factComparison: null,
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Get coverage statistics across all stories
   * 
   * @param {Object} [options] - Options
   * @param {number} [options.limit=20] - Max stories to analyze
   * @returns {Object} Coverage statistics
   */
  getCoverageStats(options = {}) {
    const { limit = 20 } = options;

    if (!this.topicAdapter) {
      return { error: 'TopicAdapter required' };
    }

    const clusters = this.topicAdapter.getStoryClusters({
      activeOnly: true,
      limit
    });

    let totalSources = 0;
    let totalArticles = 0;
    let multiSourceStories = 0;
    const sourceFrequency = new Map();

    for (const cluster of clusters) {
      const articleIds = JSON.parse(cluster.article_ids || '[]');
      totalArticles += articleIds.length;

      const articles = this._getArticleDetails(articleIds);
      const sources = new Set(articles.map(a => a.host));
      
      totalSources += sources.size;
      if (sources.size >= 2) {
        multiSourceStories++;
      }
      
      for (const source of sources) {
        sourceFrequency.set(source, (sourceFrequency.get(source) || 0) + 1);
      }
    }
    
    const topSources = [...sourceFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, storyCount: count }));
    
    return {
      storiesAnalyzed: clusters.length,
      totalArticles,
      avgSourcesPerStory: clusters.length > 0 
        ? Math.round((totalSources / clusters.length) * 10) / 10 
        : 0,
      multiSourceStories,
      multiSourcePct: clusters.length > 0 
        ? Math.round((multiSourceStories / clusters.length) * 100) 
        : 0,
      topSources
    };
  }
  
  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      hasTopicAdapter: !!this.topicAdapter,
      hasArticlesAdapter: !!this.articlesAdapter,
      hasPerspectiveAnalyzer: !!this.perspectiveAnalyzer,
      hasFactExtractor: !!this.factExtractor,
      // c204: nested component stats (pinned by the suite)
      perspectiveAnalyzer: this.perspectiveAnalyzer ? this.perspectiveAnalyzer.getStats() : null,
      factExtractor: this.factExtractor ? this.factExtractor.getStats() : null
    };
  }
}

module.exports = {
  CoverageMap
};
