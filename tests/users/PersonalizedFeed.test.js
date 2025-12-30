'use strict';

/**
 * @fileoverview Tests for PersonalizedFeed
 */

const { PersonalizedFeed, MAX_PER_DOMAIN } = require('../../src/users/PersonalizedFeed');

describe('PersonalizedFeed', () => {
  let feed;
  let mockAdapter;
  let mockPreferenceLearner;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = {
      getPreferences: jest.fn(),
      getUserById: jest.fn(),
      getViewedContentIds: jest.fn().mockReturnValue(new Set()),
      getTrendingArticles: jest.fn().mockReturnValue([]),
      getRecentArticles: jest.fn().mockReturnValue([]),
      getArticlesByCategory: jest.fn().mockReturnValue([]),
      getArticlesBySource: jest.fn().mockReturnValue([])
    };

    mockPreferenceLearner = {
      checkPersonalizationReadiness: jest.fn(),
      getTopInterests: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    feed = new PersonalizedFeed({
      userAdapter: mockAdapter,
      preferenceLearner: mockPreferenceLearner,
      logger: mockLogger
    });
  });

  describe('constructor', () => {
    test('requires userAdapter', () => {
      expect(() => new PersonalizedFeed({})).toThrow('requires a userAdapter');
    });

    test('allows optional preferenceLearner', () => {
      const f = new PersonalizedFeed({
        userAdapter: mockAdapter
      });
      expect(f.preferenceLearner).toBeNull();
    });

    test('uses default weights', () => {
      expect(feed.weights.preference).toBe(0.5);
      expect(feed.weights.recency).toBe(0.3);
      expect(feed.weights.trending).toBe(0.2);
    });
  });

  // =================== generateFeed ===================

  describe('generateFeed', () => {
    test('returns cold-start feed for user without preferences', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([
        { contentId: 1, title: 'Trending 1', host: 'site1.com', category: 'news' },
        { contentId: 2, title: 'Trending 2', host: 'site2.com', category: 'tech' }
      ]);
      mockAdapter.getRecentArticles.mockReturnValue([
        { contentId: 3, title: 'Recent 1', host: 'site3.com', category: 'sports' }
      ]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.coldStart).toBe(true);
      expect(result.personalized).toBe(false);
      expect(result.articles.length).toBeGreaterThan(0);
    });

    test('returns cold-start feed for empty preferences', async () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: {},
        topicWeights: {},
        sourceWeights: {},
        entityWeights: {}
      });
      mockAdapter.getTrendingArticles.mockReturnValue([
        { contentId: 1, title: 'Trending', host: 'site.com', category: 'news' }
      ]);
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.coldStart).toBe(true);
    });

    test('returns personalized feed for user with preferences', async () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 0.6, sports: 0.4 },
        sourceWeights: { 'techsite.com': 0.7 },
        topicWeights: { ai: 0.5 },
        entityWeights: {}
      });
      mockAdapter.getArticlesByCategory.mockReturnValue([
        { contentId: 1, title: 'Tech Article', host: 'techsite.com', category: 'tech' },
        { contentId: 2, title: 'Sports Article', host: 'sports.com', category: 'sports' }
      ]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.personalized).toBe(true);
      expect(result.articles.length).toBeGreaterThan(0);
    });

    test('applies diversity filtering', async () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 0.8 },
        sourceWeights: { 'onesite.com': 0.9 },
        topicWeights: {},
        entityWeights: {}
      });
      // Return many articles from same domain
      mockAdapter.getArticlesByCategory.mockReturnValue([
        { contentId: 1, title: 'Article 1', host: 'onesite.com', category: 'tech' },
        { contentId: 2, title: 'Article 2', host: 'onesite.com', category: 'tech' },
        { contentId: 3, title: 'Article 3', host: 'onesite.com', category: 'tech' },
        { contentId: 4, title: 'Article 4', host: 'onesite.com', category: 'tech' },
        { contentId: 5, title: 'Article 5', host: 'onesite.com', category: 'tech' },
        { contentId: 6, title: 'Other Site', host: 'other.com', category: 'tech' }
      ]);

      const result = await feed.generateFeed(1, { limit: 10 });

      // Count articles from onesite.com - should be max MAX_PER_DOMAIN
      const onesiteCount = result.articles.filter(a => a.host === 'onesite.com').length;
      expect(onesiteCount).toBeLessThanOrEqual(MAX_PER_DOMAIN);
    });

    test('excludes already viewed articles', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getViewedContentIds.mockReturnValue(new Set([1]));
      mockAdapter.getTrendingArticles.mockReturnValue([
        { contentId: 1, title: 'Viewed Article', host: 'site.com', category: 'tech' },
        { contentId: 2, title: 'New Article', host: 'site.com', category: 'tech' }
      ]);
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const result = await feed.generateFeed(1, { limit: 10, excludeViewed: true });

      const viewedArticle = result.articles.find(a => a.contentId === 1);
      expect(viewedArticle).toBeUndefined();
    });

    test('respects limit option', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue(
        Array(50).fill(null).map((_, i) => ({
          contentId: i,
          title: `Article ${i}`,
          host: `site${i}.com`,
          category: 'news'
        }))
      );
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const result = await feed.generateFeed(1, { limit: 10 });

      expect(result.articles.length).toBeLessThanOrEqual(10);
    });

    test('respects offset for pagination', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue(
        Array(20).fill(null).map((_, i) => ({
          contentId: i + 1,
          title: `Article ${i + 1}`,
          host: `site${i}.com`,
          category: 'news'
        }))
      );
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const page1 = await feed.generateFeed(1, { limit: 5, offset: 0 });
      const page2 = await feed.generateFeed(1, { limit: 5, offset: 5 });

      // Different articles on each page
      const page1Ids = page1.articles.map(a => a.contentId);
      const page2Ids = page2.articles.map(a => a.contentId);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  // =================== cold start ===================

  describe('cold start feed', () => {
    test('mixes trending and recent articles', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([
        { contentId: 1, title: 'Trending', host: 'site1.com', category: 'news' }
      ]);
      mockAdapter.getRecentArticles.mockReturnValue([
        { contentId: 2, title: 'Recent', host: 'site2.com', category: 'tech' }
      ]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.coldStart).toBe(true);
      expect(result.articles.length).toBe(2);
    });

    test('handles empty trending articles', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([]);
      mockAdapter.getRecentArticles.mockReturnValue([
        { contentId: 1, title: 'Recent', host: 'site.com', category: 'tech' }
      ]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.coldStart).toBe(true);
      expect(result.articles.length).toBe(1);
    });

    test('deduplicates articles appearing in both trending and recent', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([
        { contentId: 1, title: 'Article', host: 'site.com', category: 'news' }
      ]);
      mockAdapter.getRecentArticles.mockReturnValue([
        { contentId: 1, title: 'Article', host: 'site.com', category: 'news' } // Same article
      ]);

      const result = await feed.generateFeed(1, { limit: 20 });

      expect(result.articles.length).toBe(1);
    });
  });

  // =================== error handling ===================

  describe('error handling', () => {
    test('handles adapter errors gracefully', async () => {
      mockAdapter.getPreferences.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(feed.generateFeed(1)).rejects.toThrow('Database error');
    });
  });

  // =================== feed metadata ===================

  describe('feed metadata', () => {
    test('includes generatedAt timestamp', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([]);
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const result = await feed.generateFeed(1);

      expect(result.generatedAt).toBeDefined();
      expect(new Date(result.generatedAt)).toBeInstanceOf(Date);
    });

    test('includes userId in response', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getTrendingArticles.mockReturnValue([]);
      mockAdapter.getRecentArticles.mockReturnValue([]);

      const result = await feed.generateFeed(42);

      expect(result.userId).toBe(42);
    });
  });
});
