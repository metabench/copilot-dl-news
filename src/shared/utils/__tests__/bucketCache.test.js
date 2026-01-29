/**
 * Tests for bucket cache module
 */

const { BucketCache, getGlobalCache, resetGlobalCache } = require('../bucketCache');
const { createBucket } = require('../compressionBuckets');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('bucketCache', () => {
  let db;
  
  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create schema
    const { initCompressionTables } = require('../../../data/db/sqlite/schema');
    initCompressionTables(db, { verbose: false, logger: console });
  });
  
  afterEach(() => {
    db.close();
    resetGlobalCache();
  });
  
  describe('BucketCache', () => {
    test('should create cache with default options', () => {
      const cache = new BucketCache();
      
      expect(cache.maxSize).toBe(10);
      expect(cache.maxMemoryMB).toBe(500);
    });
    
    test('should create cache with custom options', () => {
      const cache = new BucketCache({ maxSize: 5, maxMemoryMB: 100 });
      
      expect(cache.maxSize).toBe(5);
      expect(cache.maxMemoryMB).toBe(100);
    });
    
    test('should cache decompressed bucket on first access', async () => {
      const items = [
        { key: 'item1', content: 'Content 1'.repeat(100) },
        { key: 'item2', content: 'Content 2'.repeat(100) }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_11',
        items
      });
      
      const cache = new BucketCache();
      const result = cache.get(db, bucketId);
      
      expect(Buffer.isBuffer(result.tarBuffer)).toBe(true);
      expect(result.fromCache).toBe(false);
      expect(result).toHaveProperty('decompressedSize');
      expect(result).toHaveProperty('decompressTime');
    });
    
    test('should return cached buffer on subsequent access', async () => {
      const items = [{ key: 'item1', content: 'Test content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_11',
        items
      });
      
      const cache = new BucketCache();
      
      // First access
      const first = cache.get(db, bucketId);
      expect(first.fromCache).toBe(false);
      
      // Second access
      const second = cache.get(db, bucketId);
      expect(second.fromCache).toBe(true);
      expect(second.tarBuffer).toBe(first.tarBuffer);  // Same buffer reference
    });
    
    test('should track cache hits and misses', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      const cache = new BucketCache();
      
      cache.get(db, bucketId);  // Miss
      cache.get(db, bucketId);  // Hit
      cache.get(db, bucketId);  // Hit
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(parseFloat(stats.hitRate)).toBeCloseTo(0.667, 2);
    });
    
    test('should evict LRU entry when maxSize exceeded', async () => {
      const cache = new BucketCache({ maxSize: 2 });
      
      // Create 3 buckets
      const bucket1 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b1', content: 'Content 1' }]
      });
      
      const bucket2 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b2', content: 'Content 2' }]
      });
      
      const bucket3 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b3', content: 'Content 3' }]
      });
      
      // Access buckets 1 and 2
      cache.get(db, bucket1.bucketId);
      cache.get(db, bucket2.bucketId);
      
      expect(cache.getStats().size).toBe(2);
      
      // Access bucket 3 should evict bucket 1 (least recently used)
      cache.get(db, bucket3.bucketId);
      
      expect(cache.getStats().size).toBe(2);
      expect(cache.getStats().evictions).toBe(1);
      expect(cache.has(bucket1.bucketId)).toBe(false);
      expect(cache.has(bucket2.bucketId)).toBe(true);
      expect(cache.has(bucket3.bucketId)).toBe(true);
    });
    
    test('should update access time on cache hit', async () => {
      const cache = new BucketCache({ maxSize: 2 });
      
      const bucket1 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b1', content: 'Content 1' }]
      });
      
      const bucket2 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b2', content: 'Content 2' }]
      });
      
      const bucket3 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b3', content: 'Content 3' }]
      });
      
      // Access buckets 1 and 2
      cache.get(db, bucket1.bucketId);
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure distinct timestamp
      cache.get(db, bucket2.bucketId);
      
      // Re-access bucket 1 (updates access time)
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure distinct timestamp
      cache.get(db, bucket1.bucketId);
      
      // Access bucket 3 should evict bucket 2 (now least recently used)
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure distinct timestamp
      cache.get(db, bucket3.bucketId);
      
      expect(cache.has(bucket1.bucketId)).toBe(true);
      expect(cache.has(bucket2.bucketId)).toBe(false);
      expect(cache.has(bucket3.bucketId)).toBe(true);
    });
    
    test('should manually evict entry', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      const cache = new BucketCache();
      cache.get(db, bucketId);
      
      expect(cache.has(bucketId)).toBe(true);
      
      cache.evict(bucketId);
      
      expect(cache.has(bucketId)).toBe(false);
    });
    
    test('should clear entire cache', async () => {
      const cache = new BucketCache();
      
      for (let i = 0; i < 3; i++) {
        const { bucketId } = await createBucket(db, {
          bucketType: 'test',
          compressionType: 'gzip_6',
          items: [{ key: `item${i}`, content: 'Content' }]
        });
        cache.get(db, bucketId);
      }
      
      expect(cache.getStats().size).toBe(3);
      
      cache.clear();
      
      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
    });
    
    test('should track access count', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      const cache = new BucketCache();
      
      cache.get(db, bucketId);
      cache.get(db, bucketId);
      cache.get(db, bucketId);
      
      const entries = cache.getEntries();
      expect(entries[0].accessCount).toBe(3);
    });
    
    test('should provide detailed statistics', async () => {
      const cache = new BucketCache({ maxSize: 10, maxMemoryMB: 100 });
      
      const items = [{ key: 'item1', content: 'A'.repeat(10000) }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_11',
        items
      });
      
      cache.get(db, bucketId);  // Miss
      cache.get(db, bucketId);  // Hit
      
      const stats = cache.getStats();
      
      expect(stats).toHaveProperty('size', 1);
      expect(stats).toHaveProperty('maxSize', 10);
      expect(stats).toHaveProperty('memoryUsageMB');
      expect(stats).toHaveProperty('maxMemoryMB', 100);
      expect(stats).toHaveProperty('hits', 1);
      expect(stats).toHaveProperty('misses', 1);
      expect(stats).toHaveProperty('evictions', 0);
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('avgDecompressTimeMs');
      expect(stats).toHaveProperty('totalDecompressTimeMs');
    });
    
    test('should prewarm cache with bucket IDs', async () => {
      const cache = new BucketCache();
      const bucketIds = [];
      
      for (let i = 0; i < 3; i++) {
        const { bucketId } = await createBucket(db, {
          bucketType: 'test',
          compressionType: 'gzip_6',
          items: [{ key: `item${i}`, content: 'Content' }]
        });
        bucketIds.push(bucketId);
      }
      
      const result = cache.prewarm(db, bucketIds);
      
      expect(result.loaded).toBe(3);
      expect(result.errors).toHaveLength(0);
      expect(cache.getStats().size).toBe(3);
      
      // Subsequent access should be cache hits
      cache.get(db, bucketIds[0]);
      expect(cache.getStats().hits).toBe(1);
    });
    
    test('should handle prewarm errors gracefully', async () => {
      const cache = new BucketCache();
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'item1', content: 'Content' }]
      });
      
      const result = cache.prewarm(db, [bucketId, 99999, 88888]);
      
      expect(result.loaded).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toHaveProperty('bucketId', 99999);
      expect(result.errors[0]).toHaveProperty('error');
    });
  });
  
  describe('getGlobalCache', () => {
    test('should create global cache instance', () => {
      const cache = getGlobalCache();
      
      expect(cache).toBeInstanceOf(BucketCache);
    });
    
    test('should return same instance on subsequent calls', () => {
      const cache1 = getGlobalCache();
      const cache2 = getGlobalCache();
      
      expect(cache1).toBe(cache2);
    });
    
    test('should accept options on first call', () => {
      const cache = getGlobalCache({ maxSize: 20 });
      
      expect(cache.maxSize).toBe(20);
    });
  });
  
  describe('resetGlobalCache', () => {
    test('should reset global cache', () => {
      const cache1 = getGlobalCache({ maxSize: 10 });
      
      resetGlobalCache();
      
      const cache2 = getGlobalCache({ maxSize: 20 });
      
      expect(cache1).not.toBe(cache2);
      expect(cache2.maxSize).toBe(20);
    });
  });
  
  describe('cache entries', () => {
    test('should provide entry details', async () => {
      const cache = new BucketCache();
      
      const items = [
        { key: 'item1', content: 'Content 1'.repeat(1000) },
        { key: 'item2', content: 'Content 2'.repeat(500) }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_11',
        items
      });
      
      cache.get(db, bucketId);
      cache.get(db, bucketId);
      
      const entries = cache.getEntries();
      
      expect(entries).toHaveLength(1);
      expect(entries[0]).toHaveProperty('bucketId', bucketId);
      expect(entries[0]).toHaveProperty('decompressedSize');
      expect(entries[0]).toHaveProperty('compressedSize');
      expect(entries[0]).toHaveProperty('compressionRatio');
      expect(entries[0]).toHaveProperty('accessCount', 2);
      expect(entries[0]).toHaveProperty('accessTime');
      expect(entries[0]).toHaveProperty('decompressTime');
    });
    
    test('should sort entries by access count', async () => {
      const cache = new BucketCache();
      
      const bucket1 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b1', content: 'Content 1' }]
      });
      
      const bucket2 = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'b2', content: 'Content 2' }]
      });
      
      // Access bucket1 once, bucket2 three times
      cache.get(db, bucket1.bucketId);
      cache.get(db, bucket2.bucketId);
      cache.get(db, bucket2.bucketId);
      cache.get(db, bucket2.bucketId);
      
      const entries = cache.getEntries();
      
      expect(entries[0].bucketId).toBe(bucket2.bucketId);
      expect(entries[0].accessCount).toBe(3);
      expect(entries[1].bucketId).toBe(bucket1.bucketId);
      expect(entries[1].accessCount).toBe(1);
    });
  });
});
