'use strict';

/**
 * Tests for ContentRecommender
 */

const { ContentRecommender, DEFAULT_SIMHASH_THRESHOLD } = require('../../../src/analysis/recommendations/ContentRecommender');

describe('ContentRecommender', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const recommender = new ContentRecommender();
      
      expect(recommender.simhashThreshold).toBe(DEFAULT_SIMHASH_THRESHOLD);
      expect(recommender.minSimilarity).toBe(0.3);
      expect(recommender.duplicateDetector).toBeNull();
    });
    
    it('should accept custom options', () => {
      const mockDetector = {};
      const recommender = new ContentRecommender({
        duplicateDetector: mockDetector,
        simhashThreshold: 3,
        minSimilarity: 0.5
      });
      
      expect(recommender.duplicateDetector).toBe(mockDetector);
      expect(recommender.simhashThreshold).toBe(3);
      expect(recommender.minSimilarity).toBe(0.5);
    });
  });
  
  describe('hammingToSimilarity', () => {
    let recommender;
    
    beforeEach(() => {
      recommender = new ContentRecommender();
    });
    
    it('should return 1.0 for distance 0 (identical)', () => {
      expect(recommender.hammingToSimilarity(0)).toBe(1);
    });
    
    it('should return 0.5 for distance 32 (half different)', () => {
      expect(recommender.hammingToSimilarity(32)).toBe(0.5);
    });
    
    it('should return 0 for distance 64 (completely different)', () => {
      expect(recommender.hammingToSimilarity(64)).toBe(0);
    });
    
    it('should return ~0.95 for distance 3 (very similar)', () => {
      const similarity = recommender.hammingToSimilarity(3);
      expect(similarity).toBeCloseTo(0.953, 2);
    });
    
    it('should return ~0.92 for distance 5 (similar)', () => {
      const similarity = recommender.hammingToSimilarity(5);
      expect(similarity).toBeCloseTo(0.922, 2);
    });
  });
  
  describe('normalizeScore', () => {
    let recommender;
    
    beforeEach(() => {
      recommender = new ContentRecommender({ simhashThreshold: 5 });
    });
    
    it('should use Jaccard similarity as base', () => {
      // No SimHash bonus (distance undefined)
      const score = recommender.normalizeScore(0.7, undefined);
      expect(score).toBe(0.7);
    });
    
    it('should boost for close SimHash matches', () => {
      // Jaccard 0.7 + SimHash distance 3 (very close)
      const score = recommender.normalizeScore(0.7, 3);
      
      // 0.7 * 0.7 + 0.953 * 0.3 ≈ 0.49 + 0.286 ≈ 0.776
      expect(score).toBeGreaterThan(0.7);
      expect(score).toBeLessThan(0.9);
    });
    
    it('should not boost for distant SimHash matches', () => {
      // Jaccard 0.7 + SimHash distance 10 (beyond threshold)
      const score = recommender.normalizeScore(0.7, 10);
      
      // Distance > threshold, no boost
      expect(score).toBe(0.7);
    });
    
    it('should cap at 1.0', () => {
      const score = recommender.normalizeScore(1.0, 0);
      expect(score).toBe(1);
    });
    
    it('should floor at 0', () => {
      const score = recommender.normalizeScore(-0.5, 10);
      expect(score).toBe(0);
    });
  });
  
  describe('isSimilar', () => {
    let recommender;
    
    beforeEach(() => {
      recommender = new ContentRecommender({ minSimilarity: 0.5 });
    });
    
    it('should return true for scores above threshold', () => {
      expect(recommender.isSimilar(0.6)).toBe(true);
      expect(recommender.isSimilar(1.0)).toBe(true);
    });
    
    it('should return true for score at threshold', () => {
      expect(recommender.isSimilar(0.5)).toBe(true);
    });
    
    it('should return false for scores below threshold', () => {
      expect(recommender.isSimilar(0.4)).toBe(false);
      expect(recommender.isSimilar(0)).toBe(false);
    });
  });
  
  describe('getRecommendations', () => {
    it('should return empty array without detector', async () => {
      const recommender = new ContentRecommender();
      
      const result = await recommender.getRecommendations(123);
      
      expect(result).toEqual([]);
    });
    
    it('should transform detector results to recommendation format', async () => {
      const mockDetector = {
        findSimilarWithMetadata: jest.fn().mockResolvedValue([
          { id: 1, similarity: 0.8, simhashDistance: 2, matchType: 'near', title: 'Similar 1', host: 'example.com', url: 'http://example.com/1' },
          { id: 2, similarity: 0.6, simhashDistance: 4, matchType: 'near', title: 'Similar 2', host: 'test.com', url: 'http://test.com/2' }
        ])
      };
      const recommender = new ContentRecommender({ duplicateDetector: mockDetector });
      
      const result = await recommender.getRecommendations(123, { limit: 10 });
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        contentId: 1,
        similarity: 0.8,
        distance: 2,
        matchType: 'near',
        title: 'Similar 1',
        host: 'example.com'
      });
      expect(result[0].score).toBeGreaterThan(0.7); // Normalized score
    });
    
    it('should pass limit and minSimilarity to detector', async () => {
      const mockDetector = {
        findSimilarWithMetadata: jest.fn().mockResolvedValue([])
      };
      const recommender = new ContentRecommender({
        duplicateDetector: mockDetector,
        minSimilarity: 0.4
      });
      
      await recommender.getRecommendations(123, { limit: 5 });
      
      expect(mockDetector.findSimilarWithMetadata).toHaveBeenCalledWith(123, {
        limit: 5,
        minSimilarity: 0.4
      });
    });
    
    it('should use findSimilar when includeMetadata is false', async () => {
      const mockDetector = {
        findSimilar: jest.fn().mockResolvedValue([
          { id: 1, similarity: 0.8, simhashDistance: 2, matchType: 'near' }
        ])
      };
      const recommender = new ContentRecommender({ duplicateDetector: mockDetector });
      
      const result = await recommender.getRecommendations(123, { includeMetadata: false });
      
      expect(mockDetector.findSimilar).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
    
    it('should handle detector errors gracefully', async () => {
      const mockDetector = {
        findSimilarWithMetadata: jest.fn().mockRejectedValue(new Error('DB error'))
      };
      const mockLogger = { warn: jest.fn(), error: jest.fn() };
      const recommender = new ContentRecommender({
        duplicateDetector: mockDetector,
        logger: mockLogger
      });
      
      const result = await recommender.getRecommendations(123);
      
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
  
  describe('getStats', () => {
    it('should return basic stats without detector', () => {
      const recommender = new ContentRecommender({
        simhashThreshold: 3,
        minSimilarity: 0.5
      });
      
      const stats = recommender.getStats();
      
      expect(stats.simhashThreshold).toBe(3);
      expect(stats.minSimilarity).toBe(0.5);
      expect(stats.hasDetector).toBe(false);
    });
    
    it('should include detector stats if available', () => {
      const mockDetector = {
        getStats: jest.fn().mockReturnValue({ indexSize: 1000 })
      };
      const recommender = new ContentRecommender({ duplicateDetector: mockDetector });
      
      const stats = recommender.getStats();
      
      expect(stats.hasDetector).toBe(true);
      expect(stats.detector).toEqual({ indexSize: 1000 });
    });
  });
});
