'use strict';

const { PlannerHost } = require('../PlannerHost');
const { GraphReasonerPlugin } = require('../plugins/GraphReasonerPlugin');
const { QueryCostEstimatorPlugin } = require('../plugins/QueryCostEstimatorPlugin');
const { ensureDb } = require('../../db/sqlite/ensureDb');
const { recordQuery } = require('../../db/queryTelemetry');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('QueryCostEstimatorPlugin', () => {
  let db;
  let dbPath;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), 'test-cost-estimator');
    fs.mkdirSync(tmpDir, { recursive: true });
    dbPath = path.join(tmpDir, `test-${process.pid}-${Date.now()}.db`);
    db = ensureDb(dbPath);

    // Seed some query telemetry
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 50, resultCount: 10 });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 100, resultCount: 20 });
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 150, resultCount: 30 });
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

  it('should build cost model from telemetry', async () => {
    const costPlugin = new QueryCostEstimatorPlugin();
    const host = new PlannerHost({
      plugins: [costPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      dbAdapter: db,
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result.blackboard.costEstimates).toBeDefined();
    expect(result.blackboard.costEstimates.available).toBe(true);
    expect(result.blackboard.costEstimates.model.totalSamples).toBe(3);
  });

  it('should estimate costs for proposed hubs', async () => {
    const graphPlugin = new GraphReasonerPlugin();
    const costPlugin = new QueryCostEstimatorPlugin();

    const host = new PlannerHost({
      plugins: [graphPlugin, costPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      dbAdapter: db,
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result.blackboard.proposedHubs.length).toBeGreaterThan(0);
    expect(result.blackboard.costEstimates.hubCosts.length).toBeGreaterThan(0);
    
    const firstHubCost = result.blackboard.costEstimates.hubCosts[0];
    expect(firstHubCost).toHaveProperty('hubUrl');
    expect(firstHubCost).toHaveProperty('estimatedMs');
    expect(firstHubCost).toHaveProperty('confidence');
  });

  it('should warn about high-cost hubs', async () => {
    // Seed expensive query telemetry
    recordQuery(db, { queryType: 'fetch_articles', operation: 'SELECT', durationMs: 1000, resultCount: 100 });

    const graphPlugin = new GraphReasonerPlugin();
    const costPlugin = new QueryCostEstimatorPlugin({ budgetThresholdMs: 200 });

    const host = new PlannerHost({
      plugins: [graphPlugin, costPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      dbAdapter: db,
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result.blackboard.costEstimates.highCostCount).toBeGreaterThan(0);
    const rationale = result.blackboard.rationale.join(' ');
    expect(rationale).toContain('Warning');
    expect(rationale).toContain('exceed');
  });

  it('should handle missing telemetry gracefully', async () => {
    // Clear telemetry
    db.prepare('DELETE FROM query_telemetry').run();

    const costPlugin = new QueryCostEstimatorPlugin();
    const host = new PlannerHost({
      plugins: [costPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      dbAdapter: db,
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    expect(result.blackboard.costEstimates.available).toBe(false);
    const rationale = result.blackboard.rationale.join(' ');
    expect(rationale).toContain('no historical telemetry');
  });

  it('should emit gofai-trace events', async () => {
    const costPlugin = new QueryCostEstimatorPlugin();
    const host = new PlannerHost({
      plugins: [costPlugin],
      options: { domain: 'example.com', baseUrl: 'https://example.com', startUrl: 'https://example.com' },
      dbAdapter: db,
      budgetMs: 5000,
      preview: true
    });

    const result = await host.run();

    const traceEvents = result.telemetryEvents.filter(e => e.type === 'gofai-trace');
    expect(traceEvents.length).toBeGreaterThan(0);

    const costEvents = traceEvents.filter(e => e.data && e.data.pluginId === 'query-cost-estimator');
    expect(costEvents.length).toBeGreaterThan(0);
  });
});
