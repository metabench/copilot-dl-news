/**
 * Bucket Cache Module
 * 
 * LRU cache for decompressed tar buckets to improve retrieval performance.
 * First access: ~150ms (decompress + extract), Cached: <1ms (memory lookup + extract)
 */

const { decompress } = require('./CompressionFacade');

/**
 * LRU Cache for compression buckets
 * Stores decompressed tar buffers in memory to avoid repeated decompression
 */
class BucketCache {
  /**
   * Create a new bucket cache
   * 
   * @param {Object} options - Cache options
   * @param {number} [options.maxSize] - Maximum number of buckets to cache (default: 10)
   * @param {number} [options.maxMemoryMB] - Maximum memory usage in MB (default: 500)
   */
  constructor(options = {}) {
    this.maxSize = Math.max(1, options.maxSize || 10);  // Minimum 1
    this.maxMemoryMB = Math.max(1, options.maxMemoryMB || 500);  // Minimum 1MB
    this.cache = new Map();  // bucketId -> { tarBuffer, compressedSize, decompressedSize, accessTime, accessCount }
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalDecompressTimeMs: 0
    };
  }
  
  /**
   * Get decompressed tar buffer from cache or decompress and cache
   * 
   * @param {Database} db - better-sqlite3 database instance
   * @param {number} bucketId - Bucket ID
   * @returns {Object} { tarBuffer, fromCache }
   */
  get(db, bucketId) {
    // Check cache
    if (this.cache.has(bucketId)) {
      const entry = this.cache.get(bucketId);
      entry.accessTime = Date.now();
      entry.accessCount++;
      this.stats.hits++;
      
      return {
        tarBuffer: entry.tarBuffer,
        fromCache: true,
        decompressedSize: entry.decompressedSize
      };
    }
    
    // Cache miss - fetch and decompress
    this.stats.misses++;
    
    const bucket = db.prepare(`
      SELECT cb.bucket_blob, cb.compressed_size, ct.algorithm
      FROM compression_buckets cb
      JOIN compression_types ct ON cb.compression_type_id = ct.id
      WHERE cb.id = ?
    `).get(bucketId);
    
    if (!bucket) {
      throw new Error(`Bucket not found: ${bucketId}`);
    }
    
    // Decompress
    const startTime = Date.now();
    const tarBuffer = decompress(bucket.bucket_blob, bucket.algorithm);
    const decompressTime = Date.now() - startTime;
    this.stats.totalDecompressTimeMs += decompressTime;
    
    const decompressedSize = tarBuffer.length;
    
    // Add to cache
    this.cache.set(bucketId, {
      tarBuffer,
      compressedSize: bucket.compressed_size,
      decompressedSize,
      accessTime: Date.now(),
      accessCount: 1,
      decompressTime
    });
    
    // Evict if needed
    this._evictIfNeeded();
    
    return {
      tarBuffer,
      fromCache: false,
      decompressedSize,
      decompressTime
    };
  }
  
  /**
   * Check if bucket is cached
   * 
   * @param {number} bucketId - Bucket ID
   * @returns {boolean}
   */
  has(bucketId) {
    return this.cache.has(bucketId);
  }
  
  /**
   * Remove bucket from cache
   * 
   * @param {number} bucketId - Bucket ID
   * @returns {boolean} True if removed
   */
  evict(bucketId) {
    return this.cache.delete(bucketId);
  }
  
  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalDecompressTimeMs: 0
    };
  }
  
  /**
   * Get cache statistics
   * 
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalMemoryMB = this._getTotalMemoryUsage();
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? this.stats.hits / (this.stats.hits + this.stats.misses)
      : 0;
    const avgDecompressTime = this.stats.misses > 0
      ? this.stats.totalDecompressTimeMs / this.stats.misses
      : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      memoryUsageMB: totalMemoryMB,
      maxMemoryMB: this.maxMemoryMB,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: hitRate.toFixed(3),
      avgDecompressTimeMs: avgDecompressTime.toFixed(1),
      totalDecompressTimeMs: this.stats.totalDecompressTimeMs
    };
  }
  
  /**
   * Get cache entries sorted by access time
   * 
   * @returns {Array<Object>} Cache entries with metadata
   */
  getEntries() {
    return Array.from(this.cache.entries())
      .map(([bucketId, entry]) => ({
        bucketId,
        decompressedSize: entry.decompressedSize,
        compressedSize: entry.compressedSize,
        compressionRatio: (entry.compressedSize / entry.decompressedSize).toFixed(3),
        accessCount: entry.accessCount,
        accessTime: new Date(entry.accessTime).toISOString(),
        decompressTime: entry.decompressTime
      }))
      .sort((a, b) => b.accessCount - a.accessCount);
  }
  
  /**
   * Evict entries if cache exceeds limits
   * Uses LRU (Least Recently Used) strategy
   * 
   * @private
   */
  _evictIfNeeded() {
    // Check size limit
    while (this.cache.size > this.maxSize) {
      this._evictLRU();
    }
    
    // Check memory limit
    while (this._getTotalMemoryUsage() > this.maxMemoryMB) {
      this._evictLRU();
    }
  }
  
  /**
   * Evict least recently used entry
   * 
   * @private
   */
  _evictLRU() {
    if (this.cache.size === 0) return;
    
    // Find entry with oldest accessTime
    let oldestBucketId = null;
    let oldestAccessTime = Infinity;
    
    for (const [bucketId, entry] of this.cache.entries()) {
      if (entry.accessTime < oldestAccessTime) {
        oldestAccessTime = entry.accessTime;
        oldestBucketId = bucketId;
      }
    }
    
    if (oldestBucketId !== null) {
      this.cache.delete(oldestBucketId);
      this.stats.evictions++;
    }
  }
  
  /**
   * Calculate total memory usage of cached buffers
   * 
   * @private
   * @returns {number} Memory usage in MB
   */
  _getTotalMemoryUsage() {
    let totalBytes = 0;
    
    for (const entry of this.cache.values()) {
      totalBytes += entry.decompressedSize;
    }
    
    return totalBytes / (1024 * 1024);
  }
  
  /**
   * Prewarm cache with specific buckets
   * Useful for loading frequently accessed buckets at startup
   * 
   * @param {Database} db - better-sqlite3 database instance
   * @param {Array<number>} bucketIds - Array of bucket IDs to prewarm
   * @returns {Object} { loaded: number, errors: Array }
   */
  prewarm(db, bucketIds) {
    const errors = [];
    let loaded = 0;
    
    for (const bucketId of bucketIds) {
      try {
        this.get(db, bucketId);
        loaded++;
      } catch (error) {
        errors.push({ bucketId, error: error.message });
      }
    }
    
    return { loaded, errors };
  }
}

/**
 * Global singleton cache instance (optional convenience)
 */
let globalCache = null;

/**
 * Get or create global cache instance
 * 
 * @param {Object} options - Cache options
 * @returns {BucketCache}
 */
function getGlobalCache(options) {
  if (!globalCache) {
    globalCache = new BucketCache(options);
  }
  return globalCache;
}

/**
 * Reset global cache instance
 */
function resetGlobalCache() {
  if (globalCache) {
    globalCache.clear();
  }
  globalCache = null;
}

module.exports = {
  BucketCache,
  getGlobalCache,
  resetGlobalCache
};
