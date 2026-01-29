'use strict';

/**
 * MinHasher - MinHash signatures for Jaccard similarity estimation
 * 
 * MinHash approximates Jaccard similarity between sets of shingles (n-grams).
 * Uses 128 hash functions to create a signature that can be compared quickly.
 * 
 * Algorithm:
 * 1. Convert text to shingles (word n-grams)
 * 2. For each of 128 hash functions:
 *    - Compute hash for all shingles
 *    - Keep minimum hash value
 * 3. Signature = array of 128 minimum hashes
 * 
 * Jaccard similarity ≈ (matching minimums) / 128
 * 
 * @module MinHasher
 */

// Default configuration
const DEFAULT_NUM_HASHES = 128;
const DEFAULT_SHINGLE_SIZE = 3;

// Pre-generated seeds for reproducibility (128 random 32-bit values)
// These must be consistent across all computations
const HASH_SEEDS = generateSeeds(DEFAULT_NUM_HASHES);

/**
 * Generate deterministic seeds for hash functions
 * Uses a simple PRNG seeded with a fixed value for reproducibility
 * 
 * @param {number} count - Number of seeds to generate
 * @returns {number[]} Array of 32-bit seed values
 */
function generateSeeds(count) {
  const seeds = [];
  // Use a fixed seed for reproducibility
  let state = 0x12345678;
  
  for (let i = 0; i < count; i++) {
    // Simple xorshift32 PRNG
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    seeds.push(state >>> 0); // Convert to unsigned 32-bit
  }
  
  return seeds;
}

/**
 * FNV-1a 32-bit hash with seed
 * 
 * @param {string} str - String to hash
 * @param {number} seed - Seed value to mix in
 * @returns {number} 32-bit hash value
 */
function fnv1a32Seeded(str, seed) {
  const FNV_OFFSET = 2166136261;
  const FNV_PRIME = 16777619;
  
  // Mix seed into initial value
  let hash = FNV_OFFSET ^ seed;
  
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i) & 0xFF;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  
  return hash;
}

/**
 * Tokenize text into words for shingling
 * 
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of words
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(word => word.length >= 2);
}

/**
 * Generate shingles (word n-grams) from text
 * 
 * @param {string} text - Text to shingle
 * @param {number} [size=3] - Shingle size (number of words per shingle)
 * @returns {Set<string>} Set of unique shingles
 */
function shingle(text, size = DEFAULT_SHINGLE_SIZE) {
  const words = tokenize(text);
  const shingles = new Set();
  
  if (words.length < size) {
    // If text has fewer words than shingle size, use whole text as one shingle
    if (words.length > 0) {
      shingles.add(words.join(' '));
    }
    return shingles;
  }
  
  for (let i = 0; i <= words.length - size; i++) {
    const shingleWords = words.slice(i, i + size);
    shingles.add(shingleWords.join(' '));
  }
  
  return shingles;
}

/**
 * Compute MinHash signature for text
 * 
 * @param {string} text - Text to compute signature for
 * @param {Object} [options] - Options
 * @param {number} [options.numHashes=128] - Number of hash functions
 * @param {number} [options.shingleSize=3] - Shingle size (word n-grams)
 * @returns {Buffer} 512-byte Buffer (128 × 4-byte hashes) or null for empty text
 */
function compute(text, options = {}) {
  const {
    numHashes = DEFAULT_NUM_HASHES,
    shingleSize = DEFAULT_SHINGLE_SIZE
  } = options;
  
  const shingles = shingle(text, shingleSize);
  
  if (shingles.size === 0) {
    // Return null for empty/invalid text
    return null;
  }
  
  // Initialize signature with max values
  const signature = new Uint32Array(numHashes).fill(0xFFFFFFFF);
  
  // For each shingle, compute all hash functions and keep minimums
  for (const s of shingles) {
    for (let i = 0; i < numHashes; i++) {
      const hash = fnv1a32Seeded(s, HASH_SEEDS[i % HASH_SEEDS.length]);
      if (hash < signature[i]) {
        signature[i] = hash;
      }
    }
  }
  
  // Convert to Buffer (little-endian)
  return Buffer.from(signature.buffer);
}

/**
 * Calculate Jaccard similarity from two MinHash signatures
 * 
 * @param {Buffer} sig1 - First signature (512-byte Buffer)
 * @param {Buffer} sig2 - Second signature (512-byte Buffer)
 * @param {number} [numHashes=128] - Number of hash functions used
 * @returns {number} Jaccard similarity estimate (0-1)
 */
function jaccardSimilarity(sig1, sig2, numHashes = DEFAULT_NUM_HASHES) {
  if (!sig1 || !sig2) {
    return 0;
  }
  
  if (!Buffer.isBuffer(sig1) || sig1.length !== numHashes * 4) {
    throw new Error(`sig1 must be a ${numHashes * 4}-byte Buffer`);
  }
  if (!Buffer.isBuffer(sig2) || sig2.length !== numHashes * 4) {
    throw new Error(`sig2 must be a ${numHashes * 4}-byte Buffer`);
  }
  
  let matching = 0;
  
  for (let i = 0; i < numHashes; i++) {
    const offset = i * 4;
    const h1 = sig1.readUInt32LE(offset);
    const h2 = sig2.readUInt32LE(offset);
    
    if (h1 === h2) {
      matching++;
    }
  }
  
  return matching / numHashes;
}

/**
 * Compute exact Jaccard similarity between two texts (for testing)
 * 
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @param {number} [shingleSize=3] - Shingle size
 * @returns {number} Exact Jaccard similarity (0-1)
 */
function exactJaccardSimilarity(text1, text2, shingleSize = DEFAULT_SHINGLE_SIZE) {
  const shingles1 = shingle(text1, shingleSize);
  const shingles2 = shingle(text2, shingleSize);
  
  if (shingles1.size === 0 && shingles2.size === 0) {
    return 1; // Both empty = identical
  }
  
  if (shingles1.size === 0 || shingles2.size === 0) {
    return 0; // One empty, one not = no similarity
  }
  
  // Intersection
  let intersection = 0;
  for (const s of shingles1) {
    if (shingles2.has(s)) {
      intersection++;
    }
  }
  
  // Union = |A| + |B| - |A ∩ B|
  const union = shingles1.size + shingles2.size - intersection;
  
  return intersection / union;
}

/**
 * Extract a band (subset) from a MinHash signature for LSH
 * 
 * @param {Buffer} signature - Full MinHash signature
 * @param {number} bandIndex - Band index (0-based)
 * @param {number} [numBands=16] - Total number of bands
 * @param {number} [rowsPerBand=8] - Rows per band (numHashes / numBands)
 * @returns {Buffer} Band portion of signature
 */
function extractBand(signature, bandIndex, numBands = 16, rowsPerBand = 8) {
  if (!Buffer.isBuffer(signature)) {
    throw new Error('signature must be a Buffer');
  }
  
  const bytesPerHash = 4;
  const bandSize = rowsPerBand * bytesPerHash;
  const offset = bandIndex * bandSize;
  
  if (offset + bandSize > signature.length) {
    throw new Error(`Band ${bandIndex} out of range for signature`);
  }
  
  return signature.subarray(offset, offset + bandSize);
}

/**
 * Hash a band to a bucket identifier for LSH
 * 
 * @param {Buffer} band - Band data
 * @returns {string} Bucket identifier (hex string)
 */
function hashBand(band) {
  // Use FNV-1a hash on the band bytes
  let hash = 2166136261;
  
  for (let i = 0; i < band.length; i++) {
    hash ^= band[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  
  return hash.toString(16).padStart(8, '0');
}

/**
 * Convert signature Buffer to array of hashes (for debugging/inspection)
 * 
 * @param {Buffer} signature - 512-byte signature buffer
 * @param {number} [numHashes=128] - Number of hash values
 * @returns {number[]} Array of 32-bit hash values
 */
function signatureToArray(signature, numHashes = DEFAULT_NUM_HASHES) {
  if (!Buffer.isBuffer(signature) || signature.length !== numHashes * 4) {
    throw new Error(`Invalid signature: expected ${numHashes * 4} bytes`);
  }
  
  const arr = [];
  for (let i = 0; i < numHashes; i++) {
    arr.push(signature.readUInt32LE(i * 4));
  }
  return arr;
}

/**
 * Convert array of hashes to signature Buffer
 * 
 * @param {number[]} arr - Array of 32-bit hash values
 * @returns {Buffer} Signature buffer
 */
function arrayToSignature(arr) {
  const buffer = Buffer.alloc(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buffer.writeUInt32LE(arr[i] >>> 0, i * 4);
  }
  return buffer;
}

module.exports = {
  // Core functions
  compute,
  jaccardSimilarity,
  
  // Utilities
  shingle,
  tokenize,
  exactJaccardSimilarity,
  
  // LSH support
  extractBand,
  hashBand,
  
  // Conversions
  signatureToArray,
  arrayToSignature,
  
  // Constants
  DEFAULT_NUM_HASHES,
  DEFAULT_SHINGLE_SIZE,
  HASH_SEEDS
};
