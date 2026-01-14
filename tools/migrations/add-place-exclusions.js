#!/usr/bin/env node
/**
 * Migration: Add place_exclusions table
 * 
 * This table stores patterns that should exclude a place name from being
 * recognized as a geographic entity, such as:
 * - Organization names: "Texas Instruments", "Boston Consulting"
 * - Personal names: "Paris Hilton", "Georgia O'Keeffe"
 * - Product names: "Dodge Dakota"
 * 
 * Safe to run multiple times (idempotent).
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { CliFormatter } = require('../../src/shared/utils/CliFormatter');

const fmt = new CliFormatter();
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

// Seed data for common exclusion patterns
const SEED_EXCLUSIONS = [
  // Technology companies
  { trigger_word: 'texas', exclusion_phrase: 'texas instruments', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'boston', exclusion_phrase: 'boston dynamics', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'boston', exclusion_phrase: 'boston consulting', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'boston', exclusion_phrase: 'boston scientific', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'silicon', exclusion_phrase: 'silicon valley bank', exclusion_type: 'organization', source: 'builtin' },
  
  // Media organizations
  { trigger_word: 'new york', exclusion_phrase: 'new york times', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'new york', exclusion_phrase: 'new york post', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'washington', exclusion_phrase: 'washington post', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'los angeles', exclusion_phrase: 'los angeles times', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'chicago', exclusion_phrase: 'chicago tribune', exclusion_type: 'organization', source: 'builtin' },
  
  // Sports teams (samples - the full list is in PlaceContextFilter.js)
  { trigger_word: 'chicago', exclusion_phrase: 'chicago bulls', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'los angeles', exclusion_phrase: 'los angeles lakers', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'manchester', exclusion_phrase: 'manchester united', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'manchester', exclusion_phrase: 'manchester city', exclusion_type: 'organization', source: 'builtin' },
  
  // Personal names with place names
  { trigger_word: 'paris', exclusion_phrase: 'paris hilton', exclusion_type: 'personal_name', source: 'builtin' },
  { trigger_word: 'georgia', exclusion_phrase: "georgia o'keeffe", exclusion_type: 'personal_name', source: 'builtin' },
  { trigger_word: 'brooklyn', exclusion_phrase: 'brooklyn beckham', exclusion_type: 'personal_name', source: 'builtin' },
  { trigger_word: 'jordan', exclusion_phrase: 'michael jordan', exclusion_type: 'personal_name', source: 'builtin' },
  { trigger_word: 'phoenix', exclusion_phrase: 'joaquin phoenix', exclusion_type: 'personal_name', source: 'builtin' },
  
  // Airlines
  { trigger_word: 'american', exclusion_phrase: 'american airlines', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'united', exclusion_phrase: 'united airlines', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'delta', exclusion_phrase: 'delta airlines', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'british', exclusion_phrase: 'british airways', exclusion_type: 'organization', source: 'builtin' },
  
  // Financial
  { trigger_word: 'goldman', exclusion_phrase: 'goldman sachs', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'morgan', exclusion_phrase: 'morgan stanley', exclusion_type: 'organization', source: 'builtin' },
  { trigger_word: 'morgan', exclusion_phrase: 'jp morgan', exclusion_type: 'organization', source: 'builtin' },
];

function createTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_word TEXT NOT NULL,
      exclusion_phrase TEXT NOT NULL,
      exclusion_type TEXT NOT NULL DEFAULT 'organization',
      source TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      
      UNIQUE(trigger_word, exclusion_phrase)
    );
    
    CREATE INDEX IF NOT EXISTS idx_place_exclusions_trigger 
    ON place_exclusions(trigger_word);
    
    CREATE INDEX IF NOT EXISTS idx_place_exclusions_active 
    ON place_exclusions(active);
    
    CREATE INDEX IF NOT EXISTS idx_place_exclusions_type 
    ON place_exclusions(exclusion_type);
  `);
}

function seedData(db) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO place_exclusions 
    (trigger_word, exclusion_phrase, exclusion_type, source)
    VALUES (?, ?, ?, ?)
  `);
  
  let inserted = 0;
  for (const row of SEED_EXCLUSIONS) {
    const result = insertStmt.run(
      row.trigger_word.toLowerCase(),
      row.exclusion_phrase.toLowerCase(),
      row.exclusion_type,
      row.source
    );
    if (result.changes > 0) inserted++;
  }
  
  return inserted;
}

function run(dbPath = DEFAULT_DB_PATH) {
  fmt.header('Place Exclusions Migration');
  fmt.stat('Database', dbPath);
  
  const db = new Database(dbPath);
  
  try {
    // Check if table already exists
    const existing = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='place_exclusions'
    `).get();
    
    if (existing) {
      const count = db.prepare('SELECT COUNT(*) as cnt FROM place_exclusions').get();
      fmt.stat('Status', `Table exists with ${count.cnt} rows`);
      
      // Still seed any new data
      const seeded = seedData(db);
      if (seeded > 0) {
        fmt.stat('New rows seeded', seeded);
      }
    } else {
      createTable(db);
      fmt.stat('Status', 'Table created');
      
      const seeded = seedData(db);
      fmt.stat('Rows seeded', seeded);
    }
    
    // Show sample data
    const sample = db.prepare(`
      SELECT trigger_word, exclusion_phrase, exclusion_type 
      FROM place_exclusions 
      LIMIT 5
    `).all();
    
    fmt.section('Sample Data');
    for (const row of sample) {
      console.log(`  ${row.trigger_word}: "${row.exclusion_phrase}" (${row.exclusion_type})`);
    }
    
    fmt.success('Migration complete');
  } finally {
    db.close();
  }
}

// CLI
if (require.main === module) {
  const dbPath = process.argv[2] || DEFAULT_DB_PATH;
  run(dbPath);
}

module.exports = { run, createTable, seedData, SEED_EXCLUSIONS };

