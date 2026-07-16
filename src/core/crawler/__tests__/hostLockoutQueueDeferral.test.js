'use strict';

const HostRetryBudgetManager = require('../HostRetryBudgetManager');
const { DomainThrottleManager } = require('../DomainThrottleManager');

/**
 * Regression: a host retry-budget lockout must reach the queue's host
 * gating (DomainThrottleManager.getHostResumeTime). Before this wiring,
 * the lock existed only inside FetchPipeline, so QueueManager kept
 * dequeuing the locked host's URLs and each one turned into a synthetic
 * HOST_RETRY_EXHAUSTED error — LeMonde 2026-07-15 (jobs 143fc616 &
 * ce78bfd3) burned 5,140 such errors during a single 2-minute lock.
 */

const makeThrottle = () => {
  const states = new Map();
  return new DomainThrottleManager({
    state: {
      getDomainLimitState: (host) => states.get(host) || null,
      setDomainLimitState: (host, s) => states.set(host, s)
    }
  });
};

describe('host lockout → queue deferral wiring', () => {
  it('onLockout fires once per lock with the expiry timestamp', () => {
    const seen = [];
    const manager = new HostRetryBudgetManager({
      maxErrors: 3, windowMs: 10000, lockoutMs: 2000,
      logger: { warn: () => {} },
      onLockout: (host, until) => seen.push({ host, until })
    });
    const before = Date.now();
    for (let i = 0; i < 5; i++) manager.noteFailure('www.lemonde.fr', { reason: 'HTTP 402' });
    expect(seen).toHaveLength(1); // once per lock, not per subsequent failure
    expect(seen[0].host).toBe('www.lemonde.fr');
    expect(seen[0].until).toBeGreaterThanOrEqual(before + 2000);
  });

  it('applyHostBackoff makes getHostResumeTime defer the host', () => {
    const throttle = makeThrottle();
    expect(throttle.getHostResumeTime('www.lemonde.fr')).toBeNull();
    const until = Date.now() + 120000;
    throttle.applyHostBackoff('www.lemonde.fr', until);
    expect(throttle.getHostResumeTime('www.lemonde.fr')).toBe(until);
    // Never shortens an existing backoff.
    throttle.applyHostBackoff('www.lemonde.fr', until - 60000);
    expect(throttle.getHostResumeTime('www.lemonde.fr')).toBe(until);
  });

  it('end to end: budget exhaustion gates the host at the throttle', () => {
    const throttle = makeThrottle();
    const manager = new HostRetryBudgetManager({
      maxErrors: 2, windowMs: 10000, lockoutMs: 5000,
      logger: { warn: () => {} },
      onLockout: (host, until) => throttle.applyHostBackoff(host, until)
    });
    manager.noteFailure('www.lemonde.fr');
    expect(throttle.getHostResumeTime('www.lemonde.fr')).toBeNull(); // not yet
    manager.noteFailure('www.lemonde.fr');
    const resume = throttle.getHostResumeTime('www.lemonde.fr');
    expect(resume).toBeGreaterThan(Date.now());
    expect(manager.check('www.lemonde.fr').locked).toBe(true);
  });

  it('ignores junk input without throwing', () => {
    const throttle = makeThrottle();
    throttle.applyHostBackoff(null, Date.now() + 1000);
    throttle.applyHostBackoff('host.example', NaN);
    expect(throttle.getHostResumeTime('host.example')).toBeNull();
  });
});
