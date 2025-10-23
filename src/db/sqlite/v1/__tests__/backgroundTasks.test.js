'use strict';

const Database = require('better-sqlite3');
const {
  ensureBackgroundTaskSchema,
  createBackgroundTask,
  updateBackgroundTask,
  getBackgroundTaskById
} = require('../queries/backgroundTasks');

function createTestDb() {
  const db = new Database(':memory:');
  ensureBackgroundTaskSchema(db);
  return db;
}

describe('backgroundTasks queries', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
  });

  test('createBackgroundTask inserts task with normalized progress', () => {
    const task = createBackgroundTask(db, {
      taskType: 'analysis-run',
      status: 'running',
      progress: { current: 10, total: 100, message: 'Starting' },
      config: { foo: 'bar' },
      metadata: { runId: 'run-1' }
    });

    expect(task).toMatchObject({
      taskType: 'analysis-run',
      status: 'running',
      progress: {
        current: 10,
        total: 100,
        message: 'Starting',
        percent: 10
      },
      config: { foo: 'bar' },
      metadata: { runId: 'run-1' }
    });
    expect(task.id).toBeGreaterThan(0);
  });

  test('updateBackgroundTask updates status and progress fields', () => {
    const task = createBackgroundTask(db, {
      taskType: 'analysis-run',
      status: 'running'
    });

    const changed = updateBackgroundTask(db, task.id, {
      status: 'completed',
      progress: { current: 50, total: 50, message: 'Done' },
      metadata: { stage: 'completed' }
    });

    expect(changed).toBe(true);
    const updated = getBackgroundTaskById(db, task.id);
    expect(updated.status).toBe('completed');
    expect(updated.progress).toMatchObject({
      current: 50,
      total: 50,
      message: 'Done',
      percent: 100
    });
    expect(updated.metadata).toMatchObject({ stage: 'completed' });
  });
});
