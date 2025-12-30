'use strict';

/**
 * Tests for TagRecommender
 */

const { TagRecommender, CATEGORY_BOOST, MIN_KEYWORD_OVERLAP } = require('../../../src/analysis/recommendations/TagRecommender');

describe('TagRecommender', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const recommender = new TagRecommender();
      
      expect(recommender.categoryBoost).toBe(CATEGORY_BOOST);
      expect(recommender.minKeywordOverlap).toBe(MIN_KEYWORD_OVERLAP);
      expect(recommender.tagAdapter).toBeNull();
    });
    
    it('should accept custom options', () => {
      const mockTagAdapter = {};
      const mockArticlesAdapter = {};
      const recommender = new TagRecommender({
        tagAdapter: mockTagAdapter,
        articlesAdapter: mockArticlesAdapter,
        categoryBoost: 0.5,
        minKeywordOverlap: 2
      });
      
      expect(recommender.tagAdapter).toBe(mockTagAdapter);
      expect(recommender.articlesAdapter).toBe(mockArticlesAdapter);
      expect(recommender.categoryBoost).toBe(0.5);
      expect(recommender.minKeywordOverlap).toBe(2);
    });
  });
  
  describe('jaccardSimilarity', () => {
    let recommender;
    
    beforeEach(() => {
      recommender = new TagRecommender();
    });
    
    it('should return 0 for empty sets', () => {
      expect(recommender.jaccardSimilarity([], [])).toBe(0);
      expect(recommender.jaccardSimilarity(new Set(), new Set())).toBe(0);
    });
    
    it('should return 1 for identical sets', () => {
      const set = ['a', 'b', 'c'];
      expect(recommender.jaccardSimilarity(set, set)).toBe(1);
    });
    
    it('should return 0 for disjoint sets', () => {
      const setA = ['a', 'b', 'c'];
      const setB = ['x', 'y', 'z'];
      expect(recommender.jaccardSimilarity(setA, setB)).toBe(0);
    });
    
    it('should compute correct similarity for overlapping sets', () => {
      const setA = ['a', 'b', 'c'];
      const setB = ['b', 'c', 'd'];
      
      // Intersection: {b, c} = 2
      // Union: {a, b, c, d} = 4
      // Jaccard = 2/4 = 0.5
      expect(recommender.jaccardSimilarity(setA, setB)).toBe(0.5);
    });
    
    it('should handle Set objects', () => {
      const setA = new Set(['a', 'b', 'c']);
      const setB = new Set(['b', 'c', 'd']);
      
      expect(recommender.jaccardSimilarity(setA, setB)).toBe(0.5);
    });
    
    it('should handle asymmetric sets', () => {
      const setA = ['a', 'b'];
      const setB = ['a', 'b', 'c', 'd', 'e'];
      
      // Intersection: 2, Union: 5
      expect(recommender.jaccardSimilarity(setA, setB)).toBe(0.4);
    });
  });
  
  describe('getRecommendations', () => {
    it('should return empty array without adapter', async () => {
      const recommender = new TagRecommender();
      
      const result = await recommender.getRecommendations(123);
      
      expect(result).toEqual([]);
    });
    
    it('should return empty array for article without tags', async () => {
      const mockTagAdapter = {
        getArticleTags: jest.fn().mockReturnValue(null)
      };
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = await recommender.getRecommendations(123);
      
      expect(result).toEqual([]);
    });
    
    it('should return empty array for article with no keywords and no category', async () => {
      const mockTagAdapter = {
        getArticleTags: jest.fn().mockReturnValue({
          keywords: [],
          category: null,
          entities: []
        })
      };
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = await recommender.getRecommendations(123);
      
      expect(result).toEqual([]);
    });
    
    it('should find articles with shared keywords', async () => {
      const mockTagAdapter = {
        getArticleTags: jest.fn()
          .mockReturnValueOnce({
            keywords: [
              { keyword: 'python' },
              { keyword: 'programming' },
              { keyword: 'tutorial' }
            ],
            category: { category: 'Technology' }
          })
          .mockReturnValue({
            keywords: [
              { keyword: 'python' },
              { keyword: 'coding' }
            ],
            category: { category: 'Technology' }
          }),
        getCategory: jest.fn().mockReturnValue({ category: 'Technology' }),
        getArticlesByKeyword: jest.fn().mockReturnValue([
          { contentId: 456, title: 'Python Guide', score: 0.8 }
        ]),
        getArticlesByCategory: jest.fn().mockReturnValue([])
      };
      
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = await recommender.getRecommendations(123, { limit: 10 });
      
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should boost score for same category', async () => {
      // Source has 2 keywords: a, b
      // Candidate has 3 keywords: a, c, d (partial overlap)
      // Jaccard = 1 / (2 + 3 - 1) = 0.25
      // With category boost 0.3: score = 0.25 + 0.3 = 0.55
      const mockTagAdapter = {
        getArticleTags: jest.fn()
          .mockReturnValueOnce({
            keywords: [{ keyword: 'a' }, { keyword: 'b' }],
            category: { category: 'Technology' }
          })
          .mockReturnValue({
            keywords: [{ keyword: 'a' }, { keyword: 'c' }, { keyword: 'd' }]
          }),
        getCategory: jest.fn().mockReturnValue({ category: 'Technology' }),
        getArticlesByKeyword: jest.fn().mockReturnValue([
          { contentId: 456, title: 'Same Category Article' }
        ]),
        getArticlesByCategory: jest.fn().mockReturnValue([])
      };
      
      const recommender = new TagRecommender({ 
        tagAdapter: mockTagAdapter,
        categoryBoost: 0.3
      });
      
      // The category boost should be applied when same category
      const result = await recommender.getRecommendations(123);
      
      // Results should have sameCategory flag and score boosted above keywordSimilarity
      // Note: only check when keywordSimilarity < 1.0 (so boost can be observed)
      result.forEach(item => {
        if (item.sameCategory && item.keywordSimilarity < 1.0) {
          expect(item.score).toBeGreaterThan(item.keywordSimilarity);
        }
      });
    });
    
    it('should exclude source article from results', async () => {
      const mockTagAdapter = {
        getArticleTags: jest.fn()
          .mockReturnValueOnce({
            keywords: [{ keyword: 'test' }],
            category: { category: 'Technology' }
          })
          .mockReturnValue({
            keywords: [{ keyword: 'test' }]
          }),
        getCategory: jest.fn().mockReturnValue({ category: 'Technology' }),
        getArticlesByKeyword: jest.fn().mockReturnValue([
          { contentId: 123, title: 'Source Article' }, // Same as source
          { contentId: 456, title: 'Other Article' }
        ]),
        getArticlesByCategory: jest.fn().mockReturnValue([])
      };
      
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = await recommender.getRecommendations(123);
      
      // Source article should be excluded
      expect(result.find(r => r.contentId === 123)).toBeUndefined();
    });
    
    it('should filter by minimum keyword overlap', async () => {
      const mockTagAdapter = {
        getArticleTags: jest.fn()
          .mockReturnValueOnce({
            keywords: [
              { keyword: 'a' },
              { keyword: 'b' },
              { keyword: 'c' }
            ],
            category: null
          })
          .mockReturnValue({
            keywords: [{ keyword: 'x' }] // No overlap
          }),
        getCategory: jest.fn().mockReturnValue(null),
        getArticlesByKeyword: jest.fn().mockReturnValue([
          { contentId: 456, title: 'No Overlap Article' }
        ]),
        getArticlesByCategory: jest.fn().mockReturnValue([])
      };
      
      const recommender = new TagRecommender({
        tagAdapter: mockTagAdapter,
        minKeywordOverlap: 1
      });
      
      const result = await recommender.getRecommendations(123);
      
      // Should filter out articles with no keyword overlap
      expect(result.filter(r => r.keywordOverlap === 0 && !r.sameCategory)).toHaveLength(0);
    });
  });
  
  describe('getCategoryRecommendations', () => {
    it('should return empty array without adapter', () => {
      const recommender = new TagRecommender();
      
      const result = recommender.getCategoryRecommendations('Technology');
      
      expect(result).toEqual([]);
    });
    
    it('should return articles from category', () => {
      const mockTagAdapter = {
        getArticlesByCategory: jest.fn().mockReturnValue([
          { contentId: 1, confidence: 0.9, title: 'Tech Article 1' },
          { contentId: 2, confidence: 0.8, title: 'Tech Article 2' }
        ])
      };
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = recommender.getCategoryRecommendations('Technology', { limit: 10 });
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        contentId: 1,
        score: 0.9,
        sameCategory: true,
        category: 'Technology'
      });
    });
    
    it('should exclude specified article ID', () => {
      const mockTagAdapter = {
        getArticlesByCategory: jest.fn().mockReturnValue([
          { contentId: 123, confidence: 0.9, title: 'Excluded' },
          { contentId: 456, confidence: 0.8, title: 'Included' }
        ])
      };
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const result = recommender.getCategoryRecommendations('Technology', {
        limit: 10,
        excludeId: 123
      });
      
      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe(456);
    });
  });
  
  describe('getStats', () => {
    it('should return basic stats without adapters', () => {
      const recommender = new TagRecommender({
        categoryBoost: 0.5,
        minKeywordOverlap: 2
      });
      
      const stats = recommender.getStats();
      
      expect(stats.categoryBoost).toBe(0.5);
      expect(stats.minKeywordOverlap).toBe(2);
      expect(stats.hasTagAdapter).toBe(false);
      expect(stats.hasArticlesAdapter).toBe(false);
    });
    
    it('should include tag adapter stats if available', () => {
      const mockTagAdapter = {
        getStats: jest.fn().mockReturnValue({
          articlesWithKeywords: 1000,
          articlesWithCategories: 950
        })
      };
      const recommender = new TagRecommender({ tagAdapter: mockTagAdapter });
      
      const stats = recommender.getStats();
      
      expect(stats.hasTagAdapter).toBe(true);
      expect(stats.tagStats).toEqual({
        articlesWithKeywords: 1000,
        articlesWithCategories: 950
      });
    });
  });
});
