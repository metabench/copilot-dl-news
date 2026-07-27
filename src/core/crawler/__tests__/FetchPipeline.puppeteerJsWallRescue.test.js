'use strict';

const { FetchPipeline } = require('../FetchPipeline');
const { ContentValidationService } = require('../services/ContentValidationService');

/**
 * A content-validation 'soft' rejection (JS-required, bot-check interstitial,
 * etc.) is DIRECT evidence that a page needs a real browser — unlike an
 * ECONNRESET, which is only a probabilistic TLS-fingerprint-blocking signal
 * gated behind _shouldUsePuppeteerFallback's host allowlist. This suite
 * proves the soft-failure path retries via Puppeteer IMMEDIATELY, for ANY
 * host (bypassing the allowlist on purpose — the evidence justifies it),
 * and stays safe when Puppeteer's own result is still bad or fallback is
 * disabled.
 *
 * Found live 2026-07-19: Globe and Mail now serves a JS-required wall for
 * nearly all content; ContentValidationService already classified it as a
 * 'soft' failure (failureType meant "try with Puppeteer later"), but nothing
 * acted on that signal — the designed "Teacher rendering" hook
 * (this.onSoftFailure) is never wired to anything in the live app
 * (teacherService is constructed nowhere). This closes that gap directly,
 * reusing the already-proven ECONNRESET Puppeteer-fallback machinery instead
 * of the unfinished Teacher pathway.
 */
describe('FetchPipeline: Puppeteer rescue on content-validation soft-failure', () => {
  const JS_WALL_HTML = `<html><body>
    <div>Please enable JavaScript to view this content.</div>
    <div>This site requires JavaScript to function correctly for all users.</div>
  </body></html>`;
  const REAL_ARTICLE_HTML = '<html><body><h1>Real Headline</h1><p>' +
    'This is the genuine article body rendered by a real browser, long enough to clear the minimum body length check comfortably.' +
    '</p></body></html>';
  // A host in none of: the static TLS-fingerprint list, DB policyHosts, or the
  // auto-learning domain manager — proves the soft-failure path does NOT need
  // host pre-approval (unlike the ECONNRESET trigger).
  const UNLISTED_HOST_URL = 'https://www.example-js-wall.test/world/';

  const baseDeps = () => ({
    getUrlDecision: jest.fn((url) => ({ allow: true, analysis: { normalized: url } })),
    normalizeUrl: jest.fn((url) => url),
    isOnDomain: jest.fn(() => true),
    isAllowed: jest.fn(() => true),
    hasVisited: jest.fn(() => false),
    getCachedArticle: jest.fn(),
    looksLikeArticle: jest.fn(() => false),
    cache: { get: jest.fn() },
    preferCache: false,
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
    telemetry: { telemetry: jest.fn(), problem: jest.fn(), milestone: jest.fn() },
    articleHeaderCache: new Map(),
    knownArticlesCache: new Map(),
    getDbAdapter: () => ({ isEnabled: () => false }),
    parseRetryAfter: () => null,
    handlePolicySkip: jest.fn(),
    onCacheServed: jest.fn(),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    contentValidationService: new ContentValidationService({
      minBodyLength: 50,
      logger: { info: () => {}, warn: () => {} }
    })
  });

  const okResponse = (html) => ({
    ok: true,
    status: 200,
    headers: { get: (key) => (key === 'content-type' ? 'text/html' : null) },
    url: UNLISTED_HOST_URL,
    text: async () => html
  });

  function makeFakePuppeteerFetcher(result) {
    return { fetch: jest.fn().mockResolvedValue(result) };
  }

  it('retries via Puppeteer on a JS-required soft-failure, on a host NOT in any allowlist', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(JS_WALL_HTML));
    const pipeline = new FetchPipeline(deps);
    // Confirm this host genuinely has no pre-approval — the point of the test.
    expect(pipeline._shouldUsePuppeteerFallback('www.example-js-wall.test')).toBe(false);

    const fakeFetcher = makeFakePuppeteerFetcher({
      success: true,
      html: REAL_ARTICLE_HTML,
      httpStatus: 200,
      contentLength: REAL_ARTICLE_HTML.length,
      finalUrl: UNLISTED_HOST_URL,
      durationMs: 42
    });
    pipeline._getPuppeteerFetcher = jest.fn().mockResolvedValue(fakeFetcher);

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(fakeFetcher.fetch).toHaveBeenCalledTimes(1);
    expect(deps.fetchFn).toHaveBeenCalledTimes(1); // no retry loop on the plain fetch side
    expect(result.meta.status).toBe('success');
    expect(result.html).toBe(REAL_ARTICLE_HTML);
    expect(result.html).not.toContain('enable JavaScript');
    expect(result.meta.fetchMeta.fetchMethod).toBe('puppeteer-fallback');
    // Regression guard: live-observed 2026-07-20 on Globe and Mail — the
    // ECONNRESET path's 'domcontentloaded' default fires BEFORE SPA
    // hydration finishes, so Puppeteer captured the SAME "enable JavaScript"
    // placeholder as a plain fetch. The JS-wall rescue must wait for the
    // render cycle to actually complete.
    expect(fakeFetcher.fetch).toHaveBeenCalledWith(
      UNLISTED_HOST_URL,
      expect.objectContaining({ waitUntil: 'networkidle2' })
    );
  });

  it('falls through to the validation-failed result when Puppeteer is disabled', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(JS_WALL_HTML));
    deps.puppeteerFallback = { enabled: false };
    const pipeline = new FetchPipeline(deps);
    pipeline._getPuppeteerFetcher = jest.fn(); // must never be called

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(pipeline._getPuppeteerFetcher).not.toHaveBeenCalled();
    expect(result.meta.status).toBe('skipped');
    expect(result.meta.reason).toBe('javascript-required');
  });

  it('falls through safely when the Puppeteer-rendered content STILL fails validation', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(JS_WALL_HTML));
    const pipeline = new FetchPipeline(deps);
    // Simulate Puppeteer itself getting bot-walled — no infinite loop, no crash.
    pipeline._getPuppeteerFetcher = jest.fn().mockResolvedValue(makeFakePuppeteerFetcher({
      success: true,
      html: JS_WALL_HTML,
      httpStatus: 200,
      contentLength: JS_WALL_HTML.length,
      finalUrl: UNLISTED_HOST_URL,
      durationMs: 30
    }));

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(result.meta.status).toBe('skipped');
    expect(result.meta.reason).toBe('javascript-required');
  });

  it('falls through safely when Puppeteer itself errors', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(JS_WALL_HTML));
    const pipeline = new FetchPipeline(deps);
    pipeline._getPuppeteerFetcher = jest.fn().mockResolvedValue({
      fetch: jest.fn().mockRejectedValue(new Error('browser crashed'))
    });

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(result.meta.status).toBe('skipped');
    expect(result.meta.reason).toBe('javascript-required');
  });

  it('does not touch Puppeteer for a HARD validation failure (e.g. 403/access-denied)', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(
      '<html><body>403 Forbidden. Access Denied. You do not have permission to access this resource on this server, sorry.</body></html>'
    ));
    const pipeline = new FetchPipeline(deps);
    pipeline._getPuppeteerFetcher = jest.fn();

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(pipeline._getPuppeteerFetcher).not.toHaveBeenCalled();
    expect(result.meta.status).toBe('skipped');
  });

  it('valid (non-rejected) content never triggers Puppeteer', async () => {
    const deps = baseDeps();
    deps.fetchFn = jest.fn(async () => okResponse(REAL_ARTICLE_HTML));
    const pipeline = new FetchPipeline(deps);
    pipeline._getPuppeteerFetcher = jest.fn();

    const result = await pipeline.fetch({ url: UNLISTED_HOST_URL, context: { depth: 0 } });

    expect(pipeline._getPuppeteerFetcher).not.toHaveBeenCalled();
    expect(result.meta.status).toBe('success');
    expect(result.html).toBe(REAL_ARTICLE_HTML);
  });
});
