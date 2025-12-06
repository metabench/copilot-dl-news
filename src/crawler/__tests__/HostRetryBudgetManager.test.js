const HostRetryBudgetManager = require('../HostRetryBudgetManager');

describe('HostRetryBudgetManager', () => {
  test('failure tracking and lockout', () => {
    const manager = new HostRetryBudgetManager({ maxErrors: 3, windowMs: 10000, lockoutMs: 2000, telemetry: { telemetry: () => {} }, logger: { warn: () => {} } });
    const host = 'example.test';
    expect(manager.check(host)).toEqual({ locked: false, failures: 0, state: null });
    manager.noteFailure(host, { reason: 'a' });
    expect(manager.check(host).failures).toBe(1);
    manager.noteFailure(host, { reason: 'b' });
    expect(manager.check(host).failures).toBe(2);
    manager.noteFailure(host, { reason: 'c' });
    const res = manager.check(host);
    expect(res.locked).toBe(true);
    expect(res.failures).toBe(3);
    expect(res.retryAfterMs).toBeGreaterThanOrEqual(0);
    // noteSuccess should clear the state
    manager.noteSuccess(host);
    expect(manager.check(host)).toEqual({ locked: false, failures: 0, state: null });
  });
});
