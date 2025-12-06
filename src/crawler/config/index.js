'use strict';

/**
 * Crawler configuration module.
 * Centralizes option normalization, schema validation, and mode detection.
 * @module crawler/config
 */

const {
  // Constants
  DEFAULT_OUTPUT_VERBOSITY,
  DEFAULT_FEATURE_FLAGS,
  TEN_MINUTES_MS,
  crawlerOptionsSchema,
  
  // Normalization functions
  normalizeOutputVerbosity,
  normalizeHost,
  normalizeOptions,
  flattenLoggingConfig,
  
  // Resolution functions
  resolvePriorityProfileFromCrawlType,
  buildGazetteerStageFilter,
  createCrawlerConfig,
  
  // Mode detection
  isGazetteerMode,
  isIntelligentMode,
  isBasicMode
} = require('./CrawlerConfigNormalizer');

module.exports = {
  // Constants
  DEFAULT_OUTPUT_VERBOSITY,
  DEFAULT_FEATURE_FLAGS,
  TEN_MINUTES_MS,
  crawlerOptionsSchema,
  
  // Normalization functions
  normalizeOutputVerbosity,
  normalizeHost,
  normalizeOptions,
  flattenLoggingConfig,
  
  // Resolution functions
  resolvePriorityProfileFromCrawlType,
  buildGazetteerStageFilter,
  createCrawlerConfig,
  
  // Mode detection
  isGazetteerMode,
  isIntelligentMode,
  isBasicMode
};
