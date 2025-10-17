#!/usr/bin/env node
/**
 * Create Enhanced Database Adapter tables
 * 
 * This script creates all 13 tables required by the Enhanced Database Adapter:
 * - 4 QueueDatabase tables (queue_events_enhanced, problem_clusters, gap_predictions, priority_config_changes)
 * - 4 PlannerDatabase tables (planner_patterns, hub_validations, knowledge_reuse_events, cross_crawl_knowledge)
 * - 5 CoverageDatabase tables (coverage_snapshots, hub_discoveries, coverage_gaps, milestone_achievements, dashboard_metrics)
 * 
 * Usage:
 *   node tools/create-enhanced-tables.js [--db-path path/to/db.sqlite]
 * 
 * The tables use "CREATE TABLE IF NOT EXISTS" so this is safe to run multiple times.
 */

const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
let dbPath = path.join(__dirname, '..', 'data', 'news.db');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--db-path' && args[i + 1]) {
    dbPath = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/create-enhanced-tables.js [--db-path path/to/db.sqlite]');
    console.log('');
    console.log('Creates all 13 tables required by Enhanced Database Adapter.');
    console.log('Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).');
    process.exit(0);
  }
}

// Resolve absolute path
dbPath = path.resolve(dbPath);

// Check if database file exists
if (!fs.existsSync(dbPath)) {
  console.error(`Error: Database file not found at ${dbPath}`);
  console.error('');
  console.error('Please ensure the database exists before running this script.');
  console.error('You can specify a different path with: --db-path path/to/db.sqlite');
  process.exit(1);
}

console.log(`Creating enhanced tables in: ${dbPath}`);
console.log('');

try {
  // Import database modules
  const { ensureDatabase } = require('../src/db/sqlite');
  const { QueueDatabase } = require('../src/db/QueueDatabase');
  const { PlannerDatabase } = require('../src/db/PlannerDatabase');
  const { CoverageDatabase } = require('../src/db/CoverageDatabase');

  // Get database handle
  const db = ensureDatabase(dbPath);
  console.log('✓ Database connection established');

  // Initialize modules (this triggers _ensureSchema() for each)
  console.log('');
  console.log('Creating QueueDatabase tables (4)...');
  const queueDb = new QueueDatabase(db);
  console.log('  ✓ queue_events_enhanced');
  console.log('  ✓ problem_clusters');
  console.log('  ✓ gap_predictions');
  console.log('  ✓ priority_config_changes');

  console.log('');
  console.log('Creating PlannerDatabase tables (4)...');
  const plannerDb = new PlannerDatabase(db);
  console.log('  ✓ planner_patterns');
  console.log('  ✓ hub_validations');
  console.log('  ✓ knowledge_reuse_events');
  console.log('  ✓ cross_crawl_knowledge');

  console.log('');
  console.log('Creating CoverageDatabase tables (5)...');
  const coverageDb = new CoverageDatabase(db);
  console.log('  ✓ coverage_snapshots');
  console.log('  ✓ hub_discoveries');
  console.log('  ✓ coverage_gaps');
  console.log('  ✓ milestone_achievements');
  console.log('  ✓ dashboard_metrics');

  console.log('');
  console.log('✓ All 13 enhanced database tables created successfully!');
  console.log('');
  console.log('The Enhanced Database Adapter should now initialize without errors.');
  console.log('Run your crawler again to verify.');

  // Close database
  db.close();

} catch (error) {
  console.error('');
  console.error('✗ Error creating enhanced tables:');
  console.error('');
  console.error(error.message);
  if (error.stack) {
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
  }
  process.exit(1);
}
