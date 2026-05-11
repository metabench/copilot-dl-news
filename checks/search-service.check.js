'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');
/**
 * Search Service Check Script
 * 
 * Quick validation of FTS5 search functionality.
 * Run: node checks/search-service.check.js
 * 
 * Prerequisites:
 * - Migration applied: src/db/sqlite/v1/migrations/add_fts5_article_search.js
 * - Some articles with body_text populated
 */
const path = require('path');
const { SearchService } = require('../src/search/SearchService');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

console.log('=== Search Service Check ===\n');

// Check if database exists
const fs = require('fs');
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database not found:', DB_PATH);
  console.log('   Create the database first or run a crawl.');
  process.exit(1);
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

let db;
try {
  db = openNewsCrawlerDb(DB_PATH, { readonly: true });
  console.log('✅ Database opened:', DB_PATH);
} catch (err) {
  console.error('❌ Failed to open database:', err.message);
  process.exit(1);
}

const getSearchSnapshot = getDbApi('getSqliteArticleSearchCheckSnapshot');
const getSampleBodyText = getDbApi('getSqliteArticleSearchSampleBodyText');
let snapshot;
try {
  snapshot = getSearchSnapshot(db);

  if (!snapshot.ftsTableExists) {
    console.log('⚠️  FTS5 table not found - migration may not be applied');
    console.log('   Run: node src/db/sqlite/v1/migrations/add_fts5_article_search.js up');
    db.close();
    process.exit(0);
  }
  console.log('✅ FTS5 table exists: articles_fts');
} catch (err) {
  console.error('❌ Error checking FTS5 table:', err.message);
  db.close();
  process.exit(1);
}

// Check content_analysis schema
try {
  if (snapshot.missingContentAnalysisColumns.length > 0) {
    console.log('⚠️  Missing columns in content_analysis:', snapshot.missingContentAnalysisColumns.join(', '));
    console.log('   Run: node src/db/sqlite/v1/migrations/add_fts5_article_search.js up');
  } else {
    console.log('✅ content_analysis has required columns');
  }
} catch (err) {
  console.error('❌ Error checking schema:', err.message);
}

// Check trigger count
try {
  console.log(`✅ FTS triggers found: ${snapshot.triggers.length} (expected: 3)`);
  snapshot.triggers.forEach(t => console.log(`   - ${t.name}`));
} catch (err) {
  console.error('❌ Error checking triggers:', err.message);
}

// Check indexed article count
try {
  console.log(`\n📊 Index Statistics:`);
  console.log(`   FTS indexed rows: ${snapshot.ftsIndexedRows}`);
  console.log(`   Articles with body_text: ${snapshot.articlesWithBodyText}`);

  if (snapshot.ftsIndexedRows < snapshot.articlesWithBodyText) {
    console.log('   ⚠️  Some articles may need reindexing');
    console.log('   Run: node tools/fts-backfill.js');
  }
} catch (err) {
  console.error('❌ Error checking index counts:', err.message);
}

// Try a sample search if we have data
try {
  const searchService = new SearchService(db);
  
  // Get a sample word from an indexed article
  const sample = getSampleBodyText(db);
  
  if (sample && sample.body_text) {
    // Extract first meaningful word
    const words = sample.body_text.split(/\s+/).filter(w => w.length > 4);
    const testWord = words[0] || 'the';
    
    console.log(`\n🔍 Sample Search Test:`);
    console.log(`   Query: "${testWord}"`);
    
    const startTime = Date.now();
    const result = searchService.search(testWord, { limit: 5 });
    const duration = Date.now() - startTime;
    
    if (result.success) {
      console.log(`   ✅ Search succeeded in ${duration}ms`);
      console.log(`   Results: ${result.pagination.total} total, showing ${result.results.length}`);
      
      if (result.results.length > 0) {
        console.log(`   First result: "${result.results[0].title?.substring(0, 60)}..."`);
      }
    } else {
      console.log(`   ❌ Search failed: ${result.error}`);
    }
  } else {
    console.log('\n⚠️  No articles with body_text to test search');
    console.log('   Run: node tools/fts-backfill.js');
  }
} catch (err) {
  console.error('❌ Error running sample search:', err.message);
  console.error('   ', err.stack?.split('\n')[1]);
}

// Clean up
db.close();

console.log('\n=== Check Complete ===');
