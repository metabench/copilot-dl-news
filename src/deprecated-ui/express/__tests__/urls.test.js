const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../server');
const NewsDatabase = require('../../../data/db');

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
  const bodyPath = path.join(__dirname, 'tmp_urls_body.txt');
  let fetchId;
  beforeAll(() => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(bodyPath); } catch (_) {}
    makeTempDb(tmp);
    // Add a fetch row to enable filters
    const db = new NewsDatabase(tmp);
    fs.writeFileSync(bodyPath, 'hello world');
    db.insertFetch({
      url: 'https://example.com/a',
      request_started_at: new Date().toISOString(),
      fetched_at: new Date().toISOString(),
      http_status: 404,
      content_type: 'text/html',
      content_length: 0,
      content_encoding: null,
      bytes_downloaded: 100,
      transfer_kbps: 10,
      ttfb_ms: 10,
      download_ms: 20,
      total_ms: 30,
      saved_to_db: 1,
      saved_to_file: 1,
      file_path: bodyPath,
      file_size: 11,
      classification: 'article',
      nav_links_count: 0,
      article_links_count: 0,
      word_count: 123
    });
    const handle = typeof db.getHandle === 'function' ? db.getHandle() : db.db;
    const res = handle.prepare('SELECT id FROM fetches WHERE url = ? ORDER BY id DESC LIMIT 1').get('https://example.com/a');
    fetchId = res?.id;
    db.close();
  });
  afterAll(() => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    try { fs.unlinkSync(bodyPath); } catch (_) {}
  });

  test('GET /api/urls returns list of URLs', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/urls');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.urls)).toBe(true);
    expect(res.body.urls[0]).toMatch(/^https?:\/\//);
  });

  test('GET /api/urls supports filters (status/classification/minWordCount)', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/urls?details=1&status=404&classification=article&minWordCount=100');
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    const it = res.body.items[0];
    expect(it.http_status).toBe(404);
    expect(it.classification).toBe('article');
    expect(it.word_count).toBeGreaterThanOrEqual(100);
  });

  test('GET /api/url-details returns article and fetches', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get('/api/url-details?url=' + encodeURIComponent('https://example.com/a'));
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBe('https://example.com/a');
    expect(res.body.article).not.toBeNull();
    expect(Array.isArray(res.body.fetches)).toBe(true);
    expect(res.body.fetches.some(f => f.id === fetchId)).toBe(true);
    expect(res.body.urlInfo).not.toBeNull();
  });

  test('GET /api/fetch-body returns stored body text', async () => {
    const app = createApp({ dbPath: tmp });
    const res = await request(app).get(`/api/fetch-body?id=${fetchId}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('hello world');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});
