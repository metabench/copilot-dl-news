#!/usr/bin/env node

/**
 * URL Normalization Schema Application Tool
 *
 * Applies the URL normalization schema changes to a database.
 * Adds url_id foreign key columns to denormalized tables.
 *
 * Usage:
 *   node tools/migrations/url-normalization-schema.js --db=path/to/database.db
 */

const path = require('path');
const { openDatabase } = require('../../src/data/db/sqlite/v1/connection');

// Schema changes for URL normalization
const SCHEMA_CHANGES = `
-- Add url_id columns to denormalized tables
ALTER TABLE links ADD COLUMN src_url_id INTEGER REFERENCES urls(id);
ALTER TABLE links ADD COLUMN dst_url_id INTEGER REFERENCES urls(id);

ALTER TABLE queue_events ADD COLUMN url_id INTEGER REFERENCES urls(id);

ALTER TABLE crawl_jobs ADD COLUMN url_id INTEGER REFERENCES urls(id);

ALTER TABLE errors ADD COLUMN url_id INTEGER REFERENCES urls(id);

ALTER TABLE url_aliases ADD COLUMN url_id INTEGER REFERENCES urls(id);
ALTER TABLE url_aliases ADD COLUMN alias_url_id INTEGER REFERENCES urls(id);

-- Create indexes for performance (temporary - can be dropped after migration)
CREATE INDEX IF NOT EXISTS idx_links_src_url_id ON links(src_url_id);
CREATE INDEX IF NOT EXISTS idx_links_dst_url_id ON links(dst_url_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_url_id ON queue_events(url_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_url_id ON crawl_jobs(url_id);
CREATE INDEX IF NOT EXISTS idx_errors_url_id ON errors(url_id);
CREATE INDEX IF NOT EXISTS idx_url_aliases_url_id ON url_aliases(url_id);
CREATE INDEX IF NOT EXISTS idx_url_aliases_alias_url_id ON url_aliases(alias_url_id);
`;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value || true;
    }
  }

  return options;
}

async function main() {
  try {
    const options = parseArgs();

    if (!options.db) {
      console.error('Usage: node tools/migrations/url-normalization-schema.js --db=path/to/database.db');
      process.exit(1);
    }

    const dbPath = path.resolve(options.db);
    console.log(`Applying URL normalization schema to: ${dbPath}`);

    // Open database (read-write mode)
    const db = openDatabase(dbPath);

    // Apply schema changes
    console.log('Executing schema changes...');
    db.exec(SCHEMA_CHANGES);

    console.log('✅ Schema changes applied successfully');

    // Verify changes
    console.log('\nVerifying schema changes...');
    const tables = ['links', 'queue_events', 'crawl_jobs', 'errors', 'url_aliases'];

    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      console.log(`\n${table} columns:`);
      columns.forEach(col => {
        console.log(`  ${col.name}: ${col.type}${col.pk ? ' (PK)' : ''}`);
      });
    }

    db.close();
    console.log('\n✅ Schema verification complete');

  } catch (error) {
    console.error('❌ Schema application failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
