const path = require('path');
const fs = require('fs');
const { once } = require('events');
const NewsDatabase = require('../data/db');

function makeTempDb(filePath) {
  const db = new NewsDatabase(filePath);
  for (let i = 0; i < 5; i++) {
    db.upsertArticle({
      url: `https://example.com/${i}`,
      title: `t${i}`,
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
  }
  return db;
}

describe('NewsDatabase.streamArticleUrls', () => {
  const tmp = path.join(__dirname, 'tmp_stream.db');
  beforeAll(() => { try { fs.unlinkSync(tmp); } catch (_) {} });
  afterAll(() => { try { fs.unlinkSync(tmp); } catch (_) {} });

  test('streams URLs in objectMode', async () => {
    const db = makeTempDb(tmp);
    const rs = db.streamArticleUrls();
    const items = [];
    rs.on('data', (u) => items.push(u));
    await once(rs, 'end');
    db.close();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items[0]).toMatch(/^https?:\/\//);
  });
});
