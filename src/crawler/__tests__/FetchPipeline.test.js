const { FetchPipeline } = require('../FetchPipeline');

describe('FetchPipeline', () => {
  const baseDeps = () => {
    const articleHeaderCache = new Map();
    const knownArticlesCache = new Map();
    const telemetry = { telemetry: jest.fn() };
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
      telemetry,
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

  it('returns cached fallback when network-first fetch fails', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => ({
      ok: false,
      status: 502,
      headers: { get: () => null },
      text: async () => 'Bad Gateway'
    }));

    const cachedFallback = {
      html: '<html><body>cached hub</body></html>',
      crawledAt: new Date(Date.now() - 60_000).toISOString(),
      source: 'db'
    };

    const pipeline = new FetchPipeline({ ...deps, fetchFn: deps.fetchFn });

    const context = {
      depth: 0,
      allowRevisit: true,
      fetchPolicy: 'network-first',
      fallbackToCache: true,
      cachedFallback,
      cachedFallbackMeta: {
        ageMs: 60_000,
        reason: 'stale-for-policy',
        policy: 'network-first'
      },
      cachedHost: 'example.com'
    };

    const result = await pipeline.fetch({ url: 'https://example.com/hub', context });

    expect(result.source).toBe('cache');
    expect(result.html).toBe(cachedFallback.html);
    expect(result.meta.cacheInfo).toEqual(expect.objectContaining({
      reason: 'stale-for-policy',
      policy: 'network-first',
      fallbackReason: 'http-502',
      httpStatus: 502,
      ageSeconds: 60,
      cachedHost: 'example.com'
    }));
    expect(deps.recordError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http' }));
    expect(deps.noteSuccess).not.toHaveBeenCalled();
  });

  it('retries transient network errors and surfaces retry metadata', async () => {
    const deps = baseDeps();
    const networkError = new Error('socket hang up');
    networkError.code = 'ECONNRESET';
    deps.fetchFn = jest.fn(() => {
      const err = new Error(networkError.message);
      err.code = networkError.code;
      throw err;
    });

    const pipeline = new FetchPipeline({
      ...deps,
      fetchFn: deps.fetchFn,
      networkRetryOptions: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0,
        randomFn: () => 0
      }
    });

    const result = await pipeline.fetch({ url: 'https://example.com/reset', context: { depth: 0 } });

    expect(deps.fetchFn).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('error');
    expect(result.meta.error).toMatchObject({
      kind: 'network',
      code: 'ECONNRESET',
      attempt: 3,
      attempts: 3,
      strategy: 'connection-reset'
    });
    expect(deps.recordError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ECONNRESET',
      attempt: 3,
      maxAttempts: 3
    }));
    expect(deps.handleConnectionReset).toHaveBeenCalledTimes(1);
    expect(deps.telemetry.telemetry).toHaveBeenCalledWith(expect.objectContaining({
      event: 'fetch.network-error',
      url: 'https://example.com/reset',
      code: 'ECONNRESET',
      attempt: 3,
      maxAttempts: 3,
      host: 'example.com'
    }));
  });

  it('locks hosts when retry budget is exhausted', async () => {
    const deps = baseDeps();
    const error = new Error('connection reset');
    error.code = 'ECONNRESET';
    deps.fetchFn = jest.fn(() => {
      const err = new Error(error.message);
      err.code = error.code;
      throw err;
    });

    const pipeline = new FetchPipeline({
      ...deps,
      fetchFn: deps.fetchFn,
      networkRetryOptions: {
        maxAttempts: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0,
        randomFn: () => 0
      },
      hostRetryBudget: {
        maxErrors: 1,
        windowMs: 60_000,
        lockoutMs: 60_000
      }
    });

    const first = await pipeline.fetch({ url: 'https://retry.test/path-1', context: { depth: 0 } });
    expect(first.source).toBe('error');
    expect(first.meta.error.code).toBe('ECONNRESET');
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);

    const second = await pipeline.fetch({ url: 'https://retry.test/path-2', context: { depth: 0 } });
    expect(deps.fetchFn).toHaveBeenCalledTimes(1);
    expect(second.source).toBe('error');
    expect(second.meta.error.code).toBe('HOST_RETRY_EXHAUSTED');
    expect(second.meta.error.hostRetryBudget).toEqual(expect.objectContaining({
      host: 'retry.test',
      maxFailures: 1
    }));
    expect(second.meta.error.retryAfterMs).toBeGreaterThan(0);
    expect(second.meta.error.retryAfterMs).toBeLessThanOrEqual(60_000);
    expect(second.meta.retryAfterMs).toBeGreaterThan(0);
    expect(second.meta.retryAfterMs).toBeLessThanOrEqual(60_000);

    expect(deps.telemetry.telemetry).toHaveBeenCalledWith(expect.objectContaining({
      event: 'fetch.host-retry-budget',
      stage: 'exhausted',
      host: 'retry.test'
    }));
    expect(deps.telemetry.telemetry).toHaveBeenCalledWith(expect.objectContaining({
      event: 'fetch.host-retry-budget',
      stage: 'locked',
      host: 'retry.test'
    }));
  });

  describe('orchestrator integration', () => {
    it('skips via orchestrator decision without calling legacy decision and triggers policy skip', async () => {
      const deps = baseDeps();
      deps.getUrlDecision = jest.fn();
      const handlePolicySkip = jest.fn();
      const urlDecisionOrchestrator = {
        decide: jest.fn(async () => ({
          action: 'skip',
          reason: 'query-superfluous',
          analysis: { normalized: 'https://example.com/?q=foo' }
        }))
      };

      const pipeline = new FetchPipeline({
        ...deps,
        handlePolicySkip,
        getUrlDecision: deps.getUrlDecision,
        urlDecisionOrchestrator,
        fetchFn: deps.fetchFn
      });

      const result = await pipeline.fetch({
        url: 'https://example.com/?q=foo',
        context: { depth: 0 }
      });

      expect(urlDecisionOrchestrator.decide).toHaveBeenCalledWith(
        'https://example.com/?q=foo',
        expect.objectContaining({ phase: 'fetch', depth: 0 })
      );
      expect(deps.getUrlDecision).not.toHaveBeenCalled();
      expect(handlePolicySkip).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'query-superfluous' }),
        expect.objectContaining({ depth: 0, normalizedUrl: 'https://example.com/?q=foo' })
      );
      expect(result.source).toBe('skipped');
      expect(result.meta.status).toBe('skipped-policy');
      expect(result.meta.reason).toBe('query-superfluous');
    });

    it('forces cache via orchestrator decision and skips network when cache is served', async () => {
      const deps = baseDeps();
      deps.getUrlDecision = jest.fn();
      const cached = { html: '<html></html>', crawledAt: new Date().toISOString(), source: 'db' };
      deps.getCachedArticle.mockResolvedValue(cached);
      const urlDecisionOrchestrator = {
        decide: jest.fn(async () => ({
          action: 'cache',
          reason: 'rate-limit',
          analysis: { normalized: 'https://example.com/page' }
        }))
      };

      const pipeline = new FetchPipeline({
        ...deps,
        getUrlDecision: deps.getUrlDecision,
        urlDecisionOrchestrator,
        fetchFn: deps.fetchFn
      });

      const result = await pipeline.fetch({
        url: 'https://example.com/page',
        context: { depth: 1 }
      });

      expect(urlDecisionOrchestrator.decide).toHaveBeenCalled();
      expect(deps.getUrlDecision).not.toHaveBeenCalled();
      expect(deps.acquireDomainToken).not.toHaveBeenCalled();
      expect(result.source).toBe('cache');
      expect(result.meta.cacheInfo.reason).toBe('rate-limit');
    });

    it('defers via orchestrator decision and returns a skipped result', async () => {
      const deps = baseDeps();
      deps.getUrlDecision = jest.fn();
      const urlDecisionOrchestrator = {
        decide: jest.fn(async () => ({
          action: 'defer',
          reason: 'domain-throttled',
          analysis: { normalized: 'https://example.com/page' }
        }))
      };

      const pipeline = new FetchPipeline({
        ...deps,
        getUrlDecision: deps.getUrlDecision,
        urlDecisionOrchestrator,
        fetchFn: deps.fetchFn
      });

      const result = await pipeline.fetch({
        url: 'https://example.com/page',
        context: { depth: 2 }
      });

      expect(urlDecisionOrchestrator.decide).toHaveBeenCalled();
      expect(deps.getUrlDecision).not.toHaveBeenCalled();
      expect(result.source).toBe('skipped');
      expect(result.meta.status).toBe('skipped-deferred');
      expect(result.meta.reason).toBe('domain-throttled');
    });
  });
});
