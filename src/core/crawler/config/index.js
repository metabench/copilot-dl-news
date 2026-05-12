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

const {
  DEFAULT_PROFILE_NAME,
  PROFILES: DEFAULT_CRAWL_PROFILES,
  getDefaultCrawlProfile,
  listProfileNames: listDefaultCrawlProfileNames,
  buildOverrides: buildDefaultCrawlOverrides
} = require('./defaultCrawlProfiles');

module.exports = {
  // Default CLI profiles (single source of truth for sensible defaults)
  DEFAULT_PROFILE_NAME,
  DEFAULT_CRAWL_PROFILES,
  getDefaultCrawlProfile,
  listDefaultCrawlProfileNames,
  buildDefaultCrawlOverrides,

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
