/**
 * Tests for compression buckets module
 */

const { createBucket, retrieveFromBucket, listBucketEntries, getBucketStats, finalizeBucket, deleteBucket, queryBuckets } = require('../compressionBuckets');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('compressionBuckets', () => {
  let db;
  
  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create schema
    const { initCompressionTables } = require('../../db/sqlite/schema');
    initCompressionTables(db, { verbose: false, logger: console });
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('createBucket', () => {
    test('should create bucket with multiple items', async () => {
      const items = [
        { key: 'article1', content: '<html>Article 1 content</html>'.repeat(10) },
        { key: 'article2', content: '<html>Article 2 content</html>'.repeat(10) },
        { key: 'article3', content: '<html>Article 3 content</html>'.repeat(10) }
      ];
      
      const result = await createBucket(db, {
        bucketType: 'article_content',
        compressionType: 'brotli_11',
        items
      });
      
      expect(result).toHaveProperty('bucketId');
      expect(result).toHaveProperty('compressionType', 'brotli_11');
      expect(result).toHaveProperty('itemCount', 3);
      expect(result).toHaveProperty('uncompressedSize');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('ratio');
      expect(result.compressedSize).toBeLessThan(result.uncompressedSize);
    });
    
    test('should create bucket with domain pattern', async () => {
      const items = [
        { key: 'page1', content: 'Content 1' },
        { key: 'page2', content: 'Content 2' }
      ];
      
      const result = await createBucket(db, {
        bucketType: 'http_body',
        domainPattern: '%.theguardian.com',
        compressionType: 'gzip_6',
        items
      });
      
      expect(result.bucketId).toBeGreaterThan(0);
      
      // Verify in database
      const stored = db.prepare('SELECT * FROM compression_buckets WHERE id = ?').get(result.bucketId);
      expect(stored.domain_pattern).toBe('%.theguardian.com');
    });
    
    test('should create bucket with item metadata', async () => {
      const items = [
        { 
          key: 'doc1', 
          content: 'Document 1 content',
          metadata: { title: 'Doc 1', author: 'John Doe' }
        },
        { 
          key: 'doc2', 
          content: 'Document 2 content',
          metadata: { title: 'Doc 2', author: 'Jane Smith' }
        }
      ];
      
      const result = await createBucket(db, {
        bucketType: 'analysis_results',
        compressionType: 'brotli_6',
        items
      });
      
      expect(result.bucketId).toBeGreaterThan(0);
      
      // Verify metadata stored in index
      const stored = db.prepare('SELECT index_json FROM compression_buckets WHERE id = ?').get(result.bucketId);
      const index = JSON.parse(stored.index_json);
      expect(index.doc1.metadata).toEqual({ title: 'Doc 1', author: 'John Doe' });
      expect(index.doc2.metadata).toEqual({ title: 'Doc 2', author: 'Jane Smith' });
    });
    
    test('should throw error for empty items', async () => {
      await expect(createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: []
      })).rejects.toThrow('Cannot create empty bucket');
    });
    
    test('should throw error for missing item keys', async () => {
      await expect(createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ content: 'test' }]  // Missing key
      })).rejects.toThrow('must have a key');
    });
    
    test('should throw error for duplicate item keys', async () => {
      await expect(createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [
          { key: 'doc1', content: 'Content 1' },
          { key: 'doc1', content: 'Content 2' }  // Duplicate key
        ]
      })).rejects.toThrow('Duplicate key');
    });
    
    test('should achieve better compression with similar content', async () => {
      // Create items with similar structure
      const baseHTML = '<html><head><title>Article</title></head><body><article>';
      const items = Array.from({ length: 10 }, (_, i) => ({
        key: `article${i}`,
        content: `${baseHTML}<h1>Headline ${i}</h1><p>${'Text content. '.repeat(100)}</p></article></body></html>`
      }));
      
      const result = await createBucket(db, {
        bucketType: 'article_content',
        compressionType: 'brotli_11',
        items
      });
      
      // Bucket compression should achieve better ratio due to shared patterns
      expect(result.ratio).toBeLessThan(0.15);  // <15% (better than 6.67:1)
    });
  });
  
  describe('retrieveFromBucket', () => {
    test('should retrieve item from bucket', async () => {
      const items = [
        { key: 'item1', content: 'Content 1 with some text' },
        { key: 'item2', content: 'Content 2 with other text' },
        { key: 'item3', content: 'Content 3 with more text' }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_6',
        items
      });
      
      const retrieved = await retrieveFromBucket(db, bucketId, 'item2');
      
      expect(Buffer.isBuffer(retrieved.content)).toBe(true);
      expect(retrieved.content.toString('utf8')).toBe('Content 2 with other text');
    });
    
    test('should retrieve item with metadata', async () => {
      const items = [
        { 
          key: 'doc1', 
          content: 'Document content',
          metadata: { version: 1, tags: ['important'] }
        }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      const retrieved = await retrieveFromBucket(db, bucketId, 'doc1');
      
      expect(retrieved.metadata).toEqual({ version: 1, tags: ['important'] });
    });
    
    test('should throw error for non-existent bucket', async () => {
      await expect(retrieveFromBucket(db, 99999, 'key1'))
        .rejects.toThrow('Bucket not found');
    });
    
    test('should throw error for non-existent entry', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      await expect(retrieveFromBucket(db, bucketId, 'nonexistent'))
        .rejects.toThrow('Entry not found');
    });
    
    test('should work with cached tar buffer', async () => {
      const items = [{ key: 'cached', content: 'Cached content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_11',
        items
      });
      
      // First retrieval (will decompress)
      const first = await retrieveFromBucket(db, bucketId, 'cached');
      
      // Get the decompressed tar buffer for caching simulation
      const bucket = db.prepare('SELECT bucket_blob FROM compression_buckets WHERE id = ?').get(bucketId);
      const { decompress } = require('../compression');
      const tarBuffer = decompress(bucket.bucket_blob, 'brotli');
      
      // Second retrieval with cached buffer
      const second = await retrieveFromBucket(db, bucketId, 'cached', tarBuffer);
      
      expect(first.content.toString('utf8')).toBe(second.content.toString('utf8'));
    });
  });
  
  describe('listBucketEntries', () => {
    test('should list all entries in bucket', async () => {
      const items = [
        { key: 'entry1', content: 'Content 1' },
        { key: 'entry2', content: 'Content 2 longer' },
        { key: 'entry3', content: 'C3' }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      const entries = listBucketEntries(db, bucketId);
      
      expect(entries).toHaveLength(3);
      expect(entries.map(e => e.key)).toEqual(['entry1', 'entry2', 'entry3']);
      expect(entries[0]).toHaveProperty('filename');
      expect(entries[0]).toHaveProperty('size');
    });
    
    test('should include metadata in listing', async () => {
      const items = [
        { key: 'doc1', content: 'Content', metadata: { type: 'article' } }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'brotli_6',
        items
      });
      
      const entries = listBucketEntries(db, bucketId);
      
      expect(entries[0].metadata).toEqual({ type: 'article' });
    });
    
    test('should throw error for non-existent bucket', () => {
      expect(() => listBucketEntries(db, 99999)).toThrow('Bucket not found');
    });
  });
  
  describe('getBucketStats', () => {
    test('should return bucket statistics', async () => {
      const items = [
        { key: 'item1', content: 'Content 1' },
        { key: 'item2', content: 'Content 2' }
      ];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'article_content',
        domainPattern: '%.example.com',
        compressionType: 'brotli_9',
        items
      });
      
      const stats = getBucketStats(db, bucketId);
      
      expect(stats).toHaveProperty('id', bucketId);
      expect(stats).toHaveProperty('bucket_type', 'article_content');
      expect(stats).toHaveProperty('domain_pattern', '%.example.com');
      expect(stats).toHaveProperty('content_count', 2);
      expect(stats).toHaveProperty('uncompressed_size');
      expect(stats).toHaveProperty('compressed_size');
      expect(stats).toHaveProperty('compression_ratio');
      expect(stats).toHaveProperty('compression_type', 'brotli_9');
      expect(stats).toHaveProperty('algorithm', 'brotli');
      expect(stats).toHaveProperty('level', 9);
    });
    
    test('should throw error for non-existent bucket', () => {
      expect(() => getBucketStats(db, 99999)).toThrow('Bucket not found');
    });
  });
  
  describe('finalizeBucket', () => {
    test('should finalize bucket', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      finalizeBucket(db, bucketId);
      
      const bucket = db.prepare('SELECT finalized_at FROM compression_buckets WHERE id = ?').get(bucketId);
      expect(bucket.finalized_at).not.toBeNull();
    });
    
    test('should throw error when finalizing already finalized bucket', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      finalizeBucket(db, bucketId);
      
      expect(() => finalizeBucket(db, bucketId)).toThrow('already finalized');
    });
  });
  
  describe('deleteBucket', () => {
    test('should delete bucket', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      deleteBucket(db, bucketId);
      
      const bucket = db.prepare('SELECT * FROM compression_buckets WHERE id = ?').get(bucketId);
      expect(bucket).toBeUndefined();
    });
    
    test('should throw error when deleting bucket with references', async () => {
      const items = [{ key: 'item1', content: 'Content' }];
      
      const { bucketId } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items
      });
      
      // Create reference in content_storage
      db.prepare(`
        INSERT INTO content_storage (storage_type, compression_bucket_id, bucket_entry_key)
        VALUES (?, ?, ?)
      `).run('bucket_compressed', bucketId, 'item1');
      
      expect(() => deleteBucket(db, bucketId)).toThrow('content_storage rows reference it');
    });
  });
  
  describe('queryBuckets', () => {
    test('should query buckets by type', async () => {
      await createBucket(db, {
        bucketType: 'article_content',
        compressionType: 'gzip_6',
        items: [{ key: 'a1', content: 'Content' }]
      });
      
      await createBucket(db, {
        bucketType: 'http_body',
        compressionType: 'brotli_6',
        items: [{ key: 'b1', content: 'Content' }]
      });
      
      const results = queryBuckets(db, { bucketType: 'article_content' });
      
      expect(results).toHaveLength(1);
      expect(results[0].bucket_type).toBe('article_content');
    });
    
    test('should query buckets by domain pattern', async () => {
      await createBucket(db, {
        bucketType: 'test',
        domainPattern: '%.example.com',
        compressionType: 'gzip_6',
        items: [{ key: 'e1', content: 'Content' }]
      });
      
      await createBucket(db, {
        bucketType: 'test',
        domainPattern: '%.test.org',
        compressionType: 'gzip_6',
        items: [{ key: 't1', content: 'Content' }]
      });
      
      const results = queryBuckets(db, { domainPattern: '%.example.com' });
      
      expect(results).toHaveLength(1);
      expect(results[0].domain_pattern).toBe('%.example.com');
    });
    
    test('should query only finalized buckets', async () => {
      const { bucketId: bucket1 } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'f1', content: 'Content' }]
      });
      
      const { bucketId: bucket2 } = await createBucket(db, {
        bucketType: 'test',
        compressionType: 'gzip_6',
        items: [{ key: 'f2', content: 'Content' }]
      });
      
      finalizeBucket(db, bucket1);
      
      const results = queryBuckets(db, { finalizedOnly: true });
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(bucket1);
    });
    
    test('should limit results', async () => {
      for (let i = 0; i < 5; i++) {
        await createBucket(db, {
          bucketType: 'test',
          compressionType: 'gzip_6',
          items: [{ key: `item${i}`, content: 'Content' }]
        });
      }
      
      const results = queryBuckets(db, { limit: 3 });
      
      expect(results).toHaveLength(3);
    });
  });
});
