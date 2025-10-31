/**
 * CompressionFacade - Unified Compression Interface
 * 
 * Single entry point for all compression operations. Centralizes:
 * - Algorithm validation and level clamping
 * - Preset definitions (PRESETS constants)
 * - Consistent stats object creation
 * - Compression type lookups
 * 
 * This module wraps the core compression logic from compression.js,
 * providing a cleaner API and eliminating duplication across articleCompression,
 * compressionBuckets, and other consumers.
 * 
 * Usage:
 *   const { compress, PRESETS } = require('./CompressionFacade');
 *   const result = compress(content, { preset: PRESETS.BROTLI_6 });
 */

const {
  compress: coreCompress,
  decompress: coreDecompress,
  getCompressionType: coreGetCompressionType,
  selectCompressionType: coreSelectCompressionType,
  compressAndStore: coreCompressAndStore,
  retrieveAndDecompress: coreRetrieveAndDecompress
} = require('./compression');
const { compressionConfig, COMPRESSION_PRESETS } = require('../config/compression');

/**
 * Compression type presets — standardized across the codebase
 * Use these constants instead of hardcoded strings
 */
const PRESETS = COMPRESSION_PRESETS;

/**
 * Mapping of preset names to algorithm + level
 * @private
 */
const PRESET_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(compressionConfig.types).map(([name, def]) => [name, { algorithm: def.algorithm, level: def.level }])
  )
);

/**
 * Valid algorithms and their allowed level ranges
 * @private
 */
const ALGORITHM_RANGES = {
  none: { min: 0, max: 0, default: 0 },
  gzip: { min: 1, max: 9, default: 6 },
  brotli: { min: 0, max: 11, default: 6 },
  zstd: { min: 1, max: 22, default: 3 }
};

/**
 * Validate and normalize compression options
 * 
 * Accepts either preset-based or explicit algorithm+level input.
 * Always returns a normalized { algorithm, level } object.
 * 
 * @param {Object} options - User-provided options
 * @param {string} [options.preset] - Preset name (e.g., 'brotli_6'), takes precedence
 * @param {string} [options.algorithm] - Algorithm ('gzip' | 'brotli' | 'zstd' | 'none')
 * @param {number} [options.level] - Compression level (clamped to algorithm's range)
 * @param {number} [options.windowBits] - Brotli window size (10-24)
 * @param {number} [options.blockBits] - Brotli block size (16-24)
 * @returns {Object} Normalized { algorithm, level, windowBits?, blockBits? }
 * @throws {Error} If preset or algorithm is invalid
 * 
 * @example
 *   // Using preset
 *   normalizeCompressionOptions({ preset: 'brotli_6' })
 *   // => { algorithm: 'brotli', level: 6 }
 *
 *   // Using explicit algorithm + level
 *   normalizeCompressionOptions({ algorithm: 'gzip', level: 15 })
 *   // => { algorithm: 'gzip', level: 9 } (clamped to 1-9)
 */
function normalizeCompressionOptions(options = {}) {
  let { preset, algorithm, level, windowBits, blockBits } = options;

  // Handle preset-based input (takes precedence)
  if (preset) {
    if (!PRESET_DEFINITIONS[preset]) {
      throw new Error(`Invalid compression preset: ${preset}. Use one of: ${Object.keys(PRESET_DEFINITIONS).join(', ')}`);
    }
    const presetDef = PRESET_DEFINITIONS[preset];
    algorithm = presetDef.algorithm;
    level = presetDef.level;
  } else {
    // Default algorithm if not specified
    algorithm = algorithm || 'gzip';
  }

  // Validate algorithm
  if (!ALGORITHM_RANGES[algorithm]) {
    throw new Error(`Invalid compression algorithm: ${algorithm}. Use one of: ${Object.keys(ALGORITHM_RANGES).join(', ')}`);
  }

  // Clamp level to algorithm's valid range
  const range = ALGORITHM_RANGES[algorithm];
  const normalizedLevel = level == null ? range.default : Math.max(range.min, Math.min(range.max, level));

  const result = { algorithm, level: normalizedLevel };

  // Pass through Brotli-specific parameters
  if (windowBits != null) {
    result.windowBits = Math.max(10, Math.min(24, windowBits));
  }
  if (blockBits != null) {
    result.blockBits = Math.max(16, Math.min(24, blockBits));
  }

  return result;
}

/**
 * Assert that compression options are valid. Throws with a contextual
 * message that can be tailored per call site.
 *
 * @param {Object} options - Compression options to validate
 * @param {string} [label='compression options'] - Label for error context
 */
function assertCompressionOptions(options = {}, label = 'compression options') {
  try {
    normalizeCompressionOptions(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} invalid: ${message}`);
  }
}

/**
 * Compress content with automatic option normalization
 * 
 * Wraps the core compress() function with validation and normalization.
 * Automatically handles preset-based or explicit algorithm/level input.
 * 
 * @param {Buffer|string} content - Content to compress
 * @param {Object} options - Compression options
 * @param {string} [options.preset] - Preset name (e.g., 'brotli_6')
 * @param {string} [options.algorithm] - Algorithm ('gzip' | 'brotli' | 'zstd' | 'none')
 * @param {number} [options.level] - Compression level
 * @param {number} [options.windowBits] - Brotli window size
 * @param {number} [options.blockBits] - Brotli block size
 * @returns {Object} Compression result with standardized stats
 *   { compressed: Buffer, uncompressedSize: number, compressedSize: number, 
 *     ratio: number, sha256: string, algorithm: string, timestamp: string }
 * @throws {Error} If compression fails or options are invalid
 * 
 * @example
 *   const result = compress(htmlContent, { preset: 'brotli_6' });
 *   console.log(result.ratio); // 0.25 (25% of original size)
 */
function compress(content, options = {}) {
  // Normalize options (validates preset/algorithm, clamps level)
  const normalized = normalizeCompressionOptions(options);

  // Call core compress() with normalized options
  const result = coreCompress(content, normalized);

  // Add algorithm and timestamp to stats
  return {
    ...result,
    algorithm: normalized.algorithm,
    timestamp: new Date().toISOString()
  };
}

/**
 * Decompress content
 * 
 * Wraps the core decompress() function for consistency with compress().
 * 
 * @param {Buffer} compressedBuffer - Compressed data
 * @param {string} [algorithm='gzip'] - Algorithm used for compression
 * @returns {Buffer} Decompressed content
 * @throws {Error} If decompression fails
 */
function decompress(compressedBuffer, algorithm = 'gzip') {
  return coreDecompress(compressedBuffer, algorithm);
}

/**
 * Get compression type configuration from database
 * 
 * Looks up a compression type by name and returns its database record.
 * This is the centralized interface for all compression type lookups.
 * 
 * @param {import('better-sqlite3').Database} db - Database connection
 * @param {string} typeName - Compression type name (e.g., 'brotli_6')
 * @returns {Object|null} { id, algorithm, level, description } or null if not found
 * 
 * @example
 *   const type = getCompressionType(db, 'brotli_6');
 *   // => { id: 11, algorithm: 'brotli', level: 6, description: 'Brotli level 6 (balanced)' }
 */
function getCompressionType(db, typeName) {
  if (!db) {
    throw new Error('CompressionFacade.getCompressionType requires a database connection');
  }

  if (!typeName) {
    throw new Error('CompressionFacade.getCompressionType requires a compression type name');
  }

  return coreGetCompressionType(db, typeName);
}

/**
 * Create a standardized stats object for compression results
 * 
 * Factory function to ensure consistent stats shape across all compression operations.
 * 
 * @param {Buffer} compressed - Compressed data
 * @param {number} uncompressedSize - Original size
 * @param {string} algorithm - Algorithm used
 * @param {string} [sha256] - SHA256 hash of uncompressed content
 * @returns {Object} Standardized stats
 *   { uncompressedSize, compressedSize, ratio, algorithm, sha256, timestamp }
 */
function createStatsObject(compressed, uncompressedSize, algorithm, sha256) {
  const compressedSize = compressed ? compressed.length : 0;
  const ratio = uncompressedSize > 0 ? compressedSize / uncompressedSize : 0;

  return {
    uncompressedSize,
    compressedSize,
    ratio,
    algorithm,
    sha256: sha256 || null,
    timestamp: new Date().toISOString()
  };
}

/**
 * Determine if two compression options are equivalent
 * 
 * Useful for caching or deduplication logic.
 * 
 * @param {Object} options1 - First compression options
 * @param {Object} options2 - Second compression options
 * @returns {boolean} True if options normalize to the same algorithm + level
 */
function areCompressionOptionsEqual(options1 = {}, options2 = {}) {
  try {
    const norm1 = normalizeCompressionOptions(options1);
    const norm2 = normalizeCompressionOptions(options2);
    return norm1.algorithm === norm2.algorithm && norm1.level === norm2.level;
  } catch (_) {
    return false;
  }
}

/**
 * Get human-readable description of compression settings
 * 
 * @param {string} preset - Preset name (e.g., 'brotli_6')
 * @returns {string} Readable description (e.g., 'Brotli level 6 (balanced)')
 */
function describePreset(preset) {
  const definition = PRESET_DEFINITIONS[preset];
  if (!definition) {
    return `Unknown preset: ${preset}`;
  }

  const typeMetadata = compressionConfig.types[preset];
  if (typeMetadata && typeMetadata.description) {
    return typeMetadata.description;
  }

  const algorithm = definition.algorithm.charAt(0).toUpperCase() + definition.algorithm.slice(1);
  return `${algorithm} level ${definition.level}`;
}

function compressAndStore(db, content, options = {}) {
  return coreCompressAndStore(db, content, options);
}

function retrieveAndDecompress(db, contentId) {
  return coreRetrieveAndDecompress(db, contentId);
}

function selectCompressionType(db, contentSize, useCase = 'balanced') {
  return coreSelectCompressionType(db, contentSize, useCase);
}

module.exports = {
  // Constants
  PRESETS,
  PRESET_DEFINITIONS,
  ALGORITHM_RANGES,
  COMPRESSION_PRESETS,

  // Main functions
  compress,
  decompress,
  normalizeCompressionOptions,
  assertCompressionOptions,

  // Database lookups
  getCompressionType,
  selectCompressionType,
  compressAndStore,
  retrieveAndDecompress,

  // Utilities
  createStatsObject,
  areCompressionOptionsEqual,
  describePreset
};
