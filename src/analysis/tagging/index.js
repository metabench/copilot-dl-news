'use strict';

/**
 * Content Tagging Module
 * 
 * Exports all tagging components for content categorization:
 * - KeywordExtractor: TF-IDF based keyword extraction
 * - CategoryClassifier: Rule-based topic classification
 * - EntityRecognizer: Named entity recognition (PERSON, ORG, GPE)
 * - TaggingService: Orchestration service
 * 
 * @module analysis/tagging
 */

const { KeywordExtractor, tokenize, stem, MIN_WORD_LENGTH, MAX_WORD_LENGTH, DEFAULT_TOP_N } = require('./KeywordExtractor');
const { CategoryClassifier, loadConfig, UNCATEGORIZED, DEFAULT_CONFIG_PATH } = require('./CategoryClassifier');
const { EntityRecognizer, PERSON_TITLES, ORG_SUFFIXES, ORG_KEYWORDS, COMMON_FIRST_NAMES } = require('./EntityRecognizer');
const { TaggingService, createTaggingService } = require('./TaggingService');
const { STOPWORDS, isStopword, removeStopwords, getStopwords } = require('./stopwords');

module.exports = {
  // Main classes
  KeywordExtractor,
  CategoryClassifier,
  EntityRecognizer,
  TaggingService,
  
  // Factory function
  createTaggingService,
  
  // Utility functions
  tokenize,
  stem,
  isStopword,
  removeStopwords,
  getStopwords,
  loadConfig,
  
  // Constants
  STOPWORDS,
  PERSON_TITLES,
  ORG_SUFFIXES,
  ORG_KEYWORDS,
  COMMON_FIRST_NAMES,
  UNCATEGORIZED,
  DEFAULT_CONFIG_PATH,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
  DEFAULT_TOP_N
};
