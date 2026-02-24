'use strict';

/**
 * SentenceTokenizer - Split text into sentences
 * 
 * Thin adapter over news-db-pure-analysis/summarization.
 * Preserves the original API contract.
 * 
 * @module SentenceTokenizer
 */

const {
  tokenizeSentences,
  simpleSplitSentences,
  sentenceCountWords,
  truncateToWords: pureTruncateToWords,
  isAbbreviation: pureIsAbbreviation,
  ABBREVIATIONS
} = require('news-db-pure-analysis');

/**
 * Check if a word ending with period is an abbreviation
 * @param {string} word - Word to check (with period)
 * @param {string} nextWord - Next word (for capitalization check)
 * @returns {boolean} True if likely an abbreviation
 */
function isAbbreviation(word, nextWord = '') {
  return pureIsAbbreviation(word, nextWord);
}

/**
 * Tokenize text into sentences
 * 
 * @param {string} text - Input text
 * @returns {Array<{text: string, start: number, end: number, index: number}>} Sentences
 */
function tokenize(text) {
  return tokenizeSentences(text);
}

/**
 * Simple sentence splitter (less sophisticated, but faster)
 * Splits on .!? followed by space and capital letter
 * 
 * @param {string} text - Input text
 * @returns {string[]} Array of sentence strings
 */
function simpleSplit(text) {
  return simpleSplitSentences(text);
}

/**
 * Count words in text
 * @param {string} text - Input text
 * @returns {number} Word count
 */
function countWords(text) {
  return sentenceCountWords(text);
}

/**
 * Truncate text to approximately N words
 * @param {string} text - Input text
 * @param {number} maxWords - Maximum words
 * @returns {string} Truncated text
 */
function truncateToWords(text, maxWords) {
  return pureTruncateToWords(text, maxWords);
}

module.exports = {
  tokenize,
  simpleSplit,
  countWords,
  truncateToWords,
  isAbbreviation,
  ABBREVIATIONS
};
