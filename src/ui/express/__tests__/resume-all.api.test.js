const request = require('supertest');
const { EventEmitter } = require('events');
const { createApp } = require('../server');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

function makeRunnerWithStdin(lines = [], exitCode = 0, delayMs = 50) {
  return {
    start() {
      const ee = new EventEmitter();
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();
      ee.stdin = { writes: [], write(chunk) { this.writes.push(String(chunk)); return true; } };
      ee.killed = false;
      ee.kill = () => { ee.killed = true; ee.emit('exit', null, 'SIGTERM'); };
      ee.pid = Math.floor(Math.random() * 10000) + 1000;
      setTimeout(() => {
        for (const l of lines) ee.stdout.emit('data', Buffer.from(l + '\n'));
        ee.emit('exit', exitCode, null);
      }, delayMs);
      return ee;
    }
  };
}

describe('resume-all API integration', () => {
  let tempDbPath;
  let db;

  beforeEach(() => {
    const tmpDir = path.join(os.tmpdir(), 'copilot-ui-tests');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}
    const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
    tempDbPath = path.join(tmpDir, `test-resume-all-${unique}.db`);
    
    db = new Database(tempDbPath);
    
    // Create crawl_jobs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        args TEXT,
        status TEXT,
        started_at INTEGER,
        ended_at INTEGER
      )
    `);
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
    const suffixes = ['', '-shm', '-wal'];
    for (const suffix of suffixes) {
      try { fs.unlinkSync(tempDbPath + suffix); } catch (_) {}
    }
  });

  test('resume-all returns empty when no incomplete queues', async () => {
    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 200),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.resumed).toBe(0);
    expect(res.body.message).toContain('No incomplete');
  });

  test('resume-all resumes incomplete queues', async () => {
    // Insert incomplete queue
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://news1.example.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://news1.example.com']),
      'running',
      Date.now() - 3600000
    );

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":10}'], 0, 500),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({ maxConcurrent: 8 });
    expect(res.statusCode).toBe(200);
    expect(res.body.resumed).toBe(1);
    expect(res.body.queues).toHaveLength(1);
    expect(res.body.queues[0]).toMatchObject({
      id: 1,
      url: 'https://news1.example.com'
    });
    expect(res.body.queues[0].pid).toBeGreaterThan(0);
  });

  test('resume-all respects maxConcurrent limit', async () => {
    // Insert 5 incomplete queues
    for (let i = 1; i <= 5; i++) {
      db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
        `https://news${i}.example.com`,
        JSON.stringify(['--db', tempDbPath, '--start-url', `https://news${i}.example.com`]),
        'running',
        Date.now() - 3600000
      );
    }

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 500),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({ maxConcurrent: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body.resumed).toBe(2);
    expect(res.body.queues).toHaveLength(2);
  });

  test('resume-all prevents multiple crawls per domain', async () => {
    // Insert 3 queues from same domain
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://example.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://example.com']),
      'running',
      Date.now() - 3600000
    );
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://example.com/news',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://example.com/news']),
      'running',
      Date.now() - 3600000
    );
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://other.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://other.com']),
      'running',
      Date.now() - 3600000
    );

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 500),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({ maxConcurrent: 10 });
    expect(res.statusCode).toBe(200);
    // Should only resume 2: one from example.com and one from other.com
    expect(res.body.resumed).toBe(2);
    
    const domains = res.body.queues.map(q => new URL(q.url).hostname);
    const uniqueDomains = new Set(domains);
    expect(uniqueDomains.size).toBe(2);
    expect(uniqueDomains.has('example.com')).toBe(true);
    expect(uniqueDomains.has('other.com')).toBe(true);
  });

  test('resume-all handles args parsing errors gracefully', async () => {
    // Insert queue with invalid JSON args but valid URL
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://bad.example.com',
      'invalid-json',
      'running',
      Date.now() - 3600000
    );
    // Insert queue with no args and empty URL (truly invalid)
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      '',
      null,
      'running',
      Date.now() - 3600000
    );
    // Insert valid queue
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://good.example.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://good.example.com']),
      'running',
      Date.now() - 3600000
    );

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 500),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({});
    expect(res.statusCode).toBe(200);
    // Both valid and bad-but-has-url should resume (resilient fallback to buildArgs)
    expect(res.body.resumed).toBe(2);
    expect(res.body.queues).toHaveLength(2);
    // Should have 1 error for the queue with empty URL
    expect(res.body.errors).toHaveLength(1);
  });

  test('resume-all defaults maxConcurrent to 8', async () => {
    // Insert 10 incomplete queues on different domains
    for (let i = 1; i <= 10; i++) {
      db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
        `https://news${i}.example${i}.com`,
        JSON.stringify(['--db', tempDbPath, '--start-url', `https://news${i}.example${i}.com`]),
        'running',
        Date.now() - 3600000
      );
    }

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 500),
      dbPath: tempDbPath
    });
    
    // Don't provide maxConcurrent
    const res = await request(app).post('/api/resume-all').send({});
    expect(res.statusCode).toBe(200);
    // Should default to 8
    expect(res.body.resumed).toBe(8);
  });

  test('resume-all skips queues already completed', async () => {
    // Insert completed queue
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)').run(
      'https://completed.example.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://completed.example.com']),
      'running',
      Date.now() - 7200000,
      Date.now() - 3600000
    );
    // Insert incomplete queue
    db.prepare('INSERT INTO crawl_jobs (url, args, status, started_at) VALUES (?, ?, ?, ?)').run(
      'https://incomplete.example.com',
      JSON.stringify(['--db', tempDbPath, '--start-url', 'https://incomplete.example.com']),
      'running',
      Date.now() - 3600000
    );

    const app = createApp({ 
      runner: makeRunnerWithStdin(['PROGRESS {"visited":0}'], 0, 500),
      dbPath: tempDbPath
    });
    
    const res = await request(app).post('/api/resume-all').send({});
    expect(res.statusCode).toBe(200);
    expect(res.body.resumed).toBe(1);
    expect(res.body.queues[0].url).toBe('https://incomplete.example.com');
  });
});
