'use strict';

/**
 * SimilarityIndex - Locality-Sensitive Hashing (LSH) index for fast similarity search
 * 
 * LSH enables sub-linear time similarity search by hashing similar items
 * to the same buckets with high probability.
 * 
 * Uses MinHash signatures split into bands:
 * - 128 hash values split into 16 bands of 8 rows each
 * - Two signatures collide in a band if all 8 values match
 * - P(collision at Jaccard J) ≈ 1 - (1 - J^8)^16
 * - At J=0.5: ~47% chance of at least one band collision
 * - At J=0.8: ~99% chance of at least one band collision
 * 
 * @module SimilarityIndex
 */

const MinHasher = require('./MinHasher');
const SimHasher = require('./SimHasher');

// Default LSH configuration
const DEFAULT_NUM_BANDS = 16;
const DEFAULT_ROWS_PER_BAND = 8; // 128 hashes / 16 bands = 8 rows per band

/**
 * LSH Index for fast similarity search
 */
class SimilarityIndex {
  /**
   * Create a new SimilarityIndex
   * 
   * @param {Object} [options] - Configuration options
   * @param {number} [options.numBands=16] - Number of LSH bands
   * @param {number} [options.rowsPerBand=8] - Rows (hashes) per band
   * @param {number} [options.simhashThreshold=3] - Max Hamming distance for SimHash screening
   */
  constructor(options = {}) {
    this.numBands = options.numBands || DEFAULT_NUM_BANDS;
    this.rowsPerBand = options.rowsPerBand || DEFAULT_ROWS_PER_BAND;
    this.simhashThreshold = options.simhashThreshold || 3;
    
    // Band buckets: Map<bandIndex, Map<bucketHash, Set<contentId>>>
    this.bandBuckets = new Map();
    for (let i = 0; i < this.numBands; i++) {
      this.bandBuckets.set(i, new Map());
    }
    
    // Store fingerprints for verification: Map<contentId, {simhash, minhash}>
    this.fingerprints = new Map();
  }
  
  /**
   * Get the number of indexed items
   * @returns {number} Number of items in index
   */
  get size() {
    return this.fingerprints.size;
  }
  
  /**
   * Add an item to the index
   * 
   * @param {number} contentId - Content ID
   * @param {Buffer} simhash - 8-byte SimHash fingerprint
   * @param {Buffer} minhash - 512-byte MinHash signature
   */
  add(contentId, simhash, minhash) {
    if (!Buffer.isBuffer(simhash) || simhash.length !== 8) {
      throw new Error('simhash must be an 8-byte Buffer');
    }
    if (minhash && (!Buffer.isBuffer(minhash) || minhash.length !== this.numBands * this.rowsPerBand * 4)) {
      throw new Error(`minhash must be a ${this.numBands * this.rowsPerBand * 4}-byte Buffer`);
    }
    
    // Remove existing entry if present
    this.remove(contentId);
    
    // Store fingerprints
    this.fingerprints.set(contentId, { simhash, minhash });
    
    // Index MinHash bands if signature provided
    if (minhash) {
      for (let b = 0; b < this.numBands; b++) {
        const band = MinHasher.extractBand(minhash, b, this.numBands, this.rowsPerBand);
        const bucketHash = MinHasher.hashBand(band);
        
        const buckets = this.bandBuckets.get(b);
        if (!buckets.has(bucketHash)) {
          buckets.set(bucketHash, new Set());
        }
        buckets.get(bucketHash).add(contentId);
      }
    }
  }
  
  /**
   * Remove an item from the index
   * 
   * @param {number} contentId - Content ID to remove
   * @returns {boolean} True if item was removed
   */
  remove(contentId) {
    const fp = this.fingerprints.get(contentId);
    if (!fp) return false;
    
    // Remove from band buckets
    if (fp.minhash) {
      for (let b = 0; b < this.numBands; b++) {
        const band = MinHasher.extractBand(fp.minhash, b, this.numBands, this.rowsPerBand);
        const bucketHash = MinHasher.hashBand(band);
        
        const buckets = this.bandBuckets.get(b);
        const bucket = buckets.get(bucketHash);
        if (bucket) {
          bucket.delete(contentId);
          if (bucket.size === 0) {
            buckets.delete(bucketHash);
          }
        }
      }
    }
    
    this.fingerprints.delete(contentId);
    return true;
  }
  
  /**
   * Query for similar items using LSH
   * 
   * @param {Buffer} simhash - Query SimHash fingerprint
   * @param {Buffer} minhash - Query MinHash signature
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=10] - Maximum number of results
   * @param {number} [options.minSimilarity=0.5] - Minimum Jaccard similarity threshold
   * @param {number} [options.excludeId] - Content ID to exclude (e.g., self)
   * @returns {Array<{contentId: number, similarity: number, matchType: string}>} Ranked results
   */
  query(simhash, minhash, options = {}) {
    const {
      limit = 10,
      minSimilarity = 0.5,
      excludeId = null
    } = options;
    
    if (!Buffer.isBuffer(simhash) || simhash.length !== 8) {
      throw new Error('simhash must be an 8-byte Buffer');
    }
    
    // Stage 1: Find LSH candidates from MinHash bands
    const candidates = new Set();
    
    if (minhash && Buffer.isBuffer(minhash)) {
      for (let b = 0; b < this.numBands; b++) {
        const band = MinHasher.extractBand(minhash, b, this.numBands, this.rowsPerBand);
        const bucketHash = MinHasher.hashBand(band);
        
        const bucket = this.bandBuckets.get(b).get(bucketHash);
        if (bucket) {
          for (const id of bucket) {
            if (id !== excludeId) {
              candidates.add(id);
            }
          }
        }
      }
    }
    
    // If no LSH candidates, fall back to SimHash screening (slower)
    if (candidates.size === 0) {
      for (const [id, fp] of this.fingerprints) {
        if (id !== excludeId) {
          const distance = SimHasher.hammingDistance(simhash, fp.simhash);
          if (distance <= this.simhashThreshold * 2) {
            candidates.add(id);
          }
        }
      }
    }
    
    // Stage 2: Verify candidates with actual similarity computation
    const results = [];
    
    for (const candidateId of candidates) {
      const fp = this.fingerprints.get(candidateId);
      if (!fp) continue;
      
      // Calculate SimHash distance
      const simhashDistance = SimHasher.hammingDistance(simhash, fp.simhash);
      const matchType = SimHasher.getMatchType(simhashDistance);
      
      // Calculate MinHash similarity if both have signatures
      let similarity;
      if (minhash && fp.minhash) {
        similarity = MinHasher.jaccardSimilarity(minhash, fp.minhash);
      } else {
        // Fall back to SimHash-based similarity estimate
        similarity = SimHasher.distanceToSimilarity(simhashDistance);
      }
      
      if (similarity >= minSimilarity) {
        results.push({
          contentId: candidateId,
          similarity,
          simhashDistance,
          matchType
        });
      }
    }
    
    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    
    // Return top results
    return results.slice(0, limit);
  }
  
  /**
   * Find exact or near-duplicates using SimHash only
   * 
   * @param {Buffer} simhash - Query SimHash fingerprint
   * @param {Object} [options] - Options
   * @param {number} [options.threshold=3] - Maximum Hamming distance
   * @param {number} [options.excludeId] - Content ID to exclude
   * @returns {Array<{contentId: number, distance: number}>} Matching items
   */
  findDuplicates(simhash, options = {}) {
    const { threshold = 3, excludeId = null } = options;
    
    if (!Buffer.isBuffer(simhash) || simhash.length !== 8) {
      throw new Error('simhash must be an 8-byte Buffer');
    }
    
    const results = [];
    
    for (const [id, fp] of this.fingerprints) {
      if (id === excludeId) continue;
      
      const distance = SimHasher.hammingDistance(simhash, fp.simhash);
      if (distance <= threshold) {
        results.push({
          contentId: id,
          distance,
          matchType: SimHasher.getMatchType(distance)
        });
      }
    }
    
    // Sort by distance ascending (closest first)
    results.sort((a, b) => a.distance - b.distance);
    
    return results;
  }
  
  /**
   * Get fingerprints for a content ID
   * 
   * @param {number} contentId - Content ID
   * @returns {{simhash: Buffer, minhash: Buffer} | null} Fingerprints or null
   */
  get(contentId) {
    return this.fingerprints.get(contentId) || null;
  }
  
  /**
   * Check if an item exists in the index
   * 
   * @param {number} contentId - Content ID
   * @returns {boolean} True if exists
   */
  has(contentId) {
    return this.fingerprints.has(contentId);
  }
  
  /**
   * Clear the index
   */
  clear() {
    for (let i = 0; i < this.numBands; i++) {
      this.bandBuckets.set(i, new Map());
    }
    this.fingerprints.clear();
  }
  
  /**
   * Get index statistics
   * 
   * @returns {Object} Statistics about the index
   */
  getStats() {
    let totalBuckets = 0;
    let maxBucketSize = 0;
    let minBucketSize = Infinity;
    let totalBucketItems = 0;
    
    for (let b = 0; b < this.numBands; b++) {
      const buckets = this.bandBuckets.get(b);
      totalBuckets += buckets.size;
      
      for (const bucket of buckets.values()) {
        const size = bucket.size;
        totalBucketItems += size;
        if (size > maxBucketSize) maxBucketSize = size;
        if (size < minBucketSize) minBucketSize = size;
      }
    }
    
    if (minBucketSize === Infinity) minBucketSize = 0;
    
    return {
      itemCount: this.fingerprints.size,
      numBands: this.numBands,
      rowsPerBand: this.rowsPerBand,
      totalBuckets,
      avgBucketSize: totalBuckets > 0 ? totalBucketItems / totalBuckets : 0,
      maxBucketSize,
      minBucketSize
    };
  }
  
  /**
   * Estimate probability of collision at given Jaccard similarity
   * 
   * P(at least one band collision) = 1 - (1 - s^r)^b
   * where s = Jaccard similarity, r = rows per band, b = number of bands
   * 
   * @param {number} similarity - Jaccard similarity (0-1)
   * @returns {number} Probability of at least one band collision
   */
  collisionProbability(similarity) {
    const s = similarity;
    const r = this.rowsPerBand;
    const b = this.numBands;
    
    return 1 - Math.pow(1 - Math.pow(s, r), b);
  }
}

/**
 * Create a SimilarityIndex with default settings
 * 
 * @param {Object} [options] - Options
 * @returns {SimilarityIndex} New index instance
 */
function createIndex(options = {}) {
  return new SimilarityIndex(options);
}

module.exports = {
  SimilarityIndex,
  createIndex,
  DEFAULT_NUM_BANDS,
  DEFAULT_ROWS_PER_BAND
};
