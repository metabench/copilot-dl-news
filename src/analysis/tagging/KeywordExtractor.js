'use strict';

/**
 * KeywordExtractor - TF-IDF based keyword extraction
 * 
 * Extracts the most significant keywords from article text using
 * Term Frequency-Inverse Document Frequency (TF-IDF) scoring.
 * 
 * TF-IDF formula: tf(t,d) * log(N / df(t))
 * - tf(t,d): term frequency of term t in document d
 * - N: total number of documents in corpus
 * - df(t): number of documents containing term t
 * 
 * Features:
 * - Tokenization with punctuation removal
 * - Stopword filtering
 * - Optional stemming (Porter-like)
 * - Configurable top-N keyword extraction
 * 
 * @module KeywordExtractor
 */

const { isStopword } = require('./stopwords');

// Minimum word length to consider
const MIN_WORD_LENGTH = 3;

// Maximum word length (avoid garbage)
const MAX_WORD_LENGTH = 30;

// Default number of keywords to extract
const DEFAULT_TOP_N = 10;

/**
 * Tokenize text into words
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of lowercase tokens
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Lowercase and split on non-alphabetic characters
  const tokens = text
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes first (don't → dont)
    .split(/[^a-z]+/)
    .filter(token => 
      token.length >= MIN_WORD_LENGTH && 
      token.length <= MAX_WORD_LENGTH &&
      !isStopword(token) &&
      !/^\d+$/.test(token) // Exclude pure numbers
    );
  
  return tokens;
}

/**
 * Simple Porter-like stemmer (simplified English)
 * Not a full implementation, but handles common suffixes.
 * 
 * @param {string} word - Word to stem
 * @returns {string} Stemmed word
 */
function stem(word) {
  if (word.length <= 3) return word;
  
  // Common suffix rules (simplified)
  const rules = [
    [/ational$/, 'ate'],
    [/tional$/, 'tion'],
    [/enci$/, 'ence'],
    [/anci$/, 'ance'],
    [/izer$/, 'ize'],
    [/isation$/, 'ize'],
    [/ization$/, 'ize'],
    [/ational$/, 'ate'],
    [/ation$/, 'ate'],
    [/ator$/, 'ate'],
    [/iveness$/, 'ive'],
    [/fulness$/, 'ful'],
    [/ousness$/, 'ous'],
    [/alities$/, 'al'],
    [/ality$/, 'al'],
    [/iviti$/, 'ive'],
    [/biliti$/, 'ble'],
    [/logi$/, 'log'],
    [/alli$/, 'al'],
    [/entli$/, 'ent'],
    [/eli$/, 'e'],
    [/ousli$/, 'ous'],
    [/ness$/, ''],
    [/ment$/, ''],
    [/ful$/, ''],
    [/less$/, ''],
    [/ings$/, ''],
    [/ing$/, ''],
    [/ies$/, 'y'],
    [/ied$/, 'y'],
    [/es$/, ''],
    [/ed$/, ''],
    [/ly$/, ''],
    [/s$/, '']
  ];
  
  for (const [pattern, replacement] of rules) {
    if (pattern.test(word)) {
      const stemmed = word.replace(pattern, replacement);
      // Ensure result is at least 2 chars
      if (stemmed.length >= 2) {
        return stemmed;
      }
    }
  }
  
  return word;
}

/**
 * Calculate term frequency (normalized by document length)
 * 
 * @param {string[]} tokens - Document tokens
 * @returns {Map<string, number>} Term -> frequency map
 */
function calculateTermFrequency(tokens) {
  const termCounts = new Map();
  
  for (const token of tokens) {
    termCounts.set(token, (termCounts.get(token) || 0) + 1);
  }
  
  // Normalize by document length (raw count / total terms)
  const docLength = tokens.length;
  const tf = new Map();
  
  for (const [term, count] of termCounts) {
    tf.set(term, count / docLength);
  }
  
  return tf;
}

/**
 * KeywordExtractor class for TF-IDF keyword extraction
 */
class KeywordExtractor {
  /**
   * Create a KeywordExtractor
   * 
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.useStemming=false] - Apply stemming
   * @param {number} [options.topN=10] - Number of keywords to extract
   * @param {Map<string, number>} [options.documentFrequencies] - Pre-loaded DF map
   * @param {number} [options.totalDocuments=1] - Total docs in corpus
   * @param {Object} [options.tagAdapter] - DB adapter for DF persistence
   */
  constructor(options = {}) {
    this.useStemming = options.useStemming || false;
    this.topN = options.topN || DEFAULT_TOP_N;
    this.documentFrequencies = options.documentFrequencies || new Map();
    this.totalDocuments = options.totalDocuments || 1;
    this.tagAdapter = options.tagAdapter || null;
  }
  
  /**
   * Preprocess text into tokens
   * 
   * @param {string} text - Input text
   * @returns {string[]} Processed tokens
   */
  preprocess(text) {
    let tokens = tokenize(text);
    
    if (this.useStemming) {
      tokens = tokens.map(stem);
    }
    
    return tokens;
  }
  
  /**
   * Calculate TF-IDF scores for document terms
   * 
   * @param {string} text - Document text
   * @returns {Map<string, number>} Term -> TF-IDF score map
   */
  calculateTfIdf(text) {
    const tokens = this.preprocess(text);
    
    if (tokens.length === 0) {
      return new Map();
    }
    
    const tf = calculateTermFrequency(tokens);
    const tfidf = new Map();
    
    for (const [term, termFreq] of tf) {
      // Get document frequency (default to 1 if unknown)
      const df = this.documentFrequencies.get(term) || 1;
      
      // IDF: log(N / df)
      // Add 1 to denominator to avoid division by zero
      const idf = Math.log(this.totalDocuments / (df + 1)) + 1;
      
      // TF-IDF
      tfidf.set(term, termFreq * idf);
    }
    
    return tfidf;
  }
  
  /**
   * Extract top keywords from text
   * 
   * @param {string} text - Document text
   * @param {Object} [options] - Options
   * @param {number} [options.topN] - Override default topN
   * @returns {Array<{keyword: string, score: number}>} Ranked keywords
   */
  extract(text, options = {}) {
    const topN = options.topN || this.topN;
    const tfidf = this.calculateTfIdf(text);
    
    // Sort by score descending
    const sorted = Array.from(tfidf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);
    
    return sorted.map(([keyword, score]) => ({
      keyword,
      score: Math.round(score * 10000) / 10000 // 4 decimal places
    }));
  }
  
  /**
   * Update document frequencies from a batch of documents
   * (Used for building corpus statistics)
   * 
   * @param {string[]} documents - Array of document texts
   * @returns {{termsUpdated: number, documentsProcessed: number}}
   */
  updateDocumentFrequencies(documents) {
    const termDocs = new Map();
    
    for (const doc of documents) {
      const tokens = this.preprocess(doc);
      const uniqueTerms = new Set(tokens);
      
      for (const term of uniqueTerms) {
        termDocs.set(term, (termDocs.get(term) || 0) + 1);
      }
    }
    
    // Merge into existing frequencies
    for (const [term, count] of termDocs) {
      this.documentFrequencies.set(
        term,
        (this.documentFrequencies.get(term) || 0) + count
      );
    }
    
    // Update total documents
    this.totalDocuments += documents.length;
    
    return {
      termsUpdated: termDocs.size,
      documentsProcessed: documents.length
    };
  }
  
  /**
   * Load document frequencies from database
   * 
   * @returns {Promise<number>} Number of terms loaded
   */
  async loadFromDatabase() {
    if (!this.tagAdapter) {
      return 0;
    }
    
    const stats = this.tagAdapter.getDocumentFrequencyStats();
    this.totalDocuments = stats.totalDocuments || 1;
    
    const terms = this.tagAdapter.getDocumentFrequencies({ limit: 100000 });
    
    this.documentFrequencies.clear();
    for (const { term, docCount } of terms) {
      this.documentFrequencies.set(term, docCount);
    }
    
    return this.documentFrequencies.size;
  }
  
  /**
   * Save document frequencies to database
   * 
   * @returns {Promise<{saved: number}>}
   */
  async saveToDatabase() {
    if (!this.tagAdapter) {
      return { saved: 0 };
    }
    
    const terms = Array.from(this.documentFrequencies.entries()).map(
      ([term, docCount]) => ({ term, docCount })
    );
    
    return this.tagAdapter.bulkSaveDocumentFrequencies(terms);
  }
  
  /**
   * Get extractor statistics
   * 
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalDocuments: this.totalDocuments,
      vocabularySize: this.documentFrequencies.size,
      topN: this.topN,
      useStemming: this.useStemming
    };
  }
}

module.exports = {
  KeywordExtractor,
  tokenize,
  stem,
  calculateTermFrequency,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
  DEFAULT_TOP_N
};
