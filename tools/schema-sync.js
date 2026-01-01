#!/usr/bin/env node
/**
 * schema-sync - Synchronize schema definitions with actual database state
 * 
 * This tool regenerates schema-definitions.js from the current database,
 * ensuring documentation and code stay in sync with database changes.
 * 
 * Usage:
 *   node tools/schema-sync.js [options]
 *   npm run schema:sync [-- options]
 * 
 * Options:
 *   --check        Check for drift without writing (exit 1 if drift detected)
 *   --dry-run      Show what would be written without making changes
 *   --verbose      Show detailed output
 *   --db <path>    Path to database file (default: data/news.db)
 *   --output <path> Output path for schema-definitions.js
 *   --stats        Also regenerate schema stats JSON
 *   --help         Show this help message
 * 
 * Examples:
 *   # Regenerate schema definitions
 *   node tools/schema-sync.js
 * 
 *   # Check for schema drift in CI
 *   node tools/schema-sync.js --check
 * 
 *   # Preview changes without writing
 *   node tools/schema-sync.js --dry-run --verbose
 * 
 * Exit codes:
 *   0 - Success (or no drift in --check mode)
 *   1 - Schema drift detected (--check mode) or error
 * 
 * Integration:
 *   Run this after any migration or direct schema change.
 *   Add to pre-commit hooks or CI to catch undocumented changes.
 * 
 * @module tools/schema-sync
 */
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default paths
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'news.db');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'src', 'db', 'sqlite', 'v1', 'schema-definitions.js');
const DEFAULT_STATS_PATH = path.join(__dirname, '..', 'docs', 'database', '_artifacts', 'news_db_stats.json');

/**
 * Parse command line arguments
 * @returns {Object} Parsed options
 */
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

/**
 * Show help message
 */
function showHelp() {
    console.log(`
schema-sync - Synchronize schema definitions with actual database state

Usage:
  node tools/schema-sync.js [options]
  npm run schema:sync [-- options]

Options:
  --check        Check for drift without writing (exit 1 if drift detected)
  --dry-run      Show what would be written without making changes
  --verbose, -v  Show detailed output
  --db <path>    Path to database file (default: data/news.db)
  --output <path> Output path for schema-definitions.js
  --stats        Also regenerate schema stats JSON
  --help, -h     Show this help message

Examples:
  # Regenerate schema definitions
  node tools/schema-sync.js

  # Check for schema drift in CI
  node tools/schema-sync.js --check

  # Preview changes without writing
  node tools/schema-sync.js --dry-run --verbose

  # Regenerate with stats
  node tools/schema-sync.js --stats --verbose

Exit codes:
  0 - Success (or no drift in --check mode)
  1 - Schema drift detected (--check mode) or error
`);
}

/**
 * Extract schema objects from database
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {Object} Schema objects by type
 */
function extractSchema(db) {
    const schema = {
        tables: [],
        indexes: [],
        triggers: [],
        views: []
    };

    // Tables
    schema.tables = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all();

    // Filter out internal FTS shadow tables (e.g., <virtual_fts>_config/_data/_docsize/_idx).
    // These objects are reserved for SQLite's internal use and cannot be created explicitly.
    const virtualFtsTables = new Set(
        schema.tables
            .filter(t => typeof t.sql === 'string')
            .filter(t => /CREATE\s+VIRTUAL\s+TABLE/i.test(t.sql))
            .filter(t => /USING\s+fts(4|5)\b/i.test(t.sql))
            .map(t => t.name)
    );

    schema.tables = schema.tables.filter(table => {
        const match = table.name.match(/^(.*)_(config|data|docsize|idx)$/i);
        if (!match) return true;
        const baseName = match[1];
        return !virtualFtsTables.has(baseName);
    });

    // Indexes (excluding auto-generated)
    schema.indexes = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `).all();

    // Triggers
    schema.triggers = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='trigger' AND sql IS NOT NULL
        ORDER BY name
    `).all();

    // Views
    schema.views = db.prepare(`
        SELECT name, sql FROM sqlite_master 
        WHERE type='view' AND sql IS NOT NULL
        ORDER BY name
    `).all();

    return schema;
}

/**
 * Get row counts for all tables
 * @param {Database} db - Better-sqlite3 database instance
 * @param {Array} tables - Table objects with name property
 * @returns {Object} Table name -> row count map
 */
function getRowCounts(db, tables) {
    const counts = {};
    for (const table of tables) {
        try {
            const result = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
            counts[table.name] = result.count;
        } catch (err) {
            counts[table.name] = -1; // Error reading
        }
    }
    return counts;
}

/**
 * Generate schema-definitions.js content
 * @param {Object} schema - Schema objects
 * @returns {string} Generated file content
 */
function generateSchemaDefinitions(schema) {
    const timestamp = new Date().toISOString();
    
    let content = `/**
 * AUTO-GENERATED by tools/schema-sync.js
 * Generated at ${timestamp}
 *
 * Statements reflect the current schema of data/news.db.
 * Do not edit manually; regenerate with: npm run schema:sync
 * 
 * Schema Statistics:
 *   Tables: ${schema.tables.length}
 *   Indexes: ${schema.indexes.length}
 *   Triggers: ${schema.triggers.length}
 *   Views: ${schema.views.length}
 */
'use strict';

`;

    // TABLE_STATEMENTS
    content += 'const TABLE_STATEMENTS = [\n';
    for (const table of schema.tables) {
        const sql = normalizeCreateStatement(table.sql, 'TABLE');
        content += `  // ${table.name}\n`;
        content += `  \`${escapeSql(sql)}\`,\n\n`;
    }
    content += '];\n\n';

    // INDEX_STATEMENTS
    content += 'const INDEX_STATEMENTS = [\n';
    for (const idx of schema.indexes) {
        if (!idx.sql) continue;
        const sql = normalizeCreateStatement(idx.sql, 'INDEX');
        content += `  \`${escapeSql(sql)}\`,\n`;
    }
    content += '];\n\n';

    // TRIGGER_STATEMENTS
    content += 'const TRIGGER_STATEMENTS = [\n';
    for (const trg of schema.triggers) {
        if (!trg.sql) continue;
        const sql = normalizeCreateStatement(trg.sql, 'TRIGGER');
        content += `  // ${trg.name}\n`;
        content += `  \`${escapeSql(sql)}\`,\n\n`;
    }
    content += '];\n\n';

    // VIEW_STATEMENTS
    content += 'const VIEW_STATEMENTS = [\n';
    for (const view of schema.views) {
        if (!view.sql) continue;
        const sql = normalizeCreateStatement(view.sql, 'VIEW');
        content += `  // ${view.name}\n`;
        content += `  \`${escapeSql(sql)}\`,\n\n`;
    }
    content += '];\n\n';

    // Exports
    content += `/**
 * Get all table names defined in the schema
 * @returns {string[]} Array of table names
 */
function getTableNames() {
    return TABLE_STATEMENTS
        .map(sql => {
            const match = sql.match(/CREATE TABLE IF NOT EXISTS (\\w+)/i);
            return match ? match[1] : null;
        })
        .filter(Boolean);
}

/**
 * Get all statements needed to recreate the schema
 * @returns {string[]} Array of SQL statements
 */
function getAllStatements() {
    return [
        ...TABLE_STATEMENTS,
        ...INDEX_STATEMENTS,
        ...TRIGGER_STATEMENTS,
        ...VIEW_STATEMENTS
    ];
}

/**
 * Apply all schema statements to a database
 * @param {Database} db - Better-sqlite3 database instance
 * @param {Object} options - Options
 * @param {boolean} options.skipErrors - Continue on errors
 * @returns {Object} Result with counts and errors
 */
function applySchema(db, { skipErrors = false } = {}) {
    const result = { applied: 0, errors: [] };
    
    for (const sql of getAllStatements()) {
        try {
            db.exec(sql);
            result.applied++;
        } catch (err) {
            result.errors.push({ sql: sql.slice(0, 100), error: err.message });
            if (!skipErrors) throw err;
        }
    }
    
    return result;
}

module.exports = {
    TABLE_STATEMENTS,
    INDEX_STATEMENTS,
    TRIGGER_STATEMENTS,
    VIEW_STATEMENTS,
    getTableNames,
    getAllStatements,
    applySchema
};
`;

    return content;
}

/**
 * Normalize CREATE statement to use IF NOT EXISTS
 * @param {string} sql - Original SQL
 * @param {string} type - Statement type (TABLE, INDEX, VIEW)
 * @returns {string} Normalized SQL
 */
function normalizeCreateStatement(sql, type) {
    if (!sql || typeof sql !== 'string') return sql;

    if (type === 'TABLE') {
        // Virtual tables (FTS, etc.) show up as type='table' in sqlite_master.
        // Keep them idempotent too.
        if (/CREATE\s+VIRTUAL\s+TABLE/i.test(sql) && !/CREATE\s+VIRTUAL\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
            return sql.replace(/CREATE\s+VIRTUAL\s+TABLE\s+/i, 'CREATE VIRTUAL TABLE IF NOT EXISTS ');
        }
    }

    if (type === 'INDEX') {
        // SQLite emits both CREATE INDEX and CREATE UNIQUE INDEX.
        if (/CREATE\s+UNIQUE\s+INDEX/i.test(sql) && !/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
            return sql.replace(/CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
        }
    }

    if (type === 'TRIGGER') {
        // Triggers need to be idempotent because schema initialization can run on an existing DB.
        if (/CREATE\s+TEMP\s+TRIGGER/i.test(sql) && !/CREATE\s+TEMP\s+TRIGGER\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
            return sql.replace(/CREATE\s+TEMP\s+TRIGGER\s+/i, 'CREATE TEMP TRIGGER IF NOT EXISTS ');
        }
        if (/CREATE\s+TRIGGER/i.test(sql) && !/CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
            return sql.replace(/CREATE\s+TRIGGER\s+/i, 'CREATE TRIGGER IF NOT EXISTS ');
        }
    }

    const pattern = new RegExp(`CREATE\\s+${type}`, 'gi');
    return sql.replace(pattern, `CREATE ${type} IF NOT EXISTS`);
}

/**
 * Escape SQL for template literal
 * @param {string} sql - SQL string
 * @returns {string} Escaped SQL
 */
function escapeSql(sql) {
    return sql
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${');
}

/**
 * Generate stats JSON
 * @param {Object} schema - Schema objects
 * @param {Object} rowCounts - Table row counts
 * @returns {Object} Stats object
 */
function generateStats(schema, rowCounts) {
    return {
        generated_at: new Date().toISOString(),
        database: 'news.db',
        summary: {
            tables: schema.tables.length,
            indexes: schema.indexes.length,
            triggers: schema.triggers.length,
            views: schema.views.length,
            total_rows: Object.values(rowCounts).reduce((a, b) => a + Math.max(0, b), 0)
        },
        tables: schema.tables.map(t => ({
            name: t.name,
            rows: rowCounts[t.name] || 0
        })).sort((a, b) => b.rows - a.rows),
        largest_tables: schema.tables
            .map(t => ({ name: t.name, rows: rowCounts[t.name] || 0 }))
            .sort((a, b) => b.rows - a.rows)
            .slice(0, 10)
    };
}

/**
 * Calculate content hash for drift detection
 * @param {string} content - File content
 * @returns {string} SHA256 hash
 */
function contentHash(content) {
    // Normalize Windows CRLF -> LF so drift checks are stable across platforms.
    // Also remove timestamp line so regenerations on the same schema compare equal.
    const normalizedLineEndings = content.replace(/\r\n/g, '\n');
    const normalized = normalizedLineEndings.replace(/Generated at .+\n/g, '');
    return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Main function
 */
async function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    // Check database exists
    if (!fs.existsSync(options.dbPath)) {
        console.error(`❌ Database not found: ${options.dbPath}`);
        process.exit(1);
    }

    const db = new Database(options.dbPath, { readonly: true });

    try {
        // Extract schema
        if (options.verbose) {
            console.log(`📖 Reading schema from: ${options.dbPath}`);
        }
        
        const schema = extractSchema(db);
        const rowCounts = options.stats ? getRowCounts(db, schema.tables) : {};

        if (options.verbose) {
            console.log(`   Tables: ${schema.tables.length}`);
            console.log(`   Indexes: ${schema.indexes.length}`);
            console.log(`   Triggers: ${schema.triggers.length}`);
            console.log(`   Views: ${schema.views.length}`);
        }

        // Generate content
        const newContent = generateSchemaDefinitions(schema);
        const newHash = contentHash(newContent);

        // Check mode - compare with existing
        if (options.check) {
            if (!fs.existsSync(options.outputPath)) {
                console.log('❌ Schema definitions file does not exist');
                process.exit(1);
            }

            const existingContent = fs.readFileSync(options.outputPath, 'utf8');
            const existingHash = contentHash(existingContent);

            if (newHash === existingHash) {
                console.log('✅ Schema definitions are in sync');
                process.exit(0);
            } else {
                console.log('❌ Schema drift detected!');
                console.log(`   Existing hash: ${existingHash}`);
                console.log(`   Current hash:  ${newHash}`);
                console.log('\nRun "npm run schema:sync" to update schema definitions.');
                
                // Show what changed
                const existingTables = existingContent.match(/\/\/ (\w+)\r?\n/g) || [];
                const newTables = newContent.match(/\/\/ (\w+)\r?\n/g) || [];
                
                const existingSet = new Set(existingTables.map(t => t.replace(/\/\/ |\n/g, '')));
                const newSet = new Set(newTables.map(t => t.replace(/\/\/ |\n/g, '')));
                
                const added = [...newSet].filter(t => !existingSet.has(t));
                const removed = [...existingSet].filter(t => !newSet.has(t));
                
                if (added.length > 0) {
                    console.log(`\n   New tables: ${added.join(', ')}`);
                }
                if (removed.length > 0) {
                    console.log(`   Removed tables: ${removed.join(', ')}`);
                }
                
                process.exit(1);
            }
        }

        // Dry-run mode
        if (options.dryRun) {
            console.log('🔍 Dry run - would write:\n');
            console.log(`   ${options.outputPath}`);
            console.log(`   Size: ${(newContent.length / 1024).toFixed(1)} KB`);
            console.log(`   Hash: ${newHash}`);
            
            if (options.stats) {
                const stats = generateStats(schema, rowCounts);
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

        // Write schema definitions
        const outputDir = path.dirname(options.outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(options.outputPath, newContent, 'utf8');
        console.log(`✅ Schema definitions written: ${options.outputPath}`);

        // Write stats if requested
        if (options.stats) {
            const stats = generateStats(schema, rowCounts);
            const statsDir = path.dirname(options.statsPath);
            if (!fs.existsSync(statsDir)) {
                fs.mkdirSync(statsDir, { recursive: true });
            }
            fs.writeFileSync(options.statsPath, JSON.stringify(stats, null, 2), 'utf8');
            console.log(`✅ Stats written: ${options.statsPath}`);
        }

        // Summary
        console.log(`\n📊 Schema Summary:`);
        console.log(`   Tables: ${schema.tables.length}`);
        console.log(`   Indexes: ${schema.indexes.length}`);
        console.log(`   Triggers: ${schema.triggers.length}`);
        console.log(`   Views: ${schema.views.length}`);

    } finally {
        db.close();
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
}

module.exports = {
    extractSchema,
    generateSchemaDefinitions,
    generateStats,
    parseArgs,
    contentHash
};
