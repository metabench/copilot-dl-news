'use strict';

const Database = require('better-sqlite3');
const { recordQuery, getQueryStats, getRecentQueries, _getWriterForDb } = require('../queryTelemetry');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Query Telemetry', () => {
  let db;
  let writer;

  beforeEach(() => {
    // Use an in-memory database for each test
    db = new Database(':memory:');

    // Apply the schema, including the query_telemetry table
    const { initializeSchema } = require('../sqlite/schema');
    initializeSchema(db);

    // Get the writer for the test database
    writer = _getWriterForDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should record query telemetry for slow or complex queries', async () => {
    // This query should be recorded because it's slow
    recordQuery(db, {
      queryType: 'fetch_articles',
      operation: 'SELECT',
      durationMs: 15, // > 10ms
      resultCount: 10,
      complexity: 'simple',
      host: 'example.com',
    });

    // This query should be recorded because it's complex
    recordQuery(db, {
      queryType: 'complex_join',
      operation: 'SELECT',
      durationMs: 5, // < 10ms
      resultCount: 1,
      complexity: 'complex',
    });

    await writer.flush(); // Ensure writes are completed

    const recent = getRecentQueries(db, 'fetch_articles', 10);
    expect(recent.length).toBe(1);
    expect(recent[0].query_type).toBe('fetch_articles');
    expect(recent[0].duration_ms).toBe(15);
    expect(recent[0].result_count).toBe(10);

    const recentComplex = getRecentQueries(db, 'complex_join', 10);
    expect(recentComplex.length).toBe(1);
  });

  it('should NOT record fast, simple queries', async () => {
    recordQuery(db, {
      queryType: 'fast_query',
      operation: 'SELECT',
      durationMs: 5, // < 10ms
      complexity: 'simple',
    });

    await writer.flush();

    const recent = getRecentQueries(db, 'fast_query', 10);
    expect(recent.length).toBe(0);
  });

  it('should aggregate query statistics', async () => {
    // Record multiple queries that meet the criteria
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 11, resultCount: 5, complexity: 'simple' });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 20, resultCount: 15, complexity: 'simple' });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 30, resultCount: 25, complexity: 'simple' });

    await writer.flush();

    const stats = getQueryStats(db, { queryType: 'fetch_articles' });
    expect(stats.length).toBe(1);
    expect(stats[0].query_type).toBe('fetch_articles');
    expect(stats[0].avg_duration_ms).toBeCloseTo(20.33);
    expect(stats[0].sample_count).toBe(3);
  });

  it('should filter by complexity', async () => {
    recordQuery(db, { queryType: 'query_a', operation: 'SELECT', durationMs: 15, complexity: 'simple' });
    recordQuery(db, { queryType: 'query_b', operation: 'SELECT', durationMs: 15, complexity: 'complex' });

    await writer.flush();

    const simpleStats = getQueryStats(db, { complexity: 'simple' });
    expect(simpleStats.length).toBe(1);
    expect(simpleStats[0].query_type).toBe('query_a');

    const complexStats = getQueryStats(db, { complexity: 'complex' });
    expect(complexStats.length).toBe(1);
    expect(complexStats[0].query_type).toBe('query_b');
  });

  it('should handle invalid input gracefully', async () => {
    // Missing required fields - should not crash
    recordQuery(db, { queryType: 'test' }); // Missing operation, durationMs
    recordQuery(null, { queryType: 'test', operation: 'SELECT', durationMs: 10 }); // Null db

    await writer.flush();

    const recent = getRecentQueries(db, 'test', 10);
    expect(recent.length).toBe(0);
  });
});
