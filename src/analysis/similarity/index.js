'use strict';

/**
 * Content Similarity Engine - Module Index
 * 
 * Provides duplicate and similarity detection for articles using:
 * - SimHash: 64-bit fingerprints for near-duplicate detection
 * - MinHash: 128-hash signatures for Jaccard similarity estimation
 * - LSH: Locality-Sensitive Hashing for fast similarity search
 * 
 * @module analysis/similarity
 */

const SimHasher = require('./SimHasher');
const MinHasher = require('./MinHasher');
const { SimilarityIndex, createIndex } = require('./SimilarityIndex');
const { DuplicateDetector, createDuplicateDetector, MIN_WORD_COUNT } = require('./DuplicateDetector');

module.exports = {
  // SimHash
  SimHasher,
  
  // MinHash
  MinHasher,
  
  // LSH Index
  SimilarityIndex,
  createIndex,
  
  // Main Service
  DuplicateDetector,
  createDuplicateDetector,
  MIN_WORD_COUNT
};
