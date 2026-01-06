'use strict';

let Database;
let canUseDatabase = true;
try {
  Database = require('better-sqlite3');
} catch (error) {
  canUseDatabase = false;
}

if (canUseDatabase) {
  try {
    const smoke = new Database(':memory:');
    smoke.close();
  } catch (error) {
    canUseDatabase = false;
  }
}

const describeDb = canUseDatabase ? describe : describe.skip;
const { createMultiModalCrawlQueries } = require('../sqlite/v1/queries/multiModalCrawl');

describeDb('multiModalCrawlQueries', () => {
  let db;
  let queries;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, host TEXT);
      CREATE TABLE http_responses (id INTEGER PRIMARY KEY, url_id INTEGER);
      CREATE TABLE content_storage (id INTEGER PRIMARY KEY, http_response_id INTEGER);
      CREATE TABLE content_analysis (
        id INTEGER PRIMARY KEY,
        content_id INTEGER,
        analysis_json TEXT,
        analysis_version INTEGER,
        confidence_score REAL
      );
      CREATE TABLE links (id INTEGER PRIMARY KEY, src_url_id INTEGER, dst_url_id INTEGER);
      CREATE TABLE place_page_mappings (id INTEGER PRIMARY KEY, url TEXT, status TEXT);
      CREATE TABLE crawl_queue (id INTEGER PRIMARY KEY, status TEXT);
    `);
    queries = createMultiModalCrawlQueries(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  test('getPendingAnalysisCount counts pending analyses for a host', () => {
    db.exec(`
      INSERT INTO urls (id, url, host) VALUES
        (1, 'https://example.com/a', 'example.com'),
        (2, 'https://example.com/b', 'example.com'),
        (3, 'https://other.com/a', 'other.com');

      INSERT INTO http_responses (id, url_id) VALUES (10, 1), (11, 2), (12, 3);
      INSERT INTO content_storage (id, http_response_id) VALUES (20, 10), (21, 11), (22, 12);
      INSERT INTO content_analysis (id, content_id, analysis_json, analysis_version, confidence_score) VALUES
        (30, 20, NULL, 1, 0.2),
        (31, 21, '{}', 0, 0.9),
        (32, 22, '{}', 1, 0.9);
    `);

    const count = queries.getPendingAnalysisCount('example.com');
    expect(count).toBe(2);
  });

  test('getPatternHubCandidates returns candidates with verification flag', () => {
    db.exec(`
      INSERT INTO urls (id, url, host) VALUES
        (1, 'https://example.com/world/europe/', 'example.com'),
        (2, 'https://example.com/region/asia/', 'example.com'),
        (3, 'https://example.com/news/tech/', 'example.com'),
        (4, 'https://example.com/story/123', 'example.com');

      INSERT INTO links (id, src_url_id, dst_url_id) VALUES
        (1, 1, 100), (2, 1, 101), (3, 1, 102), (4, 1, 103), (5, 1, 104),
        (6, 2, 105), (7, 2, 106), (8, 2, 107), (9, 2, 108), (10, 2, 109),
        (11, 3, 110), (12, 3, 111), (13, 3, 112);

      INSERT INTO place_page_mappings (id, url, status) VALUES
        (1, 'https://example.com/world/europe/', 'verified');
    `);

    const rows = queries.getPatternHubCandidates('example.com');
    const urls = rows.map(r => r.url);
    expect(urls).toContain('https://example.com/world/europe/');
    expect(urls).toContain('https://example.com/region/asia/');
    expect(urls).not.toContain('https://example.com/news/tech/');
    expect(urls).not.toContain('https://example.com/story/123');

    const verified = rows.find(r => r.url.includes('world/europe'));
    const unverified = rows.find(r => r.url.includes('region/asia'));
    expect(verified.is_verified).toBe(1);
    expect(unverified.is_verified).toBe(0);
  });

  test('getReanalysisUrls returns low-confidence or stale versions', () => {
    db.exec(`
      INSERT INTO urls (id, url, host) VALUES
        (1, 'https://example.com/a', 'example.com'),
        (2, 'https://example.com/b', 'example.com'),
        (3, 'https://example.com/c', 'example.com');

      INSERT INTO http_responses (id, url_id) VALUES (10, 1), (11, 2), (12, 3);
      INSERT INTO content_storage (id, http_response_id) VALUES (20, 10), (21, 11), (22, 12);
      INSERT INTO content_analysis (id, content_id, analysis_json, analysis_version, confidence_score) VALUES
        (30, 20, '{}', 2, 0.95),
        (31, 21, '{}', 1, 0.9),
        (32, 22, '{}', 2, 0.4);
    `);

    const urls = queries.getReanalysisUrls('example.com', { minConfidence: 0.6, limit: 10 });
    expect(urls).toEqual([
      'https://example.com/c',
      'https://example.com/b'
    ]);
  });

  test('getQueueDepth counts pending queue items', () => {
    db.exec(`
      INSERT INTO crawl_queue (id, status) VALUES
        (1, 'pending'),
        (2, 'pending'),
        (3, 'done');
    `);

    const count = queries.getQueueDepth();
    expect(count).toBe(2);
  });
});
