const NetworkRetryPolicy = require('../NetworkRetryPolicy');

describe('NetworkRetryPolicy', () => {
  test('computeDelay without jitter returns expected exponential delays', () => {
    const policy = new NetworkRetryPolicy({ maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 8000, jitterRatio: 0, randomFn: () => 0 });
    expect(policy.computeDelay({ attemptIndex: 0 })).toBe(1000);
    expect(policy.computeDelay({ attemptIndex: 1 })).toBe(2000);
    expect(policy.computeDelay({ attemptIndex: 2 })).toBe(4000);
    // attemptIndex 3 would exceed max but should be capped
    expect(policy.computeDelay({ attemptIndex: 3 })).toBe(8000);
  });

  test('computeDelay with retryAfterMs honors bounds', () => {
    const policy = new NetworkRetryPolicy({ baseDelayMs: 500, maxDelayMs: 3000, jitterRatio: 0, randomFn: () => 0 });
    expect(policy.computeDelay({ attemptIndex: 0, retryAfterMs: 100 })).toBe(500); // clamped to base
    expect(policy.computeDelay({ attemptIndex: 0, retryAfterMs: 2000 })).toBe(2000); // within bounds
    expect(policy.computeDelay({ attemptIndex: 0, retryAfterMs: 10000 })).toBe(3000); // clamped to max
  });

  test('isRetryableError and strategy classification', () => {
    const policy = new NetworkRetryPolicy({});
    expect(policy.isRetryableError({ code: 'ECONNRESET', message: 'socket hang up' })).toBe(true);
    expect(policy.strategyFor({ code: 'ECONNRESET', message: 'socket hang up' })).toBe('connection-reset');
    expect(policy.isRetryableError({ name: 'AbortError' })).toBe(true);
    expect(policy.strategyFor({ name: 'AbortError' })).toBe('timeout');
    expect(policy.isRetryableError({ code: 'ENOTFOUND' })).toBe(true);
    expect(policy.strategyFor({ code: 'ENOTFOUND' })).toBe('network-code');
    expect(policy.isRetryableError({ code: 'SOME_OTHER' })).toBe(false);
    expect(policy.strategyFor({ code: 'SOME_OTHER' })).toBe('network');
  });
});
