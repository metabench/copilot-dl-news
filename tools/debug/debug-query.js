const path = require('path');
const { findProjectRoot } = require('../../src/utils/project-root');
const { ensureDb } = require('../../src/db/sqlite/ensureDb');

const projectRoot = findProjectRoot(path.join(__dirname, '..', '..'));
const dbPath = path.join(projectRoot, 'data', 'news.db');

const db = ensureDb(dbPath);

try {
  // Test simple query first
  const simple = db.prepare(`SELECT COUNT(*) as cnt FROM articles WHERE url LIKE 'http%'`).get();
  console.log('Simple count:', simple);

  // Test with LIMIT
  const withLimit = db.prepare(`
    SELECT COUNT(*) as cnt 
      FROM articles a
      LEFT JOIN latest_fetch lf ON lf.url = a.url
     WHERE a.url LIKE 'http%'
     LIMIT ?
  `).all(10);
  console.log('With LIMIT 10:', withLimit);

  // Test the actual query structure (no host filter)
  const actual = db.prepare(`
    SELECT a.url,
           a.title,
           a.section,
           a.host,
           a.analysis,
           lf.classification,
           lf.word_count AS fetch_word_count,
           lf.ts AS last_fetch_at,
           a.crawled_at
      FROM articles a
      LEFT JOIN latest_fetch lf ON lf.url = a.url
     WHERE a.url LIKE 'http%'
     ORDER BY COALESCE(lf.ts, a.crawled_at) DESC
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
