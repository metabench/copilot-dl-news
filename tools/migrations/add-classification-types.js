#!/usr/bin/env node
/**
 * Migration: Add classification_types lookup table
 * 
 * This migration:
 * 1. Creates the classification_types table
 * 2. Seeds it with known classification values (from classificationEmoji.js)
 * 3. Populates any additional classifications found in content_analysis
 * 
 * Safe to run multiple times (idempotent).
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { CliFormatter } = require('../../src/utils/CliFormatter');

const fmt = new CliFormatter();
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');

// Seed data - known classifications with their metadata
// This matches the CLASSIFICATION_EMOJI_MAP from classificationEmoji.js
const SEED_CLASSIFICATIONS = [
  // Content Types
  { name: 'article', display_name: 'Article', emoji: '📰', category: 'content', sort_order: 1, description: 'News article, blog post, or story content' },
  { name: 'nav', display_name: 'Navigation', emoji: '🧭', category: 'content', sort_order: 2, description: 'Navigation or index page' },
  { name: 'navigation', display_name: 'Navigation', emoji: '🧭', category: 'content', sort_order: 3, description: 'Navigation or index page (alias)' },
  
  // Hub Types
  { name: 'hub', display_name: 'Hub', emoji: '🔗', category: 'hub', sort_order: 10, description: 'Generic hub page with links to other content' },
  { name: 'place-hub', display_name: 'Place Hub', emoji: '📍', category: 'hub', sort_order: 11, description: 'Hub page for a geographic place' },
  { name: 'place-place-hub', display_name: 'Place Place Hub', emoji: '📍📍', category: 'hub', sort_order: 12, description: 'Hub for nested places (e.g., city within country)' },
  { name: 'topic-hub', display_name: 'Topic Hub', emoji: '🏷️', category: 'hub', sort_order: 13, description: 'Hub page for a topic or category' },
  { name: 'place-topic-hub', display_name: 'Place Topic Hub', emoji: '📍🏷️', category: 'hub', sort_order: 14, description: 'Topic hub within a place (e.g., /uk/sports)' },
  { name: 'place-place-topic-hub', display_name: 'Place Place Topic Hub', emoji: '📍📍🏷️', category: 'hub', sort_order: 15, description: 'Topic hub nested within places' },
  
  // Special Types
  { name: 'error', display_name: 'Error', emoji: '⚠️', category: 'special', sort_order: 20, description: 'Error page (4xx, 5xx responses)' },
  { name: 'redirect', display_name: 'Redirect', emoji: '↪️', category: 'special', sort_order: 21, description: 'Redirect response' },
  { name: 'api', display_name: 'API', emoji: '🔌', category: 'special', sort_order: 22, description: 'API endpoint response' },
  { name: 'api-response', display_name: 'API Response', emoji: '🔌', category: 'special', sort_order: 23, description: 'API endpoint response (alias)' },
  
  // Status Types
  { name: 'unknown', display_name: 'Unknown', emoji: '❓', category: 'status', sort_order: 30, description: 'Unknown or unclassified content' },
  { name: 'unclassified', display_name: 'Unclassified', emoji: '❓', category: 'status', sort_order: 31, description: 'Content not yet classified' },
  { name: 'article-screened', display_name: 'Article Screened', emoji: '📰✓', category: 'content', sort_order: 4, description: 'Article that passed screening' },
  
  // Index/Listing Types
  { name: 'index', display_name: 'Index', emoji: '📋', category: 'content', sort_order: 5, description: 'Index page' },
  { name: 'listing', display_name: 'Listing', emoji: '📋', category: 'content', sort_order: 6, description: 'Listing page' },
  { name: 'category', display_name: 'Category', emoji: '📁', category: 'content', sort_order: 7, description: 'Category page' },
  
  // Media Types
  { name: 'image', display_name: 'Image', emoji: '🖼️', category: 'media', sort_order: 40, description: 'Image content' },
  { name: 'video', display_name: 'Video', emoji: '🎬', category: 'media', sort_order: 41, description: 'Video content' },
  { name: 'audio', display_name: 'Audio', emoji: '🎵', category: 'media', sort_order: 42, description: 'Audio content' },
  { name: 'document', display_name: 'Document', emoji: '📄', category: 'media', sort_order: 43, description: 'Generic document' },
  { name: 'pdf', display_name: 'PDF', emoji: '📕', category: 'media', sort_order: 44, description: 'PDF document' }
];

function createTable(db) {
  fmt.info('Creating classification_types table...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS classification_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      category TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  
  fmt.success('Table created (or already exists)');
}

function seedClassifications(db) {
  fmt.info('Seeding known classification types...');
  
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO classification_types 
    (name, display_name, emoji, description, category, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  let skipped = 0;
  
  const insertMany = db.transaction(() => {
    for (const classification of SEED_CLASSIFICATIONS) {
      const result = insertStmt.run(
        classification.name,
        classification.display_name,
        classification.emoji,
        classification.description,
        classification.category,
        classification.sort_order
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  });
  
  insertMany();
  
  fmt.stat('Inserted', inserted, 'number');
  fmt.stat('Skipped (already exist)', skipped, 'number');
}

function discoverAdditionalClassifications(db) {
  fmt.info('Discovering additional classifications from content_analysis...');
  
  // Find any classifications in content_analysis not already in classification_types
  const newClassifications = db.prepare(`
    SELECT DISTINCT ca.classification
    FROM content_analysis ca
    WHERE ca.classification IS NOT NULL
      AND ca.classification != ''
      AND NOT EXISTS (
        SELECT 1 FROM classification_types ct 
        WHERE ct.name = ca.classification
      )
  `).all();
  
  if (newClassifications.length === 0) {
    fmt.info('No additional classifications found');
    return 0;
  }
  
  fmt.stat('New classifications found', newClassifications.length, 'number');
  
  // Insert discovered classifications with default values
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO classification_types 
    (name, display_name, emoji, description, category, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  
  const insertMany = db.transaction(() => {
    for (const row of newClassifications) {
      const name = row.classification;
      // Generate display name from the classification name
      const displayName = name
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      const result = insertStmt.run(
        name,
        displayName,
        '📄', // Default emoji
        `Auto-discovered classification: ${name}`,
        'discovered',
        100 // High sort order for discovered types
      );
      
      if (result.changes > 0) {
        fmt.info(`  Added: ${name} → ${displayName}`);
        inserted++;
      }
    }
  });
  
  insertMany();
  
  return inserted;
}

function showStats(db) {
  fmt.section('Classification Types Summary');
  
  const stats = db.prepare(`
    SELECT 
      category,
      COUNT(*) as count
    FROM classification_types
    GROUP BY category
    ORDER BY MIN(sort_order)
  `).all();
  
  const total = db.prepare('SELECT COUNT(*) as count FROM classification_types').get();
  
  fmt.stat('Total classification types', total.count, 'number');
  
  for (const row of stats) {
    fmt.stat(`  ${row.category || 'uncategorized'}`, row.count, 'number');
  }
  
  // Show usage counts from content_analysis
  fmt.section('Usage in content_analysis');
  
  const usage = db.prepare(`
    SELECT 
      ct.name,
      ct.emoji,
      ct.display_name,
      COUNT(ca.id) as usage_count
    FROM classification_types ct
    LEFT JOIN content_analysis ca ON ca.classification = ct.name
    GROUP BY ct.id
    HAVING usage_count > 0
    ORDER BY usage_count DESC
    LIMIT 10
  `).all();
  
  if (usage.length === 0) {
    fmt.info('No classifications currently in use');
  } else {
    for (const row of usage) {
      fmt.info(`  ${row.emoji || '📄'} ${row.display_name}: ${row.usage_count.toLocaleString()} documents`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const dbPath = args.includes('--db') 
    ? args[args.indexOf('--db') + 1] 
    : DEFAULT_DB_PATH;
  const dryRun = args.includes('--dry-run');
  
  fmt.header('Classification Types Migration');
  fmt.settings(`Database: ${dbPath}`);
  
  if (dryRun) {
    fmt.info('DRY RUN - no changes will be made');
  }
  
  let db;
  try {
    db = new Database(dbPath);
    
    if (dryRun) {
      // In dry run, just show what would be done
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='classification_types'"
      ).get();
      
      if (tableExists) {
        fmt.info('Table already exists');
        showStats(db);
      } else {
        fmt.info('Table would be created');
        fmt.info(`${SEED_CLASSIFICATIONS.length} seed classifications would be inserted`);
      }
    } else {
      // Run the migration
      createTable(db);
      seedClassifications(db);
      const discovered = discoverAdditionalClassifications(db);
      
      if (discovered > 0) {
        fmt.stat('Additional types discovered', discovered, 'number');
      }
      
      showStats(db);
    }
    
    fmt.success('Migration complete');
    
  } catch (error) {
    fmt.error(`Migration failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (db) db.close();
  }
}

main();
