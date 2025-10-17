#!/usr/bin/env node
/**
 * Seed topic_keywords and crawl_skip_terms tables with default English data.
 * 
 * This is a one-time setup script to populate the database with the topic
 * keywords and skip terms that were previously hardcoded in source files.
 * 
 * Usage:
 *   node scripts/seed-topics-and-skip-terms.js [--force]
 * 
 * Options:
 *   --force    Delete existing entries and re-seed from scratch
 */

const path = require('path');
const { ensureDatabase } = require('../src/db/sqlite');
const { seedDefaultTopics } = require('../src/db/sqlite/queries/topicKeywords');
const { seedDefaultSkipTerms } = require('../src/db/sqlite/queries/crawlSkipTerms');

const args = process.argv.slice(2);
const force = args.includes('--force');

const dbPath = path.join(__dirname, '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('Seeding topic keywords and crawl skip terms...');
console.log('Database:', dbPath);
console.log('Force mode:', force ? 'YES (will delete existing)' : 'NO (upsert only)');
console.log();

try {
  // Check current counts
  const topicCount = db.prepare('SELECT COUNT(*) as count FROM topic_keywords').get().count;
  const skipCount = db.prepare('SELECT COUNT(*) as count FROM crawl_skip_terms').get().count;
  
  console.log(`Current database state:`);
  console.log(`  - Topic keywords: ${topicCount} entries`);
  console.log(`  - Skip terms: ${skipCount} entries`);
  console.log();
  
  if (force && (topicCount > 0 || skipCount > 0)) {
    console.log('Force mode: Deleting existing entries...');
    db.prepare('DELETE FROM topic_keywords WHERE source = ?').run('system-default');
    db.prepare('DELETE FROM crawl_skip_terms WHERE source = ?').run('system-default');
    console.log('✓ Existing system-default entries deleted');
    console.log();
  }
  
  // Seed topics
  console.log('Seeding topic keywords (English)...');
  seedDefaultTopics(db, 'system-default');
  const newTopicCount = db.prepare('SELECT COUNT(*) as count FROM topic_keywords').get().count;
  console.log(`✓ Topic keywords seeded: ${newTopicCount} total entries`);
  console.log();
  
  // Seed skip terms
  console.log('Seeding crawl skip terms (English)...');
  seedDefaultSkipTerms(db, 'system-default');
  const newSkipCount = db.prepare('SELECT COUNT(*) as count FROM crawl_skip_terms').get().count;
  console.log(`✓ Skip terms seeded: ${newSkipCount} total entries`);
  console.log();
  
  // Show breakdown
  console.log('Topic breakdown:');
  const topicBreakdown = db.prepare(`
    SELECT topic, COUNT(*) as term_count
    FROM topic_keywords
    WHERE source = 'system-default'
    GROUP BY topic
    ORDER BY term_count DESC
  `).all();
  
  for (const row of topicBreakdown) {
    console.log(`  - ${row.topic}: ${row.term_count} terms`);
  }
  console.log();
  
  console.log('Skip terms breakdown:');
  const skipBreakdown = db.prepare(`
    SELECT reason, COUNT(*) as term_count
    FROM crawl_skip_terms
    WHERE source = 'system-default'
    GROUP BY reason
    ORDER BY term_count DESC
  `).all();
  
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
  
} catch (error) {
  console.error('✗ Seeding failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
