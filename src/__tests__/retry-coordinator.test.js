'use strict';

const RetryCoordinator = require('../crawler/retry/RetryCoordinator');

describe('RetryCoordinator', () => {
  test('_handleRateLimited reads Retry-After via Headers.get("retry-after")', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const rc = new RetryCoordinator({
      domain: { throttleDurationMs: 0 }
    });

    const response = {
      status: 429,
      headers: {
        get: (name) => (String(name).toLowerCase() === 'retry-after' ? '12' : null)
      }
    };

    const decision = rc._handleRateLimited('example.com', response, { type: 'rate-limited' });

    expect(decision.action).toBe('defer');
    expect(decision.delay).toBe(12000);
    expect(decision.retryAfter).toBe(1700000000000 + 12000);

    nowSpy.mockRestore();
  });

  test('_handleRateLimited reads Retry-After from plain object headers', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    const rc = new RetryCoordinator({
      domain: { throttleDurationMs: 0 }
    });

    const response = {
      status: 429,
      headers: {
        'retry-after': '7'
      }
    };

    const decision = rc._handleRateLimited('example.com', response, { type: 'rate-limited' });

    expect(decision.action).toBe('defer');
    expect(decision.delay).toBe(7000);
    expect(decision.retryAfter).toBe(1700000000000 + 7000);

    nowSpy.mockRestore();
  });

  test('network.retryableStatuses override works (and top-level still supported)', () => {
    const rcNetwork = new RetryCoordinator({
      network: { retryableStatuses: [418] }
    });
    expect(rcNetwork.networkConfig.retryableStatuses).toEqual([418]);

    const rcTopLevel = new RetryCoordinator({
      retryableStatuses: [503]
    });
    expect(rcTopLevel.networkConfig.retryableStatuses).toEqual([503]);
  });
});
