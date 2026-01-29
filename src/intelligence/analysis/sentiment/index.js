'use strict';

/**
 * Sentiment module index
 * 
 * Re-exports all sentiment analysis components.
 * 
 * @module analysis/sentiment
 */

const { SentimentAnalyzer, DEFAULT_CONFIG } = require('./SentimentAnalyzer');
const { Lexicon, AFINN_SCORES, NEGATION_WORDS, INTENSIFIERS, BUT_WORDS } = require('./Lexicon');
const { EntitySentiment, DEFAULT_ENTITY_CONFIG } = require('./EntitySentiment');

module.exports = {
  // Main analyzer
  SentimentAnalyzer,
  DEFAULT_CONFIG,
  
  // Lexicon
  Lexicon,
  AFINN_SCORES,
  NEGATION_WORDS,
  INTENSIFIERS,
  BUT_WORDS,
  
  // Entity sentiment
  EntitySentiment,
  DEFAULT_ENTITY_CONFIG
};
