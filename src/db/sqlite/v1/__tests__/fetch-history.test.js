const fs = require('fs');
const path = require('path');
const { ensureDatabase, NewsDatabase } = require('..');
const { createTempDb } = require('../test-utils');

describe('SQLiteNewsDatabase#getFetchesByUrl', () => {
  let dbPath;
  let db;
  let newsDb;

  const silentLogger = {
    log: () => {},
    warn: () => {},
    error: () => {}
  };

  beforeEach(() => {
    dbPath = createTempDb('fetch-history');
    db = ensureDatabase(dbPath, { logger: silentLogger });
    newsDb = new NewsDatabase(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (dbPath && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {
        // ignore cleanup errors in CI environments
      }
    }
  });

  function seedFetch({ url, fetchedAt, bytesDownloaded, title, analysisJson, articleLinks = null, navLinks = null }) {
    const timestamp = fetchedAt || new Date().toISOString();
    const createdAt = new Date(Date.parse(timestamp) - 1000).toISOString();

    const urlRow = db.prepare(`
      INSERT INTO urls (url, canonical_url, created_at, last_seen_at, host)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET last_seen_at = excluded.last_seen_at
      RETURNING id
    `).get(url, url, createdAt, timestamp, new URL(url).host);

    const response = db.prepare(`
      INSERT INTO http_responses (
        url_id,
        request_started_at,
        fetched_at,
        http_status,
        content_type,
        content_encoding,
        etag,
        last_modified,
        redirect_chain,
        ttfb_ms,
        download_ms,
        total_ms,
        bytes_downloaded,
        transfer_kbps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      urlRow.id,
      timestamp,
      timestamp,
      200,
      'text/html; charset=UTF-8',
      null,
      'etag-' + Math.random().toString(16).slice(2),
      timestamp,
      null,
      120,
      12,
      132,
      bytesDownloaded,
      512.5
    );

    const responseId = Number(response.lastInsertRowid);

    const content = db.prepare(`
      INSERT INTO content_storage (
        storage_type,
        http_response_id,
        compression_type_id,
        compression_bucket_id,
        bucket_entry_key,
        content_blob,
        content_sha256,
        uncompressed_size,
        compressed_size,
        compression_ratio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'inline',
      responseId,
      null,
      null,
      null,
      Buffer.from('<html><body>Test</body></html>'),
      'sha' + Math.random().toString(16).slice(2),
      bytesDownloaded,
      Math.floor(bytesDownloaded / 4),
      0.25
    );

    const contentId = Number(content.lastInsertRowid);

    db.prepare(`
      INSERT INTO content_analysis (
        content_id,
        analysis_version,
        classification,
        title,
        date,
        section,
        word_count,
        language,
        article_xpath,
        nav_links_count,
        article_links_count,
        analysis_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contentId,
      1,
      'article',
      title,
      timestamp,
      'news',
      350,
      'en',
      '/html/body/article',
      navLinks,
      articleLinks,
      analysisJson
    );
  }

  test('returns fetch history with analysis data and byte counts', () => {
    const targetUrl = 'https://example.com/article/latest';
    const newer = '2025-10-20T20:15:00.000Z';
    const older = '2025-10-19T10:00:00.000Z';

    seedFetch({
      url: targetUrl,
      fetchedAt: older,
      bytesDownloaded: 2048,
      title: 'Older snapshot',
      analysisJson: JSON.stringify({ snapshot: 'older' }),
      articleLinks: 5,
      navLinks: 10
    });

    seedFetch({
      url: targetUrl,
      fetchedAt: newer,
      bytesDownloaded: 4096,
      title: 'Latest snapshot',
      analysisJson: JSON.stringify({ snapshot: 'latest' }),
      articleLinks: 8,
      navLinks: 16
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const rows = newsDb.getFetchesByUrl(targetUrl, 10);

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      url: targetUrl,
      fetched_at: newer,
      bytes_downloaded: 4096,
      content_length: 4096,
      classification: 'article',
      title: 'Latest snapshot'
    });
    expect(rows[0].analysis).toEqual(JSON.stringify({ snapshot: 'latest' }));

    expect(rows[1]).toMatchObject({
      url: targetUrl,
      fetched_at: older,
      bytes_downloaded: 2048,
      content_length: 2048,
      title: 'Older snapshot'
    });
  });
});
