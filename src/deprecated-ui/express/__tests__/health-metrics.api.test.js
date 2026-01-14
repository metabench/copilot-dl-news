const request = require('supertest');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server');
const NewsDatabase = require('../../../data/db');

function startHttp(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

describe('health and metrics', () => {
  test('GET /health reports running=false initially', async () => {
    const app = createApp({});
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('running', false);
    expect(res.body).toHaveProperty('stage', 'idle');
  });

  test('GET /metrics exposes prometheus text', async () => {
    const app = createApp({});
    const { server, port } = await startHttp(app);
    const res = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/metrics' }, (r) => {
        let buf = '';
        r.setEncoding('utf8');
        r.on('data', (d) => buf += d);
        r.on('end', () => resolve({ status: r.statusCode, text: buf, headers: r.headers }));
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type']||'')).toMatch(/text\/plain/);
    expect(res.text).toMatch(/crawler_running/);
    expect(res.headers).toHaveProperty('etag');

    const res304 = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/metrics', headers: { 'If-None-Match': res.headers.etag } }, (r) => {
        resolve({ status: r.statusCode });
      }).on('error', reject);
    });
    expect(res304.status).toBe(304);
    await new Promise((r) => server.close(r));
  });
});

describe('UI DB-backed endpoints', () => {
  const tmp = path.join(__dirname, 'tmp_ui_db_endpoints.db');
  beforeAll(() => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    const db = new NewsDatabase(tmp);
    const now = new Date().toISOString();
    const url = 'https://site.example.com/news/alpha';
    db.upsertArticle({
      url, title: 'Alpha', date: now, section: 'news', html: '<html><body><p>hi</p></body></html>', crawled_at: now,
      canonical_url: null, referrer_url: null, discovered_at: now, crawl_depth: 0,
      fetched_at: now, request_started_at: now, http_status: 200, content_type: 'text/html', content_length: 10,
      etag: null, last_modified: null, redirect_chain: null, ttfb_ms: 1, download_ms: 1, total_ms: 2,
      bytes_downloaded: 10, transfer_kbps: 10, html_sha256: null, text: 'hi', word_count: 1, language: 'en'
    });
    db.insertFetch({
      url, request_started_at: now, fetched_at: now, http_status: 200, content_type: 'text/html', content_length: 10,
      content_encoding: null, bytes_downloaded: 10, transfer_kbps: 10, ttfb_ms: 1, download_ms: 1, total_ms: 2,
      saved_to_db: 1, saved_to_file: 0, file_path: null, file_size: null, classification: 'article', nav_links_count: 1,
      article_links_count: 1, word_count: 100
    });
    db.insertError({ url, kind: 'http', code: 404, message: 'HTTP 404 not found' });
    db.insertError({ url: 'https://site.example.com/news/beta', kind: 'http', code: 404, message: 'HTTP 404 not found' });
    db.insertError({ url: 'https://site.example.com/news/gamma', kind: 'network', message: 'socket hang up' });
    db.insertError({ url: 'https://other.example.com/home', kind: 'http', code: 500, message: 'HTTP 500 server error' });
    db.close();
  });
  afterAll(() => { try { fs.unlinkSync(tmp); } catch (_) {} });

  test('GET /api/url-details returns details', async () => {
    const app = createApp({ dbPath: tmp });
    const url = 'https://site.example.com/news/alpha';
    const res = await request(app).get('/api/url-details').query({ url });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('url', url);
    expect(res.body).toHaveProperty('article');
    expect(Array.isArray(res.body.fetches)).toBe(true);
  });

  test('GET /api/recent-errors groups recent failures by host and status', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/recent-errors');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
    const notFoundGroup = res.body.errors.find((err) => err.host === 'site.example.com' && err.status === '404');
    expect(notFoundGroup).toBeDefined();
    expect(notFoundGroup.count).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(notFoundGroup.examples)).toBe(true);
    expect(notFoundGroup.examples.length).toBeGreaterThan(0);
    const networkGroup = res.body.errors.find((err) => err.status === 'network');
    expect(networkGroup).toBeDefined();
    expect(networkGroup.kind).toBe('network');
  });

  test('GET /api/domain-summary returns summary', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/domain-summary?host=site.example.com');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('host', 'site.example.com');
    expect(res.body).toHaveProperty('articles');
    expect(res.body).toHaveProperty('fetches');
  });
});
