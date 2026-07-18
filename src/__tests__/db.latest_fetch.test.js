const path = require('path');
const fs = require('fs');
const os = require('os');
const NewsDatabase = require('../db');

function tmpDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-db-'));
  return path.join(dir, 'test.db');
}

describe('DB latest_fetch maintenance', () => {
  test('inserts and updates latest_fetch on fetches insert', () => {
    const dbPath = tmpDbPath();
    const db = new NewsDatabase(dbPath);
    const url = 'https://example.com/a';
    const now = new Date().toISOString();
    db.insertFetch({
      url,
      request_started_at: now,
      fetched_at: now,
      http_status: 200,
      content_type: 'text/html',
      content_length: 1234,
      content_encoding: null,
      bytes_downloaded: 1234,
      transfer_kbps: 100,
      ttfb_ms: 10,
      download_ms: 20,
      total_ms: 30,
      saved_to_db: 0,
      saved_to_file: 0,
      file_path: null,
      file_size: null,
      classification: 'article',
      nav_links_count: 5,
      article_links_count: 1,
      word_count: 500
    });

    // insertFetch now maps into the normalized schema (urls + http_responses).
    const { id: urlId } = db.db.prepare('SELECT id FROM urls WHERE url = ?').get(url);
    expect(urlId).toBeTruthy();

    const row1 = db.db
      .prepare('SELECT * FROM http_responses WHERE url_id = ? ORDER BY fetched_at DESC LIMIT 1')
      .get(urlId);
    expect(row1).toBeTruthy();
    expect(row1.http_status).toBe(200);

    // Insert newer with error status and ensure latest row reflects it
    const later = new Date(Date.now() + 1000).toISOString();

    db.insertFetch({
      url,
      request_started_at: later,
      fetched_at: later,
      http_status: 503,
      content_type: null,
      content_length: null,
      content_encoding: null,
      bytes_downloaded: 0,
      transfer_kbps: null,
      ttfb_ms: null,
      download_ms: null,
      total_ms: null,
      saved_to_db: 0,
      saved_to_file: 0,
      file_path: null,
      file_size: null,
      classification: 'other',
      nav_links_count: 0,
      article_links_count: 0,
      word_count: null
    });

    const row2 = db.db
      .prepare('SELECT * FROM http_responses WHERE url_id = ? ORDER BY fetched_at DESC LIMIT 1')
      .get(urlId);
    expect(row2).toBeTruthy();
    expect(row2.http_status).toBe(503);
    db.close();
  });
});
