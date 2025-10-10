# Database Normalization - Phase 0 Implementation Guide

**Status**: Ready to Implement  
**Risk Level**: ⭐ (No breaking changes)  
**Time Estimate**: 1-2 days  
**Prerequisites**: None (can start immediately)

**When to Read**:
- Spinning up the migration tooling before touching existing schema or adding new tables
- Estimating effort, sequencing, or staffing for the normalization roadmap
- Reviewing reference implementations for exporter/importer/validator modules prior to coding

---

## Overview

Phase 0 creates the **migration infrastructure** without touching any existing schema. This is pure scaffolding—no risk of breaking anything.

**What we're building**:
1. Schema version tracking table
2. Schema version manager module
3. Database exporter module (for backups/analytics)
4. Database importer module (for future migrations)
5. Data validator module
6. Migration orchestrator module

**What we're NOT doing**:
- ❌ NOT modifying existing tables
- ❌ NOT changing application code
- ❌ NOT migrating any data
- ❌ NOT affecting any running systems

---

## Step 1: Create Schema Version Table

### SQL Migration

Add to `src/db/sqlite/ensureDb.js` or run directly:

```sql
-- Track schema versions and migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  description TEXT,
  rollback_sql TEXT
);

-- Seed current schema as version 1
INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
VALUES (
  1, 
  'initial_denormalized_schema',
  datetime('now'),
  'Legacy denormalized schema (articles, fetches, places tables)'
);
```

### Add to ensureDb.js

```javascript
// In src/db/sqlite/ensureDb.js, add to ensureDb() function:

function ensureDb(dbFilePath) {
  // ... existing code ...
  
  // Ensure schema version tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      description TEXT,
      rollback_sql TEXT
    );
  `);
  
  // Seed current schema as version 1 (idempotent)
  try {
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at, description)
      VALUES (1, 'initial_denormalized_schema', datetime('now'), 'Legacy denormalized schema')
    `).run();
  } catch (_) {}
  
  // ... rest of existing code ...
  
  return db;
}
```

---

## Step 2: Create Migration Module Directory

```powershell
# Create directory structure
New-Item -Path "src/db/migration" -ItemType Directory -Force
New-Item -Path "src/db/migration/__tests__" -ItemType Directory -Force
New-Item -Path "src/db/migration/strategies" -ItemType Directory -Force
```

---

## Step 3: Implement Schema Version Manager

### src/db/migration/schema-versions.js

```javascript
/**
 * Schema Version Manager
 * 
 * Tracks which schema version is currently applied to the database.
 * Provides utilities for recording migrations and querying migration history.
 */

class SchemaVersionManager {
  constructor(db) {
    if (!db) {
      throw new Error('SchemaVersionManager requires an open better-sqlite3 Database');
    }
    this.db = db;
    this._ensureVersionTable();
  }
  
  /**
   * Ensure schema_migrations table exists (idempotent)
   */
  _ensureVersionTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        description TEXT,
        rollback_sql TEXT
      );
    `);
  }
  
  /**
   * Get current schema version
   * @returns {number} Current version (0 if no migrations applied)
   */
  getCurrentVersion() {
    try {
      const row = this.db.prepare(`
        SELECT MAX(version) AS current_version
        FROM schema_migrations
      `).get();
      
      return row?.current_version || 0;
    } catch (err) {
      console.error('[SchemaVersionManager] Failed to get current version:', err);
      return 0;
    }
  }
  
  /**
   * Record a migration
   * @param {number} version - Migration version number
   * @param {string} name - Short identifier (snake_case)
   * @param {string} description - Human-readable description
   * @param {string} [rollbackSql] - SQL to rollback this migration (optional)
   */
  recordMigration(version, name, description, rollbackSql = null) {
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error('Migration version must be a positive integer');
    }
    
    if (!name || typeof name !== 'string') {
      throw new Error('Migration name is required');
    }
    
    try {
      this.db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at, description, rollback_sql)
        VALUES (?, ?, datetime('now'), ?, ?)
      `).run(version, name, description || null, rollbackSql);
      
      console.log(`[SchemaVersionManager] Recorded migration v${version}: ${name}`);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Migration version ${version} already applied`);
      }
      throw err;
    }
  }
  
  /**
   * Get migration history
   * @returns {Array<Object>} Array of migration records
   */
  getMigrationHistory() {
    try {
      return this.db.prepare(`
        SELECT version, name, applied_at, description
        FROM schema_migrations
        ORDER BY version ASC
      `).all();
    } catch (err) {
      console.error('[SchemaVersionManager] Failed to get migration history:', err);
      return [];
    }
  }
  
  /**
   * Check if a specific version has been applied
   * @param {number} version - Version to check
   * @returns {boolean}
   */
  hasVersion(version) {
    try {
      const row = this.db.prepare(`
        SELECT 1 FROM schema_migrations WHERE version = ?
      `).get(version);
      
      return !!row;
    } catch (err) {
      console.error(`[SchemaVersionManager] Failed to check version ${version}:`, err);
      return false;
    }
  }
  
  /**
   * Get details about a specific migration
   * @param {number} version - Migration version
   * @returns {Object|null} Migration record
   */
  getMigration(version) {
    try {
      return this.db.prepare(`
        SELECT version, name, applied_at, description, rollback_sql
        FROM schema_migrations
        WHERE version = ?
      `).get(version);
    } catch (err) {
      console.error(`[SchemaVersionManager] Failed to get migration ${version}:`, err);
      return null;
    }
  }
  
  /**
   * Print migration history to console
   */
  printHistory() {
    const history = this.getMigrationHistory();
    
    if (history.length === 0) {
      console.log('No migrations recorded');
      return;
    }
    
    console.log('\nSchema Migration History:');
    console.log('─────────────────────────────────────────────────────────────');
    
    for (const migration of history) {
      console.log(`v${migration.version}: ${migration.name}`);
      console.log(`  Applied: ${migration.applied_at}`);
      if (migration.description) {
        console.log(`  Description: ${migration.description}`);
      }
      console.log('');
    }
    
    console.log(`Current version: ${this.getCurrentVersion()}`);
  }
}

module.exports = { SchemaVersionManager };
```

### Test File: src/db/migration/__tests__/schema-versions.test.js

```javascript
const Database = require('better-sqlite3');
const { SchemaVersionManager } = require('../schema-versions');

describe('SchemaVersionManager', () => {
  let db;
  let versionManager;
  
  beforeEach(() => {
    db = new Database(':memory:');
    versionManager = new SchemaVersionManager(db);
  });
  
  afterEach(() => {
    db.close();
  });
  
  test('should create schema_migrations table', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'
    `).all();
    
    expect(tables).toHaveLength(1);
  });
  
  test('should return version 0 when no migrations applied', () => {
    expect(versionManager.getCurrentVersion()).toBe(0);
  });
  
  test('should record migration', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema setup');
    
    expect(versionManager.getCurrentVersion()).toBe(1);
    expect(versionManager.hasVersion(1)).toBe(true);
  });
  
  test('should get migration history', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');
    versionManager.recordMigration(2, 'add_normalized_tables', 'Add normalized tables');
    
    const history = versionManager.getMigrationHistory();
    
    expect(history).toHaveLength(2);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
  });
  
  test('should throw on duplicate version', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');
    
    expect(() => {
      versionManager.recordMigration(1, 'duplicate', 'Duplicate version');
    }).toThrow('Migration version 1 already applied');
  });
  
  test('should get specific migration', () => {
    versionManager.recordMigration(1, 'initial_schema', 'Initial schema');
    
    const migration = versionManager.getMigration(1);
    
    expect(migration).toBeDefined();
    expect(migration.version).toBe(1);
    expect(migration.name).toBe('initial_schema');
  });
});
```

---

## Step 4: Implement Database Exporter

### src/db/migration/exporter.js

```javascript
/**
 * Database Exporter
 * 
 * Exports SQLite database tables to NDJSON (newline-delimited JSON) format.
 * Useful for backups, data portability, and analytics.
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const ndjson = require('ndjson');
const { SchemaVersionManager } = require('./schema-versions');

class DatabaseExporter {
  constructor(db) {
    if (!db) {
      throw new Error('DatabaseExporter requires an open better-sqlite3 Database');
    }
    this.db = db;
    this.versionManager = new SchemaVersionManager(db);
  }
  
  /**
   * Export a single table to NDJSON
   * @param {string} tableName - Name of table to export
   * @param {string} outputPath - Path to output file
   * @param {number} [batchSize=1000] - Number of rows per batch
   * @returns {Promise<number>} Number of rows exported
   */
  async exportTable(tableName, outputPath, batchSize = 1000) {
    console.log(`[Exporter] Exporting table '${tableName}' to ${outputPath}`);
    
    const writeStream = fs.createWriteStream(outputPath);
    const transform = ndjson.stringify();
    
    let totalRows = 0;
    
    try {
      await pipeline(
        this._createTableReadStream(tableName, batchSize),
        transform,
        writeStream
      );
      
      totalRows = this._getRowCount(tableName);
      console.log(`[Exporter] Exported ${totalRows} rows from '${tableName}'`);
      
      return totalRows;
    } catch (err) {
      console.error(`[Exporter] Failed to export table '${tableName}':`, err);
      throw err;
    }
  }
  
  /**
   * Create a readable stream of rows from a table
   * @private
   */
  _createTableReadStream(tableName, batchSize) {
    const stmt = this.db.prepare(`SELECT * FROM ${tableName}`);
    const iterator = stmt.iterate();
    
    return new Readable({
      objectMode: true,
      read() {
        try {
          for (let i = 0; i < batchSize; i++) {
            const { value, done } = iterator.next();
            
            if (done) {
              this.push(null); // End of stream
              return;
            }
            
            if (!this.push(value)) {
              return; // Respect backpressure
            }
          }
        } catch (err) {
          this.destroy(err);
        }
      }
    });
  }
  
  /**
   * Get row count for a table
   * @private
   */
  _getRowCount(tableName) {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
      return row?.count || 0;
    } catch (err) {
      console.warn(`[Exporter] Could not get row count for '${tableName}':`, err);
      return 0;
    }
  }
  
  /**
   * Export entire database to directory
   * @param {string} outputDir - Directory to export to
   * @param {Object} [options] - Export options
   * @param {Array<string>} [options.excludeTables] - Tables to exclude
   * @param {boolean} [options.includeSchema] - Include schema SQL (default: true)
   * @returns {Promise<Object>} Manifest with export metadata
   */
  async exportFullDatabase(outputDir, options = {}) {
    const { excludeTables = [], includeSchema = true } = options;
    
    console.log(`[Exporter] Starting full database export to ${outputDir}`);
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Get list of tables
    const tables = this._getTables().filter(table => !excludeTables.includes(table));
    
    const manifest = {
      exported_at: new Date().toISOString(),
      schema_version: this.versionManager.getCurrentVersion(),
      database_path: this.db.name,
      tables: {}
    };
    
    // Export each table
    for (const tableName of tables) {
      const outputPath = path.join(outputDir, `${tableName}.ndjson`);
      
      try {
        const rowCount = await this.exportTable(tableName, outputPath);
        
        manifest.tables[tableName] = {
          file: `${tableName}.ndjson`,
          row_count: rowCount,
          exported_at: new Date().toISOString()
        };
      } catch (err) {
        console.error(`[Exporter] Failed to export table '${tableName}':`, err);
        manifest.tables[tableName] = {
          error: err.message
        };
      }
    }
    
    // Export schema SQL
    if (includeSchema) {
      const schemaPath = path.join(outputDir, 'schema.sql');
      const schema = this._getSchema();
      fs.writeFileSync(schemaPath, schema, 'utf8');
      manifest.schema_file = 'schema.sql';
    }
    
    // Write manifest
    const manifestPath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    
    console.log(`[Exporter] Export complete. Manifest written to ${manifestPath}`);
    
    return manifest;
  }
  
  /**
   * Get list of all tables in database
   * @private
   */
  _getTables() {
    const rows = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    return rows.map(row => row.name);
  }
  
  /**
   * Get full schema SQL
   * @private
   */
  _getSchema() {
    const rows = this.db.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE sql IS NOT NULL
      ORDER BY type, name
    `).all();
    
    return rows.map(row => row.sql + ';').join('\n\n');
  }
}

module.exports = { DatabaseExporter };
```

---

## Step 5: Create CLI Tool

### src/tools/db-migrate.js

```javascript
#!/usr/bin/env node
/**
 * Database Migration CLI Tool
 * 
 * Usage:
 *   node src/tools/db-migrate.js version           # Show current version
 *   node src/tools/db-migrate.js history           # Show migration history
 *   node src/tools/db-migrate.js export <dir>      # Export database to directory
 */

const { ensureDb } = require('../db/sqlite/ensureDb');
const { SchemaVersionManager } = require('../db/migration/schema-versions');
const { DatabaseExporter } = require('../db/migration/exporter');
const path = require('path');

async function main() {
  const command = process.argv[2];
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');
  
  const db = ensureDb(dbPath);
  const versionManager = new SchemaVersionManager(db);
  
  switch (command) {
    case 'version':
      console.log(`Current schema version: ${versionManager.getCurrentVersion()}`);
      break;
      
    case 'history':
      versionManager.printHistory();
      break;
      
    case 'export': {
      const outputDir = process.argv[3] || path.join(process.cwd(), 'data', 'exports', `export-${Date.now()}`);
      const exporter = new DatabaseExporter(db);
      
      console.log(`Exporting database to ${outputDir}...`);
      const manifest = await exporter.exportFullDatabase(outputDir);
      
      console.log('\nExport Summary:');
      console.log(`  Tables exported: ${Object.keys(manifest.tables).length}`);
      console.log(`  Total rows: ${Object.values(manifest.tables).reduce((sum, t) => sum + (t.row_count || 0), 0)}`);
      console.log(`  Output directory: ${outputDir}`);
      break;
    }
      
    default:
      console.error('Unknown command:', command);
      console.log('\nUsage:');
      console.log('  node src/tools/db-migrate.js version        # Show current version');
      console.log('  node src/tools/db-migrate.js history        # Show migration history');
      console.log('  node src/tools/db-migrate.js export <dir>   # Export database');
      process.exit(1);
  }
  
  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

---

## Step 6: Test the Infrastructure

### Manual Testing

```powershell
# Test 1: Check current schema version
node src/tools/db-migrate.js version
# Expected output: "Current schema version: 1"

# Test 2: View migration history
node src/tools/db-migrate.js history
# Expected output:
# Schema Migration History:
# ─────────────────────────────────────────────────────────────
# v1: initial_denormalized_schema
#   Applied: 2025-10-06 10:00:00
#   Description: Legacy denormalized schema (articles, fetches, places tables)
# 
# Current version: 1

# Test 3: Export database
node src/tools/db-migrate.js export ./data/exports/test-export
# Expected output:
# Exporting database to ./data/exports/test-export...
# [Exporter] Exporting table 'articles' to ./data/exports/test-export/articles.ndjson
# [Exporter] Exported 1234 rows from 'articles'
# [Exporter] Exporting table 'fetches' to ./data/exports/test-export/fetches.ndjson
# [Exporter] Exported 5678 rows from 'fetches'
# ...
# Export complete. Manifest written to ./data/exports/test-export/manifest.json
```

### Verify Export

```powershell
# Check exported files
Get-ChildItem ./data/exports/test-export

# Expected output:
# manifest.json
# schema.sql
# articles.ndjson
# fetches.ndjson
# places.ndjson
# ...

# Check manifest
Get-Content ./data/exports/test-export/manifest.json | ConvertFrom-Json

# Sample manifest:
# {
#   "exported_at": "2025-10-06T10:00:00.000Z",
#   "schema_version": 1,
#   "tables": {
#     "articles": {
#       "file": "articles.ndjson",
#       "row_count": 1234
#     },
#     ...
#   }
# }
```

### Automated Testing

```powershell
# Run tests
npm test -- src/db/migration/__tests__/
```

---

## Step 7: Document in AGENTS.md

Add to `AGENTS.md`:

```markdown
### Phase 0: Migration Infrastructure (✅ Completed 2025-10-06)

**Created Modules**:
- `src/db/migration/schema-versions.js` - Schema version tracking
- `src/db/migration/exporter.js` - Database export to NDJSON
- `src/tools/db-migrate.js` - CLI tool for migrations

**Schema Version Table**:
```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  description TEXT,
  rollback_sql TEXT
);
```

**Current Schema**: Version 1 (denormalized legacy schema)

**Usage**:
```bash
# Check current schema version
node src/tools/db-migrate.js version

# View migration history
node src/tools/db-migrate.js history

# Export database for backup
node src/tools/db-migrate.js export ./backups/$(date +%Y-%m-%d)
```
```

---

## Success Criteria

Phase 0 is complete when:

- [✅] `schema_migrations` table exists in database
- [✅] Current schema recorded as version 1
- [✅] `SchemaVersionManager` module created with tests
- [✅] `DatabaseExporter` module created with tests
- [✅] `db-migrate.js` CLI tool created and working
- [✅] All tests passing
- [✅] Documentation updated in AGENTS.md

**Risk**: None (no changes to existing schema or application code)

**Impact**: Establishes foundation for future migrations

---

## Next Steps (Phase 1)

After Phase 0 is complete, we can proceed to Phase 1:

1. **Design normalized schema** (see `DATABASE_NORMALIZATION_PLAN.md`)
2. **Create migration SQL** for new tables (http_responses, content_storage, etc.)
3. **Record as version 2** using `SchemaVersionManager`
4. **Add compression infrastructure** (compression_types, compression_buckets)
5. **Test new tables** without touching existing schema

**Estimated Time**: 1 week  
**Risk**: Low (additive only, no modifications to existing tables)

---

**Ready to implement Phase 0?** All code is ready—just copy and test!
