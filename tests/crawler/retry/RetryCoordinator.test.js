'use strict';

const { RetryCoordinator } = require('../../../src/core/crawler/retry');
const { CrawlContext } = require('../../../src/core/crawler/context');

describe('RetryCoordinator', () => {
  let coordinator;
  let context;

  beforeEach(() => {
    context = CrawlContext.create({ jobId: 'test' });
    coordinator = new RetryCoordinator({
      context,
      maxRetries: 3,
      network: {
        baseDelayMs: 100,
        maxDelayMs: 1000
      },
      host: {
        maxErrors: 3,
        windowMs: 60000,
        lockoutMs: 30000
      }
    });
  });

  afterEach(() => {
    coordinator.reset();
  });

  describe('error classification', () => {
    test('classifies successful responses', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 200 }
      });

      expect(decision.action).toBe('success');
    });

    test('classifies 429 as rate-limited', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 429 }
      });

      expect(decision.action).toBe('defer');
      expect(decision.reason).toBe('rate-limited');
      expect(decision.delay).toBeGreaterThan(0);
    });

    test('classifies 500 as server-error', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 500 }
      });

      expect(decision.action).toBe('retry');
      expect(decision.reason).toBe('http-500');
    });

    test('classifies 404 as permanent', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 404 }
      });

      expect(decision.action).toBe('abandon');
      expect(decision.reason).toBe('not-found');
    });

    test('classifies connection reset', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        error: { code: 'ECONNRESET' }
      });

      expect(decision.action).toBe('retry');
      expect(decision.reason).toBe('connection-reset');
    });

    test('classifies timeout', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        error: { code: 'ETIMEDOUT' }
      });

      expect(decision.action).toBe('retry');
      expect(decision.reason).toBe('timeout');
    });

    test('classifies DNS failure as permanent', async () => {
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        error: { code: 'ENOTFOUND' }
      });

      expect(decision.action).toBe('abandon');
      expect(decision.reason).toBe('dns-failure');
    });
  });

  describe('retry limits', () => {
    test('retries up to max attempts', async () => {
      // First 3 attempts should retry
      for (let attempt = 0; attempt < 3; attempt++) {
        const decision = await coordinator.shouldRetry({
          url: 'https://example.com/page',
          attempt,
          error: { code: 'ETIMEDOUT' }
        });

        expect(decision.shouldRetry).toBe(true);
        expect(decision.action).toBe('retry');
      }

      // 4th attempt should abandon
      const decision = await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 3,
        error: { code: 'ETIMEDOUT' }
      });

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toBe('max-retries-exceeded');
    });

    test('calculates exponential backoff with jitter', async () => {
      const delays = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        const decision = await coordinator.shouldRetry({
          url: 'https://example.com/page',
          attempt,
          error: { code: 'ETIMEDOUT' }
        });
        delays.push(decision.delay);
      }

      // Each delay should be roughly 2x the previous (with some jitter)
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe('host error budgets', () => {
    test('locks out host after too many errors', async () => {
      const host = 'error-host.com';

      // Generate errors up to limit - the 3rd call should trigger block-host
      let blockHostDecision;
      for (let i = 0; i < 3; i++) {
        const decision = await coordinator.shouldRetry({
          url: `https://${host}/page${i}`,
          attempt: 3, // Force abandon to record error
          response: { status: 500 }
        });
        // The 3rd iteration should return block-host (error count hits maxErrors)
        if (i === 2) {
          blockHostDecision = decision;
        }
      }

      // The 3rd call itself should have returned block-host
      expect(blockHostDecision.action).toBe('block-host');
      expect(blockHostDecision.reason).toBe('host-error-budget-exceeded');

      // Subsequent calls should be deferred due to lockout
      const deferredDecision = await coordinator.shouldRetry({
        url: `https://${host}/page-final`,
        attempt: 0,
        response: { status: 500 }
      });

      expect(deferredDecision.action).toBe('defer');
      expect(deferredDecision.reason).toBe('host-locked-out');
    });

    test('clears error state after successes', async () => {
      const host = 'recovering-host.com';

      // Generate some errors
      await coordinator.shouldRetry({
        url: `https://${host}/page1`,
        attempt: 3,
        response: { status: 500 }
      });

      // Record successes
      for (let i = 0; i < 5; i++) {
        coordinator.recordSuccess(`https://${host}/success${i}`);
      }

      // Check host info
      const info = coordinator.getHostInfo(host);
      expect(info.successStreak).toBeGreaterThan(0);
    });
  });

  describe('preflight checks', () => {
    test('allows request to healthy host', () => {
      const result = coordinator.preflight('https://example.com/page');

      expect(result.allowed).toBe(true);
    });

    test('blocks request to locked host', async () => {
      const host = 'locked-host.com';

      // Lock the host
      for (let i = 0; i < 4; i++) {
        await coordinator.shouldRetry({
          url: `https://${host}/page${i}`,
          attempt: 3,
          response: { status: 500 }
        });
      }

      const result = coordinator.preflight(`https://${host}/new-page`);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('host-locked-out');
      expect(result.waitMs).toBeGreaterThan(0);
    });

    test('handles invalid URLs', () => {
      const result = coordinator.preflight('not-a-url');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('invalid-url');
    });
  });

  describe('token bucket rate limiting', () => {
    test('acquires tokens up to burst size', () => {
      const domain = 'rate-test.com';

      // Should be able to acquire burst size tokens immediately
      for (let i = 0; i < 10; i++) {
        expect(coordinator.acquireToken(domain)).toBe(true);
      }

      // Next one should fail (no tokens left)
      expect(coordinator.acquireToken(domain)).toBe(false);
    });

    test('getTokenWaitTime returns time until next token', () => {
      const domain = 'wait-test.com';

      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        coordinator.acquireToken(domain);
      }

      const waitTime = coordinator.getTokenWaitTime(domain);
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe('connection reset handling', () => {
    test('blocks host after repeated connection resets', async () => {
      const host = 'unstable-host.com';

      // Simulate rapid connection resets
      for (let i = 0; i < 3; i++) {
        await coordinator.shouldRetry({
          url: `https://${host}/page${i}`,
          attempt: 0,
          error: { code: 'ECONNRESET' }
        });
      }

      const info = coordinator.getHostInfo(host);
      expect(info.connectionResets).toBe(3);
    });
  });

  describe('events', () => {
    test('emits decision events', async () => {
      const events = [];
      coordinator.on('decision', (data) => events.push(data));

      await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        error: { code: 'ETIMEDOUT' }
      });

      expect(events).toHaveLength(1);
      expect(events[0].url).toBe('https://example.com/page');
      expect(events[0].decision).toBeDefined();
    });

    test('emits rate-limited events', async () => {
      const events = [];
      coordinator.on('rate-limited', (data) => events.push(data));

      await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 429 }
      });

      expect(events).toHaveLength(1);
      expect(events[0].host).toBe('example.com');
    });

    test('emits host-locked events', async () => {
      const events = [];
      coordinator.on('host-locked', (data) => events.push(data));

      // Generate enough errors to lock
      for (let i = 0; i < 4; i++) {
        await coordinator.shouldRetry({
          url: `https://lockme.com/page${i}`,
          attempt: 3,
          response: { status: 500 }
        });
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].host).toBe('lockme.com');
    });
  });

  describe('status and info', () => {
    test('getStatus returns summary', async () => {
      await coordinator.shouldRetry({
        url: 'https://host1.com/page',
        attempt: 0,
        response: { status: 500 }
      });

      const status = coordinator.getStatus();

      expect(status.trackedHosts).toBeGreaterThan(0);
    });

    test('getHostInfo returns detailed host data', async () => {
      await coordinator.shouldRetry({
        url: 'https://info-test.com/page',
        attempt: 0,
        response: { status: 500 }
      });

      const info = coordinator.getHostInfo('info-test.com');

      expect(info.host).toBe('info-test.com');
      expect(info.errors).toBeGreaterThan(0);
    });

    test('reset clears all state', async () => {
      await coordinator.shouldRetry({
        url: 'https://example.com/page',
        attempt: 0,
        response: { status: 500 }
      });

      coordinator.reset();

      const status = coordinator.getStatus();
      expect(status.trackedHosts).toBe(0);
    });
  });
});

