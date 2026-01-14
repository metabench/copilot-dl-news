const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Absolute path to the DB module as resolved by server.js ('../../db' -> src/db)
const DB_ABS = path.resolve(__dirname, '../../../db');

describe('/api/recent-domains', () => {
  const tmp = path.join(__dirname, 'tmp_recent_domains.db');
  
  beforeEach(() => {
    jest.resetModules();
    try { jest.unmock(DB_ABS); } catch (_) {}
    
    // CRITICAL: Delete temp DB BEFORE test runs to ensure fresh schema
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '-wal'); } catch (_) {}
    try { fs.unlinkSync(tmp + '-shm'); } catch (_) {}
  });
  
  afterEach(() => {
    // Clean up temp DB and WAL files after test
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(tmp + '-wal'); } catch (_) {}
    try { fs.unlinkSync(tmp + '-shm'); } catch (_) {}
  });

  test('returns empty list when DB is unavailable (fallback)', async () => {
    // Mock the exact module path that server.js resolves ('../../db' -> src/db)
    jest.doMock(DB_ABS, () => { throw new Error('better-sqlite3 not installed'); }, { virtual: false });

    let app;
    jest.isolateModules(() => {
      const { createApp } = require('../server');
      app = createApp();
    });
    const res = await request(app).get('/api/recent-domains?limit=20');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 0, totalSeen: 0, domains: [] });
  });

  test('aggregates recent domains from articles', async () => {
    // Ensure real DB is used
    try { jest.unmock(DB_ABS); } catch (_) {}
    const { createApp } = require('../server');
    
    // CRITICAL: Create app FIRST to initialize schema
    const app = createApp({ dbPath: tmp, verbose: false });
    
    // CRITICAL: Use app's shared DB connection (WAL mode single connection pattern)
    const db = app.locals.backgroundTaskManager?.db || app.locals.getDb?.();
    
    const now = new Date().toISOString();
    
    // Insert URLs first (required for join in selectRecentDomains)
    const urlStmt = db.prepare('INSERT OR IGNORE INTO urls (url, host) VALUES (?, ?)');
    urlStmt.run('https://sitea.example.com/news/a', 'sitea.example.com');
    urlStmt.run('https://siteb.example.com/post/b', 'siteb.example.com');
    
    // Insert articles using shared connection
    const stmt = db.prepare(`
      INSERT INTO articles (url, title, date, section, html, crawled_at, host,
        canonical_url, referrer_url, discovered_at, crawl_depth, fetched_at, request_started_at,
        http_status, content_type, content_length, etag, last_modified, redirect_chain,
        ttfb_ms, download_ms, total_ms, bytes_downloaded, transfer_kbps, html_sha256, text, word_count, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run('https://sitea.example.com/news/a', 'a', null, 'news', '<html/>', now, 'sitea.example.com',
      null, null, now, 0, now, now, 200, 'text/html', 0, null, null, null,
      1, 1, 2, 10, 10, null, 'x', 1, 'en');
    stmt.run('https://siteb.example.com/post/b', 'b', null, 'post', '<html/>', now, 'siteb.example.com',
      null, null, now, 0, now, now, 200, 'text/html', 0, null, null, null,
      1, 1, 2, 10, 10, null, 'x', 1, 'en');
    
    const res = await request(app).get('/api/recent-domains?limit=20');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    const hosts = (res.body.domains || []).map(d => d.host);
    expect(hosts).toEqual(expect.arrayContaining(['sitea.example.com', 'siteb.example.com']));
    
    // Clean up app's database connection
    if (db && db.close) db.close();
  });

  test('data helper returns empty on DB failure', () => {
    jest.doMock(DB_ABS, () => { throw new Error('mock db failure'); }, { virtual: false });
    const { getRecentDomains } = require('../../../data/recentDomains');
    const result = getRecentDomains('/fake/path', 10);
    expect(result).toEqual({ count: 0, totalSeen: 0, limit: 10, domains: [] });
  });
});
