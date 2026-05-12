'use strict';

const batch = require('../../../tools/crawl/crawl-batch.js');

describe('tools/crawl/crawl-batch.js - fail-fast launch helpers', () => {
  test('defaults start retries to zero and exposes request timeout', () => {
    const opts = batch.parseArgs(['bbc.com']);
    expect(opts.retries).toBe(0);
    expect(opts.requestTimeoutMs).toBe(15000);
  });

  test('parses explicit retry and request timeout flags', () => {
    const opts = batch.parseArgs(['--retries', '2', '--request-timeout-ms', '5000', 'bbc.com']);
    expect(opts.retries).toBe(2);
    expect(opts.requestTimeoutMs).toBe(5000);
  });

  test('classifies deterministic local API failures as non-retryable', () => {
    expect(batch.isRetryableStartFailure(409, { error: 'JOB_CONFLICT' }, '')).toBe(false);
    expect(batch.isRetryableStartFailure(422, { error: 'bad override' }, '')).toBe(false);
    expect(batch.isRetryableStartFailure(500, { error: 'temporary' }, '')).toBe(true);
    expect(batch.isRetryableStartFailure(0, null, 'request timeout after 15000ms')).toBe(true);
  });

  test('formatElapsed returns compact seconds', () => {
    expect(batch.formatElapsed('2026-05-12T00:00:00.000Z', '2026-05-12T00:00:01.250Z')).toBe('1.3s');
  });
});