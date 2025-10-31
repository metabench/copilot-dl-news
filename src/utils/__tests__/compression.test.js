/**
 * Tests for compression utility module
 */

const {
  compress,
  decompress,
  getCompressionType,
  selectCompressionType,
  compressAndStore,
  retrieveAndDecompress
} = require('../CompressionFacade');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('compression', () => {
  let db;
  
  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create schema
    const { initializeSchema } = require('../../db/sqlite/schema');
    initializeSchema(db, { verbose: false, logger: console });
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('compress', () => {
    const testContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100);
    
    test('should compress with gzip level 6', () => {
      const result = compress(testContent, { algorithm: 'gzip', level: 6 });
      
      expect(result).toHaveProperty('compressed');
      expect(result).toHaveProperty('uncompressedSize');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('ratio');
      expect(result).toHaveProperty('sha256');
      expect(Buffer.isBuffer(result.compressed)).toBe(true);
      expect(result.compressedSize).toBeLessThan(result.uncompressedSize);
      expect(result.ratio).toBeLessThan(1);
    });
    
    test('should compress with brotli level 11', () => {
      const result = compress(testContent, { algorithm: 'brotli', level: 11 });
      
      expect(result.compressedSize).toBeLessThan(result.uncompressedSize);
      expect(result.algorithm).toBe('brotli');
      expect(result.level).toBe(11);
    });
    
    test('should achieve better compression with brotli 11 vs gzip 9', () => {
      const gzipResult = compress(testContent, { algorithm: 'gzip', level: 9 });
      const brotliResult = compress(testContent, { algorithm: 'brotli', level: 11 });
      
      expect(brotliResult.compressedSize).toBeLessThan(gzipResult.compressedSize);
      expect(brotliResult.ratio).toBeLessThan(gzipResult.ratio);
    });
    
    test('should handle Buffer input', () => {
      const buffer = Buffer.from(testContent, 'utf8');
      const result = compress(buffer, { algorithm: 'gzip', level: 6 });
      
      expect(result.uncompressedSize).toBe(buffer.length);
    });
    
    test('should handle no compression', () => {
      const result = compress(testContent, { algorithm: 'none' });
      
      expect(result.compressed.toString('utf8')).toBe(testContent);
      expect(result.compressedSize).toBe(result.uncompressedSize);
      expect(result.ratio).toBe(1);
    });
    
    test('should handle empty content', () => {
      const result = compress('', { algorithm: 'gzip' });
      
      expect(result.uncompressedSize).toBe(0);
      expect(result.compressedSize).toBe(0);
      expect(result.ratio).toBe(0);
      expect(result.sha256).toBeDefined();
    });
    
    test('should accept custom window and block bits for brotli', () => {
      const result = compress(testContent, {
        algorithm: 'brotli',
        level: 11,
        windowBits: 24,
        blockBits: 24
      });
      
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThan(1);
    });
  });
  
  describe('decompress', () => {
    const testContent = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100);
    
    test('should decompress gzip compressed content', () => {
      const { compressed } = compress(testContent, { algorithm: 'gzip', level: 6 });
      const decompressed = decompress(compressed, 'gzip');
      
      expect(decompressed.toString('utf8')).toBe(testContent);
    });
    
    test('should decompress brotli compressed content', () => {
      const { compressed } = compress(testContent, { algorithm: 'brotli', level: 11 });
      const decompressed = decompress(compressed, 'brotli');
      
      expect(decompressed.toString('utf8')).toBe(testContent);
    });
    
    test('should handle no compression', () => {
      const buffer = Buffer.from(testContent, 'utf8');
      const decompressed = decompress(buffer, 'none');
      
      expect(decompressed.toString('utf8')).toBe(testContent);
    });
    
    test('should throw error for non-Buffer input', () => {
      expect(() => decompress('not a buffer', 'gzip')).toThrow('must be a Buffer');
    });
  });
  
  describe('getCompressionType', () => {
    test('should retrieve compression type by name', () => {
      const type = getCompressionType(db, 'brotli_11');
      
      expect(type).toHaveProperty('id');
      expect(type.name).toBe('brotli_11');
      expect(type.algorithm).toBe('brotli');
      expect(type.level).toBe(11);
      expect(type.memory_mb).toBe(256);
      expect(type.window_bits).toBe(24);
      expect(type.block_bits).toBe(24);
    });
    
    test('should retrieve gzip compression type', () => {
      const type = getCompressionType(db, 'gzip_6');
      
      expect(type.name).toBe('gzip_6');
      expect(type.algorithm).toBe('gzip');
      expect(type.level).toBe(6);
    });
    
    test('should throw error for unknown type', () => {
      expect(() => getCompressionType(db, 'unknown_type')).toThrow('Unknown compression type');
    });
  });
  
  describe('selectCompressionType', () => {
    test('should select no compression for very small files', () => {
      const type = selectCompressionType(db, 500, 'balanced');
      expect(type.name).toBe('none');
    });
    
    test('should select gzip for small files in realtime mode', () => {
      const type = selectCompressionType(db, 50 * 1024, 'realtime');
      expect(type.algorithm).toBe('gzip');
      expect(type.level).toBeLessThanOrEqual(3);
    });
    
    test('should select brotli 11 for large files in archival mode', () => {
      const type = selectCompressionType(db, 500 * 1024, 'archival');
      expect(type.name).toBe('brotli_11');
    });
    
    test('should select balanced compression for medium files', () => {
      const type = selectCompressionType(db, 50 * 1024, 'balanced');
      expect(type.algorithm).toBe('brotli');
      expect(type.level).toBeGreaterThanOrEqual(4);
      expect(type.level).toBeLessThanOrEqual(7);
    });
  });
  
  describe('compressAndStore', () => {
    const testContent = '<html><body>Test article content</body></html>'.repeat(50);
    
    test('should compress and store content', () => {
      const result = compressAndStore(db, testContent, {
        compressionType: 'brotli_6'
      });
      
      expect(result).toHaveProperty('contentId');
      expect(result).toHaveProperty('compressionType', 'brotli_6');
      expect(result).toHaveProperty('algorithm', 'brotli');
      expect(result).toHaveProperty('level', 6);
      expect(result).toHaveProperty('uncompressedSize');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('ratio');
      expect(result).toHaveProperty('sha256');
      expect(result.compressedSize).toBeLessThan(result.uncompressedSize);
    });
    
    test('should auto-select compression type based on size', () => {
      // Create larger content to trigger high compression (>100KB)
      const largeContent = '<html><body>Test article content</body></html>'.repeat(3000);
      
      const result = compressAndStore(db, largeContent, {
        useCase: 'archival'
      });
      
      // Should select high compression for archival with large files
      expect(result.compressionType).toMatch(/^brotli_(10|11)$/);
    });
    
    test('should store content in database', () => {
      const result = compressAndStore(db, testContent, {
        compressionType: 'gzip_6'
      });
      
      // Verify stored in database
      const stored = db.prepare('SELECT * FROM content_storage WHERE id = ?').get(result.contentId);
      expect(stored).toBeTruthy();
      expect(stored.storage_type).toBe('db_compressed');
      expect(stored.content_sha256).toBe(result.sha256);
    });
  });
  
  describe('retrieveAndDecompress', () => {
    const testContent = '<html><body>Test article content for retrieval</body></html>'.repeat(30);
    
    test('should retrieve and decompress stored content', () => {
      const { contentId } = compressAndStore(db, testContent, {
        compressionType: 'brotli_9'
      });
      
      const retrieved = retrieveAndDecompress(db, contentId);
      
      expect(Buffer.isBuffer(retrieved)).toBe(true);
      expect(retrieved.toString('utf8')).toBe(testContent);
    });
    
    test('should work with gzip compression', () => {
      const { contentId } = compressAndStore(db, testContent, {
        compressionType: 'gzip_9'
      });
      
      const retrieved = retrieveAndDecompress(db, contentId);
      expect(retrieved.toString('utf8')).toBe(testContent);
    });
    
    test('should work with no compression', () => {
      const { contentId } = compressAndStore(db, testContent, {
        compressionType: 'none'
      });
      
      const retrieved = retrieveAndDecompress(db, contentId);
      expect(retrieved.toString('utf8')).toBe(testContent);
    });
    
    test('should throw error for non-existent content', () => {
      expect(() => retrieveAndDecompress(db, 99999)).toThrow('Content not found');
    });
  });
  
  describe('compression ratios', () => {
    // Test with realistic HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>News Article</title>
      </head>
      <body>
        <article>
          <h1>Breaking News: Important Event Happens</h1>
          <p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(200)}</p>
          <p>${'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(150)}</p>
        </article>
      </body>
      </html>
    `;
    
    test('should achieve <20% ratio with brotli 11 on HTML', () => {
      const result = compress(htmlContent, { algorithm: 'brotli', level: 11 });
      
      expect(result.ratio).toBeLessThan(0.20);  // Better than 5:1 compression
    });
    
    test('should achieve <15% ratio with brotli 11 on repetitive content', () => {
      const repetitiveContent = '<div class="article">\n'.repeat(1000);
      const result = compress(repetitiveContent, { algorithm: 'brotli', level: 11 });
      
      expect(result.ratio).toBeLessThan(0.15);  // Better than 6.67:1 compression
    });
  });
});
