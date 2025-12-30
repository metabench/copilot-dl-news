'use strict';

const fs = require('fs');
const { ensureDatabase } = require('../../src/db/sqlite/v1');
const { createTempDb } = require('../../src/db/sqlite/v1/test-utils');
const { StructureMiner } = require('../../src/crawler/planner/StructureMiner');

// Simple mock HTML for testing
const createMockHtml = (content, classes = '') => `
<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <header>Header Content</header>
  <main class="${classes}">
    <article>${content}</article>
  </main>
  <footer>Footer Content</footer>
</body>
</html>
`;

// Mock SkeletonHash for predictable testing
const createMockHasher = () => ({
  compute(html, level) {
    // Generate deterministic hash from content
    const hash = require('crypto')
      .createHash('sha256')
      .update(html.slice(0, 500) + level)
      .digest('hex')
      .slice(0, 16);
    return { hash, signature: `mock_sig_${level}` };
  }
});

describe('StructureMiner', () => {
  let dbPath;
  let db;

  beforeEach(() => {
    dbPath = createTempDb('structure-miner-test');
    db = ensureDatabase(dbPath, { verbose: false });
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
    }
    dbPath = null;
    db = null;
  });

  describe('constructor', () => {
    test('creates instance with database', () => {
      const miner = new StructureMiner({ db });
      expect(miner.db).toBe(db);
      expect(miner.adapter).toBeTruthy();
    });

    test('creates instance without database', () => {
      const miner = new StructureMiner({});
      expect(miner.db).toBeUndefined();
      expect(miner.adapter).toBeNull();
    });

    test('accepts custom hasher', () => {
      const customHasher = createMockHasher();
      const miner = new StructureMiner({ db, skeletonHash: customHasher });
      expect(miner.hasher).toBe(customHasher);
    });
  });

  describe('processBatch', () => {
    test('processes pages and returns clusters', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      const pages = [
        { url: 'https://example.com/article1', html: createMockHtml('Article 1') },
        { url: 'https://example.com/article2', html: createMockHtml('Article 2') },
        { url: 'https://other.com/page', html: createMockHtml('Other Page', 'different') }
      ];

      const result = miner.processBatch(pages);

      expect(result.totalProcessed).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.signatures.length).toBe(3);
      expect(result.clusters.length).toBeGreaterThan(0);
    });

    test('extracts domain from URL', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      const result = miner.processBatch([
        { url: 'https://news.example.com/path/to/article', html: createMockHtml('Content') }
      ]);

      expect(result.signatures[0].domain).toBe('news.example.com');
    });

    test('handles errors gracefully', () => {
      const miner = new StructureMiner({ 
        db, 
        logger: { warn: jest.fn() },
        skeletonHash: createMockHasher()
      });
      
      const pages = [
        { url: 'invalid-url', html: createMockHtml('Content') }, // Invalid URL
        { url: 'https://example.com/valid', html: createMockHtml('Valid') }
      ];

      const result = miner.processBatch(pages);

      expect(result.totalProcessed).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    test('persists signatures when persist=true', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      miner.processBatch([
        { url: 'https://example.com/persist-test', html: createMockHtml('Persist Test') }
      ], { persist: true });

      // Check database has the signature
      const stats = miner.getStats();
      expect(stats.total_pages_analyzed).toBeGreaterThan(0);
    });

    test('skips persistence when persist=false', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      // First get baseline stats
      const beforeStats = miner.getStats();
      const beforeCount = beforeStats.total_pages_analyzed || 0;

      miner.processBatch([
        { url: 'https://example.com/no-persist', html: createMockHtml('No Persist') }
      ], { persist: false });

      const afterStats = miner.getStats();
      expect(afterStats.total_pages_analyzed || 0).toBe(beforeCount);
    });

    test('collects samples when collectSamples=true', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      // Use same HTML to get same L2 hash
      const sameHtml = createMockHtml('Same Content');
      const pages = [
        { url: 'https://example.com/a', html: sameHtml },
        { url: 'https://example.com/b', html: sameHtml },
        { url: 'https://example.com/c', html: sameHtml }
      ];

      const result = miner.processBatch(pages, { collectSamples: true, maxSamplesPerCluster: 2 });

      // Find the cluster with samples
      const clusterWithSamples = result.clusters.find(c => c.hasSamples);
      expect(clusterWithSamples).toBeTruthy();
    });
  });

  describe('analyzeCluster', () => {
    test('identifies varying vs constant paths', () => {
      const miner = new StructureMiner({ db });
      
      // Two similar HTML samples with different content
      const htmlSamples = [
        '<html><head><title>A</title></head><body><div id="main"><p>Content A</p></div></body></html>',
        '<html><head><title>B</title></head><body><div id="main"><p>Content B</p></div></body></html>'
      ];

      const result = miner.analyzeCluster('test_hash', htmlSamples);

      expect(result.l2Hash).toBe('test_hash');
      expect(result.sampleCount).toBe(2);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('returns error for insufficient samples', () => {
      const miner = new StructureMiner({ db });
      
      const result = miner.analyzeCluster('test_hash', ['<html></html>']);

      expect(result.error).toContain('at least 2 samples');
      expect(result.confidence).toBe(0);
    });

    test('handles null/empty samples', () => {
      const miner = new StructureMiner({ db });
      
      expect(miner.analyzeCluster('test', null).error).toBeTruthy();
      expect(miner.analyzeCluster('test', []).error).toBeTruthy();
    });
  });

  describe('generateTemplate', () => {
    test('creates template from analysis', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      const analysis = {
        varying: ['html/body/article', 'html/body/main/content'],
        constant: ['html/head', 'html/body/header', 'html/body/footer'],
        confidence: 0.8,
        sampleCount: 5
      };

      // Test without persisting (to avoid FK constraint)
      const template = miner.generateTemplate('example.com', 'abcd1234', analysis, { persist: false });

      expect(template.templateId).toBe('example-com-abcd1234');
      expect(template.domain).toBe('example.com');
      expect(template.l2Hash).toBe('abcd1234');
      expect(template.confidence).toBe(0.8);
      expect(template.structure.varyingPaths).toEqual(analysis.varying);
      expect(template.structure.constantPaths).toEqual(analysis.constant);
    });

    test('persists template to database when persist=true', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      // First save a signature (needed for FK)
      miner.processBatch([
        { url: 'https://template.example.com/page', html: createMockHtml('Template Page') }
      ]);

      // Get one of the saved signatures
      const stats = miner.adapter.signatures.getByLevel(2, 1);
      if (stats.length === 0) {
        // Skip if no signatures saved (shouldn't happen)
        return;
      }
      const sigHash = stats[0].signature_hash;

      const analysis = {
        varying: ['html/body/article'],
        constant: ['html/head'],
        confidence: 0.9,
        sampleCount: 3
      };

      miner.generateTemplate('template.example.com', sigHash, analysis, { persist: true });

      // Verify it's in the database
      const template = miner.adapter.getTemplate(sigHash);
      expect(template).toBeTruthy();
      expect(template.host).toBe('template.example.com');
    });
  });

  describe('getStats', () => {
    test('returns stats from database', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      // Add some data
      miner.processBatch([
        { url: 'https://stats.example.com/a', html: createMockHtml('A') },
        { url: 'https://stats.example.com/b', html: createMockHtml('B') }
      ]);

      const stats = miner.getStats();
      expect(stats).toBeTruthy();
      expect(typeof stats.l1_count).toBe('number');
      expect(typeof stats.l2_count).toBe('number');
    });

    test('returns null without database', () => {
      const miner = new StructureMiner({});
      expect(miner.getStats()).toBeNull();
    });
  });

  describe('getTopClusters', () => {
    test('returns top clusters sorted by count', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      // Add pages with same L2 to create clusters
      const sameHtml = createMockHtml('Same');
      miner.processBatch([
        { url: 'https://cluster.example.com/a', html: sameHtml },
        { url: 'https://cluster.example.com/b', html: sameHtml },
        { url: 'https://cluster.example.com/c', html: sameHtml }
      ]);

      const clusters = miner.getTopClusters({ limit: 5 });
      expect(Array.isArray(clusters)).toBe(true);
    });

    test('returns empty array without database', () => {
      const miner = new StructureMiner({});
      expect(miner.getTopClusters()).toEqual([]);
    });
  });

  describe('findTemplate', () => {
    test('finds template for HTML', () => {
      const miner = new StructureMiner({ db, skeletonHash: createMockHasher() });
      
      const testHtml = createMockHtml('Find Template Test');
      
      // Process and create template
      miner.processBatch([{ url: 'https://find.example.com/page', html: testHtml }]);
      
      // Get the L2 hash for this HTML
      const result = createMockHasher().compute(testHtml, 2);
      
      // Save a template for it
      miner.generateTemplate('find.example.com', result.hash, {
        varying: [],
        constant: [],
        confidence: 0.9,
        sampleCount: 1
      });

      // Now find it
      const found = miner.findTemplate(testHtml, 'find.example.com');
      expect(found).toBeTruthy();
    });

    test('returns null without database', () => {
      const miner = new StructureMiner({});
      expect(miner.findTemplate('<html></html>')).toBeNull();
    });
  });

  describe('_extractPaths', () => {
    test('extracts paths from signature string', () => {
      const miner = new StructureMiner({});
      
      // Access private method for testing
      const paths = miner._extractPaths('html(head(title)body(div(p)(span)))');
      
      expect(paths.has('html')).toBe(true);
      expect(paths.has('html/head')).toBe(true);
      expect(paths.has('html/head/title')).toBe(true);
      expect(paths.has('html/body')).toBe(true);
      expect(paths.has('html/body/div')).toBe(true);
    });

    test('handles empty signature', () => {
      const miner = new StructureMiner({});
      const paths = miner._extractPaths('');
      expect(paths.size).toBe(0);
    });

    test('handles null signature', () => {
      const miner = new StructureMiner({});
      const paths = miner._extractPaths(null);
      expect(paths.size).toBe(0);
    });
  });
});
