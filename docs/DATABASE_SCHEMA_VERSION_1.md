# [DEPRECATED] Database Schema Version 1

> **⚠️ DEPRECATED**: This document is outdated. Please refer to [docs/database/schema/main.md](database/schema/main.md) for the current schema documentation.

**Status**: Archived  
**Version**: 1 (Legacy)  
**Date Established**: 2024-2025  
**Last Updated**: October 11, 2025

---

## Overview

This document defines **DB Schema Version 1**, the current production database schema. All code currently deployed uses this schema version.

**Critical**: This is the baseline schema. Future schema versions (v2, v3, etc.) will be implemented as separate adapters to ensure zero-downtime migrations.

**Upcoming Changes**: Schema Version 2 introduces major normalization work (splitting the denormalized `articles` table, dedicated HTTP metadata tables, compressed content storage, and stronger foreign key constraints). Treat every adapter and migration plan as a bridge between the current denormalized design and this normalized future state.

---

## Schema Version Tracking

### Current State (Schema v1)

**❌ NOT YET IMPLEMENTED**: Formal schema versioning

The database currently has **no explicit version tracking**:
- No `PRAGMA user_version` set
- No `schema_versions` table
- No version checking on startup
- Migrations are ad-hoc ALTER TABLE statements in `schema.js`

### Implications

1. **Version is implicit**: Current production schema = "Version 1"
2. **Migration detection**: Happens via column inspection (checks if column exists)
3. **No rollback capability**: Cannot easily revert to previous schema
4. **No migration history**: Cannot tell which migrations have been applied

### Future Implementation (Phase 0)

When schema versioning is added:

```sql
-- Track which schema version is active
PRAGMA user_version = 1;

-- Or with dedicated table:
CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1
);

INSERT INTO schema_versions (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial schema version (current production)');
```

**See**: `docs/PHASE_0_IMPLEMENTATION.md` for complete version tracking implementation

---

## Database API (Version 1)

### Primary Entry Points

**Location**: `src/db/sqlite/index.js`

```javascript
const { ensureDatabase, wrapWithTelemetry } = require('./db/sqlite');

// Simple database access (most common)
const db = ensureDatabase('./data/news.db');
const articles = db.prepare('SELECT * FROM articles WHERE host = ?').all('example.com');

// With query telemetry (optional)
const instrumentedDb = wrapWithTelemetry(db, { trackQueries: true });
```

### Legacy API (Backward Compatibility)

```javascript
const { ensureDb, createInstrumentedDb } = require('./db/sqlite');

// Old function names still work
const db = ensureDb('./data/news.db');
const instrDb = createInstrumentedDb(db);
```

### Database Handle Contract (Version 1)

All functions return a `better-sqlite3` `Database` instance with these characteristics:

1. **WAL Mode Enabled**: `PRAGMA journal_mode = WAL`
2. **Foreign Keys Enabled**: `PRAGMA foreign_keys = ON`
3. **Busy Timeout**: 5000ms
4. **Synchronous**: NORMAL
5. **Schema Initialized**: All tables created via `initializeSchema()`

**CRITICAL**: Schema Version 1 assumes **single connection** for tests (WAL isolation issue)

---

## Core Tables (Version 1)

### Articles System

**Primary Table**: `articles`
- **Denormalized Design**: 30+ columns mixing URL, HTTP metadata, content, timing, analysis
- **Known Issues**: Duplicate data with `fetches` table, inefficient queries
- **Future**: Will be normalized in Schema v2 (see `DATABASE_NORMALIZATION_PLAN.md`)

**Related Tables**:
- `fetches` - HTTP request/response metadata
- `urls` - URL discovery tracking
- `url_aliases` - URL canonicalization

### Crawl System (Foreground)

**Primary Table**: `crawl_jobs`
- `id` - TEXT PRIMARY KEY (migrated from INTEGER in Oct 2025)
- Links to `crawl_types`, `queue_events`

**Known Issues**:
- `crawl_jobs.id` migration incomplete (some code may still expect INTEGER)

### Background Tasks System

**Primary Table**: `background_tasks`
- Long-running operations (compression, analysis, exports)
- Links to `analysis_runs`, compression jobs

**Integration**: `analysis_runs.background_task_id` added October 2025

### Gazetteer (Places)

**Primary Table**: `places`
- `wikidata_qid` - TEXT (unique identifier)
- `kind` - place type (country, city, etc.)

**Known Issues**:
- Missing migration for `wikidata_qid` column (gazetteer degraded in some environments)
- See `DATABASE_SCHEMA_ISSUES_STATUS.md` for details

### Analysis System

**Primary Table**: `analysis_runs`
- Analysis execution tracking
- Links to `background_tasks` via `background_task_id` (added Oct 2025)

---

## Migration Strategy (v1 → v2)

### Encapsulation Requirement

To enable smooth transitions between schema versions:

1. **Create `SchemaV1Adapter` class**:
   - Encapsulates all v1 schema access
   - Provides stable interface for current code
   - Location: `src/db/sqlite/adapters/SchemaV1Adapter.js`

2. **Create `SchemaV2Adapter` class** (future):
   - Implements same interface as v1
   - Uses normalized schema internally
   - Can run alongside v1 during migration

3. **Use dependency injection**:
   - Code depends on adapter interface, not specific version
   - Switch adapters without code changes

### Example Adapter Interface

```javascript
// src/db/sqlite/adapters/ISchemaAdapter.js (interface)
class ISchemaAdapter {
  // Article operations
  getArticleById(id) { throw new Error('Not implemented'); }
  insertArticle(data) { throw new Error('Not implemented'); }
  updateArticle(id, data) { throw new Error('Not implemented'); }
  
  // Crawl operations
  getCrawlJobById(id) { throw new Error('Not implemented'); }
  insertCrawlJob(data) { throw new Error('Not implemented'); }
  
  // Background task operations
  getBackgroundTaskById(id) { throw new Error('Not implemented'); }
  insertBackgroundTask(data) { throw new Error('Not implemented'); }
  
  // Gazetteer operations
  getPlaceByQid(qid) { throw new Error('Not implemented'); }
  insertPlace(data) { throw new Error('Not implemented'); }
  
  // Analysis operations
  getAnalysisRunById(id) { throw new Error('Not implemented'); }
  insertAnalysisRun(data) { throw new Error('Not implemented'); }
}

// src/db/sqlite/adapters/SchemaV1Adapter.js
class SchemaV1Adapter extends ISchemaAdapter {
  constructor(db) {
    super();
    this.db = db;
    this._initStatements();
  }
  
  _initStatements() {
    // Prepare all v1 schema queries
    this.getArticleStmt = this.db.prepare('SELECT * FROM articles WHERE id = ?');
    this.insertArticleStmt = this.db.prepare(`
      INSERT INTO articles (url, title, body, host, fetched_at)
      VALUES (@url, @title, @body, @host, @fetched_at)
    `);
    // ... more statements
  }
  
  getArticleById(id) {
    return this.getArticleStmt.get(id);
  }
  
  insertArticle(data) {
    return this.insertArticleStmt.run(data);
  }
  
  // ... implement all interface methods for v1 schema
}
```

### Dual-Adapter Testing

When implementing v2:

```javascript
// Test that both adapters produce same results
const v1Adapter = new SchemaV1Adapter(dbV1);
const v2Adapter = new SchemaV2Adapter(dbV2);

const article = { url: 'http://example.com', title: 'Test', body: 'Content' };

const v1Result = v1Adapter.insertArticle(article);
const v2Result = v2Adapter.insertArticle(article);

// Verify both produce compatible results
expect(v1Result.lastInsertRowid).toBeDefined();
expect(v2Result.lastInsertRowid).toBeDefined();

const v1Retrieved = v1Adapter.getArticleById(v1Result.lastInsertRowid);
const v2Retrieved = v2Adapter.getArticleById(v2Result.lastInsertRowid);

expect(v1Retrieved.url).toBe(v2Retrieved.url);
expect(v1Retrieved.title).toBe(v2Retrieved.title);
```

---

## Current Limitations (Schema v1)

### Known Issues

1. **No version tracking**: Cannot detect schema version programmatically
2. **Denormalized articles**: 30+ columns, duplicate data with `fetches`
3. **INTEGER → TEXT migration incomplete**: `crawl_jobs.id` may cause issues
4. **Missing gazetteer migration**: `places.wikidata_qid` not reliably present
5. **WAL mode isolation**: Multiple connections cause test data invisibility

### Migration Risks

**High Risk**:
- Changes to `articles` table (heavily used, 30+ columns)
- Changes to `crawl_jobs` table (affects all crawl types)
- Adding foreign keys (may break existing data)

**Medium Risk**:
- Changes to `background_tasks` table (relatively new)
- Changes to `analysis_runs` table (recent additions)

**Low Risk**:
- Adding new tables (doesn't affect existing code)
- Adding new columns with NULL defaults (backward compatible)

### Testing Requirements

Before ANY schema changes:

1. ✅ Export current schema: `sqlite3 data/news.db .schema > schema-v1-baseline.sql`
2. ✅ Count rows: `node tools/debug/count-tables.js`
3. ✅ Run full test suite: `npm test`
4. ✅ Test on production data subset
5. ✅ Document rollback procedure

---

## Version 2 Preparation Checklist

When ready to implement Schema v2:

### Phase 0: Infrastructure (Before Schema Changes)

- [ ] Implement schema version tracking (`PRAGMA user_version` or `schema_versions` table)
- [ ] Create `SchemaV1Adapter` class wrapping current schema
- [ ] Create `ISchemaAdapter` interface defining contract
- [ ] Update all code to use adapter instead of direct SQL
- [ ] Add adapter switching mechanism (environment variable or config)
- [ ] Test adapter with current v1 schema

### Phase 1: Parallel Schema Development

- [ ] Design v2 schema (normalized tables)
- [ ] Create `SchemaV2Adapter` implementing same interface
- [ ] Write dual-adapter tests (verify compatibility)
- [ ] Implement data migration scripts (v1 → v2)
- [ ] Test migration on production data subsets

### Phase 2: Cutover

- [ ] Deploy code with both adapters
- [ ] Run in dual-write mode (write to both v1 and v2)
- [ ] Verify data consistency
- [ ] Switch reads to v2
- [ ] Monitor for issues
- [ ] Deprecate v1 schema

**See**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for complete migration workflow

---

## Quick Reference

### Check Current Schema

```bash
# Inspect schema version (will return 0 until versioning implemented)
sqlite3 data/news.db "PRAGMA user_version"

# Export full schema
sqlite3 data/news.db .schema > current-schema.sql

# List all tables
node tools/db-schema.js tables

# Inspect specific table
node tools/db-schema.js table articles
```

### Access Database (v1 API)

```javascript
// Simple access (preferred)
const { ensureDatabase } = require('./db/sqlite');
const db = ensureDatabase('./data/news.db');

// Legacy access (still works)
const { ensureDb } = require('./db/sqlite');
const db = ensureDb('./data/news.db');

// With telemetry (optional)
const { wrapWithTelemetry } = require('./db/sqlite');
const instrDb = wrapWithTelemetry(db, { trackQueries: true });
```

### Related Documentation

- `docs/DATABASE_QUICK_REFERENCE.md` - Common patterns
- `docs/DATABASE_SCHEMA_ERD.md` - Visual schema diagram
- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` - Migration workflow
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Future v2 design
- `docs/PHASE_0_IMPLEMENTATION.md` - Version tracking implementation
- `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` - Known problems

---

## Summary

**DB Schema Version 1** is the current production schema:
- ✅ Stable and in use
- ❌ No formal version tracking (implicit v1)
- ❌ Denormalized design (articles table)
- ⚠️ Some incomplete migrations (gazetteer, crawl_jobs.id)

**Next Steps**:
1. Implement version tracking (Phase 0)
2. Create SchemaV1Adapter (encapsulation)
3. Design and implement SchemaV2Adapter (normalized schema)
4. Migrate using dual-adapter strategy
