const { FetchPipeline } = require('../FetchPipeline');

describe('FetchPipeline', () => {
  const baseDeps = () => {
    const articleHeaderCache = new Map();
    const knownArticlesCache = new Map();
    return {
      getUrlDecision: jest.fn((url) => ({ allow: true, analysis: { normalized: url } })),
      normalizeUrl: jest.fn((url) => url),
      isOnDomain: jest.fn(() => true),
      isAllowed: jest.fn(() => true),
      hasVisited: jest.fn(() => false),
      getCachedArticle: jest.fn(),
      looksLikeArticle: jest.fn(() => false),
      cache: { get: jest.fn() },
      preferCache: false,
      maxAgeMs: undefined,
      maxAgeArticleMs: undefined,
      maxAgeHubMs: undefined,
      acquireDomainToken: jest.fn(() => Promise.resolve()),
      acquireRateToken: jest.fn(() => Promise.resolve()),
      rateLimitMs: 0,
      requestTimeoutMs: 1000,
      httpAgent: {},
      httpsAgent: {},
      currentDownloads: new Map(),
      emitProgress: jest.fn(),
      note429: jest.fn(),
      noteSuccess: jest.fn(),
      recordError: jest.fn(),
      handleConnectionReset: jest.fn(),
      articleHeaderCache,
      knownArticlesCache,
      getDbAdapter: () => ({ isEnabled: () => false }),
      parseRetryAfter: () => null,
      handlePolicySkip: jest.fn(),
      onCacheServed: jest.fn(),
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    };
  };

  it('serves forced cache without touching network', async () => {
    const deps = baseDeps();
    const cached = { html: '<html></html>', crawledAt: new Date().toISOString(), source: 'db' };
    deps.getCachedArticle.mockResolvedValue(cached);
    deps.looksLikeArticle.mockReturnValue(true);

    const pipeline = new FetchPipeline({ ...deps });

    const result = await pipeline.fetch({
      url: 'https://example.com/page',
      context: { forceCache: true, depth: 0, allowRevisit: false }
    });

    expect(result.source).toBe('cache');
    expect(result.html).toBe(cached.html);
    expect(result.meta.cacheInfo).toMatchObject({ reason: 'rate-limit', forced: true });
    expect(deps.acquireDomainToken).not.toHaveBeenCalled();
    expect(deps.acquireRateToken).not.toHaveBeenCalled();
  });

  it('fetches from network when cache is absent', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (key) => {
          if (key === 'content-type') return 'text/html';
          return null;
        }
      },
      url: 'https://example.com/page',
      text: async () => '<html><body>hello</body></html>'
    }));

    const pipeline = new FetchPipeline({ ...deps, fetchFn: deps.fetchFn });

    const result = await pipeline.fetch({
      url: 'https://example.com/page',
      context: { depth: 1, allowRevisit: true }
    });

    expect(result.source).toBe('network');
    expect(result.html).toContain('hello');
    expect(result.meta.fetchMeta).toEqual(expect.objectContaining({ httpStatus: 200 }));
    expect(deps.noteSuccess).toHaveBeenCalled();
  });

  it('classifies http failure as error with retry metadata', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      text: async () => ''
    }));

    const pipeline = new FetchPipeline({ ...deps, fetchFn: deps.fetchFn });

    const result = await pipeline.fetch({ url: 'https://example.com/down', context: { depth: 0 } });

    expect(result.source).toBe('error');
    expect(result.meta.error).toMatchObject({ httpStatus: 503, kind: 'http' });
    expect(result.meta.retryAfterMs).toBeNull();
    expect(deps.recordError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http' }));
  });
});
