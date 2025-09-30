const { UrlDecisionService } = require('../UrlDecisionService');

describe('UrlDecisionService', () => {
  it('caches decisions and persists compacted analysis', () => {
    const decideMock = jest.fn(() => ({
      allow: true,
      reason: 'allowed',
      analysis: {
        raw: 'http://example.com/foo',
        normalized: 'http://example.com/foo',
        host: 'example.com',
        path: '/foo',
        hasQuery: false,
        pathIsSearchy: false
      }
    }));
    const urlPolicy = { decide: decideMock };
    const decisionCache = new Map();
    const analysisCache = new Map();
    const upsertUrl = jest.fn();
    const dbAdapter = {
      isEnabled: () => true,
      upsertUrl
    };

    const service = new UrlDecisionService({
      urlPolicy,
      urlDecisionCache: decisionCache,
      urlAnalysisCache: analysisCache,
      getDbAdapter: () => dbAdapter
    });

    const decision = service.getDecision('http://example.com/foo', { phase: 'seed' });

    expect(decision.allow).toBe(true);
    expect(decisionCache.get('seed|http://example.com/foo')).toBe(decision);
    expect(analysisCache.get('http://example.com/foo')).toMatchObject({
      normalized: 'http://example.com/foo',
      host: 'example.com',
      path: '/foo'
    });
    expect(upsertUrl).toHaveBeenCalledTimes(1);
    const [storedUrl, , payloadRaw] = upsertUrl.mock.calls[0];
    expect(storedUrl).toBe('http://example.com/foo');
    const payload = JSON.parse(payloadRaw);
    expect(payload.analysis.normalized).toBe('http://example.com/foo');
    expect(payload.decision).toMatchObject({ allow: true, reason: 'allowed' });

    upsertUrl.mockClear();
    const cached = service.getDecision('http://example.com/foo', { phase: 'seed' });
    expect(cached).toBe(decision);
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(upsertUrl).not.toHaveBeenCalled();
  });

  it('converts policy errors into blocked decisions', () => {
    const urlPolicy = {
      decide: () => {
        throw new Error('boom');
      }
    };

    const service = new UrlDecisionService({ urlPolicy });
    const decision = service.getDecision('http://bad', {});

    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('policy-error');
    expect(decision.analysis).toEqual({
      raw: 'http://bad',
      invalid: true
    });
  });
});
