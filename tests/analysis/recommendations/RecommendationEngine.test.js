'use strict';

/**
 * Tests for RecommendationEngine
 */

const { RecommendationEngine, DEFAULT_WEIGHTS, MAX_PER_DOMAIN, STRATEGIES } = require('../../../src/analysis/recommendations/RecommendationEngine');

describe('RecommendationEngine', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const engine = new RecommendationEngine();
      
      expect(engine.weights).toEqual(DEFAULT_WEIGHTS);
      expect(engine.maxPerDomain).toBe(MAX_PER_DOMAIN);
      expect(engine.contentRecommender).toBeNull();
      expect(engine.tagRecommender).toBeNull();
      expect(engine.trendingCalculator).toBeNull();
    });
    
    it('should accept custom weights', () => {
      const engine = new RecommendationEngine({
        weights: { content: 0.6, tag: 0.3, trending: 0.1 }
      });
      
      expect(engine.weights.content).toBe(0.6);
      expect(engine.weights.trending).toBe(0.1);
    });
    
    it('should accept custom maxPerDomain', () => {
      const engine = new RecommendationEngine({ maxPerDomain: 3 });
      
      expect(engine.maxPerDomain).toBe(3);
    });
  });
  
  describe('initialize', () => {
    it('should initialize without errors', async () => {
      const engine = new RecommendationEngine();
      
      const result = await engine.initialize();
      
      expect(result.initialized).toBe(true);
      expect(engine._initialized).toBe(true);
    });
    
    it('should be idempotent', async () => {
      const engine = new RecommendationEngine();
      
      await engine.initialize();
      await engine.initialize();
      
      expect(engine._initialized).toBe(true);
    });
    
    it('should initialize duplicate detector if available', async () => {
      const mockDetector = {
        initialize: jest.fn().mockResolvedValue(100)
      };
      const mockContentRecommender = {
        duplicateDetector: mockDetector
      };
      const engine = new RecommendationEngine({
        contentRecommender: mockContentRecommender
      });
      
      await engine.initialize();
      
      expect(mockDetector.initialize).toHaveBeenCalled();
    });
  });
  
  describe('_computeHybridScore', () => {
    it('should compute weighted score with default weights', () => {
      const engine = new RecommendationEngine();
      
      // content=0.5, tag=0.3, trending=0.2
      const score = engine._computeHybridScore(1.0, 1.0, 1.0);
      
      expect(score).toBe(1.0); // 0.5 + 0.3 + 0.2
    });
    
    it('should apply weights correctly', () => {
      const engine = new RecommendationEngine({
        weights: { content: 0.6, tag: 0.2, trending: 0.2 }
      });
      
      // Only content score
      const scoreContentOnly = engine._computeHybridScore(1.0, 0, 0);
      expect(scoreContentOnly).toBe(0.6);
      
      // Only tag score
      const scoreTagOnly = engine._computeHybridScore(0, 1.0, 0);
      expect(scoreTagOnly).toBe(0.2);
      
      // Only trending score
      const scoreTrendingOnly = engine._computeHybridScore(0, 0, 1.0);
      expect(scoreTrendingOnly).toBe(0.2);
    });
    
    it('should handle partial scores', () => {
      const engine = new RecommendationEngine();
      
      const score = engine._computeHybridScore(0.8, 0.6, 0.4);
      
      // 0.8*0.5 + 0.6*0.3 + 0.4*0.2 = 0.4 + 0.18 + 0.08 = 0.66
      expect(score).toBeCloseTo(0.66, 2);
    });
  });
  
  describe('_diversify', () => {
    let engine;
    
    beforeEach(() => {
      engine = new RecommendationEngine({ maxPerDomain: 2 });
    });
    
    it('should limit articles from same domain', () => {
      const recommendations = [
        { contentId: 1, host: 'example.com', score: 0.9 },
        { contentId: 2, host: 'example.com', score: 0.85 },
        { contentId: 3, host: 'example.com', score: 0.8 }, // Should be filtered
        { contentId: 4, host: 'test.com', score: 0.75 }
      ];
      
      const diversified = engine._diversify(recommendations);
      
      expect(diversified).toHaveLength(3);
      expect(diversified.map(r => r.contentId)).toEqual([1, 2, 4]);
    });
    
    it('should handle unknown hosts', () => {
      const recommendations = [
        { contentId: 1, score: 0.9 },
        { contentId: 2, score: 0.85 },
        { contentId: 3, score: 0.8 }
      ];
      
      const diversified = engine._diversify(recommendations);
      
      // All should be in 'unknown' bucket, so max 2
      expect(diversified).toHaveLength(2);
    });
    
    it('should preserve order by score', () => {
      const recommendations = [
        { contentId: 1, host: 'a.com', score: 0.9 },
        { contentId: 2, host: 'b.com', score: 0.85 },
        { contentId: 3, host: 'a.com', score: 0.8 },
        { contentId: 4, host: 'c.com', score: 0.75 }
      ];
      
      const diversified = engine._diversify(recommendations);
      
      // Should maintain original order
      expect(diversified.map(r => r.contentId)).toEqual([1, 2, 3, 4]);
    });
  });
  
  describe('_generateReasons', () => {
    let engine;
    
    beforeEach(() => {
      engine = new RecommendationEngine();
    });
    
    it('should add "Similar content" for high content score', () => {
      const rec = { contentScore: 0.7 };
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('Similar content');
    });
    
    it('should add category reason for same category', () => {
      const rec = { sameCategory: true, category: 'Technology' };
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('Same category (Technology)');
    });
    
    it('should add "Related topics" for high tag score', () => {
      const rec = { tagScore: 0.5, sameCategory: false };
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('Related topics');
    });
    
    it('should mention shared keywords', () => {
      const rec = { keywordOverlap: 5 };
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('5 shared keywords');
    });
    
    it('should add "Trending" for high view count', () => {
      const rec = { viewCount: 100 };
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('Trending');
    });
    
    it('should add default reason if no specific reasons', () => {
      const rec = {};
      
      const reasons = engine._generateReasons(rec);
      
      expect(reasons).toContain('Related article');
    });
  });
  
  describe('getRecommendations', () => {
    it('should check cache first when useCache is true', async () => {
      const mockAdapter = {
        getRecommendations: jest.fn().mockReturnValue([
          { targetId: 1, score: 0.9, reasons: ['Cached'], computedAt: '2025-12-26T12:00:00Z' }
        ])
      };
      const engine = new RecommendationEngine({ recommendationAdapter: mockAdapter });
      
      const result = await engine.getRecommendations(123, { useCache: true });
      
      expect(result.cached).toBe(true);
      expect(result.recommendations).toHaveLength(1);
      expect(mockAdapter.getRecommendations).toHaveBeenCalledWith(123, {
        strategy: 'hybrid',
        limit: 10
      });
    });
    
    it('should compute fresh when cache is empty', async () => {
      const mockAdapter = {
        getRecommendations: jest.fn().mockReturnValue([])
      };
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([])
      };
      const mockTagRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([]),
        tagAdapter: { getCategory: jest.fn().mockReturnValue(null) }
      };
      const mockTrendingCalculator = {
        getTopTrending: jest.fn().mockReturnValue([])
      };
      
      const engine = new RecommendationEngine({
        recommendationAdapter: mockAdapter,
        contentRecommender: mockContentRecommender,
        tagRecommender: mockTagRecommender,
        trendingCalculator: mockTrendingCalculator
      });
      
      const result = await engine.getRecommendations(123);
      
      expect(result.cached).toBe(false);
      expect(result.strategy).toBe('hybrid');
      expect(result.computedAt).toBeDefined();
    });
    
    it('should bypass cache when useCache is false', async () => {
      const mockAdapter = {
        getRecommendations: jest.fn().mockReturnValue([
          { targetId: 1, score: 0.9, reasons: ['Cached'] }
        ])
      };
      const engine = new RecommendationEngine({ recommendationAdapter: mockAdapter });
      
      const result = await engine.getRecommendations(123, { useCache: false });
      
      expect(result.cached).toBe(false);
    });
    
    it('should use content strategy when specified', async () => {
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.8, title: 'Similar' }
        ])
      };
      const engine = new RecommendationEngine({
        contentRecommender: mockContentRecommender
      });
      
      const result = await engine.getRecommendations(123, { strategy: 'content' });
      
      expect(mockContentRecommender.getRecommendations).toHaveBeenCalled();
      expect(result.strategy).toBe('content');
    });
    
    it('should use tag strategy when specified', async () => {
      const mockTagRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.7, sameCategory: true }
        ])
      };
      const engine = new RecommendationEngine({
        tagRecommender: mockTagRecommender
      });
      
      const result = await engine.getRecommendations(123, { strategy: 'tag' });
      
      expect(mockTagRecommender.getRecommendations).toHaveBeenCalled();
      expect(result.strategy).toBe('tag');
    });
    
    it('should use trending strategy when specified', async () => {
      const mockTrendingCalculator = {
        getTopTrending: jest.fn().mockReturnValue([
          { contentId: 1, normalized: 0.9, title: 'Trending', viewCount: 100 }
        ])
      };
      const mockTagRecommender = {
        tagAdapter: { getCategory: jest.fn().mockReturnValue(null) }
      };
      const engine = new RecommendationEngine({
        trendingCalculator: mockTrendingCalculator,
        tagRecommender: mockTagRecommender
      });
      
      const result = await engine.getRecommendations(123, { strategy: 'trending' });
      
      expect(mockTrendingCalculator.getTopTrending).toHaveBeenCalled();
      expect(result.strategy).toBe('trending');
    });
    
    it('should apply diversification when enabled', async () => {
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.9, host: 'example.com' },
          { contentId: 2, score: 0.85, host: 'example.com' },
          { contentId: 3, score: 0.8, host: 'example.com' }
        ])
      };
      const engine = new RecommendationEngine({
        contentRecommender: mockContentRecommender,
        maxPerDomain: 2
      });
      
      const result = await engine.getRecommendations(123, {
        strategy: 'content',
        diversify: true
      });
      
      // Only 2 from same domain
      expect(result.recommendations).toHaveLength(2);
    });
    
    it('should limit results', async () => {
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.9 },
          { contentId: 2, score: 0.8 },
          { contentId: 3, score: 0.7 },
          { contentId: 4, score: 0.6 },
          { contentId: 5, score: 0.5 }
        ])
      };
      const engine = new RecommendationEngine({
        contentRecommender: mockContentRecommender
      });
      
      const result = await engine.getRecommendations(123, {
        strategy: 'content',
        limit: 3,
        diversify: false
      });
      
      expect(result.recommendations).toHaveLength(3);
    });
    
    it('should add reasons to recommendations', async () => {
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.9, contentScore: 0.9 }
        ])
      };
      const engine = new RecommendationEngine({
        contentRecommender: mockContentRecommender
      });
      
      const result = await engine.getRecommendations(123, { strategy: 'content' });
      
      expect(result.recommendations[0].reasons).toBeDefined();
      expect(Array.isArray(result.recommendations[0].reasons)).toBe(true);
    });
  });
  
  describe('getColdStartRecommendations', () => {
    it('should try tag-based first', async () => {
      const mockTagRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.7, sameCategory: true },
          { contentId: 2, score: 0.6, sameCategory: true },
          { contentId: 3, score: 0.5, sameCategory: true },
          { contentId: 4, score: 0.4, sameCategory: true },
          { contentId: 5, score: 0.3, sameCategory: true }
        ])
      };
      const engine = new RecommendationEngine({
        tagRecommender: mockTagRecommender
      });
      
      const result = await engine.getColdStartRecommendations(123, { limit: 10 });
      
      expect(result.strategy).toBe('coldstart-tag');
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
    
    it('should fall back to trending if tag-based is insufficient', async () => {
      const mockTagRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.7 } // Only 1 result
        ]),
        tagAdapter: { getCategory: jest.fn().mockReturnValue({ category: 'Technology' }) }
      };
      const mockTrendingCalculator = {
        getTopTrending: jest.fn().mockReturnValue([
          { contentId: 2, normalized: 0.9, title: 'Trending' }
        ])
      };
      const engine = new RecommendationEngine({
        tagRecommender: mockTagRecommender,
        trendingCalculator: mockTrendingCalculator
      });
      
      const result = await engine.getColdStartRecommendations(123, { limit: 10 });
      
      expect(result.strategy).toBe('coldstart-trending');
    });
    
    it('should return empty if no strategies available', async () => {
      const engine = new RecommendationEngine();
      
      const result = await engine.getColdStartRecommendations(123);
      
      expect(result.strategy).toBe('coldstart-empty');
      expect(result.recommendations).toEqual([]);
    });
  });
  
  describe('cacheRecommendations', () => {
    it('should throw without adapter', async () => {
      const engine = new RecommendationEngine();
      
      await expect(engine.cacheRecommendations(123))
        .rejects.toThrow('recommendationAdapter required');
    });
    
    it('should compute and save recommendations', async () => {
      const mockAdapter = {
        getRecommendations: jest.fn().mockReturnValue([]),
        saveRecommendations: jest.fn().mockReturnValue({ saved: 2 })
      };
      const mockContentRecommender = {
        getRecommendations: jest.fn().mockResolvedValue([
          { contentId: 1, score: 0.9 },
          { contentId: 2, score: 0.8 }
        ])
      };
      const engine = new RecommendationEngine({
        recommendationAdapter: mockAdapter,
        contentRecommender: mockContentRecommender
      });
      
      const result = await engine.cacheRecommendations(123, {
        strategy: 'content',
        limit: 10
      });
      
      expect(result.saved).toBe(2);
      expect(mockAdapter.saveRecommendations).toHaveBeenCalledWith(
        123,
        expect.any(Array),
        'content'
      );
    });
  });
  
  describe('getStats', () => {
    it('should return basic stats', () => {
      const engine = new RecommendationEngine({
        weights: { content: 0.6, tag: 0.2, trending: 0.2 },
        maxPerDomain: 3
      });
      
      const stats = engine.getStats();
      
      expect(stats.weights).toEqual({ content: 0.6, tag: 0.2, trending: 0.2 });
      expect(stats.maxPerDomain).toBe(3);
      expect(stats.hasContentRecommender).toBe(false);
      expect(stats.hasTagRecommender).toBe(false);
      expect(stats.hasTrendingCalculator).toBe(false);
      expect(stats.hasCache).toBe(false);
    });
    
    it('should include cache stats if available', () => {
      const mockAdapter = {
        getStats: jest.fn().mockReturnValue({
          cachedSources: 100,
          totalRecommendations: 500
        })
      };
      const engine = new RecommendationEngine({
        recommendationAdapter: mockAdapter
      });
      
      const stats = engine.getStats();
      
      expect(stats.hasCache).toBe(true);
      expect(stats.cacheStats).toEqual({
        cachedSources: 100,
        totalRecommendations: 500
      });
    });
  });
  
  describe('STRATEGIES constant', () => {
    it('should export all strategies', () => {
      expect(STRATEGIES.HYBRID).toBe('hybrid');
      expect(STRATEGIES.CONTENT).toBe('content');
      expect(STRATEGIES.TAG).toBe('tag');
      expect(STRATEGIES.TRENDING).toBe('trending');
    });
  });
  
  describe('DEFAULT_WEIGHTS constant', () => {
    it('should sum to 1.0', () => {
      const sum = DEFAULT_WEIGHTS.content + DEFAULT_WEIGHTS.tag + DEFAULT_WEIGHTS.trending;
      expect(sum).toBe(1.0);
    });
  });
});
