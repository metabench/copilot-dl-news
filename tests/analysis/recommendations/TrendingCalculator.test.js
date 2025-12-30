'use strict';

/**
 * Tests for TrendingCalculator
 */

const { TrendingCalculator, DEFAULT_DECAY_RATE } = require('../../../src/analysis/recommendations/TrendingCalculator');

describe('TrendingCalculator', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const calculator = new TrendingCalculator();
      
      expect(calculator.decayRate).toBe(DEFAULT_DECAY_RATE);
      expect(calculator.recommendationAdapter).toBeNull();
    });
    
    it('should accept custom decay rate', () => {
      const calculator = new TrendingCalculator({ decayRate: 3600 });
      
      expect(calculator.decayRate).toBe(3600);
    });
    
    it('should accept recommendation adapter', () => {
      const mockAdapter = { getTrending: jest.fn() };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      expect(calculator.recommendationAdapter).toBe(mockAdapter);
    });
  });
  
  describe('computeRawScore', () => {
    let calculator;
    
    beforeEach(() => {
      calculator = new TrendingCalculator();
    });
    
    it('should return 0 for zero views', () => {
      const now = new Date('2025-12-26T12:00:00Z');
      const lastView = new Date('2025-12-26T11:00:00Z');
      
      const score = calculator.computeRawScore(0, lastView, now);
      
      expect(score).toBe(0);
    });
    
    it('should return 0 for negative views', () => {
      const now = new Date('2025-12-26T12:00:00Z');
      const lastView = new Date('2025-12-26T11:00:00Z');
      
      const score = calculator.computeRawScore(-5, lastView, now);
      
      expect(score).toBe(0);
    });
    
    it('should compute score for recent article with views', () => {
      const now = new Date('2025-12-26T12:00:00Z');
      const lastView = new Date('2025-12-26T11:00:00Z'); // 1 hour ago
      
      const score = calculator.computeRawScore(100, lastView, now);
      
      // log(100+1) * e^(-3600/86400) ≈ 4.615 * 0.959 ≈ 4.43
      expect(score).toBeGreaterThan(4);
      expect(score).toBeLessThan(5);
    });
    
    it('should apply decay for older articles', () => {
      const now = new Date('2025-12-26T12:00:00Z');
      const recentView = new Date('2025-12-26T11:00:00Z'); // 1 hour ago
      const oldView = new Date('2025-12-25T12:00:00Z'); // 24 hours ago
      
      const recentScore = calculator.computeRawScore(100, recentView, now);
      const oldScore = calculator.computeRawScore(100, oldView, now);
      
      // Same view count, but older article should have lower score
      expect(oldScore).toBeLessThan(recentScore);
      // After 24 hours, decay factor is e^(-1) ≈ 0.368
      expect(oldScore / recentScore).toBeCloseTo(0.368, 1);
    });
    
    it('should handle string timestamps', () => {
      const now = '2025-12-26T12:00:00Z';
      const lastView = '2025-12-26T11:00:00Z';
      
      const score = calculator.computeRawScore(50, lastView, now);
      
      expect(score).toBeGreaterThan(0);
    });
    
    it('should use logarithmic scaling for view count', () => {
      const now = new Date('2025-12-26T12:00:00Z');
      const lastView = new Date('2025-12-26T12:00:00Z'); // Just now (no decay)
      
      const score10 = calculator.computeRawScore(10, lastView, now);
      const score100 = calculator.computeRawScore(100, lastView, now);
      const score1000 = calculator.computeRawScore(1000, lastView, now);
      
      // log(11) ≈ 2.40, log(101) ≈ 4.62, log(1001) ≈ 6.91
      expect(score100).toBeLessThan(score10 * 3); // Not linear
      expect(score1000).toBeLessThan(score100 * 3);
    });
  });
  
  describe('normalizeScore', () => {
    let calculator;
    
    beforeEach(() => {
      calculator = new TrendingCalculator();
    });
    
    it('should return 0 for zero score', () => {
      expect(calculator.normalizeScore(0)).toBe(0);
    });
    
    it('should return 0 for negative score', () => {
      expect(calculator.normalizeScore(-1)).toBe(0);
    });
    
    it('should normalize based on max score', () => {
      const normalized = calculator.normalizeScore(5, 10);
      
      expect(normalized).toBe(0.5);
    });
    
    it('should cap at 1.0', () => {
      const normalized = calculator.normalizeScore(15, 10);
      
      expect(normalized).toBe(1);
    });
    
    it('should use cached max score if available', () => {
      calculator._maxScore = 10;
      
      const normalized = calculator.normalizeScore(5);
      
      expect(normalized).toBe(0.5);
    });
  });
  
  describe('getTrendScore', () => {
    it('should return null without adapter', () => {
      const calculator = new TrendingCalculator();
      
      const result = calculator.getTrendScore(123);
      
      expect(result).toBeNull();
    });
    
    it('should return zero scores for non-existent article', () => {
      const mockAdapter = { getTrending: jest.fn().mockReturnValue(null) };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const result = calculator.getTrendScore(123);
      
      expect(result).toEqual({
        score: 0,
        normalized: 0,
        viewCount: 0,
        lastViewAt: null
      });
    });
    
    it('should return trending data for existing article', () => {
      const mockAdapter = {
        getTrending: jest.fn().mockReturnValue({
          contentId: 123,
          viewCount: 50,
          lastViewAt: '2025-12-26T12:00:00Z',
          trendScore: 3.5
        })
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      calculator._maxScore = 7;
      
      const result = calculator.getTrendScore(123);
      
      expect(result.score).toBe(3.5);
      expect(result.normalized).toBe(0.5);
      expect(result.viewCount).toBe(50);
      expect(result.lastViewAt).toBe('2025-12-26T12:00:00Z');
    });
  });
  
  describe('getTopTrending', () => {
    it('should return empty array without adapter', () => {
      const calculator = new TrendingCalculator();
      
      const result = calculator.getTopTrending();
      
      expect(result).toEqual([]);
    });
    
    it('should return top trending articles', () => {
      const mockAdapter = {
        getTopTrending: jest.fn().mockReturnValue([
          { contentId: 1, viewCount: 100, trendScore: 5.0, title: 'Article 1', host: 'example.com' },
          { contentId: 2, viewCount: 50, trendScore: 3.5, title: 'Article 2', host: 'test.com' }
        ])
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const result = calculator.getTopTrending({ limit: 10 });
      
      expect(result).toHaveLength(2);
      expect(result[0].contentId).toBe(1);
      expect(result[0].normalized).toBe(1); // Highest score = 1.0
      expect(result[1].normalized).toBe(0.7); // 3.5/5.0 = 0.7
    });
    
    it('should update max score cache', () => {
      const mockAdapter = {
        getTopTrending: jest.fn().mockReturnValue([
          { contentId: 1, viewCount: 100, trendScore: 8.0, title: 'Top Article', host: 'example.com' }
        ])
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      calculator.getTopTrending();
      
      expect(calculator._maxScore).toBe(8.0);
    });
  });
  
  describe('recordView', () => {
    it('should return false without adapter', () => {
      const calculator = new TrendingCalculator();
      
      const result = calculator.recordView(123);
      
      expect(result.success).toBe(false);
    });
    
    it('should increment views via adapter', () => {
      const mockAdapter = { incrementViews: jest.fn() };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const result = calculator.recordView(123);
      
      expect(result.success).toBe(true);
      expect(mockAdapter.incrementViews).toHaveBeenCalledWith(123);
    });
  });
  
  describe('recomputeAllScores', () => {
    it('should throw without adapter', async () => {
      const calculator = new TrendingCalculator();
      
      await expect(calculator.recomputeAllScores()).rejects.toThrow('recommendationAdapter required');
    });
    
    it('should return zero counts for empty dataset', async () => {
      const mockAdapter = {
        getArticlesForTrendingUpdate: jest.fn().mockReturnValue([]),
        bulkSaveTrending: jest.fn().mockReturnValue({ saved: 0 })
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const result = await calculator.recomputeAllScores();
      
      expect(result.updated).toBe(0);
      expect(result.maxScore).toBe(0);
    });
    
    it('should recompute and save scores', async () => {
      const mockAdapter = {
        getArticlesForTrendingUpdate: jest.fn().mockReturnValue([
          { contentId: 1, viewCount: 100, lastViewAt: new Date().toISOString() },
          { contentId: 2, viewCount: 50, lastViewAt: new Date().toISOString() }
        ]),
        bulkSaveTrending: jest.fn().mockReturnValue({ saved: 2 })
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const result = await calculator.recomputeAllScores();
      
      expect(result.updated).toBe(2);
      expect(result.maxScore).toBeGreaterThan(0);
      expect(mockAdapter.bulkSaveTrending).toHaveBeenCalled();
      
      // Check the saved data
      const savedData = mockAdapter.bulkSaveTrending.mock.calls[0][0];
      expect(savedData).toHaveLength(2);
      expect(savedData[0].contentId).toBe(1);
      expect(savedData[0].trendScore).toBeGreaterThan(0);
    });
  });
  
  describe('getStats', () => {
    it('should return basic stats without adapter', () => {
      const calculator = new TrendingCalculator({ decayRate: 3600 });
      calculator._maxScore = 5;
      
      const stats = calculator.getStats();
      
      expect(stats.decayRate).toBe(3600);
      expect(stats.maxScore).toBe(5);
    });
    
    it('should include adapter stats if available', () => {
      const mockAdapter = {
        getStats: jest.fn().mockReturnValue({
          trendingArticles: 100,
          avgTrendScore: 2.5,
          maxViews: 500
        })
      };
      const calculator = new TrendingCalculator({ recommendationAdapter: mockAdapter });
      
      const stats = calculator.getStats();
      
      expect(stats.trendingArticles).toBe(100);
      expect(stats.avgTrendScore).toBe(2.5);
      expect(stats.maxViews).toBe(500);
    });
  });
});
