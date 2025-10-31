#!/usr/bin/env node
'use strict';

/**
 * Create place_hub_guess_runs table
 *
 * Adds a table to store metadata for place hub guessing runs,
 * similar to analysis_runs but for hub discovery operations.
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');

async function main() {
  const dbPath = path.join(__dirname, '../../data/news.db');
  const db = ensureDatabase(dbPath);

  console.log('Creating place_hub_guess_runs table...');

  // Create the table with similar structure to analysis_runs
  db.exec(`
    CREATE TABLE IF NOT EXISTS place_hub_guess_runs (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      stage TEXT,

      -- Hub guessing specific parameters
      domain_count INTEGER,
      total_domains INTEGER,
      kinds TEXT, -- JSON array of hub kinds
      limit_per_domain INTEGER,
      apply_changes INTEGER, -- 0/1 for boolean
      emit_report INTEGER, -- 0/1 for boolean
      report_path TEXT,
      readiness_timeout_seconds INTEGER,
      enable_topic_discovery INTEGER, -- 0/1 for boolean

      -- Results summary
      domains_processed INTEGER DEFAULT 0,
      hubs_generated INTEGER DEFAULT 0,
      hubs_validated INTEGER DEFAULT 0,
      hubs_persisted INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,

      -- Timing
      duration_ms INTEGER,

      -- Background task linkage (like analysis_runs)
      background_task_id INTEGER,
      background_task_status TEXT,

      -- Additional metadata
      summary TEXT,
      last_progress TEXT,
      error TEXT,

      FOREIGN KEY (background_task_id) REFERENCES background_tasks(id)
    )
  `);

  // Create indexes for efficient queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_status
    ON place_hub_guess_runs(status);

    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_started_at
    ON place_hub_guess_runs(started_at);

    CREATE INDEX IF NOT EXISTS idx_place_hub_guess_runs_background_task_id
    ON place_hub_guess_runs(background_task_id);
  `);

  console.log('✅ place_hub_guess_runs table created successfully');
  console.log('✅ Indexes created for efficient querying');

  db.close();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { main };