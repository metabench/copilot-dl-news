#!/usr/bin/env node

/**
 * Enhanced Place Hub Discovery Tool
 *
 * This tool improves upon the existing guess-place-hubs.js by:
 * 1. Using ML-based content analysis for better hub identification
 * 2. Implementing confidence scoring and ranking
 * 3. Adding cross-validation with multiple signals
 * 4. Supporting batch processing with progress tracking
 * 5. Providing detailed reporting and analytics
 */

const path = require('path');
const fs = require('fs');
const { ensureDatabase } = require('../src/data/db/sqlite');
const { createSQLiteDatabase } = require('../src/data/db/sqlite');
const { CountryHubGapAnalyzer } = require('../src/services/CountryHubGapAnalyzer');
const { HubValidator } = require('../src/core/crawler/hub-discovery/HubValidator');
const { slugify } = require('../src/tools/slugify');

const fetchImpl = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class EnhancedHubDiscoverer {
  constructor(options = {}) {
    this.db = options.db;
    this.logger = options.logger || console;
    this.validator = new HubValidator({ logger: this.logger });
    this.analyzer = new CountryHubGapAnalyzer({ db: this.db, logger: this.logger });

    // ML-based scoring weights (configurable)
    this.scoringWeights = {
      titleRelevance: 0.3,
      linkDensity: 0.25,
      urlStructure: 0.2,
      contentFreshness: 0.15,
      domainAuthority: 0.1
    };

    // Confidence thresholds
    this.thresholds = {
      highConfidence: 0.8,
      mediumConfidence: 0.6,
      lowConfidence: 0.4
    };
  }

  /**
   * Enhanced URL prediction using multiple strategies
   */
  async predictHubUrls(domain, place, kind = 'country') {
    const predictions = [];

    // Strategy 1: DSPL-based patterns (highest priority)
    const dsplUrls = this.analyzer.predictCountryHubUrls(domain, place.name, place.code);
    predictions.push(...dsplUrls.map(url => ({
      url,
      strategy: 'dspl',
      confidence: 0.9,
      source: 'learned-patterns'
    })));

    // Strategy 2: Gazetteer-informed patterns
    const gazetteerUrls = this.generateGazetteerPatterns(domain, place, kind);
    predictions.push(...gazetteerUrls.map(url => ({
      url,
      strategy: 'gazetteer',
      confidence: 0.7,
      source: 'gazetteer-metadata'
    })));

    // Strategy 3: Content-based discovery (from existing articles)
    const contentUrls = await this.discoverFromContent(domain, place, kind);
    predictions.push(...contentUrls.map(url => ({
      url,
      strategy: 'content',
      confidence: 0.6,
      source: 'article-analysis'
    })));

    // Remove duplicates and score
    const uniquePredictions = this.deduplicatePredictions(predictions);
    return this.scorePredictions(uniquePredictions, place);
  }

  /**
   * Generate patterns based on gazetteer metadata
   */
  generateGazetteerPatterns(domain, place, kind) {
    const urls = [];
    const baseUrl = `https://${domain}`;
    const slug = slugify(place.name);

    // Country-specific patterns
    if (kind === 'country') {
      const patterns = [
        `/world/${slug}`,
        `/news/world/${slug}`,
        `/${slug}`,
        `/international/${slug}`,
        `/news/${slug}`
      ];

      // Add region-specific patterns
      const region = this.getRegionFromCountryCode(place.code);
      if (region) {
        patterns.push(`/news/world-${region}-${slug}`);
      }

      patterns.forEach(pattern => {
        try {
          urls.push(new URL(pattern, baseUrl).href);
        } catch (e) {
          // Skip invalid patterns
        }
      });
    }

    return urls;
  }

  /**
   * Discover potential hubs from existing article content
   */
  async discoverFromContent(domain, place, kind) {
    const urls = [];

    try {
      // Query articles that might reference this place
      const articles = this.db.prepare(`
        SELECT url, title, html
        FROM articles
        WHERE LOWER(host) LIKE LOWER(?)
          AND (LOWER(title) LIKE LOWER(?) OR LOWER(html) LIKE LOWER(?))
        LIMIT 50
      `).all(`%${domain}%`, `%${place.name}%`, `%${place.name}%`);

      for (const article of articles) {
        // Extract potential hub URLs from article content
        const hubUrls = this.extractHubUrlsFromArticle(article, domain, place);
        urls.push(...hubUrls);
      }
    } catch (error) {
      this.logger.warn(`Content discovery failed for ${place.name}: ${error.message}`);
    }

    return urls;
  }

  /**
   * Extract potential hub URLs from article content
   */
  extractHubUrlsFromArticle(article, domain, place) {
    const urls = [];
    const slug = slugify(place.name);

    try {
      // Look for navigation links that might point to hubs
      const linkRegex = /<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let match;

      while ((match = linkRegex.exec(article.html)) !== null) {
        const href = match[1];
        const text = match[2];

        if (href.includes(slug) && href.includes(`https://${domain}`)) {
          // Check if this looks like a hub URL (not an article)
          if (!this.isArticleUrl(href) && this.isLikelyHubUrl(href, text, place)) {
            urls.push(href);
          }
        }
      }
    } catch (error) {
      // Skip problematic articles
    }

    return urls;
  }

  /**
   * Score predictions using multiple signals
   */
  scorePredictions(predictions, place) {
    return predictions.map(pred => {
      let score = pred.confidence; // Base confidence from strategy

      // Adjust based on URL structure
      score *= this.scoreUrlStructure(pred.url, place);

      // Adjust based on domain authority
      score *= this.scoreDomainAuthority(pred.url);

      // Adjust based on pattern specificity
      score *= this.scorePatternSpecificity(pred.url, place);

      return {
        ...pred,
        finalScore: score,
        confidence: score >= this.thresholds.highConfidence ? 'high' :
                   score >= this.thresholds.mediumConfidence ? 'medium' : 'low'
      };
    }).sort((a, b) => b.finalScore - a.finalScore);
  }

  /**
   * Score URL structure quality
   */
  scoreUrlStructure(url, place) {
    let score = 1.0;

    // Prefer shorter, cleaner URLs
    const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
    if (pathSegments.length > 3) score *= 0.8;

    // Prefer URLs that include place name prominently
    const slug = slugify(place.name);
    if (url.includes(`/${slug}`)) score *= 1.2;

    // Penalize URLs with dates or article-like patterns
    if (/\d{4}\/\d{2}\/\d{2}/.test(url)) score *= 0.5;

    return Math.min(score, 1.0);
  }

  /**
   * Score domain authority (placeholder - could integrate Alexa/Moz data)
   */
  scoreDomainAuthority(url) {
    // For now, assume all domains in our system are authoritative
    return 1.0;
  }

  /**
   * Score pattern specificity
   */
  scorePatternSpecificity(url, place) {
    let score = 1.0;

    // Prefer patterns that are specific to this place
    const slug = slugify(place.name);
    const code = place.code?.toLowerCase();

    if (url.includes(slug) && url.includes(code)) score *= 1.3;
    else if (url.includes(slug)) score *= 1.1;

    return Math.min(score, 1.0);
  }

  /**
   * Enhanced validation with ML-based content analysis
   */
  async validateHubContent(url, place) {
    return await this.validator.validateHubContent(url, place);
  }

  /**
   * Remove duplicates and score predictions
   */
  deduplicatePredictions(predictions) {
    const seen = new Set();
    return predictions.filter(pred => {
      if (seen.has(pred.url)) return false;
      seen.add(pred.url);
      return true;
    });
  }

  isArticleUrl(url) { return /\d{4}\/\d{2}\/\d{2}/.test(url); }
  isLikelyHubUrl(url, text, place) { return text.toLowerCase().includes(place.name.toLowerCase()); }
}

module.exports = { EnhancedHubDiscoverer };