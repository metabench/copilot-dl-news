'use strict';

/**
 * TfIdfVectorizer - TF-IDF vectorization for sentences
 * 
 * Thin adapter over news-db-pure-analysis/text/tfidf.
 * Maintains the class-based API for backward compatibility with
 * TextRank.js and Summarizer.js consumers.
 * 
 * @module TfIdfVectorizer
 */

const {
  tokenizeForTfIdf,
  tfidfTF,
  tfidfIDF,
  buildVocabulary,
  tfidfSparseVector,
  tfidfCosineSimilarity,
  tfidfSimilarityMatrix
} = require('news-db-pure-analysis');

// Minimum word length to consider
const MIN_WORD_LENGTH = 3;

// Maximum word length (avoid garbage)
const MAX_WORD_LENGTH = 30;

/**
 * Tokenize text into words
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of lowercase tokens
 */
function tokenizeWords(text) {
  return tokenizeForTfIdf(text, {
    minLength: MIN_WORD_LENGTH,
    maxLength: MAX_WORD_LENGTH
  });
}

/**
 * TfIdfVectorizer class for sentence vectorization
 * 
 * Wraps pure-functional TF-IDF from news-db-pure-analysis
 * with a class-based API for backward compatibility.
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

    const tokenized = documents.map(d => tokenizeWords(d));
    this.documentCount = documents.length;
    this.idf = tfidfIDF(tokenized);
    this.vocabulary = buildVocabulary(this.idf);

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

    return tfidfSparseVector(tokens, this.idf, this.vocabulary, this.normalize);
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
    return tfidfCosineSimilarity(vec1, vec2);
  }

  /**
   * Build a similarity matrix for all vectors
   * 
   * @param {Map<number, number>[]} vectors - Array of sparse vectors
   * @returns {number[][]} Similarity matrix (N x N)
   */
  static buildSimilarityMatrix(vectors) {
    return tfidfSimilarityMatrix(vectors);
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
