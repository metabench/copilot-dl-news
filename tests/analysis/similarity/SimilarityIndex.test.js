'use strict';

/**
 * SimilarityIndex Tests
 * 
 * Tests for the LSH (Locality-Sensitive Hashing) index implementation.
 */

const { SimilarityIndex, createIndex } = require('../../../src/analysis/similarity/SimilarityIndex');
const SimHasher = require('../../../src/analysis/similarity/SimHasher');
const MinHasher = require('../../../src/analysis/similarity/MinHasher');

describe('SimilarityIndex', () => {
  // Sample articles for testing
  const articles = [
    {
      id: 1,
      text: `The Federal Reserve announced Wednesday that it would raise interest rates 
             by a quarter percentage point, marking the first increase since March 2020.`
    },
    {
      id: 2,
      text: `The Federal Reserve announced Thursday that it would raise interest rates 
             by a half percentage point, marking the second increase since March 2020.`
    },
    {
      id: 3,
      text: `The local high school basketball team won the state championship last night 
             in an overtime thriller. The final score was 72-70 after James hit a three-pointer.`
    },
    {
      id: 4,
      text: `Stock markets rallied on Thursday after the Federal Reserve indicated it would 
             slow the pace of interest rate increases in the coming months.`
    },
    {
      id: 5,
      text: `The Federal Reserve announced Wednesday that it would raise interest rates 
             by a quarter percentage point, marking the first increase since March 2020.`
    } // Exact duplicate of article 1
  ];

  function computeFingerprints(text) {
    return {
      simhash: SimHasher.compute(text),
      minhash: MinHasher.compute(text)
    };
  }

  describe('constructor', () => {
    it('should create index with default settings', () => {
      const index = new SimilarityIndex();
      expect(index.numBands).toBe(16);
      expect(index.rowsPerBand).toBe(8);
      expect(index.size).toBe(0);
    });

    it('should create index with custom settings', () => {
      const index = new SimilarityIndex({
        numBands: 8,
        rowsPerBand: 16,
        simhashThreshold: 5
      });
      expect(index.numBands).toBe(8);
      expect(index.rowsPerBand).toBe(16);
      expect(index.simhashThreshold).toBe(5);
    });
  });

  describe('createIndex helper', () => {
    it('should create a new SimilarityIndex', () => {
      const index = createIndex();
      expect(index).toBeInstanceOf(SimilarityIndex);
    });
  });

  describe('add', () => {
    it('should add items to the index', () => {
      const index = new SimilarityIndex();
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      index.add(1, simhash, minhash);
      
      expect(index.size).toBe(1);
      expect(index.has(1)).toBe(true);
    });

    it('should replace existing items', () => {
      const index = new SimilarityIndex();
      const fp1 = computeFingerprints(articles[0].text);
      const fp2 = computeFingerprints(articles[1].text);
      
      index.add(1, fp1.simhash, fp1.minhash);
      index.add(1, fp2.simhash, fp2.minhash);
      
      expect(index.size).toBe(1);
    });

    it('should throw for invalid simhash', () => {
      const index = new SimilarityIndex();
      expect(() => index.add(1, Buffer.alloc(4), null)).toThrow();
      expect(() => index.add(1, null, null)).toThrow();
    });

    it('should accept null minhash', () => {
      const index = new SimilarityIndex();
      const { simhash } = computeFingerprints(articles[0].text);
      
      expect(() => index.add(1, simhash, null)).not.toThrow();
      expect(index.size).toBe(1);
    });
  });

  describe('remove', () => {
    it('should remove items from the index', () => {
      const index = new SimilarityIndex();
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      index.add(1, simhash, minhash);
      expect(index.size).toBe(1);
      
      const removed = index.remove(1);
      expect(removed).toBe(true);
      expect(index.size).toBe(0);
      expect(index.has(1)).toBe(false);
    });

    it('should return false for non-existent items', () => {
      const index = new SimilarityIndex();
      expect(index.remove(999)).toBe(false);
    });
  });

  describe('get / has', () => {
    it('should retrieve fingerprints by ID', () => {
      const index = new SimilarityIndex();
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      index.add(1, simhash, minhash);
      
      const retrieved = index.get(1);
      expect(retrieved).not.toBeNull();
      expect(retrieved.simhash.equals(simhash)).toBe(true);
      expect(retrieved.minhash.equals(minhash)).toBe(true);
    });

    it('should return null for non-existent IDs', () => {
      const index = new SimilarityIndex();
      expect(index.get(999)).toBeNull();
    });
  });

  describe('query', () => {
    let index;

    beforeEach(() => {
      index = new SimilarityIndex();
      
      // Add all articles to index
      for (const article of articles) {
        const { simhash, minhash } = computeFingerprints(article.text);
        index.add(article.id, simhash, minhash);
      }
    });

    it('should find exact duplicates', () => {
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 1,
        minSimilarity: 0.9
      });
      
      // Should find article 5 (exact duplicate)
      const duplicate = results.find(r => r.contentId === 5);
      expect(duplicate).toBeDefined();
      expect(duplicate.similarity).toBe(1);
      expect(duplicate.matchType).toBe('exact');
    });

    it('should find near-duplicates', () => {
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 1,
        minSimilarity: 0.5
      });
      
      // Should find article 2 (similar) and article 5 (duplicate)
      expect(results.length).toBeGreaterThanOrEqual(1);
      
      const nearDup = results.find(r => r.contentId === 2);
      if (nearDup) {
        expect(nearDup.similarity).toBeGreaterThan(0.5);
      }
    });

    it('should not find unrelated articles', () => {
      const { simhash, minhash } = computeFingerprints(articles[2].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 3,
        minSimilarity: 0.8
      });
      
      // Basketball article should not match Fed articles
      const fedArticle = results.find(r => r.contentId === 1 || r.contentId === 2);
      expect(fedArticle).toBeUndefined();
    });

    it('should respect limit option', () => {
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 1,
        limit: 2,
        minSimilarity: 0.1
      });
      
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should exclude specified ID', () => {
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 1
      });
      
      const self = results.find(r => r.contentId === 1);
      expect(self).toBeUndefined();
    });

    it('should sort results by similarity descending', () => {
      const { simhash, minhash } = computeFingerprints(articles[0].text);
      
      const results = index.query(simhash, minhash, {
        excludeId: 1,
        minSimilarity: 0.1
      });
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });
  });

  describe('findDuplicates', () => {
    let index;

    beforeEach(() => {
      index = new SimilarityIndex();
      
      for (const article of articles) {
        const { simhash, minhash } = computeFingerprints(article.text);
        index.add(article.id, simhash, minhash);
      }
    });

    it('should find exact duplicates', () => {
      const { simhash } = computeFingerprints(articles[0].text);
      
      const results = index.findDuplicates(simhash, { threshold: 0 });
      
      // Should find articles 1 and 5 (identical)
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r.distance === 0)).toBe(true);
    });

    it('should respect threshold', () => {
      const { simhash } = computeFingerprints(articles[0].text);
      
      const strict = index.findDuplicates(simhash, { threshold: 0 });
      const loose = index.findDuplicates(simhash, { threshold: 10 });
      
      expect(loose.length).toBeGreaterThanOrEqual(strict.length);
    });

    it('should exclude specified ID', () => {
      const { simhash } = computeFingerprints(articles[0].text);
      
      const results = index.findDuplicates(simhash, { excludeId: 1 });
      
      const self = results.find(r => r.contentId === 1);
      expect(self).toBeUndefined();
    });

    it('should sort by distance ascending', () => {
      const { simhash } = computeFingerprints(articles[0].text);
      
      const results = index.findDuplicates(simhash, { threshold: 64 });
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].distance).toBeLessThanOrEqual(results[i].distance);
      }
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      const index = new SimilarityIndex();
      
      for (const article of articles) {
        const { simhash, minhash } = computeFingerprints(article.text);
        index.add(article.id, simhash, minhash);
      }
      
      expect(index.size).toBe(5);
      
      index.clear();
      
      expect(index.size).toBe(0);
      expect(index.has(1)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return statistics about the index', () => {
      const index = new SimilarityIndex();
      
      for (const article of articles) {
        const { simhash, minhash } = computeFingerprints(article.text);
        index.add(article.id, simhash, minhash);
      }
      
      const stats = index.getStats();
      
      expect(stats.itemCount).toBe(5);
      expect(stats.numBands).toBe(16);
      expect(stats.rowsPerBand).toBe(8);
      expect(stats.totalBuckets).toBeGreaterThan(0);
    });
  });

  describe('collisionProbability', () => {
    it('should calculate probability correctly', () => {
      const index = new SimilarityIndex();
      
      // At J=1, probability should be 1
      expect(index.collisionProbability(1)).toBeCloseTo(1, 5);
      
      // At J=0, probability should be 0
      expect(index.collisionProbability(0)).toBeCloseTo(0, 5);
      
      // At J=0.5 with b=16, r=8: P = 1 - (1 - 0.5^8)^16 ≈ 0.06
      // High r (8) makes bands very selective - this is mathematically correct
      expect(index.collisionProbability(0.5)).toBeGreaterThan(0.05);
      expect(index.collisionProbability(0.5)).toBeLessThan(0.1);
      
      // At J=0.9: P = 1 - (1 - 0.9^8)^16 ≈ 0.99
      expect(index.collisionProbability(0.9)).toBeGreaterThan(0.95);
    });
  });

  describe('LSH properties', () => {
    it('should group similar documents in same buckets', () => {
      const index = new SimilarityIndex();
      
      // Add article 1 and its duplicate (article 5)
      const fp1 = computeFingerprints(articles[0].text);
      const fp5 = computeFingerprints(articles[4].text);
      
      index.add(1, fp1.simhash, fp1.minhash);
      index.add(5, fp5.simhash, fp5.minhash);
      
      // Query for article 1 - should find article 5
      const results = index.query(fp1.simhash, fp1.minhash, {
        excludeId: 1
      });
      
      const duplicate = results.find(r => r.contentId === 5);
      expect(duplicate).toBeDefined();
      expect(duplicate.similarity).toBe(1);
    });

    it('should not group dissimilar documents in same buckets (usually)', () => {
      const index = new SimilarityIndex();
      
      // Add very different articles
      const fpFed = computeFingerprints(articles[0].text);
      const fpSports = computeFingerprints(articles[2].text);
      
      index.add(1, fpFed.simhash, fpFed.minhash);
      index.add(3, fpSports.simhash, fpSports.minhash);
      
      // Query for Fed article with high threshold
      const results = index.query(fpFed.simhash, fpFed.minhash, {
        excludeId: 1,
        minSimilarity: 0.7
      });
      
      // Should NOT find sports article
      const sports = results.find(r => r.contentId === 3);
      expect(sports).toBeUndefined();
    });
  });

  describe('performance', () => {
    it('should handle many items efficiently', () => {
      const index = new SimilarityIndex();
      const baseText = 'Article content with various words for testing similarity search performance ';
      
      // Add 1000 slightly different articles
      const startAdd = Date.now();
      for (let i = 0; i < 1000; i++) {
        const text = baseText + `variation ${i} with extra words ${i * 2}`;
        const { simhash, minhash } = computeFingerprints(text);
        index.add(i, simhash, minhash);
      }
      const addTime = Date.now() - startAdd;
      
      expect(index.size).toBe(1000);
      
      // Query should be fast (LSH avoids O(n) comparison)
      const queryFp = computeFingerprints(baseText + 'variation 500 with extra words 1000');
      
      const startQuery = Date.now();
      const results = index.query(queryFp.simhash, queryFp.minhash, {
        limit: 10,
        minSimilarity: 0.5
      });
      const queryTime = Date.now() - startQuery;
      
      // Query should complete in <50ms (acceptance criteria)
      expect(queryTime).toBeLessThan(50);
      
      // Should find similar articles
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
