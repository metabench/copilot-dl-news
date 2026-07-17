const { FetchPipeline } = require('../FetchPipeline');

/**
 * Regression: _shouldUsePuppeteerFallback must treat the static
 * TLS-fingerprinting domain list as a BASELINE even when the auto-learning
 * PuppeteerDomainManager is present.
 *
 * Previously the manager's answer was returned outright, so a site like
 * theguardian.com — in the static list but not yet auto-learned (learning
 * needs several failures) — got NO Puppeteer fallback on first-contact
 * ECONNRESET and the crawl died with CRAWL_NO_PROGRESS
 * ("no pages downloaded after 1 error"). Seen live 2026-07-14, job
 * 0ff6f86d (basicArticleCrawl https://www.theguardian.com/uk).
 */

describe('FetchPipeline puppeteer fallback domain decision', () => {
  const minimalDeps = (puppeteerFallback = {}) => ({
    getUrlDecision: jest.fn((url) => ({ allow: true, analysis: { normalized: url } })),
    normalizeUrl: jest.fn((url) => url),
    isOnDomain: jest.fn(() => true),
    isAllowed: jest.fn(() => true),
    hasVisited: jest.fn(() => false),
    getCachedArticle: jest.fn(),
    looksLikeArticle: jest.fn(() => false),
    cache: { get: jest.fn() },
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
    telemetry: { telemetry: jest.fn() },
    articleHeaderCache: new Map(),
    knownArticlesCache: new Map(),
    getDbAdapter: () => ({ isEnabled: () => false }),
    parseRetryAfter: () => null,
    handlePolicySkip: jest.fn(),
    onCacheServed: jest.fn(),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    puppeteerFallback
  });

  const managerSaying = (answer) => ({
    shouldUsePuppeteer: jest.fn(() => answer),
    isTrackingEnabled: () => false,
    on: jest.fn(),
    load: jest.fn()
  });

  it('falls back for static-list domains even when the manager has not learned them', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      domainManager: managerSaying(false) // e.g. only 1 ECONNRESET so far
    }));
    expect(pipeline._shouldUsePuppeteerFallback('www.theguardian.com')).toBe(true);
    expect(pipeline._shouldUsePuppeteerFallback('theguardian.com')).toBe(true);
    expect(pipeline._shouldUsePuppeteerFallback('bloomberg.com')).toBe(true);
  });

  it('does not fall back for hosts in neither the manager nor the static list', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      domainManager: managerSaying(false)
    }));
    expect(pipeline._shouldUsePuppeteerFallback('www.bbc.com')).toBe(false);
    expect(pipeline._shouldUsePuppeteerFallback('nottheguardian.com.evil.example')).toBe(false);
  });

  it('still honors manager-approved (auto-learned) domains outside the static list', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      domainManager: managerSaying(true)
    }));
    expect(pipeline._shouldUsePuppeteerFallback('learned-site.example')).toBe(true);
  });

  it('respects the enabled=false kill-switch over everything', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      enabled: false,
      domainManager: managerSaying(true)
    }));
    expect(pipeline._shouldUsePuppeteerFallback('www.theguardian.com')).toBe(false);
  });

  it('custom domain lists replace the defaults', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      domains: ['custom-site.example'],
      domainManager: managerSaying(false)
    }));
    expect(pipeline._shouldUsePuppeteerFallback('custom-site.example')).toBe(true);
    expect(pipeline._shouldUsePuppeteerFallback('www.theguardian.com')).toBe(false);
  });

  it('falls back for DB policy hosts (domain_fetch_policies) beyond the static list', () => {
    // lemonde.fr / reuters.com live only in domain_fetch_policies, injected
    // by the wiring as policyHosts. Consistency fix 2026-07-17: the live
    // crawler must honor them, not just the static guardian/bloomberg/wsj.
    const pipeline = new FetchPipeline(minimalDeps({
      domainManager: managerSaying(false),
      policyHosts: ['lemonde.fr', 'reuters.com']
    }));
    expect(pipeline._shouldUsePuppeteerFallback('www.lemonde.fr')).toBe(true);
    expect(pipeline._shouldUsePuppeteerFallback('lemonde.fr')).toBe(true);
    expect(pipeline._shouldUsePuppeteerFallback('reuters.com')).toBe(true);
    // static defaults still apply alongside policy hosts
    expect(pipeline._shouldUsePuppeteerFallback('theguardian.com')).toBe(true);
    // unrelated host still not matched
    expect(pipeline._shouldUsePuppeteerFallback('bbc.com')).toBe(false);
  });

  it('explicit custom domains override policy hosts (test isolation)', () => {
    const pipeline = new FetchPipeline(minimalDeps({
      domains: ['custom-site.example'],
      policyHosts: ['lemonde.fr'],
      domainManager: managerSaying(false)
    }));
    // custom domains disable both the static list and policy hosts
    expect(pipeline._shouldUsePuppeteerFallback('lemonde.fr')).toBe(false);
    expect(pipeline._shouldUsePuppeteerFallback('custom-site.example')).toBe(true);
  });
});
