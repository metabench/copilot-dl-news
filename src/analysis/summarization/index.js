'use strict';

/**
 * Summarization Module Exports
 * 
 * Extractive summarization using TextRank algorithm.
 * 
 * @module summarization
 */

const { Summarizer, DEFAULT_CONFIG, MIN_SENTENCES_FOR_SUMMARIZATION } = require('./Summarizer');
const { TextRank, DEFAULT_DAMPING, DEFAULT_CONVERGENCE, MAX_ITERATIONS, MIN_SIMILARITY } = require('./TextRank');
const { TfIdfVectorizer, tokenizeWords } = require('./TfIdfVectorizer');
const { tokenize, simpleSplit, countWords, truncateToWords, ABBREVIATIONS } = require('./SentenceTokenizer');

module.exports = {
  // Main service
  Summarizer,
  DEFAULT_CONFIG,
  MIN_SENTENCES_FOR_SUMMARIZATION,
  
  // TextRank algorithm
  TextRank,
  DEFAULT_DAMPING,
  DEFAULT_CONVERGENCE,
  MAX_ITERATIONS,
  MIN_SIMILARITY,
  
  // TF-IDF vectorization
  TfIdfVectorizer,
  tokenizeWords,
  
  // Sentence tokenization (can be shared with sentiment)
  tokenize,
  tokenizeSentences: tokenize, // Alias
  simpleSplit,
  countWords,
  truncateToWords,
  ABBREVIATIONS
};
