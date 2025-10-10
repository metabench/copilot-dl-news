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
    const NewsDatabase = require('../../../db');
    
    const db = new NewsDatabase(tmp);
    const now = new Date().toISOString();
    db.upsertArticle({
      url: 'https://sitea.example.com/news/a', title: 'a', date: null, section: 'news', html: '<html/>', crawled_at: now,
      canonical_url: null, referrer_url: null, discovered_at: now, crawl_depth: 0, fetched_at: now, request_started_at: now,
      http_status: 200, content_type: 'text/html', content_length: 0, etag: null, last_modified: null, redirect_chain: null,
      ttfb_ms: 1, download_ms: 1, total_ms: 2, bytes_downloaded: 10, transfer_kbps: 10, html_sha256: null, text: 'x', word_count: 1, language: 'en'
    });
    db.upsertArticle({
      url: 'https://siteb.example.com/post/b', title: 'b', date: null, section: 'post', html: '<html/>', crawled_at: now,
      canonical_url: null, referrer_url: null, discovered_at: now, crawl_depth: 0, fetched_at: now, request_started_at: now,
      http_status: 200, content_type: 'text/html', content_length: 0, etag: null, last_modified: null, redirect_chain: null,
      ttfb_ms: 1, download_ms: 1, total_ms: 2, bytes_downloaded: 10, transfer_kbps: 10, html_sha256: null, text: 'x', word_count: 1, language: 'en'
    });
    db.close();

    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/recent-domains?limit=20');
    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(2);
    const hosts = (res.body.domains || []).map(d => d.host);
    expect(hosts).toEqual(expect.arrayContaining(['sitea.example.com', 'siteb.example.com']));
    
    // Clean up app's database connection
    const appDb = app.locals.backgroundTaskManager?.db || app.locals.getDbRW?.();
    if (appDb && appDb.close) appDb.close();
  });

  test('data helper returns empty on DB failure', () => {
    jest.doMock(DB_ABS, () => { throw new Error('mock db failure'); }, { virtual: false });
    const { getRecentDomains } = require('../data/recentDomains');
    const result = getRecentDomains('/fake/path', 10);
    expect(result).toEqual({ count: 0, totalSeen: 0, limit: 10, domains: [] });
  });
});
