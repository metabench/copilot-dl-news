'use strict';

/**
 * @fileoverview Tests for PreferenceLearner
 */

const { PreferenceLearner, EVENT_WEIGHTS, MIN_EVENTS_THRESHOLD } = require('../../src/users/PreferenceLearner');

describe('PreferenceLearner', () => {
  let learner;
  let mockAdapter;
  let mockLogger;

  beforeEach(() => {
    mockAdapter = {
      getArticleViewsWithMetadata: jest.fn(),
      getEventsSince: jest.fn(),
      getPreferences: jest.fn(),
      savePreferences: jest.fn()
    };

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    learner = new PreferenceLearner({
      userAdapter: mockAdapter,
      logger: mockLogger,
      decayDays: 30
    });
  });

  describe('constructor', () => {
    test('requires userAdapter', () => {
      expect(() => new PreferenceLearner({})).toThrow('requires a userAdapter');
    });

    test('uses default decay days', () => {
      const l = new PreferenceLearner({ userAdapter: mockAdapter });
      expect(l.decayDays).toBe(30);
    });

    test('accepts custom decay days', () => {
      const l = new PreferenceLearner({ userAdapter: mockAdapter, decayDays: 60 });
      expect(l.decayDays).toBe(60);
    });
  });

  // =================== learnPreferences ===================

  describe('learnPreferences', () => {
    test('returns insufficient_data for few views', async () => {
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, category: 'tech', host: 'example.com', timestamp: new Date().toISOString() }
      ]);

      const result = await learner.learnPreferences(1);

      expect(result.status).toBe('insufficient_data');
      expect(result.viewCount).toBe(1);
      expect(result.threshold).toBe(MIN_EVENTS_THRESHOLD);
    });

    test('learns category weights from views', async () => {
      const now = new Date();
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, category: 'technology', host: 'techsite.com', timestamp: now.toISOString() },
        { contentId: 2, category: 'technology', host: 'techsite.com', timestamp: now.toISOString() },
        { contentId: 3, category: 'technology', host: 'other.com', timestamp: now.toISOString() },
        { contentId: 4, category: 'sports', host: 'sports.com', timestamp: now.toISOString() },
        { contentId: 5, category: 'sports', host: 'sports.com', timestamp: now.toISOString() }
      ]);
      mockAdapter.getEventsSince.mockReturnValue([]);
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.learnPreferences(1);

      expect(result.userId).toBe(1);
      expect(result.categoryWeights).toBeDefined();
      expect(result.categoryWeights.technology).toBeGreaterThan(result.categoryWeights.sports);
      expect(mockAdapter.savePreferences).toHaveBeenCalled();
    });

    test('learns source weights from views', async () => {
      const now = new Date();
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, category: 'tech', host: 'favorite.com', timestamp: now.toISOString() },
        { contentId: 2, category: 'tech', host: 'favorite.com', timestamp: now.toISOString() },
        { contentId: 3, category: 'tech', host: 'favorite.com', timestamp: now.toISOString() },
        { contentId: 4, category: 'tech', host: 'other.com', timestamp: now.toISOString() },
        { contentId: 5, category: 'tech', host: 'other.com', timestamp: now.toISOString() }
      ]);
      mockAdapter.getEventsSince.mockReturnValue([]);
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.learnPreferences(1);

      expect(result.sourceWeights['favorite.com']).toBeGreaterThan(result.sourceWeights['other.com']);
    });

    test('applies temporal decay to older views', async () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
      
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, category: 'old_category', host: 'old.com', timestamp: oldDate.toISOString() },
        { contentId: 2, category: 'old_category', host: 'old.com', timestamp: oldDate.toISOString() },
        { contentId: 3, category: 'old_category', host: 'old.com', timestamp: oldDate.toISOString() },
        { contentId: 4, category: 'new_category', host: 'new.com', timestamp: now.toISOString() },
        { contentId: 5, category: 'new_category', host: 'new.com', timestamp: now.toISOString() }
      ]);
      mockAdapter.getEventsSince.mockReturnValue([]);
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.learnPreferences(1);

      // New category should have higher weight due to recency
      expect(result.categoryWeights.new_category).toBeGreaterThan(result.categoryWeights.old_category);
    });

    test('respects save option', async () => {
      const now = new Date();
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, category: 'tech', host: 'site.com', timestamp: now.toISOString() },
        { contentId: 2, category: 'tech', host: 'site.com', timestamp: now.toISOString() },
        { contentId: 3, category: 'tech', host: 'site.com', timestamp: now.toISOString() },
        { contentId: 4, category: 'tech', host: 'site.com', timestamp: now.toISOString() },
        { contentId: 5, category: 'tech', host: 'site.com', timestamp: now.toISOString() }
      ]);
      mockAdapter.getEventsSince.mockReturnValue([]);

      await learner.learnPreferences(1, { save: false });

      expect(mockAdapter.savePreferences).not.toHaveBeenCalled();
    });
  });

  // =================== checkPersonalizationReadiness ===================

  describe('checkPersonalizationReadiness', () => {
    test('returns ready when enough data', () => {
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue(
        Array(10).fill({ contentId: 1, timestamp: new Date().toISOString() })
      );
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 0.5 },
        updatedAt: new Date().toISOString()
      });

      const result = learner.checkPersonalizationReadiness(1);

      expect(result.hasEnoughData).toBe(true);
      expect(result.hasPreferences).toBe(true);
    });

    test('returns not ready when insufficient data', () => {
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue([
        { contentId: 1, timestamp: new Date().toISOString() }
      ]);
      mockAdapter.getPreferences.mockReturnValue(null);

      const result = learner.checkPersonalizationReadiness(1);

      expect(result.hasEnoughData).toBe(false);
      expect(result.hasPreferences).toBe(false);
      expect(result.viewCount).toBe(1);
      expect(result.threshold).toBe(MIN_EVENTS_THRESHOLD);
    });
  });

  // =================== getTopInterests ===================

  describe('getTopInterests', () => {
    test('returns top interests from preferences', () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 0.4, sports: 0.3, news: 0.2, entertainment: 0.1 },
        topicWeights: { ai: 0.5, ml: 0.3 },
        sourceWeights: { 'site1.com': 0.6, 'site2.com': 0.4 },
        entityWeights: {}
      });

      const result = learner.getTopInterests(1, 3);

      expect(result.categories.length).toBe(3);
      expect(result.categories[0].item).toBe('tech');
      expect(result.categories[0].weight).toBe(0.4);
    });

    test('returns empty arrays for user without preferences', () => {
      mockAdapter.getPreferences.mockReturnValue(null);

      const result = learner.getTopInterests(1);

      expect(result.categories).toEqual([]);
      expect(result.topics).toEqual([]);
    });
  });

  // =================== incrementalUpdate ===================

  describe('incrementalUpdate', () => {
    test('creates preferences if none exist', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);
      mockAdapter.getArticleViewsWithMetadata.mockReturnValue(
        Array(10).fill({ contentId: 1, category: 'tech', host: 'site.com', timestamp: new Date().toISOString() })
      );
      mockAdapter.getEventsSince.mockReturnValue([]);
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.incrementalUpdate(1, {
        category: 'technology',
        host: 'example.com',
        eventType: 'article_view'
      });

      expect(result).toBeDefined();
    });

    test('updates existing preferences incrementally', async () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 0.5 },
        topicWeights: {},
        sourceWeights: { 'old.com': 0.3 },
        entityWeights: {}
      });
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.incrementalUpdate(1, {
        category: 'sports',
        host: 'new.com',
        eventType: 'article_view'
      });

      expect(mockAdapter.savePreferences).toHaveBeenCalled();
    });
  });

  // =================== applyDecay ===================

  describe('applyDecay', () => {
    test('decays all weights', async () => {
      mockAdapter.getPreferences.mockReturnValue({
        categoryWeights: { tech: 1.0 },
        topicWeights: { ai: 0.5 },
        sourceWeights: { 'site.com': 0.8 },
        entityWeights: { 'Entity': 0.6 }
      });
      mockAdapter.savePreferences.mockReturnValue({ changes: 1 });

      const result = await learner.applyDecay(1, 30); // 30 days = 1 half-life

      // After 30 days (1 half-life), weights should be ~37% of original (e^-1)
      expect(result.categoryWeights.tech).toBeLessThan(0.5);
      expect(mockAdapter.savePreferences).toHaveBeenCalled();
    });

    test('returns null for user without preferences', async () => {
      mockAdapter.getPreferences.mockReturnValue(null);

      const result = await learner.applyDecay(1);

      expect(result).toBeNull();
    });
  });
});
