#!/usr/bin/env node
/**
 * Seed topic_keywords and crawl_skip_terms tables with default English data.
 * 
 * This is a one-time setup script to populate the database with the topic
 * keywords and skip terms that were previously hardcoded in source files.
 * 
 * Usage:
 *   node tools/migrations/seed-topics-and-skip-terms.js [--force]
 * 
 * Options:
 *   --force    Delete existing entries and re-seed from scratch
 */

const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const args = process.argv.slice(2);
const force = args.includes('--force');

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node tools/migrations/seed-topics-and-skip-terms.js [--force]');
  console.log();
  console.log('Options:');
  console.log('  --force    Delete existing system-default entries and re-seed from scratch');
  process.exit(0);
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
  const db = openNewsCrawlerDb(dbPath);

  const seedDefaultTopics = getDbApi('seedDefaultTopics');
  const seedDefaultSkipTerms = getDbApi('seedDefaultSkipTerms');
  const countTopicKeywords = getDbApi('countTopicKeywords');
  const countCrawlSkipTerms = getDbApi('countCrawlSkipTerms');
  const deleteTopicKeywordsBySource = getDbApi('deleteTopicKeywordsBySource');
  const deleteCrawlSkipTermsBySource = getDbApi('deleteCrawlSkipTermsBySource');
  const listTopicKeywordBreakdownBySource = getDbApi('listTopicKeywordBreakdownBySource');
  const listCrawlSkipTermBreakdownBySource = getDbApi('listCrawlSkipTermBreakdownBySource');

  console.log('Seeding topic keywords and crawl skip terms...');
  console.log('Database:', dbPath);
  console.log('Force mode:', force ? 'YES (will delete existing)' : 'NO (upsert only)');
  console.log();

  try {
    // Check current counts
    const topicCount = countTopicKeywords(db);
    const skipCount = countCrawlSkipTerms(db);

    console.log(`Current database state:`);
    console.log(`  - Topic keywords: ${topicCount} entries`);
    console.log(`  - Skip terms: ${skipCount} entries`);
    console.log();

    if (force && (topicCount > 0 || skipCount > 0)) {
      console.log('Force mode: Deleting existing entries...');
      deleteTopicKeywordsBySource(db, 'system-default');
      deleteCrawlSkipTermsBySource(db, 'system-default');
      console.log('✓ Existing system-default entries deleted');
      console.log();
    }

    // Seed topics
    console.log('Seeding topic keywords (English)...');
    seedDefaultTopics(db, 'system-default');
    const newTopicCount = countTopicKeywords(db);
    console.log(`✓ Topic keywords seeded: ${newTopicCount} total entries`);
    console.log();

    // Seed skip terms
    console.log('Seeding crawl skip terms (English)...');
    seedDefaultSkipTerms(db, 'system-default');
    const newSkipCount = countCrawlSkipTerms(db);
    console.log(`✓ Skip terms seeded: ${newSkipCount} total entries`);
    console.log();

    // Show breakdown
    console.log('Topic breakdown:');
    const topicBreakdown = listTopicKeywordBreakdownBySource(db, 'system-default');

    for (const row of topicBreakdown) {
      console.log(`  - ${row.topic}: ${row.term_count} terms`);
    }
    console.log();

    console.log('Skip terms breakdown:');
    const skipBreakdown = listCrawlSkipTermBreakdownBySource(db, 'system-default');

    for (const row of skipBreakdown) {
      console.log(`  - ${row.reason}: ${row.term_count} terms`);
    }
    console.log();

    console.log('✓ Seeding complete!');
    console.log();
    console.log('Next steps:');
    console.log('  1. Run node tools/intelligent-crawl.js to test topic detection');
    console.log('  2. Add more languages by inserting into topic_keywords with different lang codes');
    console.log('  3. Customize topics by adding/removing entries in the database');

  } finally {
    await closeDb(db);
  }
}

main().catch(error => {
  console.error('✗ Seeding failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
