'use strict';

const Database = require('better-sqlite3');

const {
  DEFAULT_MAX_AGE_MS,
  getStatDefinitions,
  getStatDefinition,
  getCachedMetric,
  upsertCachedMetric
} = require('../../../../src/ui/server/services/metricsService');

describe('metricsService', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) db.close();
  });

  test('getStatDefinitions returns an array', () => {
    const defs = getStatDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
  });

  test('getStatDefinition returns definition by key', () => {
    const def = getStatDefinition('urls.total_count');
    expect(def).toBeDefined();
    expect(def.key).toBe('urls.total_count');
  });

  test('upsertCachedMetric + getCachedMetric roundtrip', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');

    upsertCachedMetric(db, {
      statKey: 'test:stat',
      payload: { value: 42 },
      generatedAt: now.toISOString(),
      durationMs: 12,
      maxAgeMs: DEFAULT_MAX_AGE_MS,
      metadata: { foo: 'bar' }
    });

    const cached = getCachedMetric(db, 'test:stat', { now });
    expect(cached).toBeDefined();
    expect(cached.payload).toEqual({ value: 42 });
    expect(cached.stale).toBe(false);
    expect(cached.metadata).toEqual({ foo: 'bar' });
  });
});
