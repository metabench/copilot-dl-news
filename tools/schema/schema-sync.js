#!/usr/bin/env node
/**
 * schema-sync - Synchronize schema definitions with actual database state
 *
 * This CLI owns argument parsing and file output. Schema reads, row counts,
 * generated schema contract text, stats, and drift hashing live in
 * news-crawler-db.
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'db', 'sqlite', 'v1', 'schema-definitions.js');
const DEFAULT_STATS_PATH = path.join(__dirname, '..', '..', 'docs', 'database', '_artifacts', 'news_db_stats.json');

function getSchemaSyncApi() {
    const dbModule = resolveNewsCrawlerDbModule();
    const required = [
        'extractSqliteSchema',
        'getSqliteSchemaRowCounts',
        'generateSqliteSchemaDefinitions',
        'generateSqliteSchemaStats',
        'getSchemaSyncContentHash'
    ];

    for (const name of required) {
        if (typeof dbModule[name] !== 'function') {
            throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
        }
    }

    return dbModule;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        check: false,
        dryRun: false,
        verbose: false,
        stats: false,
        help: false,
        dbPath: DEFAULT_DB_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        statsPath: DEFAULT_STATS_PATH
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--check':
                options.check = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--stats':
                options.stats = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--db':
                options.dbPath = args[++i];
                break;
            case '--output':
                options.outputPath = args[++i];
                break;
            default:
                if (arg.startsWith('-')) {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    return options;
}

function showHelp() {
    console.log(`
schema-sync - Synchronize schema definitions with actual database state

Usage:
    node tools/schema/schema-sync.js [options]
  npm run schema:sync [-- options]

Options:
  --check         Check for drift without writing (exit 1 if drift detected)
  --dry-run       Show what would be written without making changes
  --verbose, -v   Show detailed output
  --db <path>     Path to database file (default: data/news.db)
  --output <path> Output path for schema-definitions.js
  --stats         Also regenerate schema stats JSON
  --help, -h      Show this help message

Examples:
    node tools/schema/schema-sync.js
    node tools/schema/schema-sync.js --check
    node tools/schema/schema-sync.js --dry-run --verbose
    node tools/schema/schema-sync.js --stats --verbose

Exit codes:
  0 - Success (or no drift in --check mode)
  1 - Schema drift detected (--check mode) or error
`);
}

function extractSchema(db) {
    return getSchemaSyncApi().extractSqliteSchema(db);
}

function getRowCounts(db, tables) {
    return getSchemaSyncApi().getSqliteSchemaRowCounts(db, tables);
}

function generateSchemaDefinitions(schema) {
    return getSchemaSyncApi().generateSqliteSchemaDefinitions(schema);
}

function generateStats(schema, rowCounts) {
    return getSchemaSyncApi().generateSqliteSchemaStats(schema, rowCounts);
}

function contentHash(content) {
    return getSchemaSyncApi().getSchemaSyncContentHash(content);
}

async function closeDb(db) {
    if (db && typeof db.close === 'function') {
        await db.close();
    }
}

async function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (!fs.existsSync(options.dbPath)) {
        console.error(`Database not found: ${options.dbPath}`);
        process.exit(1);
    }

    const db = openNewsCrawlerDb(options.dbPath, { readonly: true });

    try {
        if (options.verbose) {
            console.log(`Reading schema from: ${options.dbPath}`);
        }

        const api = getSchemaSyncApi();
        const schema = api.extractSqliteSchema(db);
        const rowCounts = options.stats ? api.getSqliteSchemaRowCounts(db, schema.tables) : {};

        if (options.verbose) {
            console.log(`   Tables: ${schema.tables.length}`);
            console.log(`   Indexes: ${schema.indexes.length}`);
            console.log(`   Triggers: ${schema.triggers.length}`);
            console.log(`   Views: ${schema.views.length}`);
        }

        const newContent = api.generateSqliteSchemaDefinitions(schema);
        const newHash = api.getSchemaSyncContentHash(newContent);

        if (options.check) {
            if (!fs.existsSync(options.outputPath)) {
                console.log('Schema definitions file does not exist');
                process.exit(1);
            }

            const existingContent = fs.readFileSync(options.outputPath, 'utf8');
            const existingHash = api.getSchemaSyncContentHash(existingContent);

            if (newHash === existingHash) {
                console.log('Schema definitions are in sync');
                process.exit(0);
            }

            console.log('Schema drift detected');
            console.log(`   Existing hash: ${existingHash}`);
            console.log(`   Current hash:  ${newHash}`);
            console.log('\nRun "npm run schema:sync" to update schema definitions.');

            const existingTables = existingContent.match(/\/\/ (\w+)\r?\n/g) || [];
            const newTables = newContent.match(/\/\/ (\w+)\r?\n/g) || [];
            const existingSet = new Set(existingTables.map(table => table.replace(/\/\/ |\n/g, '')));
            const newSet = new Set(newTables.map(table => table.replace(/\/\/ |\n/g, '')));
            const added = [...newSet].filter(table => !existingSet.has(table));
            const removed = [...existingSet].filter(table => !newSet.has(table));

            if (added.length > 0) console.log(`\n   New tables: ${added.join(', ')}`);
            if (removed.length > 0) console.log(`   Removed tables: ${removed.join(', ')}`);
            process.exit(1);
        }

        if (options.dryRun) {
            console.log('Dry run - would write:\n');
            console.log(`   ${options.outputPath}`);
            console.log(`   Size: ${(newContent.length / 1024).toFixed(1)} KB`);
            console.log(`   Hash: ${newHash}`);

            if (options.stats) {
                const stats = api.generateSqliteSchemaStats(schema, rowCounts);
                console.log(`\n   ${options.statsPath}`);
                console.log(`   Total rows: ${stats.summary.total_rows.toLocaleString()}`);
            }

            if (options.verbose) {
                console.log('\n--- Preview (first 2000 chars) ---');
                console.log(newContent.slice(0, 2000));
                console.log('...');
            }

            process.exit(0);
        }

        const outputDir = path.dirname(options.outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(options.outputPath, newContent, 'utf8');
        console.log(`Schema definitions written: ${options.outputPath}`);

        if (options.stats) {
            const stats = api.generateSqliteSchemaStats(schema, rowCounts);
            const statsDir = path.dirname(options.statsPath);
            if (!fs.existsSync(statsDir)) {
                fs.mkdirSync(statsDir, { recursive: true });
            }
            fs.writeFileSync(options.statsPath, JSON.stringify(stats, null, 2), 'utf8');
            console.log(`Stats written: ${options.statsPath}`);
        }

        console.log('\nSchema Summary:');
        console.log(`   Tables: ${schema.tables.length}`);
        console.log(`   Indexes: ${schema.indexes.length}`);
        console.log(`   Triggers: ${schema.triggers.length}`);
        console.log(`   Views: ${schema.views.length}`);
    } finally {
        await closeDb(db);
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    extractSchema,
    getRowCounts,
    generateSchemaDefinitions,
    generateStats,
    parseArgs,
    contentHash
};
