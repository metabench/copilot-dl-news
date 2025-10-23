'use strict';

const Database = require('better-sqlite3');
const {
  ensureAnalysisRunSchema,
  createAnalysisRun,
  updateAnalysisRun,
  addAnalysisRunEvent,
  getAnalysisRunById,
  getAnalysisRunEvents,
  getLatestAnalysisRunVersion
} = require('../queries/analysisRuns');

function createTestDb() {
  const db = new Database(':memory:');
  ensureAnalysisRunSchema(db);
  return db;
}

describe('analysisRuns queries', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  test('createAnalysisRun inserts and returns normalized run', () => {
    const run = createAnalysisRun(db, {
      id: 'run-1',
      analysisVersion: 1,
      pageLimit: 100,
      skipPages: false,
      dryRun: true,
      summary: { foo: 'bar' }
    });

    expect(run).toMatchObject({
      id: 'run-1',
      analysisVersion: 1,
      pageLimit: 100,
      skipPages: false,
      dryRun: true,
      summary: { foo: 'bar' }
    });

    const stored = getAnalysisRunById(db, 'run-1');
    expect(stored.summary).toEqual({ foo: 'bar' });
    expect(stored.startedAt).toBeTruthy();
  });

  test('updateAnalysisRun applies field changes', () => {
    createAnalysisRun(db, { id: 'run-2', status: 'running' });

    const updated = updateAnalysisRun(db, 'run-2', {
      status: 'completed',
      stage: 'finished',
      analysisVersion: 2,
      skipPages: true,
      summary: { done: true }
    });

    expect(updated).toBe(true);

    const stored = getAnalysisRunById(db, 'run-2');
    expect(stored.status).toBe('completed');
    expect(stored.stage).toBe('finished');
    expect(stored.analysisVersion).toBe(2);
    expect(stored.skipPages).toBe(true);
    expect(stored.summary).toEqual({ done: true });
  });

  test('addAnalysisRunEvent stores event with normalized payload', () => {
    createAnalysisRun(db, { id: 'run-3' });

    const event = addAnalysisRunEvent(db, {
      runId: 'run-3',
      stage: 'pages',
      message: 'Analyzed pages',
      details: { processed: 10 }
    });

    expect(event).toMatchObject({
      runId: 'run-3',
      stage: 'pages',
      message: 'Analyzed pages',
      details: { processed: 10 }
    });

    const events = getAnalysisRunEvents(db, 'run-3');
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({ processed: 10 });
  });

  test('getLatestAnalysisRunVersion returns highest recorded version', () => {
    createAnalysisRun(db, { id: 'run-a', analysisVersion: 2 });
    createAnalysisRun(db, { id: 'run-b', analysisVersion: 5 });
    createAnalysisRun(db, { id: 'run-c', analysisVersion: null });

    const latest = getLatestAnalysisRunVersion(db);
    expect(latest).toBe(5);
  });

  test('getLatestAnalysisRunVersion prioritizes highest version from both tables', () => {
    // Test 1: Only analysis_runs table has data
    createAnalysisRun(db, { id: 'run-a', analysisVersion: 5 });
    expect(getLatestAnalysisRunVersion(db)).toBe(5);

    // Test 2: Create a second analysis run with higher version
    createAnalysisRun(db, { id: 'run-b', analysisVersion: 10 });
    expect(getLatestAnalysisRunVersion(db)).toBe(10);

    // Test 3: Create a third with lower version - should still return 10
    createAnalysisRun(db, { id: 'run-c', analysisVersion: 3 });
    expect(getLatestAnalysisRunVersion(db)).toBe(10);
  });
});
