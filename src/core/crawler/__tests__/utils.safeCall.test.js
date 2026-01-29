const { safeCall, safeCallAsync, safeHostFromUrl } = require('../../../shared/utils');

describe('safeCall', () => {
  test('returns function result when no error occurs', () => {
    const result = safeCall(() => 42, null);
    expect(result).toBe(42);
  });

  test('returns fallback when function throws', () => {
    const result = safeCall(() => {
      throw new Error('boom');
    }, 'fallback');
    expect(result).toBe('fallback');
  });

  test('defaults to undefined fallback when not provided', () => {
    const result = safeCall(() => {
      throw new Error('oops');
    });
    expect(result).toBeUndefined();
  });
});

describe('safeCallAsync', () => {
  test('resolves with the async result', async () => {
    const value = await safeCallAsync(async () => 'ok');
    expect(value).toBe('ok');
  });

  test('resolves with fallback when async fn throws', async () => {
    const value = await safeCallAsync(async () => {
      throw new Error('fail');
    }, 'async-fallback');
    expect(value).toBe('async-fallback');
  });

  test('resolves with fallback when promise rejects', async () => {
    const value = await safeCallAsync(() => Promise.reject(new Error('reject')), 'rej');
    expect(value).toBe('rej');
  });
});

describe('safeHostFromUrl', () => {
  test('returns hostname for valid URLs', () => {
    expect(safeHostFromUrl('https://news.example.com/path')).toBe('news.example.com');
  });

  test('returns null for invalid URL strings', () => {
    expect(safeHostFromUrl('not-a-url')).toBeNull();
  });

  test('returns null for non-string inputs', () => {
    expect(safeHostFromUrl(null)).toBeNull();
    expect(safeHostFromUrl(undefined)).toBeNull();
    expect(safeHostFromUrl(123)).toBeNull();
  });
});
