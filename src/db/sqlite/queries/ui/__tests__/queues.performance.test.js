/**
 * @fileoverview Performance tests for queue queries
 * 
 * Verifies that query optimizations (JOIN instead of subqueries, proper indexes)
 * work correctly and maintain data accuracy.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { listQueues, getQueueDetail } = require('../../../../../db/sqlite/queries/ui/queues');

describe('Queue queries performance and correctness', () => {
  let db;
  let tmpPath;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `queues-perf-test-${Date.now()}.db`);
    db = new Database(tmpPath);
    
    // Create tables
    db.exec(`
      CREATE TABLE crawl_jobs (
        id TEXT PRIMARY KEY,
        url TEXT,
        args TEXT,
        pid INTEGER,
        started_at TEXT,
        ended_at TEXT,
        status TEXT,
        crawl_type_id INTEGER
      );
      CREATE INDEX idx_crawl_jobs_timeline ON crawl_jobs(ended_at DESC, started_at DESC);
      
      CREATE TABLE queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        ts TEXT,
        action TEXT,
        url TEXT,
        depth INTEGER,
        host TEXT,
        reason TEXT,
        queue_size INTEGER,
        alias TEXT,
        queue_origin TEXT,
        queue_role TEXT,
        queue_depth_bucket TEXT
      );
      CREATE INDEX idx_queue_events_job ON queue_events(job_id);
      CREATE INDEX idx_queue_events_job_ts ON queue_events(job_id, ts DESC);
    `);
  });

  afterEach(() => {
    if (db) db.close();
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  });

  test('listQueues with no data returns empty array', () => {
    const result = listQueues(db, { limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test('listQueues correctly aggregates event counts using JOIN', () => {
    // Insert jobs
    const now = new Date().toISOString();
    const hour_ago = new Date(Date.now() - 3600000).toISOString();
    
    db.prepare('INSERT INTO crawl_jobs (id, url, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?)')
      .run('job1', 'https://example.com', hour_ago, now, 'done');
    db.prepare('INSERT INTO crawl_jobs (id, url, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?)')
      .run('job2', 'https://test.com', hour_ago, null, 'running');
    db.prepare('INSERT INTO crawl_jobs (id, url, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?)')
      .run('job3', 'https://other.com', hour_ago, null, null);
    
    // Insert events for job1 (5 events)
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO queue_events (job_id, ts, action, url) VALUES (?, ?, ?, ?)')
        .run('job1', now, 'enqueued', `https://example.com/${i}`);
    }
    
    // Insert events for job2 (3 events)
    for (let i = 0; i < 3; i++) {
      db.prepare('INSERT INTO queue_events (job_id, ts, action, url) VALUES (?, ?, ?, ?)')
        .run('job2', now, 'dequeued', `https://test.com/${i}`);
    }
    
    // job3 has no events (0)
    
    const result = listQueues(db, { limit: 10 });
    expect(result.length).toBe(3);
    
    // Verify event counts
    const job1 = result.find(j => j.id === 'job1');
    const job2 = result.find(j => j.id === 'job2');
    const job3 = result.find(j => j.id === 'job3');
    
    expect(job1).toBeDefined();
    expect(job1.events).toBe(5);
    expect(job1.lastEventAt).toBe(now);
    expect(job1.status).toBe('done');
    
    expect(job2).toBeDefined();
    expect(job2.events).toBe(3);
    expect(job2.lastEventAt).toBe(now);
    expect(job2.status).toBe('running');
    
    expect(job3).toBeDefined();
    expect(job3.events).toBe(0);
    expect(job3.lastEventAt).toBe(null);
  });

  test('listQueues sorts by most recent activity (ended_at, started_at)', () => {
    const base = Date.now();
    const times = [
      { id: 'old', started: new Date(base - 10000000).toISOString(), ended: new Date(base - 9000000).toISOString() },
      { id: 'recent', started: new Date(base - 1000).toISOString(), ended: new Date(base - 500).toISOString() },
      { id: 'running', started: new Date(base - 5000).toISOString(), ended: null },
    ];
    
    for (const t of times) {
      db.prepare('INSERT INTO crawl_jobs (id, url, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?)')
        .run(t.id, 'https://example.com', t.started, t.ended, t.ended ? 'done' : 'running');
    }
    
    const result = listQueues(db, { limit: 10 });
    expect(result.length).toBe(3);
    
    // COALESCE(ended_at, started_at) DESC means:
    // - recent: ended_at = base - 500 (most recent)
    // - running: started_at = base - 5000 (second, since ended_at is NULL)
    // - old: ended_at = base - 9000000 (oldest)
    expect(result[0].id).toBe('recent');
    expect(result[1].id).toBe('running');
    expect(result[2].id).toBe('old');
  });

  test('listQueues respects limit parameter', () => {
    // Insert 20 jobs
    for (let i = 0; i < 20; i++) {
      const ts = new Date(Date.now() - i * 1000).toISOString();
      db.prepare('INSERT INTO crawl_jobs (id, url, started_at, status) VALUES (?, ?, ?, ?)')
        .run(`job${i}`, 'https://example.com', ts, 'done');
    }
    
    const result5 = listQueues(db, { limit: 5 });
    expect(result5.length).toBe(5);
    
    const result10 = listQueues(db, { limit: 10 });
    expect(result10.length).toBe(10);
  });

  test('getQueueDetail returns correct event counts and pagination', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO crawl_jobs (id, url, started_at, status) VALUES (?, ?, ?, ?)')
      .run('test-job', 'https://example.com', now, 'running');
    
    // Insert 25 events
    for (let i = 0; i < 25; i++) {
      db.prepare('INSERT INTO queue_events (job_id, ts, action, url, queue_size) VALUES (?, ?, ?, ?, ?)')
        .run('test-job', now, i % 2 === 0 ? 'enqueued' : 'dequeued', `https://example.com/${i}`, i);
    }
    
    const detail = getQueueDetail(db, { id: 'test-job', limit: 10 });
    
    expect(detail.job).toBeDefined();
    expect(detail.job.id).toBe('test-job');
    expect(detail.events.length).toBe(10);
    expect(detail.pagination.newestId).toBeDefined();
    expect(detail.pagination.oldestId).toBeDefined();
    expect(detail.pagination.minId).toBeDefined();
    expect(detail.pagination.maxId).toBeDefined();
  });

  test('query performance: listQueues with 100 jobs and 10k events completes quickly', () => {
    console.log('[PERF] Creating 100 jobs with varying event counts...');
    const startSetup = Date.now();
    
    // Create 100 jobs
    const stmt = db.prepare('INSERT INTO crawl_jobs (id, url, started_at, ended_at, status) VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < 100; i++) {
      const ts = new Date(Date.now() - i * 1000).toISOString();
      stmt.run(`job${i}`, `https://example${i}.com`, ts, i % 5 === 0 ? ts : null, i % 5 === 0 ? 'done' : 'running');
    }
    
    // Create 10k events distributed across jobs
    const eventStmt = db.prepare('INSERT INTO queue_events (job_id, ts, action, url) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 10000; i++) {
      const jobId = `job${i % 100}`;
      eventStmt.run(jobId, new Date().toISOString(), 'enqueued', `https://example.com/${i}`);
    }
    
    console.log(`[PERF] Setup took ${Date.now() - startSetup}ms`);
    
    // Measure query time
    const startQuery = Date.now();
    const result = listQueues(db, { limit: 50 });
    const queryTime = Date.now() - startQuery;
    
    console.log(`[PERF] Query took ${queryTime}ms for 50 results from 100 jobs with 10k events`);
    
    expect(result.length).toBe(50);
    expect(queryTime).toBeLessThan(500); // Should complete in under 500ms with optimized query
    
    // Verify correctness - each job should have ~100 events on average
    const job0 = result.find(j => j.id === 'job0');
    expect(job0).toBeDefined();
    expect(job0.events).toBe(100);
  });
});
