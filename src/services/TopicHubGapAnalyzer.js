'use strict';

const { HubGapAnalyzerBase } = require('./HubGapAnalyzerBase');
const { slugify } = require('../tools/slugify');

/**
 * TopicHubGapAnalyzer - URL prediction for topic hubs
 *
 * Generates candidate URLs for topic-based hubs like:
 * - /sport, /politics, /culture
 * - /news/politics, /section/opinion
 *
 * Uses topic_keywords table for entity list and DSPL patterns.
 */
class TopicHubGapAnalyzer extends HubGapAnalyzerBase {
  constructor({ db, logger, dsplDir } = {}) {
    super({ db, logger, dsplDir });
    this.topicCache = null;
    this.cacheExpiry = 0;
    this.cacheDurationMs = 60000; // 1 minute
  }

  /**
   * Topic label for DSPL lookups and logging
   */
  getEntityLabel() {
    return 'topic';
  }

  /**
   * Fallback patterns for topic hubs
   */
  getFallbackPatterns() {
    return [
      '/{slug}',                    // /sport, /politics
      '/news/{slug}',               // /news/politics
      '/{slug}-news',               // /sport-news
      '/section/{slug}',            // /section/opinion
      '/topics/{slug}',             // /topics/technology
      '/{category}/{slug}',         // /lifestyle/culture
      '/world/{slug}',              // /world/politics (topic-only, not place)
      '/{slug}/all'                 // /sport/all
    ];
  }

  /**
   * Build metadata for pattern substitution
   */
  buildEntityMetadata(topic) {
    if (!topic || !topic.slug) return null;

    return {
      slug: topic.slug,
      name: topic.name || topic.slug,
      category: topic.category || 'general',
      lang: topic.lang || 'en'
    };
  }

  /**
   * Get top topics by importance/frequency
   * @param {number} limit - Maximum topics to return
   * @returns {Array<Object>} Topic entities
   */
  getTopTopics(limit = 20) {
    const now = Date.now();
    if (this.topicCache && now < this.cacheExpiry) {
      return this.topicCache.slice(0, limit);
    }

    // Load from topic_keywords table (English topics)
    const rows = this.db.prepare(`
      SELECT DISTINCT term AS name, lang
      FROM topic_keywords
      WHERE lang = 'en'
      ORDER BY term
    `).all();

    // Augment with hardcoded categories for common topics
    const categoryMap = {
      'sport': 'news',
      'sports': 'news',
      'politics': 'news',
      'business': 'news',
      'technology': 'news',
      'science': 'news',
      'health': 'lifestyle',
      'culture': 'lifestyle',
      'opinion': 'opinion',
      'commentisfree': 'opinion',
      'lifestyle': 'lifestyle',
      'lifeandstyle': 'lifestyle',
      'environment': 'news',
      'education': 'news',
      'media': 'news',
      'society': 'news',
      'law': 'news',
      'scotland': 'regional',
      'world': 'news',
      'uk-news': 'news',
      'us-news': 'news',
      'australia-news': 'news'
    };

    const topics = rows.map(row => {
      const slug = slugify(row.name);
      return {
        name: row.name,
        slug,
        category: categoryMap[slug] || 'general',
        lang: row.lang || 'en'
      };
    });

    this.topicCache = topics;
    this.cacheExpiry = now + this.cacheDurationMs;

    return topics.slice(0, limit);
  }

  /**
   * Predict topic hub URLs for a domain
   * @param {string} domain - Target domain
   * @param {Object} topic - Topic entity
   * @returns {Array<Object>} Predictions with { url, confidence, source, ... }
   */
  predictTopicHubUrls(domain, topic) {
    if (!domain || !topic) return [];

    const baseUrls = this.predictHubUrls(domain, topic);

    // Convert to prediction objects with metadata
    return baseUrls.map(url => ({
      url,
      confidence: 0.7, // Lower than place hubs (less reliable)
      source: 'topic-analyzer',
      topic: {
        slug: topic.slug,
        name: topic.name,
        category: topic.category
      }
    }));
  }
}

module.exports = { TopicHubGapAnalyzer };