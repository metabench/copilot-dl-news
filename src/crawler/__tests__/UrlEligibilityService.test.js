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
      getDbAdapter: overrides.getDbAdapter || (() => adapter)
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
});
