#!/usr/bin/env node

/**
 * Quick test of article-place matching functionality
 */

const { ArticlePlaceMatcher } = require('./src/matching/ArticlePlaceMatcher');
const { ensureDatabase } = require('./src/db/sqlite/v1');

async function testPlaceMatching() {
  console.log('Testing Article-Place Matching...');

  // Get database connection
  const dbPath = process.env.DB_PATH || './data/news.db';
  const db = ensureDatabase(dbPath);

  // Create the article_place_relations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS article_place_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      place_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('primary', 'secondary', 'mentioned', 'affected', 'origin')),
      confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0),
      matching_rule_level INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES http_responses(id) ON DELETE CASCADE,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
      UNIQUE(article_id, place_id, matching_rule_level)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_article_place_relations_article ON article_place_relations(article_id);
    CREATE INDEX IF NOT EXISTS idx_article_place_relations_place ON article_place_relations(place_id);
    CREATE INDEX IF NOT EXISTS idx_article_place_relations_confidence ON article_place_relations(confidence DESC);
  `);

  // Create matcher with mock gazetteer data
  const matcher = new ArticlePlaceMatcher({
    db,
    gazetteerApi: {
      baseUrl: 'http://localhost:3000',
      // Mock places data for testing
      mockPlaces: [
        { id: 1, canonicalName: 'London', names: [{ name: 'London' }, { name: 'Greater London' }] },
        { id: 2, canonicalName: 'England', names: [{ name: 'England' }, { name: 'UK' }, { name: 'United Kingdom' }] },
        { id: 3, canonicalName: 'Paris', names: [{ name: 'Paris' }, { name: 'Paris, France' }] }
      ]
    }
  });

  // Create a test article with place mentions for testing
  const testTitle = 'London Weather and Paris News';
  const testContent = 'The weather in London today is sunny. London is the capital of England. Meanwhile, Paris is experiencing rain.';
  const testArticleId = 999;

  // Insert test data - need http_responses record first
  // First, we need a URL record
  db.prepare(`
    INSERT OR REPLACE INTO urls (id, url, created_at)
    VALUES (?, ?, datetime('now'))
  `).run(testArticleId, 'https://example.com/test-article');

  db.prepare(`
    INSERT OR REPLACE INTO http_responses (id, url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded)
    VALUES (?, ?, datetime('now'), datetime('now'), ?, ?, ?)
  `).run(testArticleId, testArticleId, 200, 'text/html', 1000);

  db.prepare(`
    INSERT OR REPLACE INTO content_analysis (id, content_id, title, word_count, language, analyzed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(testArticleId, testArticleId, testTitle, 20, 'en');

  db.prepare(`
    INSERT OR REPLACE INTO content_storage (id, http_response_id, storage_type, content_blob, uncompressed_size, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(testArticleId, testArticleId, 'db_inline', `<html><body><h1>${testTitle}</h1><p>${testContent}</p></body></html>`, 100);

  try {
    // First, let's check what data we get for the article
    const articleData = db.prepare(`
      SELECT
        hr.id,
        ca.title,
        cs.content_blob as html_content,
        ca.analysis_json
      FROM http_responses hr
      LEFT JOIN content_analysis ca ON hr.id = ca.content_id
      LEFT JOIN content_storage cs ON hr.id = cs.http_response_id
      WHERE hr.id = ?
    `).get(testArticleId);

    console.log('Article data:', {
      id: articleData?.id,
      title: articleData?.title,
      hasHtml: !!articleData?.html_content,
      htmlLength: articleData?.html_content?.length
    });

    // Test matching
    const matches = await matcher.matchArticleToPlaces(testArticleId, 1);

    console.log('\nMatching Results:');
    console.log(`Found ${matches.length} place matches:`);

    matches.forEach((match, index) => {
      console.log(`${index + 1}. Place ID: ${match.place_id} (confidence: ${match.confidence})`);
      console.log(`   Rule: ${match.matching_rule_level}, Type: ${match.relation_type}`);
      console.log(`   Evidence: ${match.evidence.substring(0, 100)}...`);
    });

    // Test database storage
    if (matches.length > 0) {
      console.log('\nTesting database storage...');
      const storedCount = await matcher.storeArticlePlaces(matches);
      console.log(`Stored ${storedCount} matches in database`);

      const stored = matcher.getArticlePlaces(testArticleId);
      console.log(`Retrieved ${stored.length} matches from database`);
    }

    console.log('\n✅ Place matching test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  testPlaceMatching().catch(console.error);
}

module.exports = { testPlaceMatching };