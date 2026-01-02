'use strict';

/**
 * CrawlScheduler Test Suite
 * 
 * Tests for the crawl scheduling system including:
 * - CrawlScheduler
 * - UpdatePatternAnalyzer
 * - ScheduleStore
 * - scheduleAdapter
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const CrawlScheduler = require('../../../src/crawler/scheduler/CrawlScheduler');
const UpdatePatternAnalyzer = require('../../../src/crawler/scheduler/UpdatePatternAnalyzer');
const ScheduleStore = require('../../../src/crawler/scheduler/ScheduleStore');
const scheduleAdapter = require('../../../src/db/sqlite/v1/queries/scheduleAdapter');
const { TaskEventWriter } = require('../../../src/db/TaskEventWriter');

describe('CrawlScheduler', () => {
  let db;
  let scheduler;
  const testDbPath = path.join(__dirname, 'test-scheduler.db');

  beforeEach(() => {
    // Clean up any existing test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new Database(testDbPath);
    scheduler = new CrawlScheduler({ db });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('constructor', () => {
    test('throws without db option', () => {
      expect(() => new CrawlScheduler({})).toThrow('CrawlScheduler requires db option');
    });

    test('creates with default weights', () => {
      const s = new CrawlScheduler({ db });
      expect(s.weights.urgency).toBe(0.3);
      expect(s.weights.successRate).toBe(0.25);
      expect(s.weights.updateFrequency).toBe(0.25);
      expect(s.weights.articleYield).toBe(0.2);
    });

    test('accepts custom weights', () => {
      const s = new CrawlScheduler({
        db,
        weights: { urgency: 0.5, successRate: 0.2, updateFrequency: 0.2, articleYield: 0.1 }
      });
      expect(s.weights.urgency).toBe(0.5);
    });
  });

  describe('addDomain', () => {
    test('adds a new domain with default settings', () => {
      const result = scheduler.addDomain('example.com');
      expect(result.domain).toBe('example.com');
      expect(result.nextCrawlAt).toBeTruthy();
      expect(result.priorityScore).toBe(0.5);
    });

    test('returns existing schedule if domain already exists', () => {
      scheduler.addDomain('example.com', { initialPriority: 0.8 });
      const result = scheduler.addDomain('example.com', { initialPriority: 0.3 });
      expect(result.priorityScore).toBe(0.8);
    });

    test('throws without domain', () => {
      expect(() => scheduler.addDomain()).toThrow('addDomain requires domain');
    });

    test('accepts custom interval', () => {
      const result = scheduler.addDomain('example.com', { intervalHours: 12 });
      expect(result.avgUpdateIntervalHours).toBe(12);
    });
  });

  describe('removeDomain', () => {
    test('removes existing domain', () => {
      scheduler.addDomain('example.com');
      expect(scheduler.removeDomain('example.com')).toBe(true);
      expect(scheduler.getSchedule('example.com')).toBeNull();
    });

    test('returns false for non-existent domain', () => {
      expect(scheduler.removeDomain('nonexistent.com')).toBe(false);
    });
  });

  describe('getSchedule', () => {
    test('returns null for unknown domain', () => {
      expect(scheduler.getSchedule('unknown.com')).toBeNull();
    });

    test('returns schedule for known domain', () => {
      scheduler.addDomain('example.com');
      const schedule = scheduler.getSchedule('example.com');
      expect(schedule).not.toBeNull();
      expect(schedule.domain).toBe('example.com');
    });
  });

  describe('recordCrawl', () => {
    test('throws without domain', () => {
      expect(() => scheduler.recordCrawl()).toThrow('recordCrawl requires domain');
    });

    test('creates schedule for new domain', () => {
      const result = scheduler.recordCrawl('new.com', true, 10);
      expect(result.domain).toBe('new.com');
      expect(result.successCount).toBe(1);
    });

    test('increments success count on success', () => {
      scheduler.addDomain('example.com');
      scheduler.recordCrawl('example.com', true, 5);
      const schedule = scheduler.getSchedule('example.com');
      expect(schedule.successCount).toBe(1);
      expect(schedule.lastArticleCount).toBe(5);
    });

    test('increments failure count on failure', () => {
      scheduler.addDomain('example.com');
      scheduler.recordCrawl('example.com', false);
      const schedule = scheduler.getSchedule('example.com');
      expect(schedule.failureCount).toBe(1);
    });

    test('updates total articles', () => {
      scheduler.addDomain('example.com');
      scheduler.recordCrawl('example.com', true, 10);
      scheduler.recordCrawl('example.com', true, 15);
      const schedule = scheduler.getSchedule('example.com');
      expect(schedule.totalArticles).toBe(25);
    });

    test('updates nextCrawlAt based on pattern', () => {
      scheduler.addDomain('example.com');
      const before = scheduler.getSchedule('example.com').nextCrawlAt;
      scheduler.recordCrawl('example.com', true, 5);
      const after = scheduler.getSchedule('example.com').nextCrawlAt;
      expect(after).not.toBe(before);
    });
  });

  describe('getNextBatch', () => {
    test('returns empty array when no domains', () => {
      const batch = scheduler.getNextBatch(10);
      expect(batch).toEqual([]);
    });

    test('returns domains sorted by priority', () => {
      // Add domains - they start as due immediately
      scheduler.addDomain('a.com');
      scheduler.addDomain('b.com');
      scheduler.addDomain('c.com');

      // Manually set different priorities via store
      scheduler.store.updatePriority('a.com', 0.3);
      scheduler.store.updatePriority('b.com', 0.9);
      scheduler.store.updatePriority('c.com', 0.5);

      const batch = scheduler.getNextBatch(3);
      expect(batch.length).toBe(3);
      // Note: getNextBatch recalculates priorities, so all fresh domains get similar scores
      // But higher priority scores should still rank higher
      expect(batch[0].priorityScore).toBeGreaterThanOrEqual(batch[1].priorityScore);
      expect(batch[1].priorityScore).toBeGreaterThanOrEqual(batch[2].priorityScore);
    });

    test('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        scheduler.addDomain(`domain${i}.com`);
      }
      const batch = scheduler.getNextBatch(3);
      expect(batch.length).toBe(3);
    });
  });

  describe('getStats', () => {
    test('returns empty stats when no domains', () => {
      const stats = scheduler.getStats();
      expect(stats.totalDomains).toBe(0);
      expect(stats.dueDomains).toBe(0);
    });

    test('counts domains and crawls', () => {
      scheduler.addDomain('a.com');
      scheduler.addDomain('b.com');
      scheduler.recordCrawl('a.com', true, 10);
      scheduler.recordCrawl('a.com', false);
      scheduler.recordCrawl('b.com', true, 5);

      const stats = scheduler.getStats();
      expect(stats.totalDomains).toBe(2);
      expect(stats.totalCrawls).toBe(3);
      expect(stats.successfulCrawls).toBe(2);
      expect(stats.failedCrawls).toBe(1);
      expect(stats.totalArticles).toBe(15);
    });

    test('calculates success rate', () => {
      scheduler.addDomain('a.com');
      scheduler.recordCrawl('a.com', true, 10);
      scheduler.recordCrawl('a.com', true, 10);
      scheduler.recordCrawl('a.com', false);

      const stats = scheduler.getStats();
      expect(stats.successRate).toBeCloseTo(2 / 3);
    });
  });

  describe('recalculateAllPriorities', () => {
    test('updates priorities for all domains', () => {
      scheduler.addDomain('a.com');
      scheduler.addDomain('b.com');

      // Simulate crawl activity
      scheduler.recordCrawl('a.com', true, 50);
      scheduler.recordCrawl('a.com', true, 50);
      scheduler.recordCrawl('b.com', false);

      const updated = scheduler.recalculateAllPriorities();
      expect(updated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reconcileOverdue', () => {
    test('postpones lower-priority overdue schedules across a spread window', () => {
      const asOf = '2026-01-01T12:00:00.000Z';
      const asOfMs = Date.parse(asOf);

      // Seed 5 overdue schedules with descending priority.
      for (let i = 0; i < 5; i++) {
        const domain = `domain${i}.example`;
        const nextCrawlAt = new Date(asOfMs - (2 * 60 + i) * 60 * 1000).toISOString();
        const priorityScore = 1 - i * 0.1;
        scheduler.store.save({ domain, nextCrawlAt, priorityScore, avgUpdateIntervalHours: 24 });
      }

      const writer = new TaskEventWriter(db, { batchWrites: false });

      const result = scheduler.reconcileOverdue({
        asOf,
        maxDueNow: 2,
        spreadWindowMinutes: 30,
        maxPostponeHours: 24,
        taskEventWriter: writer,
        taskId: 'scheduler-reconcile-test'
      });

      expect(result.overdueCount).toBe(5);
      expect(result.dueNowCount).toBe(2);
      expect(result.postponedCount).toBe(3);
      expect(result.postponed).toHaveLength(3);

      // Due-now schedules should remain overdue (<= asOf).
      const overdueAfter = scheduler.store.getOverdue({ limit: 10, asOf });
      expect(overdueAfter.length).toBe(2);

      // Postponed schedules should have nextCrawlAt >= asOf.
      for (const entry of result.postponed) {
        const schedule = scheduler.getSchedule(entry.domain);
        expect(schedule.nextCrawlAt).toBe(entry.toNextCrawlAt);
        expect(Date.parse(schedule.nextCrawlAt)).toBeGreaterThanOrEqual(asOfMs);
      }

      const events = writer.getEvents('scheduler-reconcile-test');
      expect(events[0].event_type).toBe('scheduler:reconcile:start');
      expect(events[events.length - 1].event_type).toBe('scheduler:reconcile:end');
      expect(events.filter(e => e.event_type === 'scheduler:reconcile:postpone')).toHaveLength(3);

      writer.destroy();
    });

    test('throws for invalid asOf', () => {
      expect(() => scheduler.reconcileOverdue({ asOf: 'not-a-date' })).toThrow(
        'reconcileOverdue requires valid opts.asOf ISO timestamp'
      );
    });
  });

  describe('priority calculation', () => {
    test('gives higher priority to overdue domains', () => {
      scheduler.addDomain('a.com');
      scheduler.addDomain('b.com');

      // Make a.com overdue by setting past nextCrawlAt
      const past = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      scheduler.store.save({ domain: 'a.com', nextCrawlAt: past });

      scheduler.recalculateAllPriorities();

      const a = scheduler.getSchedule('a.com');
      const b = scheduler.getSchedule('b.com');
      expect(a.priorityScore).toBeGreaterThan(b.priorityScore);
    });

    test('gives higher priority to domains with better success rate', () => {
      scheduler.addDomain('success.com');
      scheduler.addDomain('failure.com');

      for (let i = 0; i < 10; i++) {
        scheduler.recordCrawl('success.com', true, 10);
        scheduler.recordCrawl('failure.com', false);
      }

      const s = scheduler.getSchedule('success.com');
      const f = scheduler.getSchedule('failure.com');
      expect(s.priorityScore).toBeGreaterThan(f.priorityScore);
    });
  });
});

describe('UpdatePatternAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new UpdatePatternAnalyzer();
  });

  describe('constructor', () => {
    test('uses default options', () => {
      expect(analyzer.maxSamples).toBe(50);
      expect(analyzer.defaultIntervalHours).toBe(24);
    });

    test('accepts custom options', () => {
      const custom = new UpdatePatternAnalyzer({
        maxSamples: 100,
        defaultIntervalHours: 12
      });
      expect(custom.maxSamples).toBe(100);
      expect(custom.defaultIntervalHours).toBe(12);
    });
  });

  describe('recordUpdate', () => {
    test('throws without domain', () => {
      expect(() => analyzer.recordUpdate()).toThrow('recordUpdate requires domain');
    });

    test('records update for new domain', () => {
      analyzer.recordUpdate('example.com', 10);
      const pattern = analyzer.getPattern('example.com');
      expect(pattern.sampleCount).toBe(1);
    });

    test('trims to max samples', () => {
      const small = new UpdatePatternAnalyzer({ maxSamples: 3 });
      for (let i = 0; i < 5; i++) {
        small.recordUpdate('example.com', 10, new Date(Date.now() + i * 1000));
      }
      const pattern = small.getPattern('example.com');
      expect(pattern.sampleCount).toBe(3);
    });
  });

  describe('getPattern', () => {
    test('returns default pattern for unknown domain', () => {
      const pattern = analyzer.getPattern('unknown.com');
      expect(pattern.domain).toBe('unknown.com');
      expect(pattern.sampleCount).toBe(0);
      expect(pattern.avgIntervalHours).toBe(24);
      expect(pattern.confidence).toBe(0);
    });

    test('calculates average interval', () => {
      const now = Date.now();
      analyzer.recordUpdate('example.com', 10, new Date(now));
      analyzer.recordUpdate('example.com', 10, new Date(now + 6 * 60 * 60 * 1000)); // +6 hours
      analyzer.recordUpdate('example.com', 10, new Date(now + 12 * 60 * 60 * 1000)); // +12 hours

      const pattern = analyzer.getPattern('example.com');
      expect(pattern.avgIntervalHours).toBeCloseTo(6, 1);
    });

    test('calculates average article count', () => {
      const now = Date.now();
      analyzer.recordUpdate('example.com', 5, new Date(now));
      analyzer.recordUpdate('example.com', 15, new Date(now + 1000));
      analyzer.recordUpdate('example.com', 10, new Date(now + 2000));

      const pattern = analyzer.getPattern('example.com');
      expect(pattern.avgArticleCount).toBe(10);
    });

    test('identifies peak hours', () => {
      const base = new Date('2024-01-01T10:00:00Z');
      for (let i = 0; i < 5; i++) {
        analyzer.recordUpdate('example.com', 10, new Date(base.getTime() + i * 1000));
      }
      const pattern = analyzer.getPattern('example.com');
      expect(pattern.updateTimes.peakHours).toContain(10);
    });

    test('clamps interval to valid range', () => {
      const now = Date.now();
      analyzer.recordUpdate('fast.com', 10, new Date(now));
      analyzer.recordUpdate('fast.com', 10, new Date(now + 30 * 60 * 1000)); // 30 min later

      const pattern = analyzer.getPattern('fast.com');
      expect(pattern.avgIntervalHours).toBeGreaterThanOrEqual(1);
    });
  });

  describe('predictNextUpdate', () => {
    test('returns default prediction for unknown domain', () => {
      const prediction = analyzer.predictNextUpdate('unknown.com');
      expect(prediction.method).toBe('default');
      expect(prediction.confidence).toBe(0);
      expect(prediction.intervalHours).toBe(24);
    });

    test('predicts based on pattern', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        analyzer.recordUpdate('example.com', 10, new Date(now + i * 4 * 60 * 60 * 1000)); // Every 4 hours
      }

      const prediction = analyzer.predictNextUpdate('example.com');
      expect(prediction.method).not.toBe('default');
      expect(prediction.intervalHours).toBeCloseTo(4, 1);
    });

    test('adjusts prediction if in the past', () => {
      const past = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
      analyzer.recordUpdate('example.com', 10, new Date(past));
      analyzer.recordUpdate('example.com', 10, new Date(past + 6 * 60 * 60 * 1000));

      const prediction = analyzer.predictNextUpdate('example.com');
      const predictedTime = new Date(prediction.predictedAt).getTime();
      // Allow 1 second tolerance for test timing
      expect(predictedTime).toBeGreaterThanOrEqual(Date.now() - 1000);
    });
  });

  describe('exportPattern / loadPattern', () => {
    test('exports and loads pattern data', () => {
      const now = Date.now();
      analyzer.recordUpdate('example.com', 10, new Date(now));
      analyzer.recordUpdate('example.com', 20, new Date(now + 1000));

      const exported = analyzer.exportPattern('example.com');
      expect(exported.updates.length).toBe(2);
      expect(exported.articleCounts).toEqual([10, 20]);

      const newAnalyzer = new UpdatePatternAnalyzer();
      newAnalyzer.loadPattern('example.com', exported);
      const pattern = newAnalyzer.getPattern('example.com');
      expect(pattern.sampleCount).toBe(2);
    });

    test('returns null for unknown domain export', () => {
      expect(analyzer.exportPattern('unknown.com')).toBeNull();
    });
  });

  describe('clearPattern', () => {
    test('removes pattern data', () => {
      analyzer.recordUpdate('example.com', 10);
      analyzer.clearPattern('example.com');
      const pattern = analyzer.getPattern('example.com');
      expect(pattern.sampleCount).toBe(0);
    });
  });
});

describe('ScheduleStore', () => {
  let db;
  let store;
  const testDbPath = path.join(__dirname, 'test-store.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new Database(testDbPath);
    store = new ScheduleStore(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('throws without db', () => {
    expect(() => new ScheduleStore()).toThrow('ScheduleStore requires a database instance');
  });

  test('save and get', () => {
    const saved = store.save({ domain: 'example.com', priorityScore: 0.75 });
    expect(saved.domain).toBe('example.com');

    const retrieved = store.get('example.com');
    expect(retrieved.priorityScore).toBe(0.75);
  });

  test('delete', () => {
    store.save({ domain: 'example.com' });
    expect(store.delete('example.com')).toBe(true);
    expect(store.get('example.com')).toBeNull();
  });

  test('getAll', () => {
    store.save({ domain: 'a.com' });
    store.save({ domain: 'b.com' });
    const all = store.getAll();
    expect(all.length).toBe(2);
  });

  test('recordCrawlResult', () => {
    store.save({ domain: 'example.com' });
    store.recordCrawlResult('example.com', true, 10);
    const schedule = store.get('example.com');
    expect(schedule.successCount).toBe(1);
    expect(schedule.totalArticles).toBe(10);
  });

  test('updatePriority', () => {
    store.save({ domain: 'example.com', priorityScore: 0.5 });
    store.updatePriority('example.com', 0.9);
    const schedule = store.get('example.com');
    expect(schedule.priorityScore).toBe(0.9);
  });

  test('getStats', () => {
    store.save({ domain: 'a.com' });
    store.save({ domain: 'b.com' });
    store.recordCrawlResult('a.com', true, 10);

    const stats = store.getStats();
    expect(stats.totalDomains).toBe(2);
    expect(stats.totalArticles).toBe(10);
  });
});

describe('scheduleAdapter', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test-adapter.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = new Database(testDbPath);
    scheduleAdapter.ensureScheduleSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('ensureScheduleSchema requires database', () => {
    expect(() => scheduleAdapter.ensureScheduleSchema(null)).toThrow();
  });

  test('saveSchedule requires domain', () => {
    expect(() => scheduleAdapter.saveSchedule(db, {})).toThrow('saveSchedule requires domain');
  });

  test('normalizeScheduleRow handles null', () => {
    expect(scheduleAdapter.normalizeScheduleRow(null)).toBeNull();
  });

  test('getOverdueSchedules returns correct results', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    scheduleAdapter.saveSchedule(db, { domain: 'overdue.com', nextCrawlAt: past });
    scheduleAdapter.saveSchedule(db, { domain: 'future.com', nextCrawlAt: future });

    const overdue = scheduleAdapter.getOverdueSchedules(db);
    expect(overdue.length).toBe(1);
    expect(overdue[0].domain).toBe('overdue.com');
  });

  test('getScheduleBatch includes null nextCrawlAt', () => {
    scheduleAdapter.saveSchedule(db, { domain: 'never.com' }); // No nextCrawlAt
    scheduleAdapter.saveSchedule(db, { domain: 'future.com', nextCrawlAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });

    const batch = scheduleAdapter.getScheduleBatch(db, 10);
    expect(batch.length).toBe(1);
    expect(batch[0].domain).toBe('never.com');
  });

  test('pruneInactiveSchedules removes old entries', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    scheduleAdapter.saveSchedule(db, { domain: 'old.com', lastCrawlAt: old });
    scheduleAdapter.saveSchedule(db, { domain: 'recent.com', lastCrawlAt: new Date().toISOString() });

    const pruned = scheduleAdapter.pruneInactiveSchedules(db, 90);
    expect(pruned).toBe(1);
    expect(scheduleAdapter.getSchedule(db, 'old.com')).toBeNull();
    expect(scheduleAdapter.getSchedule(db, 'recent.com')).not.toBeNull();
  });

  test('updatePattern is persisted as JSON', () => {
    const pattern = { peakHours: [9, 10, 11], avgInterval: 6 };
    scheduleAdapter.saveSchedule(db, { domain: 'example.com', updatePattern: pattern });

    const retrieved = scheduleAdapter.getSchedule(db, 'example.com');
    expect(retrieved.updatePattern).toEqual(pattern);
  });
});
