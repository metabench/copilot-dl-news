'use strict';

const { UrlEligibilityService } = require('../UrlEligibilityService');

describe('UrlEligibilityService', () => {
  const makeDecision = (url, overrides = {}) => ({
    allow: true,
    analysis: { normalized: url, raw: url, ...overrides.analysis },
    ...overrides
  });

  const createService = (overrides = {}) => {
    const knownArticlesCache = overrides.knownArticlesCache || new Map();
    const adapter = overrides.adapter || null;

    return new UrlEligibilityService({
      getUrlDecision: overrides.getUrlDecision || ((url, ctx) => makeDecision(url, ctx && ctx.decisionOverrides)),
      handlePolicySkip: overrides.handlePolicySkip || jest.fn(),
      isOnDomain: overrides.isOnDomain || jest.fn().mockReturnValue(true),
      isAllowed: overrides.isAllowed || jest.fn().mockReturnValue(true),
      hasVisited: overrides.hasVisited || jest.fn().mockReturnValue(false),
      looksLikeArticle: overrides.looksLikeArticle || jest.fn().mockReturnValue(true),
      knownArticlesCache,
      getDbAdapter: overrides.getDbAdapter || (() => adapter),
      maxAgeHubMs: overrides.maxAgeHubMs,
      maxAgeArticleMs: overrides.maxAgeArticleMs,
      urlDecisionOrchestrator: overrides.urlDecisionOrchestrator || null
    });
  };

  it('allows an on-domain URL and infers article kind', () => {
    const service = createService();
    const result = service.evaluate({
      url: 'https://example.com/news/story',
      depth: 0,
      type: undefined,
      queueSize: 0,
      isDuplicate: () => false
    });
    expect(result.status).toBe('allow');
    expect(result.normalized).toBe('https://example.com/news/story');
    expect(result.kind).toBe('article');
    expect(result.queueKey).toBe('https://example.com/news/story');
  });

  it('short-circuits duplicate URLs via callback', () => {
    const service = createService();
    const result = service.evaluate({
      url: 'https://example.com/news/story',
      depth: 0,
      type: 'article',
      queueSize: 5,
      isDuplicate: () => true
    });
    expect(result.status).toBe('drop');
    expect(result.reason).toBe('duplicate');
  });

  it('promotes known articles to refresh kind', () => {
    const adapter = {
      isEnabled: () => true,
      getArticleRowByUrl: jest.fn().mockReturnValue({ id: 42 })
    };
    const service = createService({
      getDbAdapter: () => adapter,
      looksLikeArticle: jest.fn().mockReturnValue(true)
    });
    const result = service.evaluate({
      url: 'https://example.com/news/story',
      depth: 0,
      type: 'article',
      queueSize: 0,
      isDuplicate: () => false
    });
    expect(adapter.getArticleRowByUrl).toHaveBeenCalledWith('https://example.com/news/story');
    expect(result.status).toBe('allow');
    expect(result.kind).toBe('refresh');
    expect(result.reason).toBe('known-article');
    expect(result.queueKey).toBe('refresh:https://example.com/news/story');
  });

  it('drops visited URLs when revisit not allowed', () => {
    const service = createService({
      hasVisited: jest.fn().mockReturnValue(true)
    });
    const result = service.evaluate({
      url: 'https://example.com/news/story',
      depth: 1,
      type: 'article',
      queueSize: 2,
      isDuplicate: () => false
    });
    expect(result.status).toBe('drop');
    expect(result.reason).toBe('visited');
  });

  it('handles query-superfluous decisions via policy skip', () => {
    const handlePolicySkip = jest.fn();
    const service = createService({
      getUrlDecision: () => ({ allow: false, reason: 'query-superfluous', analysis: { normalized: 'https://example.com/?q=foo' } }),
      handlePolicySkip
    });
    const result = service.evaluate({
      url: 'https://example.com/?q=foo',
      depth: 0,
      type: 'nav',
      queueSize: 10,
      isDuplicate: () => false
    });
    expect(handlePolicySkip).toHaveBeenCalled();
    expect(result.status).toBe('drop');
    expect(result.handled).toBe(true);
  });

  it('respects robots exclusions', () => {
    const service = createService({
      isAllowed: jest.fn().mockReturnValue(false)
    });
    const result = service.evaluate({
      url: 'https://example.com/news/story',
      depth: 0,
      type: 'article',
      queueSize: 0,
      isDuplicate: () => false
    });
    expect(result.status).toBe('drop');
    expect(result.reason).toBe('robots-disallow');
  });

  describe('orchestrator gating', () => {
    it('short-circuits with orchestrator drop (query mapped) before legacy decision', () => {
      const getUrlDecision = jest.fn();
      const handlePolicySkip = jest.fn();
      const urlDecisionOrchestrator = {
        shouldQueue: jest.fn(() => ({ shouldQueue: false, reason: 'has-query-string' }))
      };

      const service = createService({ getUrlDecision, handlePolicySkip, urlDecisionOrchestrator });

      const url = 'https://example.com/?q=foo';
      const result = service.evaluate({
        url,
        depth: 1,
        type: 'article',
        queueSize: 3,
        isDuplicate: () => false
      });

      expect(urlDecisionOrchestrator.shouldQueue).toHaveBeenCalledWith(url, { depth: 1, classification: 'article' });
      expect(getUrlDecision).not.toHaveBeenCalled();
      expect(handlePolicySkip).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('drop');
      expect(result.handled).toBe(true);
      expect(result.reason).toBe('query-superfluous');
    });

    it('maps orchestrator drop reasons without invoking legacy decision', () => {
      const getUrlDecision = jest.fn();
      const handlePolicySkip = jest.fn();
      const urlDecisionOrchestrator = {
        shouldQueue: jest.fn(() => ({ shouldQueue: false, reason: 'off-domain' }))
      };

      const service = createService({ getUrlDecision, handlePolicySkip, urlDecisionOrchestrator });
      const url = 'https://other.test/page';
      const result = service.evaluate({
        url,
        depth: 0,
        type: 'nav',
        queueSize: 1,
        isDuplicate: () => false
      });

      expect(urlDecisionOrchestrator.shouldQueue).toHaveBeenCalledWith(url, { depth: 0, classification: 'nav' });
      expect(getUrlDecision).not.toHaveBeenCalled();
      expect(handlePolicySkip).not.toHaveBeenCalled();
      expect(result.status).toBe('drop');
      expect(result.reason).toBe('off-domain');
    });
  });

  describe('hub freshness with maxAgeHubMs', () => {
    const buildDb = (fetchedAtIso) => ({
      prepare: jest.fn((sql) => {
        if (sql.includes('content_storage')) {
          return { get: jest.fn(() => ({ ok: 1 })) };
        }
        if (sql.includes('ORDER BY hr.fetched_at DESC')) {
          return { get: jest.fn(() => ({ fetched_at: fetchedAtIso })) };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      })
    });

    it('allows nav hubs when latest fetch is older than maxAgeHubMs', () => {
      const threshold = 60 * 1000;
      const fetchedAt = new Date(Date.now() - threshold - 1000).toISOString();
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(fetchedAt)
      };
      const service = createService({
        getDbAdapter: () => adapter,
        looksLikeArticle: jest.fn().mockReturnValue(false),
        maxAgeHubMs: threshold
      });

      const result = service.evaluate({
        url: 'https://example.com/front-page',
        depth: 0,
        type: 'nav',
        queueSize: 0,
        isDuplicate: () => false
      });

      expect(result.status).toBe('allow');
      expect(result.kind).toBe('nav');
    });

    it('continues dropping nav hubs when fetch is fresher than maxAgeHubMs', () => {
      const threshold = 60 * 1000;
      const fetchedAt = new Date(Date.now() - 500).toISOString();
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(fetchedAt)
      };
      const service = createService({
        getDbAdapter: () => adapter,
        looksLikeArticle: jest.fn().mockReturnValue(false),
        maxAgeHubMs: threshold
      });

      const result = service.evaluate({
        url: 'https://example.com/front-page',
        depth: 0,
        type: 'nav',
        queueSize: 0,
        isDuplicate: () => false
      });

      expect(result.status).toBe('drop');
      expect(result.reason).toBe('already-processed');
    });
  });

  describe('article freshness with maxAgeArticleMs', () => {
    const buildDb = (fetchedAtIso) => ({
      prepare: jest.fn((sql) => {
        if (sql.includes('content_storage')) {
          return { get: jest.fn(() => ({ ok: 1 })) };
        }
        if (sql.includes('ORDER BY hr.fetched_at DESC')) {
          return { get: jest.fn(() => ({ fetched_at: fetchedAtIso })) };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      })
    });

    const evaluateArticle = (service) => service.evaluate({
      url: 'https://example.com/news/story',
      depth: 0,
      type: 'article',
      queueSize: 0,
      isDuplicate: () => false
    });

    it('drops stored articles when no age window is configured (default behavior)', () => {
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(new Date(Date.now() - 60 * 60 * 1000).toISOString())
      };
      const service = createService({ getDbAdapter: () => adapter });
      const result = evaluateArticle(service);
      expect(result.status).toBe('drop');
      expect(result.reason).toBe('already-processed');
    });

    it('allows revalidation when the stored article is older than maxAgeArticleMs', () => {
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(new Date(Date.now() - 60 * 60 * 1000).toISOString())
      };
      const service = createService({ getDbAdapter: () => adapter, maxAgeArticleMs: 60 * 1000 });
      const result = evaluateArticle(service);
      expect(result.status).toBe('allow');
    });

    it('maxAgeArticleMs=0 means always revalidate', () => {
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(new Date(Date.now() - 10).toISOString())
      };
      const service = createService({ getDbAdapter: () => adapter, maxAgeArticleMs: 0 });
      const result = evaluateArticle(service);
      expect(result.status).toBe('allow');
    });

    it('still drops articles fetched within the age window', () => {
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(new Date(Date.now() - 1000).toISOString())
      };
      const service = createService({ getDbAdapter: () => adapter, maxAgeArticleMs: 60 * 60 * 1000 });
      const result = evaluateArticle(service);
      expect(result.status).toBe('drop');
      expect(result.reason).toBe('already-processed');
    });

    it('bypasses the known-articles cache when an age window is configured', () => {
      const knownArticlesCache = new Map([['https://example.com/news/story', true]]);
      const adapter = {
        isEnabled: () => true,
        getDb: () => buildDb(new Date(Date.now() - 60 * 60 * 1000).toISOString())
      };
      const service = createService({
        getDbAdapter: () => adapter,
        knownArticlesCache,
        maxAgeArticleMs: 60 * 1000
      });
      const result = evaluateArticle(service);
      expect(result.status).toBe('allow');
    });
  });
});
