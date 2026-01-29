#!/usr/bin/env node
/**
 * backup-place-hubs.js — Backup place hub mappings and related reference tables
 * 
 * Usage:
 *   node tools/dev/backup-place-hubs.js
 *   node tools/dev/backup-place-hubs.js --output data/exports/my-backup.db
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const help = args.includes('--help');

if (help) {
    console.log(`
Usage: node tools/dev/backup-place-hubs.js [options]

Creates a standalone SQLite backup of place_page_mappings and its dependencies
(places, place_names, place_hubs).

Options:
  --output <path>  Output path for backup DB (default: tmp/backups/place-hubs-YYYY-MM-DD-HHmm.db)
  --help           Show this help
`);
    process.exit(0);
}

// Config
const SRC_DB_PATH = path.resolve(__dirname, '../../data/news.db');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const DEFAULT_OUT_DIR = path.resolve(__dirname, '../../tmp/backups');

const outArgIndex = args.indexOf('--output');
let outPath = outArgIndex !== -1 ? args[outArgIndex + 1] : null;

if (!outPath) {
    if (!fs.existsSync(DEFAULT_OUT_DIR)) {
        fs.mkdirSync(DEFAULT_OUT_DIR, { recursive: true });
    }
    outPath = path.join(DEFAULT_OUT_DIR, `place-hubs-backup-${TIMESTAMP}.db`);
}

// Ensure output dir exists
const outDir = path.dirname(outPath);
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

console.log(`Source DB: ${SRC_DB_PATH}`);
console.log(`Backup DB: ${outPath}`);

// 1. Initialize Source DB connection
const db = new Database(SRC_DB_PATH, { readonly: true });

// 2. Initialize Dest DB connection (create file)
if (fs.existsSync(outPath)) {
    console.warn(`Warning: Overwriting existing file ${outPath}`);
    fs.unlinkSync(outPath);
}
const destDb = new Database(outPath);

// 3. Define tables to backup in dependency order
const TABLES = [
    'places',
    'place_hubs',          // Must be before mappings (hub_id FK)
    'place_page_mappings',
    'place_names'          // Depends on places
];

// 4. Schema Extraction & Application
console.log(' extracting schema...');
const schemas = [];
const schemaDb = new Database(SRC_DB_PATH, { readonly: true });
for (const table of TABLES) {
    // Check if table exists
    const exists = schemaDb.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (!exists) {
        console.log(`  - Table ${table} not found in source, skipping.`);
        continue;
    }

    const schemaRow = schemaDb.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (schemaRow && schemaRow.sql) {
        schemas.push({ table, sql: schemaRow.sql });
    }
}
schemaDb.close();

// Apply schema to dest
destDb.exec('BEGIN');
for (const s of schemas) {
    console.log(`  Creating table: ${s.table}`);
    destDb.exec(s.sql);
}
destDb.exec('COMMIT');
destDb.close();

// 5. Data Transfer via ATTACH
// Open Dest as main handle
const rwDb = new Database(outPath);

// Ideally, we respect FKs, but if circular data exists or order is tricky, we can defer.
// But we want to ensure the backup is valid.
// Let's try to copy in correct order first.
// If needed, we can do: rwDb.pragma('foreign_keys = OFF');

console.log('Attaching source database...');
try {
    rwDb.prepare(`ATTACH DATABASE ? AS src`).run(SRC_DB_PATH);
} catch (e) {
    console.error('Failed to attach source database:', e.message);
    process.exit(1);
}

// 6. Copy Data
console.log('Copying data...');
rwDb.exec('BEGIN');

// Disable FKs for the bulk copy to avoid ordering headaches (though we tried to sort them)
rwDb.pragma('foreign_keys = OFF');

for (const s of schemas) {
    const table = s.table;
    process.stdout.write(`  Copying ${table}... `);
    
    // Copy all data
    const result = rwDb.prepare(`INSERT INTO main.${table} SELECT * FROM src.${table}`).run();
    console.log(`${result.changes} rows.`);
}

// Re-enable FKs? No, we're done closing.
rwDb.exec('COMMIT');

// 7. Detach
rwDb.prepare('DETACH DATABASE src').run();
rwDb.close();

console.log('\nBackup completed successfully.');
const finalStats = fs.statSync(outPath);
console.log(`Size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
