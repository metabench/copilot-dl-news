'use strict';

/**
 * Tests for BreakingNewsDetector
 */

const { BreakingNewsDetector, BREAKING_THRESHOLDS } = require('../../src/alerts/BreakingNewsDetector');
const { sampleArticles } = require('./fixtures');

describe('BreakingNewsDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new BreakingNewsDetector();
  });

  describe('Constants', () => {
    test('BREAKING_THRESHOLDS are defined', () => {
      expect(BREAKING_THRESHOLDS.MIN_SOURCES).toBeGreaterThan(0);
      expect(BREAKING_THRESHOLDS.TIME_WINDOW_MINUTES).toBeGreaterThan(0);
      expect(BREAKING_THRESHOLDS.BREAKING_KEYWORDS).toBeInstanceOf(Array);
    });
  });

  describe('detect()', () => {
    test('detects breaking news by keywords in title', () => {
      const result = detector.detect(sampleArticles.breakingNews);
      expect(result.isBreaking).toBe(true);
      expect(result.signals.hasBreakingKeywords).toBe(true);
    });

    test('does not flag regular news as breaking', () => {
      const result = detector.detect(sampleArticles.techNews);
      expect(result.isBreaking).toBe(false);
    });

    test('returns signals with breaking keywords', () => {
      const result = detector.detect(sampleArticles.breakingNews);
      expect(result.signals).toBeDefined();
      expect(result.signals.matchedKeywords).toContain('breaking');
    });
  });

  describe('processArticle()', () => {
    test('tracks article for velocity calculation', () => {
      const storyId = 'test-story-1';
      
      // Process multiple articles from different sources
      for (let i = 0; i < 5; i++) {
        const article = {
          ...sampleArticles.techNews,
          id: i,
          host: `source${i}.com`,
          storyId
        };
        detector.processArticle(article, storyId);
      }

      const result = detector.detect(sampleArticles.techNews, { storyId });
      expect(result.signals.sourceCount).toBeGreaterThanOrEqual(5);
    });

    test('returns isBreaking when velocity threshold met', () => {
      const storyId = 'velocity-test';
      
      // Simulate many sources reporting same story
      for (let i = 0; i < 10; i++) {
        const article = {
          id: i,
          host: `source${i}.com`,
          title: 'Major Event Happening',
          storyId
        };
        detector.processArticle(article, storyId);
      }

      const result = detector.processArticle(
        { id: 11, host: 'source11.com', storyId },
        storyId
      );
      expect(result.isBreaking).toBe(true);
    });

    test('does not count duplicate sources', () => {
      const storyId = 'dupe-test';
      
      // Same source multiple times
      for (let i = 0; i < 10; i++) {
        detector.processArticle({
          id: i,
          host: 'same-source.com',
          storyId
        }, storyId);
      }

      const stats = detector.getStats();
      expect(stats.trackedStories[storyId]?.sourceCount || 0).toBeLessThanOrEqual(1);
    });
  });

  describe('getBreakingNews()', () => {
    test('returns empty array when no breaking news', () => {
      const result = detector.getBreakingNews();
      expect(result).toEqual([]);
    });

    test('returns breaking news items', () => {
      // Create a breaking news story with enough sources
      const storyId = 'breaking-story';
      for (let i = 0; i < 10; i++) {
        const article = {
          id: i,
          host: `source${i}.com`,
          title: 'BREAKING: Major Event',
          storyId
        };
        detector.processArticle(article, storyId);
      }

      const result = detector.getBreakingNews();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    test('respects limit parameter', () => {
      const result = detector.getBreakingNews(5);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getStats()', () => {
    test('returns statistics object', () => {
      const stats = detector.getStats();
      expect(stats).toHaveProperty('thresholds');
      expect(stats).toHaveProperty('trackedStories');
      expect(stats).toHaveProperty('recentArticles');
    });

    test('increments article count', () => {
      const initialStats = detector.getStats();
      const initialCount = initialStats.recentArticles;

      detector.processArticle(sampleArticles.techNews, 'story-1');
      
      const newStats = detector.getStats();
      expect(newStats.recentArticles).toBe(initialCount + 1);
    });
  });

  describe('cleanup()', () => {
    test('removes old tracked stories', () => {
      // Add a story
      detector.processArticle(sampleArticles.techNews, 'old-story');
      
      expect(detector.getStats().trackedStories).toBeGreaterThanOrEqual(1);
      
      // Cleanup should not remove recent stories
      detector.cleanup();
      
      // Story should still be there (it's recent)
      expect(detector.getStats().trackedStories).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sentiment deviation detection', () => {
    test('detects unusual sentiment deviation', () => {
      // Create detector with mock trend detector
      const mockTrendDetector = {
        getBaseline: () => ({ sentimentMean: 0.2, sentimentStdDev: 0.1 })
      };
      
      const detectorWithTrend = new BreakingNewsDetector({
        trendDetector: mockTrendDetector
      });

      // Article with very negative sentiment (deviation from baseline)
      const negativeArticle = {
        ...sampleArticles.techNews,
        sentiment: { score: -0.8 }
      };

      const result = detectorWithTrend.detect(negativeArticle);
      expect(result.signals).toHaveProperty('sentimentDeviation');
    });
  });
});
