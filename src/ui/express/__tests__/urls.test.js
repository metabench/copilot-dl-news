const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server');
const NewsDatabase = require('../../../db');

function makeTempDb(filePath) {
  // create minimal DB with one article
  const db = new NewsDatabase(filePath);
  db.upsertArticle({
    url: 'https://example.com/a',
    title: 't',
    date: null,
    section: null,
    html: '<html></html>',
    crawled_at: new Date().toISOString(),
    canonical_url: null,
    referrer_url: null,
    discovered_at: null,
    crawl_depth: null,
    fetched_at: null,
    request_started_at: null,
    http_status: 200,
    content_type: 'text/html',
    content_length: 0,
    etag: null,
    last_modified: null,
    redirect_chain: null,
    ttfb_ms: 1,
    download_ms: 1,
    total_ms: 2,
    bytes_downloaded: 0,
    transfer_kbps: 0,
    html_sha256: null,
    text: 'x',
    word_count: 1,
    language: 'en'
  });
  db.close();
}

describe('URLs API', () => {
  const tmp = path.join(__dirname, 'tmp_urls.db');
  beforeAll(() => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    makeTempDb(tmp);
  });
  afterAll(() => {
    try { fs.unlinkSync(tmp); } catch (_) {}
  });

  test('GET /api/urls returns list of URLs', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/urls');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.urls)).toBe(true);
    expect(res.body.urls[0]).toMatch(/^https?:\/\//);
  });
});
