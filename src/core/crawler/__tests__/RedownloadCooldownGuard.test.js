const RedownloadCooldownGuard = require('../RedownloadCooldownGuard');

describe('RedownloadCooldownGuard', () => {
  test('unlocked until noted, then locked for cooldownMs, then unlocked again', () => {
    const guard = new RedownloadCooldownGuard({ cooldownMs: 1000 });
    const key = 'place:1';

    expect(guard.check(key)).toEqual({ locked: false, retryAfterMs: 0 });

    guard.note(key);
    const res = guard.check(key);
    expect(res.locked).toBe(true);
    expect(res.retryAfterMs).toBeGreaterThan(0);
    expect(res.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  test('expires on its own after cooldownMs elapses', async () => {
    const guard = new RedownloadCooldownGuard({ cooldownMs: 20 });
    const key = 'place:2';
    guard.note(key);
    expect(guard.check(key).locked).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(guard.check(key)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  test('keys are independent', () => {
    const guard = new RedownloadCooldownGuard({ cooldownMs: 1000 });
    guard.note('place:1');
    expect(guard.check('place:1').locked).toBe(true);
    expect(guard.check('place:2').locked).toBe(false);
  });

  test('falsy key never locks (guard is a no-op for missing keys)', () => {
    const guard = new RedownloadCooldownGuard({ cooldownMs: 1000 });
    guard.note(null);
    guard.note(undefined);
    expect(guard.check(null)).toEqual({ locked: false, retryAfterMs: 0 });
    expect(guard.check(undefined)).toEqual({ locked: false, retryAfterMs: 0 });
  });

  test('defaults cooldownMs to 5 minutes when not given / invalid', () => {
    const guard = new RedownloadCooldownGuard();
    expect(guard.cooldownMs).toBe(5 * 60 * 1000);
    const guard2 = new RedownloadCooldownGuard({ cooldownMs: -5 });
    expect(guard2.cooldownMs).toBe(5 * 60 * 1000);
  });
});
