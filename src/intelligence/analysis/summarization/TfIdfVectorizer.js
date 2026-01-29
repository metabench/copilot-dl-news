'use strict';

/**
 * TfIdfVectorizer - TF-IDF vectorization for sentences
 * 
 * Creates sparse TF-IDF vectors for sentences and computes
 * cosine similarity between them for TextRank.
 * 
 * Adapted from KeywordExtractor's TF-IDF logic.
 * 
 * @module TfIdfVectorizer
 */

const { isStopword } = require('../tagging/stopwords');

// Minimum word length to consider
const MIN_WORD_LENGTH = 3;

// Maximum word length (avoid garbage)
const MAX_WORD_LENGTH = 30;

/**
 * Tokenize text into words (adapted from KeywordExtractor)
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of lowercase tokens
 */
function tokenizeWords(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Lowercase and split on non-alphabetic characters
  const tokens = text
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes first
    .split(/[^a-z]+/)
    .filter(token => 
      token.length >= MIN_WORD_LENGTH && 
      token.length <= MAX_WORD_LENGTH &&
      !isStopword(token) &&
      !/^\d+$/.test(token)
    );
  
  return tokens;
}

/**
 * TfIdfVectorizer class for sentence vectorization
 */
class TfIdfVectorizer {
  /**
   * Create a TfIdfVectorizer
   * @param {Object} [options] - Configuration options
   * @param {boolean} [options.normalize=true] - Normalize vectors to unit length
   */
  constructor(options = {}) {
    this.normalize = options.normalize !== false;
    this.vocabulary = new Map(); // term -> index
    this.idf = new Map(); // term -> IDF score
    this.documentCount = 0;
  }
  
  /**
   * Fit the vectorizer on a set of documents (sentences)
   * Builds vocabulary and computes IDF scores
   * 
   * @param {string[]} documents - Array of document texts
   * @returns {TfIdfVectorizer} this (for chaining)
   */
  fit(documents) {
    if (!documents || !Array.isArray(documents)) {
      return this;
    }
    
    // Count document frequency for each term
    const docFreq = new Map();
    
    for (const doc of documents) {
      const tokens = tokenizeWords(doc);
      const uniqueTokens = new Set(tokens);
      
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }
    
    this.documentCount = documents.length;
    
    // Build vocabulary and IDF scores
    let vocabIndex = 0;
    for (const [term, df] of docFreq) {
      this.vocabulary.set(term, vocabIndex++);
      // IDF = log(N / df) + 1 (smoothed)
      this.idf.set(term, Math.log(this.documentCount / (df + 1)) + 1);
    }
    
    return this;
  }
  
  /**
   * Transform a document into a TF-IDF vector
   * 
   * @param {string} document - Document text
   * @returns {Map<number, number>} Sparse vector (index -> value)
   */
  transform(document) {
    const tokens = tokenizeWords(document);
    
    if (tokens.length === 0) {
      return new Map();
    }
    
    // Calculate term frequency
    const termFreq = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    
    // Build TF-IDF vector
    const vector = new Map();
    
    for (const [term, tf] of termFreq) {
      const vocabIdx = this.vocabulary.get(term);
      if (vocabIdx !== undefined) {
        const idf = this.idf.get(term) || 1;
        // TF is normalized by document length
        const tfidf = (tf / tokens.length) * idf;
        vector.set(vocabIdx, tfidf);
      }
    }
    
    // Normalize to unit length if enabled
    if (this.normalize && vector.size > 0) {
      const magnitude = Math.sqrt(
        Array.from(vector.values()).reduce((sum, v) => sum + v * v, 0)
      );
      if (magnitude > 0) {
        for (const [idx, val] of vector) {
          vector.set(idx, val / magnitude);
        }
      }
    }
    
    return vector;
  }
  
  /**
   * Fit and transform in one step
   * 
   * @param {string[]} documents - Array of document texts
   * @returns {Map<number, number>[]} Array of sparse vectors
   */
  fitTransform(documents) {
    this.fit(documents);
    return documents.map(doc => this.transform(doc));
  }
  
  /**
   * Compute cosine similarity between two sparse vectors
   * 
   * @param {Map<number, number>} vec1 - First vector
   * @param {Map<number, number>} vec2 - Second vector
   * @returns {number} Cosine similarity (0-1 for normalized vectors)
   */
  static cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.size === 0 || vec2.size === 0) {
      return 0;
    }
    
    // Compute dot product
    let dotProduct = 0;
    
    // Iterate over smaller vector
    const [smaller, larger] = vec1.size <= vec2.size ? [vec1, vec2] : [vec2, vec1];
    
    for (const [idx, val1] of smaller) {
      const val2 = larger.get(idx);
      if (val2 !== undefined) {
        dotProduct += val1 * val2;
      }
    }
    
    // If vectors are already normalized, dot product = cosine similarity
    // Otherwise, compute magnitudes
    const mag1 = Math.sqrt(
      Array.from(vec1.values()).reduce((sum, v) => sum + v * v, 0)
    );
    const mag2 = Math.sqrt(
      Array.from(vec2.values()).reduce((sum, v) => sum + v * v, 0)
    );
    
    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }
    
    return dotProduct / (mag1 * mag2);
  }
  
  /**
   * Build a similarity matrix for all vectors
   * 
   * @param {Map<number, number>[]} vectors - Array of sparse vectors
   * @returns {number[][]} Similarity matrix (N x N)
   */
  static buildSimilarityMatrix(vectors) {
    const n = vectors.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // Self-similarity
      
      for (let j = i + 1; j < n; j++) {
        const sim = TfIdfVectorizer.cosineSimilarity(vectors[i], vectors[j]);
        matrix[i][j] = sim;
        matrix[j][i] = sim; // Symmetric
      }
    }
    
    return matrix;
  }
  
  /**
   * Get vocabulary statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      vocabularySize: this.vocabulary.size,
      documentCount: this.documentCount,
      normalize: this.normalize
    };
  }
}

module.exports = {
  TfIdfVectorizer,
  tokenizeWords,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH
};
