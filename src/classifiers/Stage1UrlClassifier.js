'use strict';

/**
 * @fileoverview Stage 1: URL-Only Classification
 * 
 * Classifies URLs using the decision tree engine without downloading content.
 * Part of the Classification Cascade architecture.
 * 
 * @example
 * const { Stage1UrlClassifier } = require('./Stage1UrlClassifier');
 * const classifier = new Stage1UrlClassifier();
 * const result = classifier.classify('https://example.com/2024/01/15/my-article');
 * // { classification: 'article', confidence: 0.95, reason: 'guardian-date-pattern', signals: {...} }
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TREE_PATH = path.join(__dirname, '../../config/decision-trees/url-classification.json');

/**
 * @typedef {Object} UrlSignals
 * @property {string} url - Original URL
 * @property {string} host - Hostname
 * @property {string} path - URL path
 * @property {number} pathDepth - Number of path segments
 * @property {string} slug - Last path segment
 * @property {number} slugLength - Length of slug
 * @property {boolean} hasHyphenatedSlug - Slug contains hyphens and is long
 * @property {boolean} hasDatePath - URL contains date pattern
 * @property {boolean} hasQueryParams - URL has query parameters
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} classification - 'article' | 'hub' | 'nav' | 'unknown'
 * @property {number} confidence - Confidence score 0.0-1.0
 * @property {string} reason - Compact reason code
 * @property {UrlSignals} signals - Computed URL signals
 * @property {Array} [trace] - Decision tree path (if requested)
 */

class Stage1UrlClassifier {
  /**
   * @param {Object} options
   * @param {string} [options.treePath] - Path to decision tree JSON
   * @param {Object} [options.tree] - Pre-loaded decision tree object
   */
  constructor(options = {}) {
    if (options.tree) {
      this.tree = options.tree;
    } else {
      const treePath = options.treePath || DEFAULT_TREE_PATH;
      try {
        const content = fs.readFileSync(treePath, 'utf8');
        this.tree = JSON.parse(content);
      } catch (err) {
        throw new Error(`Failed to load decision tree from ${treePath}: ${err.message}`);
      }
    }
    
    this._validateTree();
  }

  /**
   * Validate the loaded decision tree has required structure
   * @private
   */
  _validateTree() {
    if (!this.tree.categories) {
      throw new Error('Decision tree must have categories');
    }
    const required = ['article', 'hub', 'nav'];
    for (const cat of required) {
      if (!this.tree.categories[cat]) {
        throw new Error(`Decision tree missing required category: ${cat}`);
      }
    }
  }

  /**
   * Compute signals from a URL string
   * @param {string} urlStr - URL to analyze
   * @returns {UrlSignals}
   */
  computeSignals(urlStr) {
    try {
      const u = new URL(urlStr);
      const pathStr = u.pathname;
      const segments = pathStr.split('/').filter(Boolean);
      const depth = segments.length;
      const lastSegment = segments[depth - 1] || '';
      
      return {
        url: urlStr,
        host: u.hostname,
        path: pathStr,
        pathDepth: depth,
        segments,
        slug: lastSegment,
        slugLength: lastSegment.length,
        hasPage: u.searchParams.has('page'),
        hasDatePath: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/\d{1,2}\//i.test(pathStr),
        hasNumericDate: /\/\d{4}\/\d{2}\/\d{2}\//.test(pathStr),
        hasHyphenDate: /\/\d{4}-\d{2}-\d{2}\//.test(pathStr),
        hasHyphenatedSlug: lastSegment.includes('-') && lastSegment.length > 10,
        hasSeriesSegment: pathStr.includes('/series/'),
        hasArticleSegment: /\/article[s]?\//.test(pathStr),
        hasLiveSegment: pathStr.includes('/live/'),
        hasTopicsSegment: /\/topic[s]?\//.test(pathStr),
        hasTagSegment: /\/tag[s]?\//.test(pathStr),
        hasVideoSegment: pathStr.includes('/video/'),
        hasAudioSegment: pathStr.includes('/audio/') || pathStr.includes('/podcast'),
        hasProfileSegment: pathStr.includes('/profile/') || pathStr.includes('/person/'),
        isDateArchive: /\/\d{4}\/(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{2})\/?$/i.test(pathStr),
        hasQueryParams: u.search.length > 0,
        queryParamCount: Array.from(u.searchParams).length,
        fileExtension: pathStr.match(/\.([a-z0-9]+)$/i)?.[1] || null,
        isMediaFile: /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|pdf)$/i.test(pathStr),
        isFeedFile: /\.(xml|rss|atom|json)$/i.test(pathStr) || pathStr.includes('/feed'),
      };
    } catch (err) {
      return { 
        url: urlStr, 
        error: err.message,
        pathDepth: 0,
        slugLength: 0,
        hasHyphenatedSlug: false,
        hasDatePath: false,
        hasQueryParams: false
      };
    }
  }

  /**
   * Classify a single URL
   * @param {string} url - URL to classify
   * @param {Object} [options]
   * @param {boolean} [options.includeTrace=false] - Include decision tree trace
   * @returns {ClassificationResult}
   */
  classify(url, options = {}) {
    const signals = this.computeSignals(url);
    
    // Evaluate each category in priority order
    const categories = ['article', 'hub', 'nav'];
    const results = [];
    
    for (const categoryId of categories) {
      const category = this.tree.categories[categoryId];
      const trace = [];
      const evalResult = this._evaluateTree(category.tree, signals, trace);
      
      results.push({
        categoryId,
        match: evalResult.result === 'match',
        confidence: evalResult.confidence || 0,
        reason: evalResult.reason || 'no-match',
        trace: options.includeTrace ? trace : undefined
      });
    }
    
    // Find best match
    const matches = results.filter(r => r.match);
    
    if (matches.length === 0) {
      // No category matched - return fallback
      const fallback = this.tree.fallback || { classification: 'unknown', confidence: 0.5, reason: 'no-category-matched' };
      return {
        classification: fallback.classification,
        confidence: fallback.confidence,
        reason: fallback.reason,
        signals,
        trace: options.includeTrace ? results : undefined
      };
    }
    
    // Return highest confidence match
    matches.sort((a, b) => b.confidence - a.confidence);
    const best = matches[0];
    
    return {
      classification: best.categoryId,
      confidence: best.confidence,
      reason: best.reason,
      signals,
      trace: options.includeTrace ? results : undefined
    };
  }

  /**
   * Classify multiple URLs efficiently
   * @param {string[]} urls - URLs to classify
   * @param {Object} [options]
   * @returns {ClassificationResult[]}
   */
  classifyBatch(urls, options = {}) {
    return urls.map(url => this.classify(url, options));
  }

  /**
   * Recursively evaluate a decision tree node
   * @private
   */
  _evaluateTree(node, signals, trace) {
    // Terminal node
    if (node.result !== undefined) {
      return {
        result: node.result,
        confidence: node.confidence,
        reason: node.reason
      };
    }
    
    // Branch node - evaluate condition
    const conditionResult = this._evaluateCondition(node.condition, signals);
    
    if (trace) {
      trace.push({
        nodeId: node.id || 'anonymous',
        condition: this._describeCondition(node.condition),
        result: conditionResult,
        branch: conditionResult ? 'yes' : 'no'
      });
    }
    
    // Follow appropriate branch
    const nextNode = conditionResult ? node.yes : node.no;
    return this._evaluateTree(nextNode, signals, trace);
  }

  /**
   * Evaluate a single condition
   * @private
   */
  _evaluateCondition(condition, signals) {
    if (!condition) return false;
    
    // Handle negation wrapper
    let result;
    const isNegated = condition.negate === true;
    
    switch (condition.type) {
      case 'url_matches':
        result = this._evalUrlMatches(condition, signals);
        break;
      case 'compare':
        result = this._evalCompare(condition, signals);
        break;
      case 'compound':
        result = this._evalCompound(condition, signals);
        break;
      default:
        result = false;
    }
    
    return isNegated ? !result : result;
  }

  /**
   * Evaluate url_matches condition
   * @private
   */
  _evalUrlMatches(condition, signals) {
    const url = (signals.url || '').toLowerCase();
    const matchType = condition.matchType || 'segment';
    
    for (const pattern of condition.patterns || []) {
      const pat = pattern.toLowerCase();
      
      if (matchType === 'contains') {
        if (url.includes(pat)) return true;
      } else if (matchType === 'segment') {
        const regex = new RegExp(`(^|/)${this._escapeRegex(pat)}(/|$|\\?|#)`, 'i');
        if (regex.test(url)) return true;
        const hyphenRegex = new RegExp(`[-/]${this._escapeRegex(pat)}[-/]`, 'i');
        if (hyphenRegex.test(url)) return true;
      } else if (matchType === 'regex') {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(url)) return true;
        } catch (_) {
          // Invalid regex - skip
        }
      }
    }
    return false;
  }

  /**
   * Evaluate compare condition
   * @private
   */
  _evalCompare(condition, signals) {
    const fieldValue = signals[condition.field];
    let targetValue = condition.value;
    
    // Handle undefined
    if (fieldValue === undefined) return false;
    
    switch (condition.operator) {
      case 'eq':  return fieldValue === targetValue;
      case 'ne':  return fieldValue !== targetValue;
      case 'gt':  return fieldValue > targetValue;
      case 'gte': return fieldValue >= targetValue;
      case 'lt':  return fieldValue < targetValue;
      case 'lte': return fieldValue <= targetValue;
      default:    return false;
    }
  }

  /**
   * Evaluate compound condition (AND/OR)
   * @private
   */
  _evalCompound(condition, signals) {
    const conditions = condition.conditions || [];
    
    if (condition.operator === 'AND') {
      return conditions.every(c => this._evaluateCondition(c, signals));
    } else if (condition.operator === 'OR') {
      return conditions.some(c => this._evaluateCondition(c, signals));
    }
    return false;
  }

  /**
   * Describe a condition for traces
   * @private
   */
  _describeCondition(condition) {
    if (!condition) return 'none';
    
    switch (condition.type) {
      case 'url_matches':
        const pats = condition.patterns || [];
        return `url ${condition.matchType || 'matches'} [${pats.slice(0, 2).join(', ')}${pats.length > 2 ? '...' : ''}]`;
      case 'compare':
        return `${condition.field} ${condition.operator} ${condition.value}`;
      case 'compound':
        return `(${(condition.conditions || []).length} conditions ${condition.operator})`;
      default:
        return condition.type;
    }
  }

  /**
   * Escape special regex characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { Stage1UrlClassifier };
