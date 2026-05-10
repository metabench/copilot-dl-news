'use strict';

const Database = require('better-sqlite3');
const { pruneExportedPayload } = require('../../../deploy/remote-crawler-v2/lib/export-retention');
const {
  validatePruneExportConfig,
  shouldPruneAfterIngest,
} = require('../../../tools/crawl/lib/prune-config');

function createFixtureDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      status TEXT,
      updated_at DATETIME
    );
    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      http_status INTEGER
    );
    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER NOT NULL,
      content_blob BLOB
    );
    CREATE TABLE discovered_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url_id INTEGER,
      target_url TEXT
    );
  `);

  const insertUrl = db.prepare('INSERT INTO urls (url, status, updated_at) VALUES (?, ?, ?)');
  const insertResponse = db.prepare('INSERT INTO http_responses (url_id, http_status) VALUES (?, ?)');
  const insertContent = db.prepare('INSERT INTO content_storage (http_response_id, content_blob) VALUES (?, ?)');
  const insertLink = db.prepare('INSERT INTO discovered_links (source_url_id, target_url) VALUES (?, ?)');

  // Three URLs, all updated at the same timestamp — only ids 1 and 2 will be "exported"
  const ts = '2026-05-09T00:00:00Z';
  for (let i = 1; i <= 3; i++) {
    insertUrl.run(`https://example.com/${i}`, 'fetched', ts);
    const responseId = insertResponse.run(i, 200).lastInsertRowid;
    insertContent.run(responseId, Buffer.from(`payload-${i}`));
    insertLink.run(i, `https://example.com/${i}/next`);
  }

  return { db, ts };
}

function counts(db) {
  return {
    urls: db.prepare('SELECT COUNT(*) AS c FROM urls').get().c,
    responses: db.prepare('SELECT COUNT(*) AS c FROM http_responses').get().c,
    content: db.prepare('SELECT COUNT(*) AS c FROM content_storage').get().c,
    links: db.prepare('SELECT COUNT(*) AS c FROM discovered_links').get().c,
  };
}

describe('pruneExportedPayload — exact-id safety', () => {
  test('only deletes payload for the exported url ids', () => {
    const { db } = createFixtureDb();

    const result = pruneExportedPayload(db, { urlIds: [1, 2] });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('exact-url-ids');
    expect(result.matchedUrlIds).toBe(2);
    expect(result.deleted.httpResponses).toBe(2);
    expect(result.deleted.content).toBe(2);
    expect(result.deleted.links).toBe(2);

    const remaining = counts(db);
    expect(remaining.urls).toBe(3); // url state retained by default
    expect(remaining.responses).toBe(1);
    expect(remaining.content).toBe(1);
    expect(remaining.links).toBe(1);

    const survivor = db.prepare('SELECT url_id FROM http_responses').get();
    expect(survivor.url_id).toBe(3);
  });

  test('non-exported rows under the same timestamp are preserved', () => {
    const { db, ts } = createFixtureDb();

    pruneExportedPayload(db, { urlIds: [1] });

    // Same updated_at timestamp on all three URLs — watermark would have nuked them.
    // Exact-id mode must leave 2 and 3 alone.
    const survivors = db.prepare('SELECT id FROM http_responses ORDER BY url_id').all().map(r => r.id);
    expect(survivors.length).toBe(2);
    const tsRows = db.prepare('SELECT COUNT(*) AS c FROM urls WHERE updated_at = ?').get(ts).c;
    expect(tsRows).toBe(3);
  });

  test('url state rows are retained by default (deleteUrls=false)', () => {
    const { db } = createFixtureDb();

    const result = pruneExportedPayload(db, { urlIds: [1, 2, 3] });

    expect(result.deleted.urls).toBe(0);
    expect(result.retained.urls).toBe(3);
    expect(counts(db).urls).toBe(3);
  });

  test('deleteUrls=true removes url rows when explicitly requested', () => {
    const { db } = createFixtureDb();

    const result = pruneExportedPayload(db, { urlIds: [1], deleteUrls: true });

    expect(result.deleted.urls).toBe(1);
    expect(counts(db).urls).toBe(2);
  });

  test('throws when neither urlIds nor before watermark provided', () => {
    const { db } = createFixtureDb();
    expect(() => pruneExportedPayload(db, {})).toThrow(/before watermark or urlIds are required/);
  });

  test('returns zero-deletion result for unknown url ids', () => {
    const { db } = createFixtureDb();

    const result = pruneExportedPayload(db, { urlIds: [9999] });

    expect(result.ok).toBe(true);
    expect(result.matchedUrlIds).toBe(0);
    expect(result.deleted).toEqual({ urls: 0, httpResponses: 0, content: 0, links: 0 });
    expect(counts(db)).toEqual({ urls: 3, responses: 3, content: 3, links: 3 });
  });

  test('ignores duplicate and invalid url ids in input', () => {
    const { db } = createFixtureDb();

    const result = pruneExportedPayload(db, { urlIds: [1, 1, 2, 0, -3, 'bad', null] });

    expect(result.requestedUrlIds).toBe(2);
    expect(result.matchedUrlIds).toBe(2);
    expect(counts(db).responses).toBe(1);
  });
});

describe('validatePruneExportConfig — partial export refusal', () => {
  test('allows prune when content and links are included', () => {
    expect(() => validatePruneExportConfig({ 'prune-after-ingest': true })).not.toThrow();
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-content': 'true',
      'include-links': 'true',
    })).not.toThrow();
  });

  test('refuses prune when include-content is false', () => {
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-content': 'false',
    })).toThrow(/Refusing --prune-after-ingest with a partial export/);
  });

  test('refuses prune when include-links is false', () => {
    expect(() => validatePruneExportConfig({
      'prune-after-ingest': true,
      'include-links': false,
    })).toThrow(/Refusing --prune-after-ingest with a partial export/);
  });

  test('refuses prune when camelCase includeContent is false', () => {
    expect(() => validatePruneExportConfig({
      pruneAfterIngest: true,
      includeContent: 'false',
    })).toThrow(/Refusing --prune-after-ingest/);
  });

  test('no-op when prune is not requested even with partial export', () => {
    expect(() => validatePruneExportConfig({
      'include-content': 'false',
      'include-links': 'false',
    })).not.toThrow();
  });

  test('shouldPruneAfterIngest reads both kebab and camel case', () => {
    expect(shouldPruneAfterIngest({ 'prune-after-ingest': true })).toBe(true);
    expect(shouldPruneAfterIngest({ pruneAfterIngest: 'yes' })).toBe(true);
    expect(shouldPruneAfterIngest({})).toBe(false);
    expect(shouldPruneAfterIngest({ 'prune-after-ingest': 'false' })).toBe(false);
  });
});
