'use strict';

/**
 * SimHasher - SimHash fingerprinting for near-duplicate detection
 * 
 * Adapter for news-db-pure-analysis.
 * Maintains compatibility with legacy Buffer-based API.
 * 
 * @module SimHasher
 */

const {
  fnv1a64: pureFnv1a64,
  tokenize: pureTokenize,
  computeSimHash: pureComputeSimHash,
  hammingDistance: pureHammingDistance,
  distanceToSimilarity: pureDistanceToSimilarity,
  getMatchType: pureGetMatchType
} = require('news-db-pure-analysis');

/**
 * FNV-1a 64-bit hash
 * @param {string} str
 * @returns {bigint}
 */
function fnv1a64(str) {
  return pureFnv1a64(str);
}

/**
 * Tokenize text
 * @param {string} text
 * @param {Object} [options]
 * @returns {string[]}
 */
function tokenize(text, options = {}) {
  // Map legacy options to pure options
  // pure.text.tokenize supports: { minLength, removeStopwords, lowercase }
  // Legacy SimHasher supports: { minWordLength, removeStopwords }
  const pureOptions = {
    minLength: options.minWordLength || 2,
    removeStopwords: options.removeStopwords || false,
    lowercase: true
  };
  return pureTokenize(text, pureOptions);
}

/**
 * Compute SimHash fingerprint for text
 * 
 * @param {string} text - Text to fingerprint
 * @param {Object} [options] - Options (Ignored by pure computeSimHash, but we tokenize internally in pure)
 * @returns {Buffer} 8-byte Buffer containing 64-bit fingerprint (Little Endian)
 */
function compute(text, options = {}) {
  // Pure computeSimHash uses its own internal tokenize (simple), ignoring options.
  // Ideally, pure should use text.tokenize.
  // For strict compatibility where options rely on removeStopwords, this might vary slightly.
  // However, callers of compute() in copilot-dl-news do not pass options.
  // So standard pure.computeSimHash is sufficient.

  const hex = pureComputeSimHash(text);

  // Convert Hex string (BigInt representation) to Buffer (Little Endian storage)
  // hex "1234" -> 0x1234 -> Buffer [0x34, 0x12, ...]
  const val = BigInt('0x' + hex);
  return bigIntToBuffer(val);
}

/**
 * Calculate Hamming distance between two fingerprints
 * 
 * @param {Buffer} fp1 - First fingerprint
 * @param {Buffer} fp2 - Second fingerprint
 * @returns {number} Hamming distance (0-64)
 */
function hammingDistance(fp1, fp2) {
  // Normalize to Buffers
  const buf1 = Buffer.isBuffer(fp1) ? fp1 : fromHexString(fp1);
  const buf2 = Buffer.isBuffer(fp2) ? fp2 : fromHexString(fp2);

  const v1 = bufferToBigInt(buf1);
  const v2 = bufferToBigInt(buf2);

  // Use pure implementation
  // pure expects hex strings.
  return pureHammingDistance(v1.toString(16), v2.toString(16));
}

/**
 * Check if two fingerprints are near-duplicates
 */
function isNearDuplicate(fp1, fp2, threshold = 3) {
  return hammingDistance(fp1, fp2) <= threshold;
}

/**
 * Helper to convert distance to similarity score
 */
function distanceToSimilarity(distance) {
  return pureDistanceToSimilarity(distance);
}

/**
 * Helper to get match type
 */
function getMatchType(distance) {
  return pureGetMatchType(distance);
}

// --- Utilities ---

/**
 * Convert fingerprint Buffer to BigInt (Little Endian read)
 */
function bufferToBigInt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== 8) {
    // If it's a zero-filled buffer or invalid, handle gracefully or throw?
    // Legacy threw error.
    if (buffer.length !== 8) throw new Error('Invalid fingerprint buffer: must be 8 bytes');
  }
  return buffer.readBigUInt64LE();
}

/**
 * Convert BigInt to fingerprint Buffer (Little Endian write)
 */
function bigIntToBuffer(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

/**
 * Convert Buffer to Hex String (Legacy format was just hex of buffer bytes?)
 * Legacy: fingerprint.toString('hex') -> "LE Bytes Hex"
 */
function toHexString(fingerprint) {
  if (!Buffer.isBuffer(fingerprint) || fingerprint.length !== 8) {
    throw new Error('Invalid fingerprint buffer');
  }
  return fingerprint.toString('hex');
}

/**
 * Convert Hex String to Buffer
 */
function fromHexString(hex) {
  if (typeof hex !== 'string' || hex.length !== 16) {
    // Legacy threw? Or handled?
    // Legacy: throw error.
    // If pure returns short hex (e.g. 0), we should pad?
    // pure pads to 16.
    if (hex.length !== 16) throw new Error('Invalid hex string: must be 16 characters');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Count set bits (polyfilled for API compatibility if used externally)
 */
function popcount64(value) {
  let count = 0;
  let v = value;
  while (v !== 0n) {
    v &= (v - 1n);
    count++;
  }
  return count;
}

module.exports = {
  compute,
  hammingDistance,
  tokenize,
  fnv1a64,
  popcount64,
  bufferToBigInt,
  bigIntToBuffer,
  toHexString,
  fromHexString,
  distanceToSimilarity,
  getMatchType,
  isNearDuplicate
};
