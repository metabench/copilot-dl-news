#!/usr/bin/env node
/**
 * schema-sync-postgres - Generate Postgres schema definitions from SQLite database
 * 
 * Usage:
 *   node tools/schema-sync-postgres.js
 */
'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'news.db');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'src', 'db', 'postgres', 'v1', 'schema-definitions.js');

function translateType(type) {
    if (!type) return 'TEXT'; // Default fallback
    const t = type.toUpperCase();
    if (t.includes('INT')) return 'INTEGER';
    if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'TEXT';
    if (t.includes('BLOB')) return 'BYTEA';
    if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
    if (t === 'JSON') return 'JSONB';
    if (t === 'DATETIME') return 'TIMESTAMP';
    return 'TEXT';
}

function translateCreateTable(sql) {
    // Simple regex-based translation is dangerous for complex SQL.
    // But since we control the schema, we can try to be smart.
    
    let pgSql = sql;

    // Handle "CREATE TABLE IF NOT EXISTS name ("
    const createMatch = pgSql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]+)\)/i);
    if (!createMatch) {
        if (/CREATE\s+VIRTUAL\s+TABLE/i.test(pgSql)) {
            return null; // Skip FTS for now
        }
        return null;
    }

    const tableName = createMatch[1];
    const body = createMatch[2];

    // Split body by comma, respecting parentheses
    const definitions = [];
    let current = '';
    let parenDepth = 0;
    for (let i = 0; i < body.length; i++) {
        const char = body[i];
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
        if (char === ',' && parenDepth === 0) {
            definitions.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) definitions.push(current.trim());

    const pgDefinitions = definitions.map(def => {
        // Check for constraints
        if (/^FOREIGN KEY/i.test(def) || /^PRIMARY KEY/i.test(def) || /^UNIQUE/i.test(def) || /^CHECK/i.test(def)) {
            return def; // Usually compatible
        }

        // Column definition
        // name type constraints
        const parts = def.split(/\s+/);
        const name = parts[0];
        let type = parts[1] || '';
        let rest = parts.slice(2).join(' ');

        // Handle "id INTEGER PRIMARY KEY AUTOINCREMENT"
        if (name.toLowerCase() === 'id' && /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i.test(def)) {
            return 'id SERIAL PRIMARY KEY';
        }

        // Translate type
        const newType = translateType(type);
        
        // Reassemble
        // Remove SQLite specific keywords from rest
        rest = rest.replace(/AUTOINCREMENT/gi, ''); 
        
        return `${name} ${newType} ${rest}`;
    });

    // Remove WITHOUT ROWID
    let suffix = pgSql.substring(pgSql.lastIndexOf(')') + 1).replace(/WITHOUT\s+ROWID/i, '');

    return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${pgDefinitions.join(',\n  ')}\n)${suffix}`;
}

function translateIndex(sql) {
    return sql; // Usually compatible
}

function translateTrigger(sql) {
    // Postgres triggers are very different. 
    // They require a CREATE FUNCTION first, then CREATE TRIGGER executing that function.
    // For now, we will comment them out or skip them to get the tables working.
    return null; 
}

function translateView(sql) {
    return sql; // Usually compatible
}

function extractSchema(db) {
    const schema = {
        tables: [],
        indexes: [],
        triggers: [],
        views: []
    };

    // Tables
    const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    schema.tables = tables.map(t => ({ name: t.name, sql: translateCreateTable(t.sql) })).filter(t => t.sql);

    // Indexes
    const indexes = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    schema.indexes = indexes.map(t => ({ name: t.name, sql: translateIndex(t.sql) })).filter(t => t.sql);

    // Triggers
    const triggers = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL ORDER BY name`).all();
    schema.triggers = triggers.map(t => ({ name: t.name, sql: translateTrigger(t.sql) })).filter(t => t.sql);

    // Views
    const views = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL ORDER BY name`).all();
    schema.views = views.map(t => ({ name: t.name, sql: translateView(t.sql) })).filter(t => t.sql);

    return schema;
}

function generateSchemaDefinitions(schema) {
    const timestamp = new Date().toISOString();
    
    let content = `/**
 * AUTO-GENERATED by tools/schema-sync-postgres.js
 * Generated at ${timestamp}
 *
 * Postgres schema definitions translated from SQLite.
 */
'use strict';

`;

    content += 'const TABLE_STATEMENTS = [\n';
    for (const table of schema.tables) {
        content += `  // ${table.name}\n`;
        content += `  \`${table.sql.replace(/`/g, '\\`')}\`,\n\n`;
    }
    content += '];\n\n';

    content += 'const INDEX_STATEMENTS = [\n';
    for (const idx of schema.indexes) {
        content += `  \`${idx.sql.replace(/`/g, '\\`')}\`,\n`;
    }
    content += '];\n\n';

    content += 'const TRIGGER_STATEMENTS = [\n';
    for (const trg of schema.triggers) {
        content += `  // ${trg.name}\n`;
        content += `  \`${trg.sql.replace(/`/g, '\\`')}\`,\n\n`;
    }
    content += '];\n\n';

    content += 'const VIEW_STATEMENTS = [\n';
    for (const view of schema.views) {
        content += `  // ${view.name}\n`;
        content += `  \`${view.sql.replace(/`/g, '\\`')}\`,\n\n`;
    }
    content += '];\n\n';

    content += `
function getAllStatements() {
    return [
        ...TABLE_STATEMENTS,
        ...INDEX_STATEMENTS,
        ...TRIGGER_STATEMENTS,
        ...VIEW_STATEMENTS
    ];
}

module.exports = {
    TABLE_STATEMENTS,
    INDEX_STATEMENTS,
    TRIGGER_STATEMENTS,
    VIEW_STATEMENTS,
    getAllStatements
};
`;
    return content;
}

function main() {
    if (!fs.existsSync(DEFAULT_DB_PATH)) {
        console.error(`Database not found: ${DEFAULT_DB_PATH}`);
        process.exit(1);
    }

    const db = new Database(DEFAULT_DB_PATH, { readonly: true });
    const schema = extractSchema(db);
    db.close();

    const content = generateSchemaDefinitions(schema);
    
    const outputDir = path.dirname(DEFAULT_OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(DEFAULT_OUTPUT_PATH, content, 'utf8');
    console.log(`Written ${DEFAULT_OUTPUT_PATH}`);
}

main();
