#!/usr/bin/env node
/**
 * schema-sync-postgres - Generate Postgres schema definitions from SQLite.
 *
 * This CLI owns argument parsing and file output. SQLite schema extraction,
 * SQLite-to-Postgres translation, and generated contract text live in
 * news-crawler-db.
 */
'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'news.db');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', '..', 'src', 'db', 'postgres', 'v1', 'schema-definitions.js');

function getPostgresSchemaSyncApi() {
    const dbModule = resolveNewsCrawlerDbModule();
    const required = [
        'extractPostgresSchemaFromSqliteDb',
        'generatePostgresSchemaDefinitions',
        'getSchemaSyncContentHash'
    ];

    for (const name of required) {
        if (typeof dbModule[name] !== 'function') {
            throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
        }
    }

    return dbModule;
}

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        check: false,
        dryRun: false,
        verbose: false,
        help: false,
        dbPath: DEFAULT_DB_PATH,
        outputPath: DEFAULT_OUTPUT_PATH
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
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
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--db':
                options.dbPath = argv[++i];
                break;
            case '--output':
                options.outputPath = argv[++i];
                break;
            default:
                if (arg.startsWith('-')) {
                    throw new Error(`Unknown option: ${arg}`);
                }
        }
    }

    return options;
}

function showHelp() {
    console.log(`
schema-sync-postgres - Generate Postgres schema definitions from SQLite

Usage:
  node tools/schema/schema-sync-postgres.js [options]

Options:
  --check         Check for drift without writing
  --dry-run       Show what would be written without making changes
  --verbose, -v   Show detailed output
  --db <path>     Path to SQLite database file (default: data/news.db)
  --output <path> Output path for Postgres schema definitions
  --help, -h      Show this help message
`);
}

function extractSchema(db) {
    return getPostgresSchemaSyncApi().extractPostgresSchemaFromSqliteDb(db);
}

function generateSchemaDefinitions(schema) {
    return getPostgresSchemaSyncApi().generatePostgresSchemaDefinitions(schema);
}

function contentHash(content) {
    return getPostgresSchemaSyncApi().getSchemaSyncContentHash(content);
}

async function closeDb(db) {
    if (db && typeof db.close === 'function') {
        await db.close();
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);

    if (options.help) {
        showHelp();
        return;
    }

    if (!fs.existsSync(options.dbPath)) {
        throw new Error(`Database not found: ${options.dbPath}`);
    }

    const db = openNewsCrawlerDb(options.dbPath, { readonly: true, fileMustExist: true });

    try {
        const api = getPostgresSchemaSyncApi();
        const schema = api.extractPostgresSchemaFromSqliteDb(db);
        const content = api.generatePostgresSchemaDefinitions(schema);
        const newHash = api.getSchemaSyncContentHash(content);

        if (options.verbose) {
            console.log(`Reading schema from: ${options.dbPath}`);
            console.log(`   Tables: ${schema.tables.length}`);
            console.log(`   Indexes: ${schema.indexes.length}`);
            console.log(`   Triggers: ${schema.triggers.length}`);
            console.log(`   Views: ${schema.views.length}`);
        }

        if (options.check) {
            if (!fs.existsSync(options.outputPath)) {
                console.log('Postgres schema definitions file does not exist');
                process.exitCode = 1;
                return;
            }

            const existingContent = fs.readFileSync(options.outputPath, 'utf8');
            const existingHash = api.getSchemaSyncContentHash(existingContent);

            if (newHash === existingHash) {
                console.log('Postgres schema definitions are in sync');
                return;
            }

            console.log('Postgres schema drift detected');
            console.log(`   Existing hash: ${existingHash}`);
            console.log(`   Current hash:  ${newHash}`);
            process.exitCode = 1;
            return;
        }

        if (options.dryRun) {
            console.log('Dry run - would write:\n');
            console.log(`   ${options.outputPath}`);
            console.log(`   Size: ${(content.length / 1024).toFixed(1)} KB`);
            console.log(`   Hash: ${newHash}`);
            return;
        }

        const outputDir = path.dirname(options.outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(options.outputPath, content, 'utf8');
        console.log(`Written ${options.outputPath}`);
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
    generateSchemaDefinitions,
    parseArgs,
    contentHash,
    main
};
