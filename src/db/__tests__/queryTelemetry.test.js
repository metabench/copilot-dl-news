'use strict';

const { ensureDb } = require('../sqlite/ensureDb');
const { recordQuery, getQueryStats, getRecentQueries, pruneOldTelemetry } = require('../queryTelemetry');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Query Telemetry', () => {
  let db;
  let dbPath;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), 'test-query-telemetry');
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test-${process.pid}-${Date.now()}.db`);
    db = ensureDb(dbPath);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    const suffixes = ['', '-shm', '-wal'];
    for (const suffix of suffixes) {
      try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
    }
  });

  it('should record query telemetry', () => {
    recordQuery(db, {
      queryType: 'fetch_articles',
      operation: 'SELECT',
      durationMs: 12.5,
      resultCount: 10,
      complexity: 'simple',
      host: 'example.com',
      metadata: { table: 'articles', filters: ['domain'] }
    });

    const recent = getRecentQueries(db, 'fetch_articles', 10);
    expect(recent.length).toBe(1);
    expect(recent[0].query_type).toBe('fetch_articles');
    expect(recent[0].duration_ms).toBe(12.5);
    expect(recent[0].result_count).toBe(10);
  });

  it('should aggregate query statistics', () => {
    // Record multiple queries
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 10, resultCount: 5 });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 20, resultCount: 15 });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 30, resultCount: 25 });

    const stats = getQueryStats(db, { queryType: 'fetch_articles' });
    expect(stats.length).toBe(1);
    expect(stats[0].query_type).toBe('fetch_articles');
    expect(stats[0].avg_duration_ms).toBe(20); // (10 + 20 + 30) / 3
    expect(stats[0].sample_count).toBe(3);
  });

  it('should filter by complexity', () => {
    recordQuery(db, { queryType: 'query_a', operation: 'SELECT', durationMs: 10, complexity: 'simple' });
    recordQuery(db, { queryType: 'query_b', operation: 'SELECT', durationMs: 100, complexity: 'complex' });

    const simpleStats = getQueryStats(db, { complexity: 'simple' });
    expect(simpleStats.length).toBe(1);
    expect(simpleStats[0].query_type).toBe('query_a');

    const complexStats = getQueryStats(db, { complexity: 'complex' });
    expect(complexStats.length).toBe(1);
    expect(complexStats[0].query_type).toBe('query_b');
  });

  it('should handle invalid input gracefully', () => {
    // Missing required fields - should not crash
    recordQuery(db, { queryType: 'test' }); // Missing operation, durationMs
    recordQuery(null, { queryType: 'test', operation: 'SELECT', durationMs: 10 }); // Null db

    const recent = getRecentQueries(db, 'test', 10);
    expect(recent.length).toBe(0);
  });

  it('should prune old telemetry', () => {
    // Insert telemetry with old timestamp
    const oldTimestamp = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
    db.prepare(`
      INSERT INTO query_telemetry (query_type, operation, duration_ms, result_count, timestamp)
      VALUES ('old_query', 'SELECT', 10, 5, ?)
    `).run(oldTimestamp);

    // Insert recent telemetry
    recordQuery(db, { queryType: 'recent_query', operation: 'SELECT', durationMs: 15 });

    const beforePrune = db.prepare('SELECT COUNT(*) as count FROM query_telemetry').get();
    expect(beforePrune.count).toBe(2);

    // Prune data older than 30 days
    const deleted = pruneOldTelemetry(db, 30);
    expect(deleted).toBe(1);

    const afterPrune = db.prepare('SELECT COUNT(*) as count FROM query_telemetry').get();
    expect(afterPrune.count).toBe(1);

    const remaining = getRecentQueries(db, 'recent_query', 10);
    expect(remaining.length).toBe(1);
  });

  it('should store metadata as JSON', () => {
    const metadata = { table: 'articles', filters: ['domain', 'status'], joinCount: 2 };
    recordQuery(db, {
      queryType: 'complex_query',
      operation: 'SELECT',
      durationMs: 50,
      metadata
    });

    const recent = getRecentQueries(db, 'complex_query', 1);
    expect(recent.length).toBe(1);
    const parsed = JSON.parse(recent[0].metadata);
    expect(parsed).toEqual(metadata);
  });
});
