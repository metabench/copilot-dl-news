const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');
const { ensureDb } = require('../../src/db/sqlite/ensureDb');

const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
const dbPath = path.join(projectRoot, 'data', 'news.db');

const db = ensureDb(dbPath);

try {
  // Test simple query first - count URLs in normalized schema
  const simple = db.prepare(`SELECT COUNT(*) as cnt FROM urls WHERE url LIKE 'http%'`).get();
  console.log('Simple count (urls):', simple);

  // Test with LIMIT - count HTTP responses
  const withLimit = db.prepare(`
    SELECT COUNT(*) as cnt
      FROM urls u
      LEFT JOIN http_responses hr ON hr.url_id = u.id
     WHERE u.url LIKE 'http%'
     LIMIT ?
  `).all(10);
  console.log('With LIMIT 10 (http_responses):', withLimit);

  // Test the actual query structure using normalized schema
  const actual = db.prepare(`
    SELECT u.url,
           ca.title,
           ca.section,
           u.host,
           ca.analysis_json as analysis,
           ca.classification,
           ca.word_count,
           hr.fetched_at as last_fetch_at,
           hr.fetched_at as crawled_at
      FROM urls u
      LEFT JOIN http_responses hr ON hr.url_id = u.id
      LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
      LEFT JOIN content_analysis ca ON ca.content_id = cs.id
     WHERE u.url LIKE 'http%'
     ORDER BY COALESCE(hr.fetched_at, hr.fetched_at) DESC
     LIMIT ?
  `).all(10);
  console.log('Actual query result count:', actual.length);
  if (actual.length > 0) {
    console.log('First row:', JSON.stringify(actual[0], null, 2));
  }
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
} finally {
  db.close();
}
