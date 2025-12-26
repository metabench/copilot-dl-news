'use strict';

/**
 * SimHasher - SimHash fingerprinting for near-duplicate detection
 * 
 * SimHash creates a 64-bit fingerprint where similar documents have
 * low Hamming distance. Distance ≤3 suggests near-duplicate.
 * 
 * Algorithm:
 * 1. Tokenize text into words
 * 2. For each word, compute 64-bit hash (FNV-1a)
 * 3. For each bit position, sum +1 if bit is 1, -1 if bit is 0
 * 4. Final fingerprint: bit[i] = 1 if sum[i] > 0, else 0
 * 
 * @module SimHasher
 */

/**
 * FNV-1a 64-bit hash (pure JS implementation using BigInt)
 * 
 * FNV offset basis: 14695981039346656037
 * FNV prime: 1099511628211
 * 
 * @param {string} str - String to hash
 * @returns {bigint} 64-bit hash as BigInt
 */
function fnv1a64(str) {
  const FNV_OFFSET = 14695981039346656037n;
  const FNV_PRIME = 1099511628211n;
  const MASK_64 = (1n << 64n) - 1n;
  
  let hash = FNV_OFFSET;
  
  for (let i = 0; i < str.length; i++) {
    const byte = BigInt(str.charCodeAt(i) & 0xFF);
    hash ^= byte;
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  
  return hash;
}

/**
 * Tokenize text into words
 * - Lowercase
 * - Remove punctuation
 * - Filter short words (<2 chars)
 * - Filter stopwords (optional, disabled by default for consistency)
 * 
 * @param {string} text - Text to tokenize
 * @param {Object} [options] - Tokenization options
 * @param {number} [options.minWordLength=2] - Minimum word length
 * @param {boolean} [options.removeStopwords=false] - Remove common stopwords
 * @returns {string[]} Array of tokens
 */
function tokenize(text, options = {}) {
  const { minWordLength = 2, removeStopwords = false } = options;
  
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Stopwords to optionally filter (common English words)
  const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'when',
    'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
    'there', 'then', 'once', 'if', 'because', 'until', 'while', 'although'
  ]);
  
  // Normalize: lowercase and replace non-word chars with spaces
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Split and filter
  const words = normalized.split(' ').filter(word => {
    if (word.length < minWordLength) return false;
    if (removeStopwords && STOPWORDS.has(word)) return false;
    return true;
  });
  
  return words;
}

/**
 * Compute SimHash fingerprint for text
 * 
 * @param {string} text - Text to fingerprint
 * @param {Object} [options] - Options
 * @param {number} [options.minWordLength=2] - Minimum word length for tokenization
 * @returns {Buffer} 8-byte Buffer containing 64-bit fingerprint
 */
function compute(text, options = {}) {
  const tokens = tokenize(text, options);
  
  if (tokens.length === 0) {
    // Return zero fingerprint for empty/invalid text
    return Buffer.alloc(8);
  }
  
  // Initialize bit position sums (64 positions)
  const bitSums = new Array(64).fill(0);
  
  // Process each token
  for (const token of tokens) {
    const hash = fnv1a64(token);
    
    // Update bit sums: +1 if bit is set, -1 if not
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & 1n;
      bitSums[i] += bit === 1n ? 1 : -1;
    }
  }
  
  // Generate fingerprint: bit[i] = 1 if sum[i] > 0, else 0
  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (bitSums[i] > 0) {
      fingerprint |= (1n << BigInt(i));
    }
  }
  
  // Convert to 8-byte Buffer (little-endian)
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(fingerprint);
  
  return buffer;
}

/**
 * Convert fingerprint Buffer to BigInt
 * 
 * @param {Buffer} buffer - 8-byte fingerprint buffer
 * @returns {bigint} Fingerprint as BigInt
 */
function bufferToBigInt(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length !== 8) {
    throw new Error('Invalid fingerprint buffer: must be 8 bytes');
  }
  return buffer.readBigUInt64LE();
}

/**
 * Convert BigInt to fingerprint Buffer
 * 
 * @param {bigint} value - Fingerprint as BigInt
 * @returns {Buffer} 8-byte fingerprint buffer
 */
function bigIntToBuffer(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return buffer;
}

/**
 * Calculate Hamming distance between two fingerprints
 * 
 * Hamming distance is the number of bit positions where the two
 * fingerprints differ. Lower distance = more similar.
 * 
 * - Distance 0: Identical content
 * - Distance 1-3: Near-duplicate (minor edits)
 * - Distance 4-10: Similar content
 * - Distance >10: Different content
 * 
 * @param {Buffer} fp1 - First fingerprint (8-byte Buffer)
 * @param {Buffer} fp2 - Second fingerprint (8-byte Buffer)
 * @returns {number} Hamming distance (0-64)
 */
function hammingDistance(fp1, fp2) {
  if (!Buffer.isBuffer(fp1) || fp1.length !== 8) {
    throw new Error('fp1 must be an 8-byte Buffer');
  }
  if (!Buffer.isBuffer(fp2) || fp2.length !== 8) {
    throw new Error('fp2 must be an 8-byte Buffer');
  }
  
  const v1 = fp1.readBigUInt64LE();
  const v2 = fp2.readBigUInt64LE();
  
  // XOR gives us bits that differ
  const xor = v1 ^ v2;
  
  // Count set bits (popcount)
  return popcount64(xor);
}

/**
 * Count set bits in a 64-bit BigInt (popcount)
 * 
 * @param {bigint} value - 64-bit value
 * @returns {number} Number of set bits
 */
function popcount64(value) {
  let count = 0;
  let v = value;
  
  // Brian Kernighan's algorithm
  while (v !== 0n) {
    v &= (v - 1n);
    count++;
  }
  
  return count;
}

/**
 * Calculate similarity score from Hamming distance
 * 
 * Converts Hamming distance (0-64) to similarity score (0-1).
 * Score = 1 - (distance / 64)
 * 
 * @param {number} distance - Hamming distance (0-64)
 * @returns {number} Similarity score (0-1)
 */
function distanceToSimilarity(distance) {
  return 1 - (distance / 64);
}

/**
 * Determine match type from Hamming distance
 * 
 * @param {number} distance - Hamming distance
 * @returns {'exact' | 'near' | 'similar' | 'different'} Match type
 */
function getMatchType(distance) {
  if (distance === 0) return 'exact';
  if (distance <= 3) return 'near';
  if (distance <= 10) return 'similar';
  return 'different';
}

/**
 * Check if two fingerprints are near-duplicates
 * 
 * @param {Buffer} fp1 - First fingerprint
 * @param {Buffer} fp2 - Second fingerprint
 * @param {number} [threshold=3] - Maximum Hamming distance for near-duplicate
 * @returns {boolean} True if near-duplicate
 */
function isNearDuplicate(fp1, fp2, threshold = 3) {
  return hammingDistance(fp1, fp2) <= threshold;
}

/**
 * Format fingerprint as hex string for display/debugging
 * 
 * @param {Buffer} fingerprint - 8-byte fingerprint buffer
 * @returns {string} Hex string representation
 */
function toHexString(fingerprint) {
  if (!Buffer.isBuffer(fingerprint) || fingerprint.length !== 8) {
    throw new Error('Invalid fingerprint buffer');
  }
  return fingerprint.toString('hex');
}

/**
 * Parse hex string to fingerprint Buffer
 * 
 * @param {string} hex - Hex string (16 chars)
 * @returns {Buffer} 8-byte fingerprint buffer
 */
function fromHexString(hex) {
  if (typeof hex !== 'string' || hex.length !== 16) {
    throw new Error('Invalid hex string: must be 16 characters');
  }
  return Buffer.from(hex, 'hex');
}

module.exports = {
  // Core functions
  compute,
  hammingDistance,
  
  // Utilities
  tokenize,
  fnv1a64,
  popcount64,
  
  // Conversions
  bufferToBigInt,
  bigIntToBuffer,
  toHexString,
  fromHexString,
  
  // Helpers
  distanceToSimilarity,
  getMatchType,
  isNearDuplicate
};
