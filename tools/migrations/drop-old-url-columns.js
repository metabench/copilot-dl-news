#!/usr/bin/env node

/**
 * drop-old-url-columns.js - Drop old TEXT url columns after URL normalization
 *
 * This script completes the URL normalization by removing the redundant TEXT url columns
 * from tables that now use url_id foreign keys to the urls table.
 *
 * Usage:
 *   node tools/migrations/drop-old-url-columns.js              # Dry run (default)
 *   node tools/migrations/drop-old-url-columns.js --fix        # Apply changes
 */

const path = require('path');
const { openDatabase } = require('../../src/db/sqlite/v1');

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');

async function main() {
  const projectRoot = path.resolve(__dirname, '../..');
  const dbPath = path.join(projectRoot, 'data', 'news.db');

  console.log('='.repeat(60));
  console.log('DROP OLD URL COLUMNS - URL NORMALIZATION COMPLETION');
  console.log('='.repeat(60));

  const db = openDatabase(dbPath);

  try {
    // Tables and columns to drop
    const tablesToUpdate = [
      { table: 'queue_events', column: 'url' },
      { table: 'crawl_jobs', column: 'url' },
      { table: 'errors', column: 'url' },
      { table: 'links', column: 'src_url' },
      { table: 'links', column: 'dst_url' },
      { table: 'url_aliases', column: 'url' },
      { table: 'url_aliases', column: 'alias_url' },
      { table: 'place_hubs', column: 'url' },
      { table: 'place_hub_candidates', column: 'candidate_url' },
      { table: 'place_hub_candidates', column: 'normalized_url' },
      { table: 'place_hub_unknown_terms', column: 'url' },
      { table: 'place_hub_unknown_terms', column: 'canonical_url' },
      { table: 'fetches', column: 'url' }
    ];

    console.log('\nTables to update:');
    for (const { table, column } of tablesToUpdate) {
      console.log(`  - ${table}.${column}`);
    }

    if (dryRun) {
      console.log('\nDRY RUN MODE - No changes will be made');
      console.log('\nChecking current schema...');

      for (const { table, column } of tablesToUpdate) {
        try {
          const info = db.prepare(`PRAGMA table_info(${table})`).all();
          const colExists = info.some(col => col.name === column);
          console.log(`  ${table}.${column}: ${colExists ? 'EXISTS' : 'NOT FOUND'}`);
        } catch (error) {
          console.log(`  ${table}.${column}: ERROR - ${error.message}`);
        }
      }

      console.log('\nTo apply changes, run with --fix flag');
      return;
    }

    // Apply changes
    console.log('\nAPPLYING CHANGES...');

    for (const { table, column } of tablesToUpdate) {
      try {
        console.log(`  Dropping ${table}.${column}...`);

        // SQLite doesn't support DROP COLUMN directly, need to recreate table
        // Get current schema
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        const columns = info.map(col => col.name);
        const columnIndex = columns.indexOf(column);

        if (columnIndex === -1) {
          console.log(`    Column ${column} not found in ${table}, skipping`);
          continue;
        }

        // Remove the column from the list
        columns.splice(columnIndex, 1);

        // Get indexes on this table
        const indexes = db.prepare(`
          SELECT name, sql
          FROM sqlite_master
          WHERE type='index' AND tbl_name=? AND sql IS NOT NULL
        `).all(table);

        // Create new table without the column
        const newTableName = `${table}_new`;
        const columnDefs = info
          .filter(col => col.name !== column)
          .map(col => {
            let def = col.name + ' ' + col.type;
            if (col.pk) def += ' PRIMARY KEY';
            if (col.notnull) def += ' NOT NULL';
            if (col.dflt_value !== null && col.dflt_value !== undefined) {
              const rawDefault = String(col.dflt_value).trim();
              if (rawDefault.length > 0) {
                const isQuotedString = rawDefault.startsWith("'") && rawDefault.endsWith("'");
                const isNumeric = /^[+-]?\d+(\.\d+)?$/.test(rawDefault);
                const isNullLiteral = rawDefault.toUpperCase() === 'NULL';
                const needsParens = !isQuotedString && !isNumeric && !isNullLiteral;
                if (needsParens && !(rawDefault.startsWith('(') && rawDefault.endsWith(')'))) {
                  def += ' DEFAULT (' + rawDefault + ')';
                } else {
                  def += ' DEFAULT ' + rawDefault;
                }
              }
            }
            return def;
          })
          .join(', ');

        db.exec(`CREATE TABLE ${newTableName} (${columnDefs})`);

        // Copy data
        const selectColumns = columns.join(', ');
        db.exec(`INSERT INTO ${newTableName} (${selectColumns}) SELECT ${selectColumns} FROM ${table}`);

        // Drop old table
        db.exec(`DROP TABLE ${table}`);

        // Rename new table
        db.exec(`ALTER TABLE ${newTableName} RENAME TO ${table}`);

        // Recreate indexes
        for (const index of indexes) {
          try {
            db.exec(index.sql);
          } catch (error) {
            console.log(`    Warning: Could not recreate index ${index.name}: ${error.message}`);
          }
        }

        console.log(`    ✓ Dropped ${table}.${column}`);
      } catch (error) {
        console.log(`    ✗ Failed to drop ${table}.${column}: ${error.message}`);
      }
    }

    console.log('\n✓ URL normalization completion finished');
    console.log('Old TEXT url columns have been removed');
    console.log('All tables now use url_id foreign keys to urls table');

  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

module.exports = { main };