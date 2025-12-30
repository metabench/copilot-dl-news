'use strict';

/**
 * @fileoverview Tests for MobileArticleView
 * 
 * Tests the mobile article view control rendering and behavior.
 */

const { MobileArticleView, getMobileArticleViewCss } = require('../../src/ui/mobile/MobileArticleView');

describe('MobileArticleView', () => {
  describe('getMobileArticleViewCss', () => {
    test('returns CSS string', () => {
      const css = getMobileArticleViewCss();
      expect(typeof css).toBe('string');
      expect(css.length).toBeGreaterThan(0);
    });

    test('contains essential class selectors', () => {
      const css = getMobileArticleViewCss();
      expect(css).toContain('.mobile-article-view');
      expect(css).toContain('.mobile-article-header');
      expect(css).toContain('.mobile-article-title');
      expect(css).toContain('.mobile-article-body');
      expect(css).toContain('.mobile-article-progress');
    });

    test('includes responsive styles', () => {
      const css = getMobileArticleViewCss();
      expect(css).toContain('prefers-color-scheme: dark');
    });

    test('includes safe area support', () => {
      const css = getMobileArticleViewCss();
      expect(css).toContain('safe-area-inset');
    });
  });

  describe('constructor', () => {
    test('creates instance with default options', () => {
      const view = new MobileArticleView({
        article: { id: 1, title: 'Test', body: '<p>Content</p>' }
      });

      expect(view.article.id).toBe(1);
      expect(view.options.showSaveButton).toBe(true);
      expect(view.options.showShareButton).toBe(true);
      expect(view.options.showProgress).toBe(true);
      expect(view.options.enableSwipe).toBe(true);
    });

    test('accepts custom options', () => {
      const view = new MobileArticleView({
        article: { id: 1, title: 'Test', body: '' },
        options: {
          showSaveButton: false,
          enableSwipe: false
        }
      });

      expect(view.options.showSaveButton).toBe(false);
      expect(view.options.enableSwipe).toBe(false);
      expect(view.options.showShareButton).toBe(true); // default
    });

    test('stores article data', () => {
      const article = {
        id: 42,
        title: 'Article Title',
        body: '<p>Body content</p>',
        author: 'Test Author',
        host: 'example.com',
        url: 'https://example.com/article',
        publishedAt: '2025-12-26T10:00:00Z',
        imageUrl: 'https://example.com/image.jpg'
      };

      const view = new MobileArticleView({ article });

      expect(view.article).toEqual(article);
    });

    test('stores callbacks', () => {
      const onSave = jest.fn();
      const onShare = jest.fn();
      const onSwipeLeft = jest.fn();
      const onSwipeRight = jest.fn();

      const view = new MobileArticleView({
        article: { id: 1 },
        onSave,
        onShare,
        onSwipeLeft,
        onSwipeRight
      });

      expect(view.onSave).toBe(onSave);
      expect(view.onShare).toBe(onShare);
      expect(view.onSwipeLeft).toBe(onSwipeLeft);
      expect(view.onSwipeRight).toBe(onSwipeRight);
    });
  });

  describe('getReadingStats', () => {
    test('returns reading statistics', () => {
      const view = new MobileArticleView({
        article: { id: 42, title: 'Test', body: '' }
      });

      const stats = view.getReadingStats();

      expect(stats.articleId).toBe(42);
      expect(stats.scrollPercent).toBe(0);
      expect(stats.timeSpentMs).toBeGreaterThanOrEqual(0);
      expect(stats.completed).toBe(false);
      expect(stats.isSaved).toBe(false);
    });
  });

  describe('date formatting', () => {
    test('formats recent dates as relative time', () => {
      const view = new MobileArticleView({
        article: { id: 1, title: 'Test', body: '' }
      });

      // Access private method for testing
      const now = new Date();
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

      const formatted = view._formatDate(twoHoursAgo);
      expect(formatted).toBe('2h ago');
    });

    test('handles invalid dates gracefully', () => {
      const view = new MobileArticleView({
        article: { id: 1, title: 'Test', body: '' }
      });

      const formatted = view._formatDate('invalid-date');
      expect(formatted).toBe('invalid-date');
    });
  });
});

describe('MobileArticleView integration', () => {
  // These tests would run in a browser environment with jsgui3
  // For Node.js, we test the static parts

  test('module exports correct interface', () => {
    const mobile = require('../../src/ui/mobile');

    expect(mobile.MobileArticleView).toBeDefined();
    expect(mobile.getMobileArticleViewCss).toBeDefined();
    expect(mobile.OfflineManager).toBeDefined();
  });
});
