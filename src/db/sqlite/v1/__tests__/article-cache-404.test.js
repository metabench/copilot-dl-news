const fs = require('fs');
const { ensureDatabase, NewsDatabase } = require('..');
const { createTempDb } = require('../test-utils');
const { ArticleCache } = require('../../../../cache');

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
};

function removeDatabase(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

describe('NewsDatabase 404 fetch handling', () => {
  let dbPath;
  let dbHandle;
  let newsDb;

  beforeEach(() => {
    dbPath = createTempDb('known-404');
    dbHandle = ensureDatabase(dbPath, { logger: silentLogger });
    newsDb = new NewsDatabase(dbHandle);
  });

  afterEach(() => {
    if (dbHandle) {
      dbHandle.close();
      dbHandle = null;
    }
    removeDatabase(dbPath);
    dbPath = null;
    newsDb = null;
  });

  const articleUrl = 'https://example.com/missing-page';
  const older = '2025-10-20T10:00:00.000Z';
  const newer = '2025-10-20T12:00:00.000Z';

  function seedArticleSnapshot() {
    newsDb.upsertArticle({
      url: articleUrl,
      html: '<html>original</html>',
      crawled_at: older,
      fetched_at: older,
      request_started_at: older,
      http_status: 200,
      content_type: 'text/html',
      bytes_downloaded: 1024,
      download_ms: 10,
      total_ms: 12,
      ttfb_ms: 5,
      transfer_kbps: 100
    }, { compress: false });
  }

  function insert404Snapshot() {
    return newsDb.insertHttpResponse({
      url: articleUrl,
      request_started_at: newer,
      fetched_at: newer,
      http_status: 404,
      content_type: 'text/html',
      content_encoding: null,
      etag: null,
      last_modified: null,
      redirect_chain: null,
      ttfb_ms: 45,
      download_ms: 0,
      total_ms: 45,
      bytes_downloaded: 0,
      transfer_kbps: null
    });
  }

  test('getArticleByUrl returns 404 row when only error responses exist', () => {
    const responseId = insert404Snapshot();

    expect(responseId).toBeTruthy();

    const row = newsDb.getArticleByUrl(articleUrl);
    expect(row).toBeTruthy();
    expect(row.http_status).toBe(404);
    expect(row.html).toBeNull();
    expect(row.fetched_at).toBe(newer);
  });

  test('getArticleByUrl returns latest 404 response even without content rows', () => {
    seedArticleSnapshot();
    const responseId = insert404Snapshot();

    expect(responseId).toBeTruthy();

    const row = newsDb.getArticleByUrl(articleUrl);
    expect(row).toBeTruthy();
    expect(row.http_status).toBe(404);
    expect(row.html).toBeNull();
    expect(row.fetched_at).toBe(newer);
  });

  test('ArticleCache marks known 404 responses from database', async () => {
    seedArticleSnapshot();
    insert404Snapshot();

    const cache = new ArticleCache({ db: newsDb, normalizeUrl: (u) => u });
    const cached = await cache.get(articleUrl);

    expect(cached).toEqual({
      html: null,
      crawledAt: newer,
      source: 'db-404',
      httpStatus: 404
    });
  });
});
