'use strict';

/**
 * @fileoverview Tests for REST API Gateway articles routes
 */

const express = require('express');
const request = require('supertest');
const { createArticlesRouter } = require('../../../../src/api/v1/routes/articles');

describe('articles routes', () => {
  let app;
  let mockArticlesAdapter;
  let mockSearchAdapter;

  beforeEach(() => {
    // Create mock adapters
    mockArticlesAdapter = {
      listArticles: jest.fn(),
      getArticleById: jest.fn()
    };

    mockSearchAdapter = null; // FTS5 not available by default

    // Create Express app with router
    app = express();
    app.use(express.json());
    
    // Simulate authenticated request
    app.use((req, res, next) => {
      req.apiKey = { id: 1, tier: 'free' };
      next();
    });

    app.use('/api/v1/articles', createArticlesRouter({
      articlesAdapter: mockArticlesAdapter,
      searchAdapter: mockSearchAdapter,
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    }));
  });

  describe('GET /api/v1/articles', () => {
    test('returns article list', async () => {
      const mockArticles = [
        { id: 1, url: 'https://example.com/a', title: 'Article 1', host: 'example.com' },
        { id: 2, url: 'https://example.com/b', title: 'Article 2', host: 'example.com' }
      ];
      mockArticlesAdapter.listArticles.mockReturnValue({
        articles: mockArticles,
        total: 100,
        page: 1,
        limit: 20
      });

      const response = await request(app)
        .get('/api/v1/articles')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.articles).toHaveLength(2);
      expect(mockArticlesAdapter.listArticles).toHaveBeenCalledWith({
        page: 1,
        limit: 20
      });
    });

    test('respects page and limit parameters', async () => {
      mockArticlesAdapter.listArticles.mockReturnValue({
        articles: [],
        total: 0
      });

      await request(app)
        .get('/api/v1/articles?page=3&limit=50')
        .expect(200);

      expect(mockArticlesAdapter.listArticles).toHaveBeenCalledWith({
        page: 3,
        limit: 50
      });
    });

    test('handles adapter errors', async () => {
      mockArticlesAdapter.listArticles.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/v1/articles')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('GET /api/v1/articles/search', () => {
    test('returns 501 when search not available', async () => {
      const response = await request(app)
        .get('/api/v1/articles/search?q=test')
        .expect(501);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('NOT_IMPLEMENTED');
    });

    test('returns 400 when query is missing', async () => {
      const response = await request(app)
        .get('/api/v1/articles/search')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('BAD_REQUEST');
    });

    describe('when search adapter is available', () => {
      beforeEach(() => {
        mockSearchAdapter = {
          search: jest.fn()
        };

        // Recreate app with search adapter
        app = express();
        app.use(express.json());
        app.use((req, res, next) => {
          req.apiKey = { id: 1, tier: 'free' };
          next();
        });
        app.use('/api/v1/articles', createArticlesRouter({
          articlesAdapter: mockArticlesAdapter,
          searchAdapter: mockSearchAdapter,
          logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
        }));
      });

      test('returns search results', async () => {
        mockSearchAdapter.search.mockReturnValue({
          results: [
            { id: 1, title: 'Climate Change Report', host: 'news.com' }
          ],
          total: 1
        });

        const response = await request(app)
          .get('/api/v1/articles/search?q=climate')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.query).toBe('climate');
        expect(mockSearchAdapter.search).toHaveBeenCalledWith('climate', expect.objectContaining({
          limit: 20,
          offset: 0
        }));
      });
    });
  });

  describe('GET /api/v1/articles/:id', () => {
    test('returns article by ID', async () => {
      const mockArticle = {
        id: 42,
        url: 'https://example.com/article',
        title: 'Test Article',
        host: 'example.com',
        content: 'Article content here',
        crawledAt: '2025-01-01T00:00:00Z'
      };
      mockArticlesAdapter.getArticleById.mockReturnValue(mockArticle);

      const response = await request(app)
        .get('/api/v1/articles/42')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.article).toEqual(mockArticle);
      expect(mockArticlesAdapter.getArticleById).toHaveBeenCalledWith(42);
    });

    test('returns 404 when article not found', async () => {
      mockArticlesAdapter.getArticleById.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/articles/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('NOT_FOUND');
    });

    test('returns 400 for invalid ID', async () => {
      const response = await request(app)
        .get('/api/v1/articles/notanumber')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/v1/articles/:id/similar', () => {
    test('returns placeholder response', async () => {
      mockArticlesAdapter.getArticleById.mockReturnValue({
        id: 1,
        title: 'Test'
      });

      const response = await request(app)
        .get('/api/v1/articles/1/similar')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Phase 8 Item 3');
      expect(response.body.similar).toEqual([]);
    });

    test('returns 404 when source article not found', async () => {
      mockArticlesAdapter.getArticleById.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/articles/999/similar')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });
});
