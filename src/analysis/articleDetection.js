'use strict';

/**
 * @fileoverview Article Detection
 * 
 * LEGACY INTERFACE: This module provides backward compatibility with the original
 * evaluateArticleCandidate() function. Internally, it now uses the Classification
 * Cascade (Stage1UrlClassifier, Stage2ContentClassifier, StageAggregator) for
 * consistent multi-stage classification.
 * 
 * For new code, prefer using the classifiers directly:
 * ```js
 * const { Stage1UrlClassifier, Stage2ContentClassifier, StageAggregator } = require('./classifiers');
 * ```
 * 
 * @see src/classifiers/Stage1UrlClassifier.js
 * @see src/classifiers/Stage2ContentClassifier.js
 * @see src/classifiers/StageAggregator.js
 */

const ArticleSignalsService = require('../crawler/ArticleSignalsService');
const { Stage1UrlClassifier, Stage2ContentClassifier, StageAggregator } = require('../classifiers');

// Singleton instances for reuse
let _urlClassifier = null;
let _contentClassifier = null;
let _aggregator = null;

function getUrlClassifier() {
  if (!_urlClassifier) {
    _urlClassifier = new Stage1UrlClassifier();
  }
  return _urlClassifier;
}

function getContentClassifier() {
  if (!_contentClassifier) {
    _contentClassifier = new Stage2ContentClassifier();
  }
  return _contentClassifier;
}

function getAggregator() {
  if (!_aggregator) {
    _aggregator = new StageAggregator();
  }
  return _aggregator;
}

function normalizeClassification(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['nav', 'navigation', 'hub'].includes(normalized)) return 'nav';
  return normalized;
}

function safeParse(json) {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function extractContentSignals(analysis) {
  if (!analysis) return null;
  const sourceTagged = (content) => ({
    linkDensity: typeof content.linkDensity === 'number' ? content.linkDensity : null,
    h2: typeof content.h2 === 'number' ? content.h2 : null,
    h3: typeof content.h3 === 'number' ? content.h3 : null,
    a: typeof content.a === 'number' ? content.a : null,
    p: typeof content.p === 'number' ? content.p : null,
    wordCount: typeof content.wordCount === 'number' ? content.wordCount : null,
    schema: content.schema && typeof content.schema === 'object' ? content.schema : null,
    source: content.source || 'analysis'
  });

  if (analysis.content && typeof analysis.content === 'object') {
    return sourceTagged(analysis.content);
  }
  if (analysis.url && typeof analysis.url === 'object' && typeof analysis.combined === 'object') {
    return extractContentSignals({ content: analysis.url });
  }
  return null;
}

function mergeContentSignals(primary, fallback) {
  if (!primary && !fallback) return null;
  if (primary && !fallback) return primary;
  if (!primary && fallback) return fallback;

  const mergeMetric = (p, f) => (typeof p === 'number' ? p : (typeof f === 'number' ? f : null));

  return {
    linkDensity: mergeMetric(primary.linkDensity, fallback.linkDensity),
    h2: mergeMetric(primary.h2, fallback.h2),
    h3: mergeMetric(primary.h3, fallback.h3),
    a: mergeMetric(primary.a, fallback.a),
    p: mergeMetric(primary.p, fallback.p),
    wordCount: mergeMetric(primary.wordCount, fallback.wordCount),
    schema: primary.schema || fallback.schema || null,
    source: primary.source || fallback.source || null
  };
}

function createArticleSignalsService() {
  return new ArticleSignalsService();
}

function evaluateArticleCandidate(candidate, { signalsService = createArticleSignalsService() } = {}) {
  const url = candidate.url;
  const title = candidate.title || '';
  const latestClassification = normalizeClassification(candidate.latestClassification);
  const urlSignals = signalsService.computeUrlSignals(url);
  const urlLooksArticle = signalsService.looksLikeArticle(url);

  const articleAnalysis = safeParse(candidate.articleAnalysis);
  const articleContent = extractContentSignals(articleAnalysis);

  const fetchAnalysis = safeParse(candidate.fetchAnalysis);
  const fetchContent = extractContentSignals(fetchAnalysis);

  const contentSignals = mergeContentSignals(articleContent, fetchContent);

  const wordCountCandidates = [
    typeof candidate.articleWordCount === 'number' ? candidate.articleWordCount : null,
    contentSignals && typeof contentSignals.wordCount === 'number' ? contentSignals.wordCount : null,
    typeof candidate.fetchWordCount === 'number' ? candidate.fetchWordCount : null
  ].filter((v) => typeof v === 'number');
  const wordCount = wordCountCandidates.length ? wordCountCandidates[0] : null;

  const reasons = [];
  const rejections = [];
  let positives = 0;
  let negatives = 0;

  if (urlLooksArticle) {
    positives += 0.5; // Reduced from 1
    reasons.push('url-pattern: matched article keyword');
  } else {
    negatives += 1;
    rejections.push('url-pattern: lacks article keyword');
  }

  if (typeof wordCount === 'number') {
    if (wordCount >= 350) {
      positives += 2;
      reasons.push(`word-count: high (>=350, value ${wordCount})`);
    } else if (wordCount >= 180) {
      positives += 1;
      reasons.push(`word-count: medium (>=180, value ${wordCount})`);
    } else {
      negatives += 2;
      rejections.push(`word-count: low (<180, value ${wordCount})`);
    }
  } else {
    negatives += 1;
    rejections.push('word-count: unavailable');
  }

  const schemaSignals = contentSignals && contentSignals.schema ? contentSignals.schema : null;

  if (contentSignals) {
    if (typeof contentSignals.linkDensity === 'number') {
      const ld = contentSignals.linkDensity;
      if (ld <= 0.2) {
        positives += 1;
        reasons.push(`link-density: low (${ld.toFixed(2)})`);
      } else if (ld >= 0.35) {
        negatives += 1;
        rejections.push(`link-density: high (${ld.toFixed(2)})`);
      }
    }
    if (typeof contentSignals.p === 'number') {
      const paragraphs = contentSignals.p;
      if (paragraphs >= 4) {
        positives += 1;
        reasons.push(`paragraphs: ${paragraphs}`);
      } else if (paragraphs <= 1) {
        negatives += 1;
        rejections.push(`paragraphs: ${paragraphs}`);
      }
    }
  }

  if (schemaSignals) {
    const schemaScore = typeof schemaSignals.score === 'number' ? schemaSignals.score : 0;
    if (schemaScore >= 6) {
      positives += 3;
      reasons.push(`schema: strong article signals (score ${schemaScore.toFixed(1)})`);
    } else if (schemaScore >= 3.5) {
      positives += 2;
      reasons.push(`schema: medium article signals (score ${schemaScore.toFixed(1)})`);
    } else if (schemaScore > 0.5) {
      positives += 1;
      reasons.push(`schema: weak article signals (score ${schemaScore.toFixed(1)})`);
    } else if (schemaSignals.hasStructuredData && !schemaSignals.hasArticleType) {
      negatives += 1;
      rejections.push('schema: structured data without article type');
    }

    if (!schemaSignals.hasArticleBody && schemaSignals.hasArticleType && schemaScore < 3) {
      negatives += 1;
      rejections.push('schema: missing article body');
    }
  }

  const combined = signalsService.combineSignals(urlSignals, contentSignals, { wordCount: wordCount ?? undefined });
  if (combined) {
    if (combined.hint === 'article') {
      positives += 2;
      reasons.push(`combined-signal: article (confidence ${combined.confidence.toFixed(2)})`);
    } else if (combined.hint === 'nav') {
      negatives += 2;
      rejections.push(`combined-signal: nav (confidence ${combined.confidence.toFixed(2)})`);
    }
  }

  if (latestClassification === 'article') {
    positives += 1;
    reasons.push('latest-classification: article');
  } else if (latestClassification === 'nav') {
    negatives += 1;
    rejections.push('latest-classification: nav');
  }

  if (typeof candidate.navLinksCount === 'number') {
    if (candidate.navLinksCount >= 100) {
      negatives += 3;
      rejections.push(`nav-links: very high (>=100, value ${candidate.navLinksCount})`);
    } else if (candidate.navLinksCount >= 50) {
      negatives += 1;
      rejections.push(`nav-links: high (>=50, value ${candidate.navLinksCount})`);
    }
  }

  const score = positives - negatives;
  const isArticle = score > 0;
  const confidence = Math.max(0, Math.min(1, positives / Math.max(1, positives + negatives)));

  return {
    url,
    title,
    isArticle,
    score,
    confidence,
    reasons,
    rejections,
    signals: {
      wordCount,
      navLinksCount: typeof candidate.navLinksCount === 'number' ? candidate.navLinksCount : null,
      articleLinksCount: typeof candidate.articleLinksCount === 'number' ? candidate.articleLinksCount : null,
      combinedHint: combined ? combined.hint : null,
      combinedConfidence: combined ? combined.confidence : null,
      latestClassification,
      contentSource: articleContent ? 'article-analysis' : (fetchContent ? 'fetch-analysis' : null),
      schemaScore: schemaSignals ? schemaSignals.score : null,
      schemaStrength: schemaSignals ? schemaSignals.strength : null,
      schemaSources: schemaSignals && Array.isArray(schemaSignals.sources) ? schemaSignals.sources : null,
      schemaTypes: schemaSignals && Array.isArray(schemaSignals.articleTypes) ? schemaSignals.articleTypes : null,
      schemaHasArticleType: schemaSignals ? Boolean(schemaSignals.hasArticleType) : null
    }
  };
}

/**
 * Classify a URL + optional HTML using the Classification Cascade.
 * 
 * This is the recommended API for new code. It uses independent stage classifiers
 * and returns a result with full provenance tracking.
 * 
 * @param {string} url - The URL to classify
 * @param {string} [html] - Optional HTML content (if already downloaded)
 * @param {Object} [options] - Classification options
 * @param {boolean} [options.includeProvenance=true] - Include provenance tracking
 * @returns {Object} Classification result with provenance
 * 
 * @example
 * // URL-only (pre-download)
 * const result = classifyWithCascade('https://example.com/article');
 * 
 * // URL + Content (post-download)
 * const result = classifyWithCascade('https://example.com/article', htmlContent);
 * console.log(result.provenance.aggregator.decision); // 'unanimous' or 'content-override'
 */
function classifyWithCascade(url, html = null, options = {}) {
  const { includeProvenance = true } = options;
  
  const urlClassifier = getUrlClassifier();
  const contentClassifier = getContentClassifier();
  const aggregator = getAggregator();
  
  // Stage 1: URL classification
  const urlResult = urlClassifier.classify(url);
  
  // Stage 2: Content classification (if HTML provided)
  let contentResult = null;
  if (html) {
    contentResult = contentClassifier.classify(html, url);
  }
  
  // Aggregate results
  const aggregated = aggregator.aggregate(urlResult, contentResult, null);
  
  const result = {
    url,
    classification: aggregated.classification,
    confidence: aggregated.confidence,
    isArticle: aggregated.classification === 'article',
    stages: {
      url: {
        classification: urlResult.classification,
        confidence: urlResult.confidence,
        reason: urlResult.reason
      },
      content: contentResult ? {
        classification: contentResult.classification,
        confidence: contentResult.confidence,
        reason: contentResult.reason,
        signals: contentResult.signals
      } : null
    }
  };
  
  if (includeProvenance) {
    result.provenance = aggregated.provenance;
  }
  
  return result;
}

/**
 * Classify a URL using all three stages of the Classification Cascade.
 * 
 * This async version supports Puppeteer-based classification (Stage 3).
 * Use when you need the most accurate classification and can afford the browser overhead.
 * 
 * @param {string} url - The URL to classify
 * @param {Object} [options] - Classification options
 * @param {string} [options.html] - Pre-downloaded HTML (skips re-fetch for Stage 2)
 * @param {boolean} [options.usePuppeteer=false] - Enable Stage 3 Puppeteer classification
 * @param {Object} [options.puppeteerClassifier] - Pre-initialized Stage3PuppeteerClassifier
 * @param {boolean} [options.includeProvenance=true] - Include provenance tracking
 * @returns {Promise<Object>} Classification result with provenance
 * 
 * @example
 * // Full cascade with Puppeteer
 * const result = await classifyWithFullCascade('https://example.com/article', {
 *   usePuppeteer: true
 * });
 * console.log(result.provenance.puppeteer); // Stage 3 result
 */
async function classifyWithFullCascade(url, options = {}) {
  const { 
    html = null, 
    usePuppeteer = false, 
    puppeteerClassifier = null,
    includeProvenance = true 
  } = options;
  
  const urlClassifier = getUrlClassifier();
  const contentClassifier = getContentClassifier();
  const aggregator = getAggregator();
  
  // Stage 1: URL classification
  const urlResult = urlClassifier.classify(url);
  
  // Stage 2: Content classification (if HTML provided)
  let contentResult = null;
  if (html) {
    contentResult = contentClassifier.classify(html, url);
  }
  
  // Stage 3: Puppeteer classification (if requested)
  let puppeteerResult = null;
  if (usePuppeteer) {
    const { Stage3PuppeteerClassifier } = require('../classifiers');
    const classifier = puppeteerClassifier || new Stage3PuppeteerClassifier();
    const needsCleanup = !puppeteerClassifier;
    
    try {
      await classifier.init();
      puppeteerResult = await classifier.classify(url);
    } finally {
      if (needsCleanup) {
        await classifier.destroy();
      }
    }
  }
  
  // Aggregate all results
  const aggregated = aggregator.aggregate(urlResult, contentResult, puppeteerResult);
  
  const result = {
    url,
    classification: aggregated.classification,
    confidence: aggregated.confidence,
    isArticle: aggregated.classification === 'article',
    stages: {
      url: {
        classification: urlResult.classification,
        confidence: urlResult.confidence,
        reason: urlResult.reason
      },
      content: contentResult ? {
        classification: contentResult.classification,
        confidence: contentResult.confidence,
        reason: contentResult.reason,
        signals: contentResult.signals
      } : null,
      puppeteer: puppeteerResult ? {
        classification: puppeteerResult.classification,
        confidence: puppeteerResult.confidence,
        reason: puppeteerResult.reason
      } : null
    }
  };
  
  if (includeProvenance) {
    result.provenance = aggregated.provenance;
  }
  
  return result;
}

module.exports = {
  normalizeClassification,
  safeParse,
  extractContentSignals,
  mergeContentSignals,
  evaluateArticleCandidate,
  createArticleSignalsService,
  
  // New cascade-based API
  classifyWithCascade,
  classifyWithFullCascade,
  
  // Direct access to classifiers (for advanced usage)
  getUrlClassifier,
  getContentClassifier,
  getAggregator
};
