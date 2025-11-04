/**
 * Database test helpers
 */

const { ensureDb } = require('../db/sqlite/v1/ensureDb');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Create a temporary database file path
 * @param {string} prefix - Optional prefix for the filename
 * @returns {string} Path to temporary database file
 */
function createTempDbPath(prefix = 'test') {
  const tmpDir = path.join(os.tmpdir(), 'copilot-dl-news-tests');
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return path.join(tmpDir, `${prefix}-${unique}.db`);
}

/**
 * Create and initialize a temporary database
 * @param {string} prefix - Optional prefix for the filename
 * @returns {Database} Initialized better-sqlite3 database
 */
function createTempDb(prefix = 'test') {
  const dbPath = createTempDbPath(prefix);
  return ensureDb(dbPath);
}

/**
 * Seed test database with basic data
 * @param {Database} db - Database to seed
 */
function seedTestData(db) {
  // Insert some basic test data into normalized schema
  db.prepare(`
    INSERT OR IGNORE INTO urls (url, created_at, last_seen_at) VALUES
    ('http://example.com', datetime('now'), datetime('now')),
    ('http://test.com', datetime('now'), datetime('now')),
    ('http://news.com', datetime('now'), datetime('now')),
    ('http://blog.com', datetime('now'), datetime('now')),
    ('http://site.com', datetime('now'), datetime('now'))
  `).run();

  // Insert HTTP responses for the URLs
  db.prepare(`
    INSERT OR IGNORE INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type)
    SELECT u.id, datetime('now'), datetime('now'), 200, 'text/html'
    FROM urls u
  `).run();

  // Insert content storage for the responses
  db.prepare(`
    INSERT OR IGNORE INTO content_storage (http_response_id, storage_type, content_blob, uncompressed_size)
    SELECT hr.id, 'db_inline',
           CASE
             WHEN u.url = 'http://example.com' THEN 'Test content for example.com'
             WHEN u.url = 'http://test.com' THEN 'Test content for test.com'
             WHEN u.url = 'http://news.com' THEN 'Test content for news.com'
           END,
           LENGTH(CASE
             WHEN u.url = 'http://example.com' THEN 'Test content for example.com'
             WHEN u.url = 'http://test.com' THEN 'Test content for test.com'
             WHEN u.url = 'http://news.com' THEN 'Test content for news.com'
           END)
    FROM urls u
    INNER JOIN http_responses hr ON hr.url_id = u.id
    WHERE u.url IN ('http://example.com', 'http://test.com', 'http://news.com')
  `).run();

  // Insert content analysis
  db.prepare(`
    INSERT OR IGNORE INTO content_analysis (content_id, classification, analyzed_at)
    SELECT cs.id, 'article', datetime('now')
    FROM content_storage cs
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO places (kind, source)
    SELECT 'city', 'test'
    FROM urls
    LIMIT 2
  `).run();

  // Insert names for the places we just created
  db.prepare(`
    INSERT OR IGNORE INTO place_names (place_id, name, normalized, is_preferred)
    SELECT p.id, 'Test Place ' || u.id, LOWER('Test Place ' || u.id), 1
    FROM places p
    JOIN urls u ON u.id <= 2
    WHERE p.kind = 'city' AND p.source = 'test'
    LIMIT 2
  `).run();

  // Update canonical_name_id to point to the names we just created
  db.prepare(`
    UPDATE places
    SET canonical_name_id = (
      SELECT pn.id
      FROM place_names pn
      WHERE pn.place_id = places.id
      ORDER BY pn.id
      LIMIT 1
    )
    WHERE kind = 'city' AND source = 'test' AND canonical_name_id IS NULL
  `).run();
}


module.exports = {
  createTempDbPath,
  createTempDb,
  seedTestData
};