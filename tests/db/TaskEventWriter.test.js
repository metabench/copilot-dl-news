'use strict';

/**
 * @jest-environment node
 */

const Database = require('better-sqlite3');
const { TaskEventWriter, getEventMetadata, EVENT_TYPE_METADATA } = require('../../src/db/TaskEventWriter');

describe('TaskEventWriter', () => {
  let db;
  let writer;

  beforeEach(() => {
    db = new Database(':memory:');
    writer = new TaskEventWriter(db, { batchWrites: false });
  });

  afterEach(() => {
    writer.destroy();
    db.close();
  });

  describe('schema creation', () => {
    test('creates task_events table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='task_events'"
      ).all();
      expect(tables).toHaveLength(1);
    });

    test('creates indexes', () => {
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='task_events'"
      ).all();
      expect(indexes.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('write()', () => {
    test('writes event with required fields', () => {
      writer.write({
        taskType: 'crawl',
        taskId: 'job-001',
        eventType: 'crawl:start',
        data: { config: { maxPages: 100 } }
      });

      const events = writer.getEvents('job-001');
      expect(events).toHaveLength(1);
      expect(events[0].task_type).toBe('crawl');
      expect(events[0].task_id).toBe('job-001');
      expect(events[0].event_type).toBe('crawl:start');
      expect(events[0].seq).toBe(1);
    });

    test('increments seq for same task', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'progress' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end' });

      const events = writer.getEvents('job-001');
      expect(events.map(e => e.seq)).toEqual([1, 2, 3]);
    });

    test('maintains separate seq counters per task', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start' });
      writer.write({ taskType: 'crawl', taskId: 'job-002', eventType: 'start' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end' });

      const events1 = writer.getEvents('job-001');
      const events2 = writer.getEvents('job-002');
      expect(events1.map(e => e.seq)).toEqual([1, 2]);
      expect(events2.map(e => e.seq)).toEqual([1]);
    });

    test('extracts denormalized fields', () => {
      writer.write({
        taskType: 'crawl',
        taskId: 'job-001',
        eventType: 'url:fetched',
        data: { url: 'https://example.com', status: 200, durationMs: 150 }
      });

      const events = writer.getEvents('job-001');
      expect(events[0].duration_ms).toBe(150);
      expect(events[0].http_status).toBe(200);
    });

    test('extracts scope from host', () => {
      writer.write({
        taskType: 'crawl',
        taskId: 'job-001',
        eventType: 'url:fetched',
        data: { host: 'example.com' }
      });

      const events = writer.getEvents('job-001');
      expect(events[0].scope).toBe('domain:example.com');
    });

    test('extracts target from url', () => {
      writer.write({
        taskType: 'crawl',
        taskId: 'job-001',
        eventType: 'url:fetched',
        data: { url: 'https://example.com/page' }
      });

      const events = writer.getEvents('job-001');
      expect(events[0].target).toBe('https://example.com/page');
    });

    test('skips invalid events silently', () => {
      writer.write({}); // No required fields
      writer.write({ taskType: 'crawl' }); // No taskId or eventType
      writer.write({ taskType: 'crawl', taskId: 'job-001' }); // No eventType

      const events = writer.getEvents('job-001');
      expect(events).toHaveLength(0);
    });
  });

  describe('batch writes', () => {
    test('buffers events and flushes on batchSize', () => {
      const batchWriter = new TaskEventWriter(db, { batchWrites: true, batchSize: 3 });

      batchWriter.write({ taskType: 'test', taskId: 't1', eventType: 'e1' });
      batchWriter.write({ taskType: 'test', taskId: 't1', eventType: 'e2' });
      
      // Not flushed yet
      let events = db.prepare('SELECT COUNT(*) as c FROM task_events WHERE task_id = ?').get('t1');
      expect(events.c).toBe(0);

      batchWriter.write({ taskType: 'test', taskId: 't1', eventType: 'e3' });
      
      // Should flush at batchSize
      events = db.prepare('SELECT COUNT(*) as c FROM task_events WHERE task_id = ?').get('t1');
      expect(events.c).toBe(3);

      batchWriter.destroy();
    });

    test('flushes remaining on destroy', () => {
      const batchWriter = new TaskEventWriter(db, { batchWrites: true, batchSize: 100 });

      batchWriter.write({ taskType: 'test', taskId: 't1', eventType: 'e1' });
      batchWriter.write({ taskType: 'test', taskId: 't1', eventType: 'e2' });

      batchWriter.destroy();

      const events = db.prepare('SELECT COUNT(*) as c FROM task_events WHERE task_id = ?').get('t1');
      expect(events.c).toBe(2);
    });
  });

  describe('writeTelemetryEvent()', () => {
    test('writes crawl telemetry event', () => {
      writer.writeTelemetryEvent({
        type: 'crawl:progress',
        jobId: 'crawl-123',
        crawlType: 'discovery',
        timestamp: '2025-01-01T00:00:00.000Z',
        data: { visited: 50, queued: 100 }
      });

      const events = writer.getEvents('crawl-123');
      expect(events).toHaveLength(1);
      expect(events[0].task_type).toBe('discovery');
      expect(events[0].event_type).toBe('crawl:progress');
    });

    test('extracts jobId from data if not at top level', () => {
      writer.writeTelemetryEvent({
        type: 'milestone',
        data: { jobId: 'crawl-456', name: 'discovery_complete' }
      });

      const events = writer.getEvents('crawl-456');
      expect(events).toHaveLength(1);
    });

    test('skips events without jobId', () => {
      writer.writeTelemetryEvent({ type: 'orphan', data: {} });
      
      const count = db.prepare('SELECT COUNT(*) as c FROM task_events').get();
      expect(count.c).toBe(0);
    });
  });

  describe('writeBackgroundTaskEvent()', () => {
    test('writes background task entry', () => {
      writer.writeBackgroundTaskEvent({
        event: 'task:started',
        taskId: 'bg-001',
        taskType: 'compression',
        status: 'running',
        ts: '2025-01-01T00:00:00.000Z',
        severity: 'info'
      });

      const events = writer.getEvents('bg-001');
      expect(events).toHaveLength(1);
      expect(events[0].task_type).toBe('compression');
      expect(events[0].event_type).toBe('task:started');
      expect(events[0].scope).toBe('taskType:compression');
    });
  });

  describe('getEvents()', () => {
    beforeEach(() => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start', category: 'lifecycle' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'url:fetched', category: 'work' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'error', severity: 'error' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end', category: 'lifecycle' });
    });

    test('returns all events for task', () => {
      const events = writer.getEvents('job-001');
      expect(events).toHaveLength(4);
    });

    test('filters by eventType', () => {
      const events = writer.getEvents('job-001', { eventType: 'error' });
      expect(events).toHaveLength(1);
    });

    test('filters by category', () => {
      const events = writer.getEvents('job-001', { category: 'lifecycle' });
      expect(events).toHaveLength(2);
    });

    test('filters by severity', () => {
      const events = writer.getEvents('job-001', { severity: 'error' });
      expect(events).toHaveLength(1);
    });

    test('supports cursor-based pagination (sinceSeq)', () => {
      const events = writer.getEvents('job-001', { sinceSeq: 2 });
      expect(events).toHaveLength(2);
      expect(events[0].seq).toBe(3);
    });

    test('respects limit', () => {
      const events = writer.getEvents('job-001', { limit: 2 });
      expect(events).toHaveLength(2);
    });
  });

  describe('getSummary()', () => {
    test('returns summary statistics', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start', category: 'lifecycle' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'work', category: 'work' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'error', severity: 'error' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'warn', severity: 'warn' });

      const summary = writer.getSummary('job-001');
      expect(summary.total_events).toBe(4);
      expect(summary.max_seq).toBe(4);
      expect(summary.error_count).toBe(1);
      expect(summary.warn_count).toBe(1);
      expect(summary.event_types).toEqual(expect.arrayContaining([
        expect.objectContaining({ event_type: 'start' })
      ]));
    });
  });

  describe('getProblems()', () => {
    test('returns errors and warnings', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'error', severity: 'error' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'warning', severity: 'warn' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end' });

      const problems = writer.getProblems('job-001');
      expect(problems).toHaveLength(2);
    });
  });

  describe('getTimeline()', () => {
    test('returns lifecycle events only', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start', category: 'lifecycle' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'work', category: 'work' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end', category: 'lifecycle' });

      const timeline = writer.getTimeline('job-001');
      expect(timeline).toHaveLength(2);
      expect(timeline.map(e => e.event_type)).toEqual(['start', 'end']);
    });
  });

  describe('listTasks()', () => {
    test('returns list of tasks with counts', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'end' });
      writer.write({ taskType: 'analysis', taskId: 'analysis-001', eventType: 'start' });

      const tasks = writer.listTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.find(t => t.task_id === 'job-001').event_count).toBe(2);
    });

    test('filters by taskType', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start' });
      writer.write({ taskType: 'analysis', taskId: 'analysis-001', eventType: 'start' });

      const tasks = writer.listTasks({ taskType: 'crawl' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].task_id).toBe('job-001');
    });
  });

  describe('pruning', () => {
    test('pruneOlderThan deletes old events', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      
      writer.write({ taskType: 'crawl', taskId: 'old', eventType: 'e', ts: oldDate.toISOString() });
      writer.write({ taskType: 'crawl', taskId: 'new', eventType: 'e' });

      const result = writer.pruneOlderThan(5);
      expect(result.deleted).toBe(1);

      const remaining = db.prepare('SELECT task_id FROM task_events').all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].task_id).toBe('new');
    });

    test('deleteTask removes all events for a task', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'e1' });
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'e2' });
      writer.write({ taskType: 'crawl', taskId: 'job-002', eventType: 'e1' });

      const result = writer.deleteTask('job-001');
      expect(result.deleted).toBe(2);

      const remaining = db.prepare('SELECT task_id FROM task_events').all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].task_id).toBe('job-002');
    });
  });

  describe('getStorageStats()', () => {
    test('returns storage statistics', () => {
      writer.write({ taskType: 'crawl', taskId: 'job-001', eventType: 'start', data: { foo: 'bar' } });
      writer.write({ taskType: 'crawl', taskId: 'job-002', eventType: 'start', data: { baz: 'qux' } });

      const stats = writer.getStorageStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.totalTasks).toBe(2);
      expect(stats.estimatedPayloadBytes).toBeGreaterThan(0);
    });
  });
});

describe('getEventMetadata()', () => {
  test('returns metadata for known event types', () => {
    expect(getEventMetadata('crawl:start')).toEqual({ category: 'lifecycle', severity: 'info' });
    expect(getEventMetadata('url:fetched')).toEqual({ category: 'work', severity: 'info' });
    expect(getEventMetadata('error')).toEqual({ category: 'error', severity: 'error' });
  });

  test('infers metadata from event name', () => {
    expect(getEventMetadata('custom:error:something')).toEqual({ category: 'error', severity: 'error' });
    expect(getEventMetadata('some:warning')).toEqual({ category: 'error', severity: 'warn' });
  });

  test('returns defaults for unknown types', () => {
    expect(getEventMetadata('totally:unknown')).toEqual({ category: 'work', severity: 'info' });
  });

  test('handles suffix matching', () => {
    expect(getEventMetadata('crawl:telemetry:progress')).toEqual({ category: 'metric', severity: 'info' });
  });
});
