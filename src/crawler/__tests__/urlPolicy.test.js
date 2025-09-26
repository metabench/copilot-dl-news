const { UrlPolicy } = require('../urlPolicy');

describe('UrlPolicy', () => {
  test('normalizes URLs and recognises query presence', () => {
    const policy = new UrlPolicy({ baseUrl: 'https://example.com' });
    const raw = '/foo/bar?one=1&two=2';
    const normalized = policy.normalize(raw);
    expect(normalized).toBe('https://example.com/foo/bar?one=1&two=2');

    const decision = policy.decide(normalized, { phase: 'test' });
    expect(decision.allow).toBe(true);
    expect(decision.analysis.hasQuery).toBe(true);
    expect(decision.pendingActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'query-investigation' })
      ])
    );
    expect(decision.notes).toMatch(/Querystring/);
    expect(decision.classification.mode).toBe('uncertain');
  });

  test('marks common tracking parameters as superfluous', () => {
    const policy = new UrlPolicy({ baseUrl: 'https://example.com' });
    const raw = 'https://example.com/live?filterKeyEvents=false&page=with%3Ablock-abc';
    const decision = policy.decide(raw, { phase: 'enqueue' });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('query-superfluous');
    expect(decision.analysis.guessedWithoutQuery).toBe('https://example.com/live');
    expect(decision.guessedUrl).toBe('https://example.com/live');
    expect(decision.classification.mode).toBe('superfluous');
  });

  test('flags invalid URLs', () => {
    const policy = new UrlPolicy();
    const decision = policy.decide('notaurl');
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('invalid-url');
  });
});
