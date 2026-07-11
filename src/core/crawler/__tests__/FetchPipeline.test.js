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
    expect(result.meta.freshness).toEqual(expect.objectContaining({
      status: 'new',
      reason: 'network-200-no-stored-proof'
    }));
    expect(deps.noteSuccess).toHaveBeenCalled();
  });

  it('classifies conditional 304 responses as unchanged freshness', async () => {
    const deps = baseDeps();
    const dbAdapter = {
      isEnabled: () => true,
      getArticleHeaders: jest.fn(() => ({
        etag: '"stored"',
        last_modified: 'Tue, 10 Jun 2026 10:00:00 GMT',
        fetched_at: '2026-06-10T10:00:00.000Z'
      })),
      insertHttpResponse: jest.fn(async () => {})
    };
    deps.fetchFn = jest.fn(async (_url, options) => ({
      ok: false,
      status: 304,
      headers: {
        get: (key) => {
          if (key === 'etag') return '"stored"';
          if (key === 'last-modified') return 'Tue, 10 Jun 2026 10:00:00 GMT';
          return null;
        }
      },
      text: async () => ''
    }));

    const pipeline = new FetchPipeline({ ...deps, getDbAdapter: () => dbAdapter, fetchFn: deps.fetchFn });
    const result = await pipeline.fetch({ url: 'https://example.com/page', context: { depth: 0, allowRevisit: true } });

    expect(deps.fetchFn).toHaveBeenCalledWith('https://example.com/page', expect.objectContaining({
      headers: expect.objectContaining({
        'If-None-Match': '"stored"',
        'If-Modified-Since': 'Tue, 10 Jun 2026 10:00:00 GMT'
      })
    }));
    expect(result.source).toBe('not-modified');
    expect(result.meta.freshness).toMatchObject({
      status: 'unchanged',
      reason: 'conditional-get-304',
      avoidedDownload: true,
      fullGetRequired: false
    });
  });

  it('re-consults the DB for validators after a null first lookup (within-run re-fetch)', async () => {
    const deps = baseDeps();
    let storedHeaders = null; // no validators yet on first fetch
    const dbAdapter = {
      isEnabled: () => true,
      getArticleHeaders: jest.fn(() => storedHeaders),
      insertHttpResponse: jest.fn(async () => {})
    };
    deps.fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (key) => {
          if (key === 'content-type') return 'text/html';
          if (key === 'etag') return '"v1"';
          return null;
        }
      },
      text: async () => '<html><body>hub</body></html>'
    }));

    const pipeline = new FetchPipeline({ ...deps, getDbAdapter: () => dbAdapter, fetchFn: deps.fetchFn });

    await pipeline.fetch({ url: 'https://example.com/hub', context: { depth: 0, allowRevisit: true } });
    const firstHeaders = deps.fetchFn.mock.calls[0][1].headers;
    expect(firstHeaders['If-None-Match']).toBeUndefined();

    // Validators get persisted between fetches (e.g. hub page stored to DB).
    storedHeaders = { etag: '"v1"', last_modified: null, fetched_at: '2026-07-02T10:00:00.000Z' };

    await pipeline.fetch({ url: 'https://example.com/hub', context: { depth: 0, allowRevisit: true } });
    const secondHeaders = deps.fetchFn.mock.calls[deps.fetchFn.mock.calls.length - 1][1].headers;
    expect(secondHeaders['If-None-Match']).toBe('"v1"');
  });

  it('classifies conditional 200 responses with sitemap lastmod as updated freshness', async () => {
    const deps = baseDeps();
    const dbAdapter = {
      isEnabled: () => true,
      getArticleHeaders: jest.fn(() => ({
        etag: '"old"',
        last_modified: 'Tue, 10 Jun 2026 10:00:00 GMT',
        fetched_at: '2026-06-10T10:00:00.000Z'
      })),
      insertHttpResponse: jest.fn(async () => {})
    };
    deps.fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (key) => {
          if (key === 'content-type') return 'text/html';
          if (key === 'etag') return '"new"';
          if (key === 'last-modified') return 'Fri, 12 Jun 2026 10:00:00 GMT';
          return null;
        }
      },
      text: async () => '<html><body>updated</body></html>'
    }));

    const pipeline = new FetchPipeline({ ...deps, getDbAdapter: () => dbAdapter, fetchFn: deps.fetchFn });
    const result = await pipeline.fetch({
      url: 'https://example.com/page',
      context: {
        depth: 0,
        allowRevisit: true,
        requestMeta: {
          source: 'sitemap',
          sitemapDiscovery: true,
          lastmod: '2026-06-12T10:00:00Z'
        }
      }
    });

    expect(result.source).toBe('network');
    expect(result.meta.freshness).toMatchObject({
      status: 'updated',
      reason: 'conditional-get-200',
      conditional: true,
      sitemapLastmod: '2026-06-12T10:00:00Z'
    });
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

  describe('fetch-skip visibility (cycle 10)', () => {
    const withQueueTelemetry = (deps) => {
      deps.telemetry = {
        telemetry: jest.fn(),
        queueEvent: jest.fn(),
        enhancedQueueEvent: jest.fn()
      };
      return deps;
    };

    it('emits a fetch-skip queue event when the orchestrator skips a dequeued URL', async () => {
      const deps = withQueueTelemetry(baseDeps());
      deps.getUrlDecision = jest.fn();
      const urlDecisionOrchestrator = {
        decide: jest.fn(async () => ({
          action: 'skip',
          reason: 'already-visited',
          analysis: { normalized: 'https://example.com/seed' }
        }))
      };

      const pipeline = new FetchPipeline({ ...deps, urlDecisionOrchestrator });
      const result = await pipeline.fetch({
        url: 'https://example.com/seed',
        context: { depth: 0, allowRevisit: true }
      });

      expect(result.source).toBe('skipped');
      expect(deps.telemetry.enhancedQueueEvent).toHaveBeenCalledTimes(1);
      const evt = deps.telemetry.enhancedQueueEvent.mock.calls[0][0];
      expect(evt.action).toBe('fetch-skip');
      expect(evt.url).toBe('https://example.com/seed');
      expect(evt.reason).toBe('orchestrator:already-visited');
      expect(evt.host).toBe('example.com');
      expect(evt.depth).toBe(0);
    });

    it('emits a fetch-skip queue event for already-visited URLs without allowRevisit', async () => {
      const deps = withQueueTelemetry(baseDeps());
      deps.hasVisited = jest.fn(() => true);

      const pipeline = new FetchPipeline({ ...deps });
      const result = await pipeline.fetch({
        url: 'https://example.com/page',
        context: { depth: 1, allowRevisit: false }
      });

      expect(result.source).toBe('skipped');
      expect(result.meta.reason).toBe('already-visited');
      const evt = deps.telemetry.enhancedQueueEvent.mock.calls[0][0];
      expect(evt.action).toBe('fetch-skip');
      expect(evt.reason).toBe('already-visited');
    });

    it('emits a fetch-skip queue event when robots/domain policy blocks the fetch', async () => {
      const deps = withQueueTelemetry(baseDeps());
      deps.isAllowed = jest.fn(() => false);

      const pipeline = new FetchPipeline({ ...deps });
      const result = await pipeline.fetch({
        url: 'https://example.com/blocked',
        context: { depth: 0 }
      });

      expect(result.source).toBe('skipped');
      const evt = deps.telemetry.enhancedQueueEvent.mock.calls[0][0];
      expect(evt.action).toBe('fetch-skip');
      expect(evt.reason).toBe('robots-disallow');
    });

    it('does not emit fetch-skip events for successful cache serves', async () => {
      const deps = withQueueTelemetry(baseDeps());
      const cached = { html: '<html></html>', crawledAt: new Date().toISOString(), source: 'db' };
      deps.getCachedArticle.mockResolvedValue(cached);

      const pipeline = new FetchPipeline({ ...deps });
      const result = await pipeline.fetch({
        url: 'https://example.com/page',
        context: { forceCache: true, depth: 0, allowRevisit: false }
      });

      expect(result.source).toBe('cache');
      expect(deps.telemetry.enhancedQueueEvent).not.toHaveBeenCalled();
    });
  });
});
