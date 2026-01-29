'use strict';

/**
 * CategoryClassifier - Rule-based topic classification
 * 
 * Classifies articles into one of 7 categories using weighted keyword matching:
 * - Politics
 * - Technology
 * - Sports
 * - Business
 * - Entertainment
 * - Science
 * - Health
 * 
 * Uses keyword lists from config/category-keywords.json with primary (high weight)
 * and secondary (lower weight) keywords.
 * 
 * @module CategoryClassifier
 */

const fs = require('fs');
const path = require('path');

const { tokenize } = require('./KeywordExtractor');

// Default category when no keywords match
const UNCATEGORIZED = 'Uncategorized';

// Default config path
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../../../config/category-keywords.json');

/**
 * Load category keywords configuration
 * 
 * @param {string} [configPath] - Path to config file
 * @returns {Object} Configuration object
 */
function loadConfig(configPath) {
  const filePath = configPath || DEFAULT_CONFIG_PATH;
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[CategoryClassifier] Could not load config from ${filePath}:`, err.message);
    return getDefaultConfig();
  }
}

/**
 * Get minimal default configuration
 * @returns {Object} Default config
 */
function getDefaultConfig() {
  return {
    categories: {
      Politics: { primary: ['election', 'president', 'congress', 'government', 'political'], secondary: [] },
      Technology: { primary: ['technology', 'software', 'computer', 'internet', 'digital'], secondary: [] },
      Sports: { primary: ['sports', 'game', 'team', 'player', 'championship'], secondary: [] },
      Business: { primary: ['business', 'company', 'market', 'stock', 'economy'], secondary: [] },
      Entertainment: { primary: ['movie', 'music', 'celebrity', 'film', 'television'], secondary: [] },
      Science: { primary: ['science', 'research', 'study', 'discovery', 'scientist'], secondary: [] },
      Health: { primary: ['health', 'medical', 'doctor', 'hospital', 'disease'], secondary: [] }
    },
    weights: {
      primary: 2.0,
      secondary: 1.0,
      titleMultiplier: 3.0
    },
    thresholds: {
      minConfidence: 0.1,
      secondaryCategoryGap: 0.5
    }
  };
}

/**
 * CategoryClassifier class for rule-based topic classification
 */
class CategoryClassifier {
  /**
   * Create a CategoryClassifier
   * 
   * @param {Object} [options] - Configuration options
   * @param {string} [options.configPath] - Path to category keywords config
   * @param {Object} [options.config] - Direct config object (overrides file)
   */
  constructor(options = {}) {
    // Load configuration
    if (options.config) {
      this.config = options.config;
    } else {
      this.config = loadConfig(options.configPath);
    }
    
    // Build keyword lookup maps for fast matching
    this._buildKeywordMaps();
    
    // Extract weights and thresholds
    this.weights = this.config.weights || {
      primary: 2.0,
      secondary: 1.0,
      titleMultiplier: 3.0
    };
    
    this.thresholds = this.config.thresholds || {
      minConfidence: 0.1,
      secondaryCategoryGap: 0.5
    };
  }
  
  /**
   * Build keyword lookup maps for efficient matching
   * @private
   */
  _buildKeywordMaps() {
    // Map of keyword -> { category, type: 'primary'|'secondary' }
    this.keywordMap = new Map();
    
    // Map of multi-word phrase -> { category, type }
    this.phraseMap = new Map();
    
    // List of categories
    this.categories = Object.keys(this.config.categories || {});
    
    for (const category of this.categories) {
      const catConfig = this.config.categories[category];
      
      // Process primary keywords
      for (const keyword of (catConfig.primary || [])) {
        this._addKeyword(keyword, category, 'primary');
      }
      
      // Process secondary keywords
      for (const keyword of (catConfig.secondary || [])) {
        this._addKeyword(keyword, category, 'secondary');
      }
    }
  }
  
  /**
   * Add a keyword to the appropriate map
   * @private
   */
  _addKeyword(keyword, category, type) {
    const lower = keyword.toLowerCase();
    
    if (lower.includes(' ')) {
      // Multi-word phrase
      this.phraseMap.set(lower, { category, type });
    } else {
      // Single word
      this.keywordMap.set(lower, { category, type });
    }
  }
  
  /**
   * Classify an article
   * 
   * @param {string} text - Article body text
   * @param {Object} [options] - Options
   * @param {string} [options.title] - Article title (weighted higher)
   * @returns {{category: string, confidence: number, secondaryCategory: string|null, secondaryConfidence: number|null, scores: Object}}
   */
  classify(text, options = {}) {
    const { title = '' } = options;
    
    // Initialize scores for each category
    const scores = {};
    for (const category of this.categories) {
      scores[category] = 0;
    }
    
    // Tokenize text and title
    const textLower = (text || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();
    
    const textTokens = tokenize(text);
    const titleTokens = tokenize(title);
    
    // Count token occurrences
    const textCounts = this._countTokens(textTokens);
    const titleCounts = this._countTokens(titleTokens);
    
    // Score single-word keywords
    for (const [keyword, { category, type }] of this.keywordMap) {
      const weight = type === 'primary' ? this.weights.primary : this.weights.secondary;
      
      // Count in text
      const textCount = textCounts.get(keyword) || 0;
      if (textCount > 0) {
        scores[category] += textCount * weight;
      }
      
      // Count in title (with multiplier)
      const titleCount = titleCounts.get(keyword) || 0;
      if (titleCount > 0) {
        scores[category] += titleCount * weight * this.weights.titleMultiplier;
      }
    }
    
    // Score multi-word phrases
    for (const [phrase, { category, type }] of this.phraseMap) {
      const weight = type === 'primary' ? this.weights.primary : this.weights.secondary;
      
      // Count in text
      const textMatches = this._countPhrase(textLower, phrase);
      if (textMatches > 0) {
        scores[category] += textMatches * weight;
      }
      
      // Count in title (with multiplier)
      const titleMatches = this._countPhrase(titleLower, phrase);
      if (titleMatches > 0) {
        scores[category] += titleMatches * weight * this.weights.titleMultiplier;
      }
    }
    
    // Find top categories
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);
    
    const topScore = sorted[0][1];
    const secondScore = sorted[1] ? sorted[1][1] : 0;
    
    // Calculate confidence (normalized by top score)
    // Higher score relative to others = higher confidence
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? topScore / totalScore : 0;
    
    // Determine if there's a valid secondary category
    let secondaryCategory = null;
    let secondaryConfidence = null;
    
    if (secondScore > 0) {
      const gap = 1 - (secondScore / topScore);
      if (gap < this.thresholds.secondaryCategoryGap) {
        secondaryCategory = sorted[1][0];
        secondaryConfidence = totalScore > 0 ? secondScore / totalScore : 0;
      }
    }
    
    // Apply minimum confidence threshold
    if (topScore === 0 || confidence < this.thresholds.minConfidence) {
      return {
        category: UNCATEGORIZED,
        confidence: 0,
        secondaryCategory: null,
        secondaryConfidence: null,
        scores
      };
    }
    
    return {
      category: sorted[0][0],
      confidence: Math.round(confidence * 1000) / 1000,
      secondaryCategory,
      secondaryConfidence: secondaryConfidence ? Math.round(secondaryConfidence * 1000) / 1000 : null,
      scores
    };
  }
  
  /**
   * Count token occurrences
   * @private
   */
  _countTokens(tokens) {
    const counts = new Map();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
    return counts;
  }
  
  /**
   * Count phrase occurrences in text
   * @private
   */
  _countPhrase(text, phrase) {
    if (!text || !phrase) return 0;
    
    let count = 0;
    let pos = 0;
    
    while ((pos = text.indexOf(phrase, pos)) !== -1) {
      count++;
      pos += phrase.length;
    }
    
    return count;
  }
  
  /**
   * Get list of available categories
   * @returns {string[]} Category names
   */
  getCategories() {
    return [...this.categories];
  }
  
  /**
   * Get keywords for a category
   * 
   * @param {string} category - Category name
   * @returns {{primary: string[], secondary: string[]}|null}
   */
  getCategoryKeywords(category) {
    const catConfig = this.config.categories[category];
    if (!catConfig) return null;
    
    return {
      primary: [...(catConfig.primary || [])],
      secondary: [...(catConfig.secondary || [])]
    };
  }
  
  /**
   * Get classifier statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      categories: this.categories.length,
      singleKeywords: this.keywordMap.size,
      phrases: this.phraseMap.size,
      weights: { ...this.weights },
      thresholds: { ...this.thresholds }
    };
  }
}

module.exports = {
  CategoryClassifier,
  loadConfig,
  getDefaultConfig,
  UNCATEGORIZED,
  DEFAULT_CONFIG_PATH
};
