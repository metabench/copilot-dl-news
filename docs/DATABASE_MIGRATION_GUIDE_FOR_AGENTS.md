# Database Migration Guide for AI Agents

**When to Read**: When planning or executing database schema changes, adding new tables/columns, or refactoring database structure.

**Last Updated**: 2025-10-10  
**Status**: Active - Core migration infrastructure ready (Phase 0)

---

## Table of Contents

1. [Overview](#overview)
2. [Current Migration State](#current-migration-state)
3. [Pre-Migration Checklist](#pre-migration-checklist)
4. [Dual-Adapter Strategy](#dual-adapter-strategy)
5. [Export/Import Testing Workflow](#exportimport-testing-workflow)
6. [Migration Execution Process](#migration-execution-process)
7. [Validation and Rollback](#validation-and-rollback)
8. [Integration with Development Workflow](#integration-with-development-workflow)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Database migrations in this project require **zero-downtime compatibility** and **referential integrity verification**. This guide outlines a systematic approach to:

1. **Schema Version Tracking** - Know which schema version is active
2. **Adapter-Based Encapsulation** - Isolate schema details from application code
3. **Dual-Adapter Testing** - Run old and new schemas simultaneously
4. **Export/Import Validation** - Verify all references are preserved
5. **Incremental Migration** - Move data in testable chunks
6. **Rollback Safety** - Always maintain ability to revert

**Current State**: DB Schema Version 1 (implicit, no version tracking yet)

**See**: `docs/DATABASE_SCHEMA_VERSION_1.md` for complete current schema documentation

**Key Principle**: Never modify production database without:
1. Creating adapter classes that encapsulate schema access
2. Proven migration path tested on real data subsets
3. Rollback procedure documented and tested

---

## Current Migration State

**Schema Version**: 1 (implicit - no formal version tracking implemented)

**See**: `docs/DATABASE_SCHEMA_VERSION_1.md` for complete current schema documentation

**Current Database API**:
- Primary: `ensureDatabase()` + `wrapWithTelemetry()` (new API)
- Legacy: `ensureDb()` + `createInstrumentedDb()` (still works)
- Returns: `better-sqlite3` Database instance with WAL mode + foreign keys enabled

**Known Schema Issues** (as of 2025-10-10):
- ✅ `articles.host`, `urls.host`, `fetches.host` - Migration added
- ✅ `crawl_jobs.id` (INTEGER → TEXT) - Migration added (may be incomplete)
- ✅ `url_aliases.url_exists` - Migration added
- ❌ `places.wikidata_qid` - Missing migration (gazetteer degraded)
- ❌ Schema versioning system - Not yet implemented

**Migration Infrastructure Status**:
- ✅ Resilient schema initialization (logs warnings, doesn't crash)
- ✅ Basic ALTER TABLE migrations in `initCoreTables()`
- ❌ Adapter-based encapsulation - Not implemented (REQUIRED for v2)
- ❌ Phase 0 infrastructure (exporter, importer, transformer, validator) - Documented but not implemented
- ❌ Schema version tracking - Not implemented (CRITICAL for v2)
- ❌ Migration rollback system - Not implemented

**CRITICAL for Version 2**: Before implementing any new schema version, MUST create `SchemaV1Adapter` class to encapsulate current schema. See "Adapter-Based Encapsulation" section below.

**See**: `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` for detailed current state

---

## Pre-Migration Checklist

**Before starting ANY database migration, complete these steps:**

### 1. Document Current State

```bash
# Check current schema version
node -e "const db = require('./src/db/sqlite').ensureDatabase('./data/news.db'); console.log('User version:', db.pragma('user_version', { simple: true })); db.close();"

# Export current schema
sqlite3 data/news.db .schema > docs/migrations/schema-before-migration.sql

# Document table row counts
node tools/debug/count-tables.js > docs/migrations/row-counts-before.txt
```

### 2. Identify All Affected Components

Search codebase for references to tables/columns being modified:

```bash
# Example: Find all code using 'articles' table
node -e "const { grep_search } = require('./tools'); grep_search({ query: 'articles', isRegexp: false, includePattern: 'src/**/*.js' });"
```

**Critical files to check**:
- `src/db/sqlite/v1/SQLiteNewsDatabase.js` - Prepared statements
- `src/db/sqlite/v1/schema-definitions.js` - Table definitions
- `src/db/sqlite/v1/queries/*.js` - Query modules
- All test files - May have direct SQL queries
- All API endpoints - May use affected tables

### 3. Create Migration Document

Create `docs/migrations/YYYY-MM-DD-migration-name.md` with:
- **Objective**: What schema change is being made
- **Affected Tables**: List all tables/columns
- **Affected Code**: List all files needing updates
- **Rollback Plan**: How to revert if migration fails
- **Test Plan**: How to verify migration success

### 4. Check Test Coverage

```bash
# Find tests covering affected tables
npm run test:file "table-name"

# If no tests exist, CREATE THEM FIRST
# Tests must pass BEFORE migration begins
```

---

## Adapter-Based Encapsulation (REQUIRED Before Schema v2)

**Goal**: Isolate schema version details from application code, enabling smooth migration between versions.

### Why Adapters Are Critical

**Problem**: Current code directly accesses database with raw SQL:
```javascript
// ❌ Direct SQL - tightly coupled to Schema v1
const articles = db.prepare('SELECT * FROM articles WHERE host = ?').all('example.com');
```

**This causes**:
- Cannot change schema without updating all code
- Cannot run v1 and v2 simultaneously
- Cannot test migration incrementally
- Cannot rollback easily

**Solution**: Adapter pattern encapsulates schema access:
```javascript
// ✅ Adapter - decoupled from schema version
const articles = adapter.getArticlesByHost('example.com');
```

### Step 0: Create Adapter Interface

**Location**: `src/db/sqlite/adapters/ISchemaAdapter.js`

```javascript
/**
 * Schema Adapter Interface
 * 
 * All schema versions must implement this interface.
 * Enables switching between v1, v2, etc. without code changes.
 */
class ISchemaAdapter {
  constructor(db) {
    this.db = db;
  }
  
  // Article operations
  getArticleById(id) { throw new Error('Not implemented'); }
  getArticlesByHost(host, options = {}) { throw new Error('Not implemented'); }
  insertArticle(data) { throw new Error('Not implemented'); }
  updateArticle(id, data) { throw new Error('Not implemented'); }
  deleteArticle(id) { throw new Error('Not implemented'); }
  
  // Crawl job operations
  getCrawlJobById(id) { throw new Error('Not implemented'); }
  insertCrawlJob(data) { throw new Error('Not implemented'); }
  updateCrawlJobStatus(id, status) { throw new Error('Not implemented'); }
  
  // Background task operations
  getBackgroundTaskById(id) { throw new Error('Not implemented'); }
  insertBackgroundTask(data) { throw new Error('Not implemented'); }
  updateBackgroundTaskStatus(id, status) { throw new Error('Not implemented'); }
  
  // Gazetteer operations
  getPlaceByQid(qid) { throw new Error('Not implemented'); }
  getPlacesByKind(kind) { throw new Error('Not implemented'); }
  insertPlace(data) { throw new Error('Not implemented'); }
  
  // Analysis operations
  getAnalysisRunById(id) { throw new Error('Not implemented'); }
  insertAnalysisRun(data) { throw new Error('Not implemented'); }
  linkAnalysisToBackgroundTask(analysisId, taskId) { throw new Error('Not implemented'); }
  
  // Utility
  getSchemaVersion() { throw new Error('Not implemented'); }
  close() { this.db.close(); }
}

module.exports = { ISchemaAdapter };
```

### Step 1: Create Schema V1 Adapter

**Location**: `src/db/sqlite/adapters/SchemaV1Adapter.js`

**Purpose**: Encapsulate current production schema (Schema Version 1)

```javascript
const { ISchemaAdapter } = require('./ISchemaAdapter');

/**
 * Schema Version 1 Adapter
 * 
 * Wraps current production schema (as of Oct 2025).
 * Provides stable interface for existing code during v2 migration.
 * 
 * See: docs/DATABASE_SCHEMA_VERSION_1.md for complete v1 schema docs
 */
class SchemaV1Adapter extends ISchemaAdapter {
  constructor(db) {
    super(db);
    this._initStatements();
  }
  
  _initStatements() {
    // Prepare all v1 schema queries once for performance
    this.stmts = {
      // Articles
      getArticleById: this.db.prepare('SELECT * FROM articles WHERE id = ?'),
      getArticlesByHost: this.db.prepare('SELECT * FROM articles WHERE host = ? LIMIT ? OFFSET ?'),
      insertArticle: this.db.prepare(`
        INSERT INTO articles (url, title, body, host, fetched_at, created_at)
        VALUES (@url, @title, @body, @host, @fetched_at, @created_at)
      `),
      updateArticle: this.db.prepare(`
        UPDATE articles SET title = @title, body = @body WHERE id = @id
      `),
      deleteArticle: this.db.prepare('DELETE FROM articles WHERE id = ?'),
      
      // Crawl jobs
      getCrawlJobById: this.db.prepare('SELECT * FROM crawl_jobs WHERE id = ?'),
      insertCrawlJob: this.db.prepare(`
        INSERT INTO crawl_jobs (id, url, args, status, started_at, crawl_type_id)
        VALUES (@id, @url, @args, @status, @started_at, @crawl_type_id)
      `),
      updateCrawlJobStatus: this.db.prepare(`
        UPDATE crawl_jobs SET status = ?, ended_at = ? WHERE id = ?
      `),
      
      // Background tasks
      getBackgroundTaskById: this.db.prepare('SELECT * FROM background_tasks WHERE id = ?'),
      insertBackgroundTask: this.db.prepare(`
        INSERT INTO background_tasks (id, type, status, created_at, config)
        VALUES (@id, @type, @status, @created_at, @config)
      `),
      updateBackgroundTaskStatus: this.db.prepare(`
        UPDATE background_tasks SET status = ?, updated_at = ? WHERE id = ?
      `),
      
      // Gazetteer
      getPlaceByQid: this.db.prepare('SELECT * FROM places WHERE wikidata_qid = ?'),
      getPlacesByKind: this.db.prepare('SELECT * FROM places WHERE kind = ?'),
      insertPlace: this.db.prepare(`
        INSERT INTO places (wikidata_qid, name, kind, parent_qid, geometry)
        VALUES (@wikidata_qid, @name, @kind, @parent_qid, @geometry)
      `),
      
      // Analysis
      getAnalysisRunById: this.db.prepare('SELECT * FROM analysis_runs WHERE id = ?'),
      insertAnalysisRun: this.db.prepare(`
        INSERT INTO analysis_runs (id, type, status, started_at, config, background_task_id)
        VALUES (@id, @type, @status, @started_at, @config, @background_task_id)
      `),
      linkAnalysisToBackgroundTask: this.db.prepare(`
        UPDATE analysis_runs SET background_task_id = ?, background_task_status = ?
        WHERE id = ?
      `)
    };
  }
  
  // Article operations
  getArticleById(id) {
    return this.stmts.getArticleById.get(id);
  }
  
  getArticlesByHost(host, options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    return this.stmts.getArticlesByHost.all(host, limit, offset);
  }
  
  insertArticle(data) {
    return this.stmts.insertArticle.run({
      url: data.url,
      title: data.title || null,
      body: data.body || null,
      host: data.host || null,
      fetched_at: data.fetched_at || new Date().toISOString(),
      created_at: data.created_at || new Date().toISOString()
    });
  }
  
  updateArticle(id, data) {
    return this.stmts.updateArticle.run({
      id,
      title: data.title,
      body: data.body
    });
  }
  
  deleteArticle(id) {
    return this.stmts.deleteArticle.run(id);
  }
  
  // Crawl job operations
  getCrawlJobById(id) {
    return this.stmts.getCrawlJobById.get(id);
  }
  
  insertCrawlJob(data) {
    return this.stmts.insertCrawlJob.run({
      id: data.id,
      url: data.url || null,
      args: data.args || null,
      status: data.status || 'pending',
      started_at: data.started_at || new Date().toISOString(),
      crawl_type_id: data.crawl_type_id || null
    });
  }
  
  updateCrawlJobStatus(id, status) {
    return this.stmts.updateCrawlJobStatus.run(status, new Date().toISOString(), id);
  }
  
  // Background task operations
  getBackgroundTaskById(id) {
    return this.stmts.getBackgroundTaskById.get(id);
  }
  
  insertBackgroundTask(data) {
    return this.stmts.insertBackgroundTask.run({
      id: data.id,
      type: data.type,
      status: data.status || 'pending',
      created_at: data.created_at || new Date().toISOString(),
      config: data.config ? JSON.stringify(data.config) : null
    });
  }
  
  updateBackgroundTaskStatus(id, status) {
    return this.stmts.updateBackgroundTaskStatus.run(status, new Date().toISOString(), id);
  }
  
  // Gazetteer operations
  getPlaceByQid(qid) {
    return this.stmts.getPlaceByQid.get(qid);
  }
  
  getPlacesByKind(kind) {
    return this.stmts.getPlacesByKind.all(kind);
  }
  
  insertPlace(data) {
    return this.stmts.insertPlace.run({
      wikidata_qid: data.wikidata_qid,
      name: data.name,
      kind: data.kind,
      parent_qid: data.parent_qid || null,
      geometry: data.geometry ? JSON.stringify(data.geometry) : null
    });
  }
  
  // Analysis operations
  getAnalysisRunById(id) {
    return this.stmts.getAnalysisRunById.get(id);
  }
  
  insertAnalysisRun(data) {
    return this.stmts.insertAnalysisRun.run({
      id: data.id,
      type: data.type,
      status: data.status || 'pending',
      started_at: data.started_at || new Date().toISOString(),
      config: data.config ? JSON.stringify(data.config) : null,
      background_task_id: data.background_task_id || null
    });
  }
  
  linkAnalysisToBackgroundTask(analysisId, taskId) {
    // Get task status for denormalized storage
    const task = this.getBackgroundTaskById(taskId);
    return this.stmts.linkAnalysisToBackgroundTask.run(
      taskId,
      task?.status || 'unknown',
      analysisId
    );
  }
  
  // Utility
  getSchemaVersion() {
    return 1; // Explicit version identifier
  }
}

module.exports = { SchemaV1Adapter };
```

### Step 2: Update Application to Use Adapter

**Before (direct SQL)**:
```javascript
// src/ui/express/server.js
const { ensureDatabase } = require('./db/sqlite');
const db = ensureDatabase(dbPath);

// Scattered SQL queries throughout codebase
app.get('/articles', (req, res) => {
  const articles = db.prepare('SELECT * FROM articles WHERE host = ?')
    .all(req.query.host);
  res.json(articles);
});
```

**After (adapter-based)**:
```javascript
// src/ui/express/server.js
const { ensureDatabase } = require('./db/sqlite');
const { SchemaV1Adapter } = require('./db/sqlite/adapters/SchemaV1Adapter');

const db = ensureDatabase(dbPath);
const adapter = new SchemaV1Adapter(db);

// Clean, version-independent API
app.get('/articles', (req, res) => {
  const articles = adapter.getArticlesByHost(req.query.host, {
    limit: req.query.limit || 100,
    offset: req.query.offset || 0
  });
  res.json(articles);
});

// Store adapter for use across application
app.locals.dbAdapter = adapter;
```

### Step 3: Create Tests for V1 Adapter

**Location**: `src/db/sqlite/adapters/__tests__/SchemaV1Adapter.test.js`

```javascript
const { ensureDatabase } = require('../../connection');
const { SchemaV1Adapter } = require('../SchemaV1Adapter');
const { createTempDb } = require('../../../test-utils/tempDb');

describe('SchemaV1Adapter', () => {
  let dbPath, db, adapter;
  
  beforeEach(() => {
    dbPath = createTempDb();
    db = ensureDatabase(dbPath);
    adapter = new SchemaV1Adapter(db);
  });
  
  afterEach(() => {
    adapter.close();
    // Clean up temp files
  });
  
  describe('Article operations', () => {
    test('insertArticle and getArticleById', () => {
      const article = {
        url: 'http://example.com/test',
        title: 'Test Article',
        body: 'Content',
        host: 'example.com'
      };
      
      const result = adapter.insertArticle(article);
      expect(result.lastInsertRowid).toBeDefined();
      
      const retrieved = adapter.getArticleById(result.lastInsertRowid);
      expect(retrieved.url).toBe(article.url);
      expect(retrieved.title).toBe(article.title);
      expect(retrieved.host).toBe(article.host);
    });
    
    test('getArticlesByHost with pagination', () => {
      // Insert 10 articles
      for (let i = 0; i < 10; i++) {
        adapter.insertArticle({
          url: `http://example.com/${i}`,
          title: `Article ${i}`,
          host: 'example.com'
        });
      }
      
      // Test pagination
      const page1 = adapter.getArticlesByHost('example.com', { limit: 5, offset: 0 });
      expect(page1.length).toBe(5);
      
      const page2 = adapter.getArticlesByHost('example.com', { limit: 5, offset: 5 });
      expect(page2.length).toBe(5);
      
      // Verify no overlap
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });
  
  describe('Schema version', () => {
    test('getSchemaVersion returns 1', () => {
      expect(adapter.getSchemaVersion()).toBe(1);
    });
  });
});
```

### Benefits of Adapter Approach

1. **Isolated Changes**: Update schema without touching application code
2. **Parallel Operation**: Run v1 and v2 simultaneously during migration
3. **Easy Testing**: Test adapters independently
4. **Clear Interface**: Standard methods across versions
5. **Safe Rollback**: Switch back to v1 adapter if v2 fails

---

## Dual-Adapter Strategy (For Schema v2 Migration)

**Goal**: Run old and new schemas simultaneously during migration to verify compatibility.

### Prerequisites

- ✅ SchemaV1Adapter implemented and tested (see above)
- ✅ Schema v2 design documented
- ✅ All application code using adapter interface (not direct SQL)

### Step 1: Create Schema V2 Adapter

**Location**: `src/db/sqlite/adapters/`

```javascript
// src/db/sqlite/adapters/LegacyDatabaseAdapter.js
/**
 * Database adapter for OLD schema (pre-migration)
 * Maintains compatibility with existing code during migration
 */
class LegacyDatabaseAdapter {
  constructor(db) {
    this.db = db;
    this._initPreparedStatements();
  }

  _initPreparedStatements() {
    // Use OLD column names and table structures
    this.insertArticle = this.db.prepare(`
      INSERT INTO articles (url, title, body, fetched_at)
      VALUES (@url, @title, @body, @fetched_at)
    `);
    // ... other OLD schema queries
  }

  // Implement same interface as new adapter
  addArticle(data) {
    return this.insertArticle.run(data);
  }
}

module.exports = { LegacyDatabaseAdapter };
```

```javascript
// src/db/sqlite/adapters/ModernDatabaseAdapter.js
/**
 * Database adapter for NEW schema (post-migration)
 * Uses normalized tables and new column names
 */
class ModernDatabaseAdapter {
  constructor(db) {
    this.db = db;
    this._initPreparedStatements();
  }

  _initPreparedStatements() {
    // Use NEW column names and table structures
    this.insertArticle = this.db.prepare(`
      INSERT INTO articles (url, title, body, fetched_at, host)
      VALUES (@url, @title, @body, @fetched_at, @host)
    `);
    // ... other NEW schema queries
  }

  // Implement same interface as legacy adapter
  addArticle(data) {
    // NEW: Auto-extract host from URL if not provided
    if (!data.host && data.url) {
      data.host = new URL(data.url).hostname;
    }
    return this.insertArticle.run(data);
  }
}

module.exports = { ModernDatabaseAdapter };
```

### Step 2: Create Focused Adapter Tests

**Location**: `src/db/sqlite/adapters/__tests__/`

```javascript
// src/db/sqlite/adapters/__tests__/LegacyDatabaseAdapter.test.js
const { LegacyDatabaseAdapter } = require('../LegacyDatabaseAdapter');
const { ensureDatabase } = require('../../connection');
const fs = require('fs');

describe('LegacyDatabaseAdapter', () => {
  let db, adapter, dbPath;

  beforeEach(() => {
    dbPath = './test-legacy.db';
    // Delete old test DB
    try { fs.unlinkSync(dbPath); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

    // Initialize with OLD schema (no host column)
    db = ensureDatabase(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT
      )
    `);
    adapter = new LegacyDatabaseAdapter(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}
  });

  test('addArticle works with old schema', () => {
    const result = adapter.addArticle({
      url: 'https://example.com/article',
      title: 'Test Article',
      body: 'Content',
      fetched_at: new Date().toISOString()
    });

    expect(result.lastInsertRowid).toBeDefined();

    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);
    expect(article.url).toBe('https://example.com/article');
    expect(article.title).toBe('Test Article');
  });

  test('getAllArticles returns correct data', () => {
    // Insert test data
    adapter.addArticle({ url: 'https://example.com/1', title: 'Article 1', body: 'Body 1', fetched_at: '2025-10-10T12:00:00Z' });
    adapter.addArticle({ url: 'https://example.com/2', title: 'Article 2', body: 'Body 2', fetched_at: '2025-10-10T13:00:00Z' });

    const articles = adapter.getAllArticles();
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe('Article 1');
  });
});
```

```javascript
// src/db/sqlite/adapters/__tests__/ModernDatabaseAdapter.test.js
const { ModernDatabaseAdapter } = require('../ModernDatabaseAdapter');
const { ensureDatabase } = require('../../connection');
const fs = require('fs');

describe('ModernDatabaseAdapter', () => {
  let db, adapter, dbPath;

  beforeEach(() => {
    dbPath = './test-modern.db';
    // Delete old test DB
    try { fs.unlinkSync(dbPath); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

    // Initialize with NEW schema (includes host column)
    db = ensureDatabase(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT,
        host TEXT
      )
    `);
    adapter = new ModernDatabaseAdapter(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}
  });

  test('addArticle works with new schema and auto-extracts host', () => {
    const result = adapter.addArticle({
      url: 'https://example.com/article',
      title: 'Test Article',
      body: 'Content',
      fetched_at: new Date().toISOString()
      // Note: No host provided - should be auto-extracted
    });

    expect(result.lastInsertRowid).toBeDefined();

    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid);
    expect(article.url).toBe('https://example.com/article');
    expect(article.host).toBe('example.com'); // Auto-extracted!
  });

  test('getAllArticles returns correct data with host', () => {
    adapter.addArticle({ url: 'https://example.com/1', title: 'Article 1', body: 'Body 1', fetched_at: '2025-10-10T12:00:00Z' });
    adapter.addArticle({ url: 'https://news.bbc.co.uk/2', title: 'Article 2', body: 'Body 2', fetched_at: '2025-10-10T13:00:00Z' });

    const articles = adapter.getAllArticles();
    expect(articles).toHaveLength(2);
    expect(articles[0].host).toBe('example.com');
    expect(articles[1].host).toBe('news.bbc.co.uk');
  });
});
```

### Step 3: Create Dual-Database Test Suite

**Location**: `src/db/sqlite/adapters/__tests__/dual-schema.test.js`

```javascript
/**
 * Dual-Schema Compatibility Test
 * Ensures both adapters implement the same interface and produce compatible results
 */
const { LegacyDatabaseAdapter } = require('../LegacyDatabaseAdapter');
const { ModernDatabaseAdapter } = require('../ModernDatabaseAdapter');
const { ensureDatabase } = require('../../connection');
const fs = require('fs');

describe('Dual-Schema Compatibility', () => {
  let legacyDb, modernDb, legacyAdapter, modernAdapter;
  let legacyPath = './test-dual-legacy.db';
  let modernPath = './test-dual-modern.db';

  beforeEach(() => {
    // Clean up old test DBs
    [legacyPath, modernPath].forEach(path => {
      try { fs.unlinkSync(path); } catch (_) {}
      try { fs.unlinkSync(path + '-wal'); } catch (_) {}
      try { fs.unlinkSync(path + '-shm'); } catch (_) {}
    });

    // Create legacy DB with old schema
    legacyDb = ensureDatabase(legacyPath);
    legacyDb.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT
      )
    `);
    legacyAdapter = new LegacyDatabaseAdapter(legacyDb);

    // Create modern DB with new schema
    modernDb = ensureDatabase(modernPath);
    modernDb.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT,
        host TEXT
      )
    `);
    modernAdapter = new ModernDatabaseAdapter(modernDb);
  });

  afterEach(() => {
    legacyDb.close();
    modernDb.close();
    [legacyPath, modernPath].forEach(path => {
      try { fs.unlinkSync(path); } catch (_) {}
      try { fs.unlinkSync(path + '-wal'); } catch (_) {}
      try { fs.unlinkSync(path + '-shm'); } catch (_) {}
    });
  });

  test('Both adapters implement same interface', () => {
    // Verify both adapters have same methods
    const legacyMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(legacyAdapter));
    const modernMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(modernAdapter));

    const publicMethods = legacyMethods.filter(m => !m.startsWith('_') && m !== 'constructor');
    publicMethods.forEach(method => {
      expect(modernAdapter).toHaveProperty(method);
      expect(typeof modernAdapter[method]).toBe('function');
    });
  });

  test('Same data produces compatible results', () => {
    const testArticle = {
      url: 'https://example.com/test',
      title: 'Test Article',
      body: 'Test body content',
      fetched_at: '2025-10-10T12:00:00Z'
    };

    // Insert same article into both DBs
    const legacyResult = legacyAdapter.addArticle(testArticle);
    const modernResult = modernAdapter.addArticle(testArticle);

    // Both should succeed
    expect(legacyResult.lastInsertRowid).toBeDefined();
    expect(modernResult.lastInsertRowid).toBeDefined();

    // Retrieve from both DBs
    const legacyArticles = legacyAdapter.getAllArticles();
    const modernArticles = modernAdapter.getAllArticles();

    // Both should have 1 article
    expect(legacyArticles).toHaveLength(1);
    expect(modernArticles).toHaveLength(1);

    // Core fields should match
    expect(legacyArticles[0].url).toBe(modernArticles[0].url);
    expect(legacyArticles[0].title).toBe(modernArticles[0].title);
    expect(legacyArticles[0].body).toBe(modernArticles[0].body);

    // Modern DB should have additional host field
    expect(modernArticles[0].host).toBe('example.com');
  });

  test('Migration path preserves data integrity', () => {
    // Insert data into legacy DB
    legacyAdapter.addArticle({ url: 'https://bbc.co.uk/1', title: 'Article 1', body: 'Body 1', fetched_at: '2025-10-10T10:00:00Z' });
    legacyAdapter.addArticle({ url: 'https://cnn.com/2', title: 'Article 2', body: 'Body 2', fetched_at: '2025-10-10T11:00:00Z' });

    // Simulate migration: Export from legacy, import to modern
    const legacyArticles = legacyAdapter.getAllArticles();
    legacyArticles.forEach(article => {
      modernAdapter.addArticle(article);
    });

    // Verify modern DB has same count
    const modernArticles = modernAdapter.getAllArticles();
    expect(modernArticles).toHaveLength(legacyArticles.length);

    // Verify modern DB auto-extracted hosts
    expect(modernArticles.find(a => a.url.includes('bbc.co.uk')).host).toBe('bbc.co.uk');
    expect(modernArticles.find(a => a.url.includes('cnn.com')).host).toBe('cnn.com');
  });
});
```

**Run Dual-Schema Tests**:
```bash
npm run test:file "dual-schema"
npm run test:file "LegacyDatabaseAdapter"
npm run test:file "ModernDatabaseAdapter"
```

---

## Export/Import Testing Workflow

**Goal**: Verify that exporting a subset of data and importing it to new schema preserves all referential integrity.

### Step 1: Create Export Tool

**Location**: `src/db/sqlite/tools/export-subset.js`

```javascript
/**
 * Export a subset of database content with all references intact
 * 
 * Usage:
 *   node src/db/sqlite/tools/export-subset.js \
 *     --db data/news.db \
 *     --output exports/test-subset.json \
 *     --articles 100 \
 *     --with-references
 */

const { ensureDatabase } = require('../connection');
const fs = require('fs');
const path = require('path');

class DatabaseExporter {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      includeReferences: options.includeReferences !== false,
      verbose: options.verbose || false,
      logger: options.logger || console
    };
  }

  /**
   * Export a subset of articles with all related data
   * @param {number} limit - Maximum number of articles to export
   * @returns {Object} - Export data with articles, urls, fetches, etc.
   */
  exportArticles(limit = 100) {
    const exported = {
      metadata: {
        exportedAt: new Date().toISOString(),
        schemaVersion: this.db.pragma('user_version', { simple: true }),
        limit,
        includeReferences: this.options.includeReferences
      },
      articles: [],
      urls: [],
      fetches: [],
      url_aliases: [],
      place_sources: []
    };

    // Export articles
    const articles = this.db.prepare(`
      SELECT * FROM articles 
      ORDER BY id DESC 
      LIMIT ?
    `).all(limit);
    
    exported.articles = articles;
    this.log(`Exported ${articles.length} articles`);

    if (!this.options.includeReferences) {
      return exported;
    }

    // Extract all URLs from articles
    const articleUrls = [...new Set(articles.map(a => a.url))];
    this.log(`Found ${articleUrls.length} unique URLs in articles`);

    // Export related URLs
    if (articleUrls.length > 0) {
      const placeholders = articleUrls.map(() => '?').join(',');
      exported.urls = this.db.prepare(`
        SELECT * FROM urls WHERE url IN (${placeholders})
      `).all(...articleUrls);
      this.log(`Exported ${exported.urls.length} related URLs`);

      // Export related fetches
      exported.fetches = this.db.prepare(`
        SELECT * FROM fetches WHERE url IN (${placeholders})
      `).all(...articleUrls);
      this.log(`Exported ${exported.fetches.length} related fetches`);

      // Export related URL aliases
      exported.url_aliases = this.db.prepare(`
        SELECT * FROM url_aliases WHERE url IN (${placeholders}) OR alias_url IN (${placeholders})
      `).all(...articleUrls, ...articleUrls);
      this.log(`Exported ${exported.url_aliases.length} URL aliases`);

      // Export related place_sources
      exported.place_sources = this.db.prepare(`
        SELECT * FROM place_sources WHERE url IN (${placeholders})
      `).all(...articleUrls);
      this.log(`Exported ${exported.place_sources.length} place sources`);
    }

    // Validate referential integrity
    this.validateReferences(exported);

    return exported;
  }

  /**
   * Validate that all references in exported data are satisfied
   * @param {Object} exported - Exported data object
   * @throws {Error} - If missing references detected
   */
  validateReferences(exported) {
    const errors = [];

    // Check that all article URLs exist in urls table
    const urlSet = new Set(exported.urls.map(u => u.url));
    const missingUrls = exported.articles
      .map(a => a.url)
      .filter(url => !urlSet.has(url));

    if (missingUrls.length > 0) {
      errors.push(`Missing ${missingUrls.length} URLs referenced by articles: ${missingUrls.slice(0, 5).join(', ')}`);
    }

    // Check that all fetch URLs exist in urls table
    const missingFetchUrls = exported.fetches
      .map(f => f.url)
      .filter(url => !urlSet.has(url));

    if (missingFetchUrls.length > 0) {
      errors.push(`Missing ${missingFetchUrls.length} URLs referenced by fetches: ${missingFetchUrls.slice(0, 5).join(', ')}`);
    }

    // Check that all url_alias URLs and alias_urls exist
    const allAliasUrls = [
      ...exported.url_aliases.map(a => a.url),
      ...exported.url_aliases.map(a => a.alias_url)
    ];
    const missingAliasUrls = allAliasUrls.filter(url => !urlSet.has(url));

    if (missingAliasUrls.length > 0) {
      this.log(`Warning: ${missingAliasUrls.length} alias URLs not in urls table (may be external references)`);
    }

    if (errors.length > 0) {
      throw new Error(`Referential integrity validation failed:\n${errors.join('\n')}`);
    }

    this.log('✓ Referential integrity validated');
  }

  log(message) {
    if (this.options.verbose) {
      this.options.logger.log(`[DatabaseExporter] ${message}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, defaultValue) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : defaultValue;
  };

  const dbPath = getArg('db', 'data/news.db');
  const outputPath = getArg('output', 'exports/test-subset.json');
  const limit = parseInt(getArg('articles', '100'), 10);
  const withReferences = !args.includes('--no-references');
  const verbose = args.includes('--verbose');

  try {
    const db = ensureDatabase(dbPath);
    const exporter = new DatabaseExporter(db, { includeReferences: withReferences, verbose });
    
    console.log(`Exporting ${limit} articles from ${dbPath}...`);
    const exported = exporter.exportArticles(limit);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write export file
    fs.writeFileSync(outputPath, JSON.stringify(exported, null, 2));
    console.log(`✓ Export complete: ${outputPath}`);
    console.log(`  Articles: ${exported.articles.length}`);
    console.log(`  URLs: ${exported.urls.length}`);
    console.log(`  Fetches: ${exported.fetches.length}`);
    console.log(`  URL Aliases: ${exported.url_aliases.length}`);
    console.log(`  Place Sources: ${exported.place_sources.length}`);
    
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('Export failed:', err.message);
    process.exit(1);
  }
}

module.exports = { DatabaseExporter };
```

### Step 2: Create Import Tool

**Location**: `src/db/sqlite/tools/import-subset.js`

```javascript
/**
 * Import exported database content to new schema
 * 
 * Usage:
 *   node src/db/sqlite/tools/import-subset.js \
 *     --input exports/test-subset.json \
 *     --db data/news-new.db \
 *     --validate
 */

const { ensureDatabase } = require('../connection');
const { ModernDatabaseAdapter } = require('../adapters/ModernDatabaseAdapter');
const fs = require('fs');

class DatabaseImporter {
  constructor(db, options = {}) {
    this.db = db;
    this.adapter = new ModernDatabaseAdapter(db);
    this.options = {
      validate: options.validate !== false,
      verbose: options.verbose || false,
      logger: options.logger || console
    };
  }

  /**
   * Import exported data into database
   * @param {Object} exportData - Data exported by DatabaseExporter
   * @returns {Object} - Import statistics
   */
  importData(exportData) {
    const stats = {
      articles: 0,
      urls: 0,
      fetches: 0,
      url_aliases: 0,
      place_sources: 0,
      errors: []
    };

    this.log(`Importing data from schema version ${exportData.metadata.schemaVersion}`);

    // Import in dependency order: urls → articles/fetches → url_aliases → place_sources
    
    // 1. Import URLs first (referenced by everything else)
    this.log(`Importing ${exportData.urls.length} URLs...`);
    exportData.urls.forEach(url => {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO urls (url, created_at, last_seen_at, host)
          VALUES (@url, @created_at, @last_seen_at, @host)
        `).run({
          url: url.url,
          created_at: url.created_at,
          last_seen_at: url.last_seen_at,
          host: url.host || new URL(url.url).hostname // Auto-extract if missing
        });
        stats.urls++;
      } catch (err) {
        stats.errors.push(`URL import failed (${url.url}): ${err.message}`);
      }
    });

    // 2. Import articles
    this.log(`Importing ${exportData.articles.length} articles...`);
    exportData.articles.forEach(article => {
      try {
        this.adapter.addArticle(article);
        stats.articles++;
      } catch (err) {
        stats.errors.push(`Article import failed (${article.url}): ${err.message}`);
      }
    });

    // 3. Import fetches
    this.log(`Importing ${exportData.fetches.length} fetches...`);
    exportData.fetches.forEach(fetch => {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO fetches (url, fetched_at, http_status, classification, word_count, host)
          VALUES (@url, @fetched_at, @http_status, @classification, @word_count, @host)
        `).run({
          url: fetch.url,
          fetched_at: fetch.fetched_at,
          http_status: fetch.http_status,
          classification: fetch.classification,
          word_count: fetch.word_count,
          host: fetch.host || new URL(fetch.url).hostname
        });
        stats.fetches++;
      } catch (err) {
        stats.errors.push(`Fetch import failed (${fetch.url}): ${err.message}`);
      }
    });

    // 4. Import URL aliases
    this.log(`Importing ${exportData.url_aliases.length} URL aliases...`);
    exportData.url_aliases.forEach(alias => {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO url_aliases (url, alias_url, classification, reason, url_exists, checked_at, metadata)
          VALUES (@url, @alias_url, @classification, @reason, @url_exists, @checked_at, @metadata)
        `).run(alias);
        stats.url_aliases++;
      } catch (err) {
        stats.errors.push(`URL alias import failed (${alias.url} → ${alias.alias_url}): ${err.message}`);
      }
    });

    // 5. Import place sources
    this.log(`Importing ${exportData.place_sources.length} place sources...`);
    exportData.place_sources.forEach(ps => {
      try {
        this.db.prepare(`
          INSERT OR IGNORE INTO place_sources (url, place_id, provenance, confidence, discovered_at)
          VALUES (@url, @place_id, @provenance, @confidence, @discovered_at)
        `).run(ps);
        stats.place_sources++;
      } catch (err) {
        stats.errors.push(`Place source import failed (${ps.url}): ${err.message}`);
      }
    });

    if (this.options.validate) {
      this.validateImport(exportData, stats);
    }

    return stats;
  }

  /**
   * Validate that imported data matches export
   * @param {Object} exportData - Original export data
   * @param {Object} stats - Import statistics
   */
  validateImport(exportData, stats) {
    this.log('Validating import...');

    const validationErrors = [];

    // Check counts match (accounting for duplicates/conflicts)
    if (stats.articles < exportData.articles.length * 0.9) {
      validationErrors.push(`Only ${stats.articles}/${exportData.articles.length} articles imported`);
    }

    if (stats.urls < exportData.urls.length * 0.9) {
      validationErrors.push(`Only ${stats.urls}/${exportData.urls.length} URLs imported`);
    }

    // Sample check: Verify a few articles exist
    const sampleArticles = exportData.articles.slice(0, 5);
    sampleArticles.forEach(article => {
      const exists = this.db.prepare('SELECT 1 FROM articles WHERE url = ?').get(article.url);
      if (!exists) {
        validationErrors.push(`Sample article not found: ${article.url}`);
      }
    });

    if (validationErrors.length > 0) {
      throw new Error(`Import validation failed:\n${validationErrors.join('\n')}`);
    }

    this.log('✓ Import validation passed');
  }

  log(message) {
    if (this.options.verbose) {
      this.options.logger.log(`[DatabaseImporter] ${message}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (name, defaultValue) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : defaultValue;
  };

  const inputPath = getArg('input', 'exports/test-subset.json');
  const dbPath = getArg('db', 'data/news-new.db');
  const validate = !args.includes('--no-validate');
  const verbose = args.includes('--verbose');

  try {
    console.log(`Importing ${inputPath} to ${dbPath}...`);
    
    const exportData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const db = ensureDatabase(dbPath);
    const importer = new DatabaseImporter(db, { validate, verbose });
    
    const stats = importer.importData(exportData);
    
    console.log('✓ Import complete:');
    console.log(`  Articles: ${stats.articles}`);
    console.log(`  URLs: ${stats.urls}`);
    console.log(`  Fetches: ${stats.fetches}`);
    console.log(`  URL Aliases: ${stats.url_aliases}`);
    console.log(`  Place Sources: ${stats.place_sources}`);
    
    if (stats.errors.length > 0) {
      console.log(`  Errors: ${stats.errors.length}`);
      stats.errors.slice(0, 10).forEach(err => console.log(`    - ${err}`));
    }
    
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
}

module.exports = { DatabaseImporter };
```

### Step 3: Create Export/Import Test Suite

**Location**: `src/db/sqlite/tools/__tests__/export-import.test.js`

```javascript
/**
 * Export/Import Workflow Test
 * Verifies that exporting and importing preserves data integrity
 */
const { DatabaseExporter } = require('../export-subset');
const { DatabaseImporter } = require('../import-subset');
const { ensureDatabase } = require('../../connection');
const fs = require('fs');

describe('Export/Import Workflow', () => {
  let sourceDb, targetDb, sourcePath, targetPath, exportPath;

  beforeEach(() => {
    sourcePath = './test-export-source.db';
    targetPath = './test-export-target.db';
    exportPath = './test-export-data.json';

    // Clean up old files
    [sourcePath, targetPath].forEach(path => {
      try { fs.unlinkSync(path); } catch (_) {}
      try { fs.unlinkSync(path + '-wal'); } catch (_) {}
      try { fs.unlinkSync(path + '-shm'); } catch (_) {}
    });
    try { fs.unlinkSync(exportPath); } catch (_) {}

    // Create source DB with test data
    sourceDb = ensureDatabase(sourcePath);
    sourceDb.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS urls (
        url TEXT PRIMARY KEY,
        created_at TEXT,
        last_seen_at TEXT,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS fetches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        fetched_at TEXT,
        http_status INTEGER,
        classification TEXT,
        word_count INTEGER,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS url_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        alias_url TEXT NOT NULL,
        classification TEXT,
        reason TEXT,
        url_exists INTEGER,
        checked_at TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS place_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        place_id INTEGER,
        provenance TEXT,
        confidence REAL,
        discovered_at TEXT
      );
    `);

    // Insert test data
    const urls = ['https://example.com/1', 'https://example.com/2', 'https://bbc.co.uk/news'];
    urls.forEach(url => {
      sourceDb.prepare('INSERT INTO urls (url, created_at, last_seen_at, host) VALUES (?, ?, ?, ?)').run(
        url,
        '2025-10-10T10:00:00Z',
        '2025-10-10T12:00:00Z',
        new URL(url).hostname
      );
      sourceDb.prepare('INSERT INTO articles (url, title, body, fetched_at, host) VALUES (?, ?, ?, ?, ?)').run(
        url,
        `Article from ${url}`,
        'Test body content',
        '2025-10-10T11:00:00Z',
        new URL(url).hostname
      );
    });

    // Create target DB with same schema
    targetDb = ensureDatabase(targetPath);
    targetDb.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT,
        body TEXT,
        fetched_at TEXT,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS urls (
        url TEXT PRIMARY KEY,
        created_at TEXT,
        last_seen_at TEXT,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS fetches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        fetched_at TEXT,
        http_status INTEGER,
        classification TEXT,
        word_count INTEGER,
        host TEXT
      );
      CREATE TABLE IF NOT EXISTS url_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        alias_url TEXT NOT NULL,
        classification TEXT,
        reason TEXT,
        url_exists INTEGER,
        checked_at TEXT,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS place_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        place_id INTEGER,
        provenance TEXT,
        confidence REAL,
        discovered_at TEXT
      );
    `);
  });

  afterEach(() => {
    sourceDb?.close();
    targetDb?.close();
    [sourcePath, targetPath].forEach(path => {
      try { fs.unlinkSync(path); } catch (_) {}
      try { fs.unlinkSync(path + '-wal'); } catch (_) {}
      try { fs.unlinkSync(path + '-shm'); } catch (_) {}
    });
    try { fs.unlinkSync(exportPath); } catch (_) {}
  });

  test('exports data with referential integrity', () => {
    const exporter = new DatabaseExporter(sourceDb, { verbose: false });
    const exported = exporter.exportArticles(10);

    expect(exported.metadata).toBeDefined();
    expect(exported.metadata.exportedAt).toBeDefined();
    expect(exported.articles.length).toBe(3);
    expect(exported.urls.length).toBe(3);

    // All article URLs should be in urls table
    const urlSet = new Set(exported.urls.map(u => u.url));
    exported.articles.forEach(article => {
      expect(urlSet.has(article.url)).toBe(true);
    });
  });

  test('imports data successfully', () => {
    // Export from source
    const exporter = new DatabaseExporter(sourceDb, { verbose: false });
    const exported = exporter.exportArticles(10);

    // Import to target
    const importer = new DatabaseImporter(targetDb, { verbose: false });
    const stats = importer.importData(exported);

    expect(stats.articles).toBe(3);
    expect(stats.urls).toBe(3);
    expect(stats.errors).toHaveLength(0);

    // Verify data in target DB
    const articles = targetDb.prepare('SELECT * FROM articles').all();
    expect(articles.length).toBe(3);
    expect(articles[0].host).toBeDefined();
  });

  test('round-trip preserves data', () => {
    // Get original data
    const originalArticles = sourceDb.prepare('SELECT * FROM articles ORDER BY url').all();

    // Export
    const exporter = new DatabaseExporter(sourceDb, { verbose: false });
    const exported = exporter.exportArticles(10);

    // Import
    const importer = new DatabaseImporter(targetDb, { verbose: false });
    importer.importData(exported);

    // Get imported data
    const importedArticles = targetDb.prepare('SELECT * FROM articles ORDER BY url').all();

    // Compare
    expect(importedArticles.length).toBe(originalArticles.length);
    originalArticles.forEach((original, i) => {
      const imported = importedArticles[i];
      expect(imported.url).toBe(original.url);
      expect(imported.title).toBe(original.title);
      expect(imported.body).toBe(original.body);
      expect(imported.host).toBe(original.host);
    });
  });

  test('validates missing references', () => {
    const exporter = new DatabaseExporter(sourceDb, { verbose: false });
    const exported = exporter.exportArticles(10);

    // Corrupt export by removing URLs
    exported.urls = [];

    // Import should fail validation
    const importer = new DatabaseImporter(targetDb, { validate: true, verbose: false });
    expect(() => importer.importData(exported)).toThrow(/Missing.*URLs referenced by articles/);
  });
});
```

**Run Export/Import Tests**:
```bash
npm run test:file "export-import"

# Manual export/import test with real database
node src/db/sqlite/tools/export-subset.js --db data/news.db --output exports/test-100.json --articles 100 --verbose
node src/db/sqlite/tools/import-subset.js --input exports/test-100.json --db data/news-test.db --verbose
```

---

## Migration Execution Process

**Follow this checklist for every database migration:**

### Phase 1: Planning (1-2 hours)

- [ ] Create migration document in `docs/migrations/YYYY-MM-DD-migration-name.md`
- [ ] Document current schema version
- [ ] Identify all affected tables, columns, and code
- [ ] Create rollback plan
- [ ] Estimate migration time and downtime
- [ ] Get approval if migration affects production

### Phase 2: Dual-Adapter Development (2-4 hours)

- [ ] Create `LegacyDatabaseAdapter` for old schema
- [ ] Create `ModernDatabaseAdapter` for new schema
- [ ] Write focused tests for both adapters
- [ ] Write dual-schema compatibility tests
- [ ] All adapter tests pass: `npm run test:file "Adapter"`

### Phase 3: Export/Import Testing (1-2 hours)

- [ ] Export small subset (100 records): `node src/db/sqlite/tools/export-subset.js --articles 100`
- [ ] Verify export has all references intact
- [ ] Import to test database: `node src/db/sqlite/tools/import-subset.js --input exports/test-100.json`
- [ ] Verify import validation passes
- [ ] Run export/import tests: `npm run test:file "export-import"`

### Phase 4: Code Migration (2-8 hours)

- [ ] Update `src/db/sqlite/v1/schema-definitions.js` with new schema
- [ ] Add migration logic to `src/db/sqlite/v1/schema.js` `initCoreTables()`
- [ ] Update `SQLiteNewsDatabase.js` prepared statements
- [ ] Update all query modules in `src/db/sqlite/v1/queries/`
- [ ] Update all tests to use new schema
- [ ] All tests pass: `npm test`

### Phase 5: Data Migration (30 min - 4 hours)

**For Development Database**:
```bash
# Option 1: Fresh schema (fastest, loses data)
rm data/news.db data/news.db-wal data/news.db-shm
npm start  # Will create DB with new schema

# Option 2: In-place migration (preserves data)
node src/db/sqlite/tools/migrate-database.js --db data/news.db --backup data/news-backup.db
```

**For Production Database** (if applicable):
```bash
# 1. Backup first
cp data/news.db data/news-backup-YYYY-MM-DD.db

# 2. Export current data
node src/db/sqlite/tools/export-subset.js --db data/news.db --output exports/full-export.json --articles 999999

# 3. Create new database with new schema
rm data/news-new.db
node -e "require('./src/db/sqlite').ensureDatabase('./data/news-new.db')"

# 4. Import data
node src/db/sqlite/tools/import-subset.js --input exports/full-export.json --db data/news-new.db --validate

# 5. Verify data integrity
node tools/debug/count-tables.js --db data/news-new.db > counts-after.txt
diff counts-before.txt counts-after.txt

# 6. Swap databases (downtime here)
mv data/news.db data/news-old.db
mv data/news-new.db data/news.db

# 7. Test system
npm start
# Run smoke tests, check critical features

# 8. If success, delete old database after 1 week
# If failure, rollback: mv data/news-old.db data/news.db
```

### Phase 6: Validation (30 min)

- [ ] Start server: `npm start`
- [ ] Run full test suite: `npm test`
- [ ] Check critical features work (crawling, analysis, UI)
- [ ] Monitor logs for schema errors
- [ ] Verify data counts match pre-migration
- [ ] Update migration document with results

### Phase 7: Documentation (30 min)

- [ ] Update `docs/DATABASE_SCHEMA_ISSUES_STATUS.md`
- [ ] Update `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` (this file)
- [ ] Update `AGENTS.md` with migration status
- [ ] Commit migration tools and tests
- [ ] Document lessons learned

---

## Validation and Rollback

### Validation Checklist

After migration, verify:

```bash
# 1. Schema version updated
node -e "const db = require('./src/db/sqlite').ensureDatabase('./data/news.db'); console.log('Schema version:', db.pragma('user_version', { simple: true })); db.close();"

# 2. Table counts unchanged (or expected changes)
node tools/debug/count-tables.js > counts-after.txt
diff counts-before.txt counts-after.txt

# 3. No schema errors in logs
npm start 2>&1 | grep -i "schema.*error\|failed to initialize"

# 4. All tests pass
npm test

# 5. Critical features work
# - Can create new crawl job
# - Can view articles in UI
# - Can run analysis
# - Can export database
```

### Rollback Procedure

**If migration fails:**

```bash
# 1. Stop server
pkill -f "node.*server.js"

# 2. Restore backup
cp data/news-backup-YYYY-MM-DD.db data/news.db

# 3. Clear WAL files
rm data/news.db-wal data/news.db-shm

# 4. Verify backup integrity
sqlite3 data/news.db "PRAGMA integrity_check;"

# 5. Start server
npm start

# 6. Document failure
echo "Migration failed: [reason]" >> docs/migrations/YYYY-MM-DD-migration-name.md
```

---

## Integration with Development Workflow

### Check Migration Status Before Starting Work

**Every agent session should start with:**

```bash
# Check schema version
node -e "const db = require('./src/db/sqlite').ensureDatabase('./data/news.db'); console.log('Schema version:', db.pragma('user_version', { simple: true })); db.close();"

# Check for pending migrations
grep -r "TODO.*migration\|FIXME.*schema" src/db/sqlite/

# Check test status
npm run test:file "schema"
```

### When Feature Requires Schema Change

**Before implementing feature:**

1. Check if schema change is needed:
   ```bash
   # Search for table/column references
   grep -r "articles\|urls\|fetches" src/**/*.js
   ```

2. If schema change needed:
   - Create migration document first
   - Implement dual adapters
   - Test export/import workflow
   - Then implement feature

3. Update documentation:
   - Add migration status to feature doc
   - Link to migration guide
   - Document rollback plan

### Documentation Cross-References

**Other docs that reference migrations:**

- **`AGENTS.md`** - "Database Architecture" section should link here
- **`docs/DATABASE_SCHEMA_ISSUES_STATUS.md`** - Current migration state
- **`docs/DATABASE_NORMALIZATION_PLAN.md`** - Future migration plans
- **`docs/PHASE_0_IMPLEMENTATION.md`** - Migration infrastructure (ready to implement)
- **`README.md`** - Should mention migration status in setup section
- **`RUNBOOK.md`** - Operations guide should link here for production migrations

**When updating this guide, also update:**
- `AGENTS.md` - Add entry in Topic Index and "When to Read Which Docs" table
- `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` - Update "Fixed items" section
- Any feature docs that triggered the migration

---

## Troubleshooting

### Common Issues

**Issue: "no such column" errors after migration**

```bash
# Check if column exists
sqlite3 data/news.db "PRAGMA table_info(articles);" | grep column_name

# Check migration ran
grep "Adding.*column" logs/server.log

# Manually add column if migration failed
sqlite3 data/news.db "ALTER TABLE articles ADD COLUMN host TEXT;"
```

**Issue: "datatype mismatch" errors**

```bash
# Check column types
sqlite3 data/news.db ".schema articles"

# This means old data in column doesn't match new type
# Solution: Export, transform, reimport
node src/db/sqlite/tools/export-subset.js --articles 999999
# Edit exported JSON to fix datatypes
node src/db/sqlite/tools/import-subset.js --input exports/fixed.json
```

**Issue: Import validation fails**

```bash
# Check what's missing
node src/db/sqlite/tools/export-subset.js --articles 100 --verbose 2>&1 | grep "Missing"

# Usually means export didn't include all references
# Fix: Update DatabaseExporter to include missing table
```

**Issue: Migration too slow (>1 hour)**

```bash
# Check for missing indexes
sqlite3 data/news.db ".indexes articles"

# Add indexes before migration
sqlite3 data/news.db "CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);"

# Or migrate in smaller batches
for i in {1..10}; do
  node src/db/sqlite/tools/export-subset.js --articles 1000 --offset $((i*1000))
  node src/db/sqlite/tools/import-subset.js --input exports/batch-$i.json
done
```

---

## Quick Reference Commands

```bash
# Check schema version
node -e "const db = require('./src/db/sqlite').ensureDatabase('./data/news.db'); console.log('Schema:', db.pragma('user_version', { simple: true })); db.close();"

# Export test subset
node src/db/sqlite/tools/export-subset.js --db data/news.db --output exports/test-100.json --articles 100 --verbose

# Import to test database
node src/db/sqlite/tools/import-subset.js --input exports/test-100.json --db data/news-test.db --verbose

# Run adapter tests
npm run test:file "Adapter|dual-schema"

# Run export/import tests
npm run test:file "export-import"

# Count table rows (before/after comparison)
node tools/debug/count-tables.js > counts-before.txt

# Check for schema errors in logs
npm start 2>&1 | grep -i "schema.*error\|failed to initialize"

# Backup database
cp data/news.db data/news-backup-$(date +%Y-%m-%d).db

# Full test suite
npm test
```

---

## Related Documentation

- **`docs/DATABASE_SCHEMA_ISSUES_STATUS.md`** - Current schema state and known issues
- **`docs/DATABASE_MIGRATION_STRATEGY.md`** - Historical migration decisions and lessons
- **`docs/DATABASE_NORMALIZATION_PLAN.md`** - Long-term normalization roadmap (1660 lines)
- **`docs/PHASE_0_IMPLEMENTATION.md`** - Migration infrastructure ready to implement (761 lines)
- **`AGENTS.md`** - "Database Architecture" section with quick patterns
- **`RUNBOOK.md`** - Production operations and emergency procedures

---

**End of Guide** - Last Updated: 2025-10-10
