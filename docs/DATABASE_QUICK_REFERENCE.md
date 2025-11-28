# Database Quick Reference for AI Agents

**When to Read**: Before any database operations

**Purpose**: Fast lookup for common database patterns and operations

**Current Schema**: Version 37 (normalized architecture with 75 tables)

---

## Schema Synchronization (CRITICAL)

**After ANY schema change** (migrations, ALTER TABLE, new tables):

```bash
npm run schema:sync     # Regenerate schema-definitions.js
npm run schema:check    # Verify no drift (CI gate) 
npm run schema:stats    # Regenerate with table statistics
```

**Files updated**:
- `src/db/sqlite/v1/schema-definitions.js` — Canonical schema (auto-generated)
- `docs/database/_artifacts/news_db_stats.json` — Table row counts

**In workflows**:
1. **After running migrations**: Always run `npm run schema:sync`
2. **Before PR merge**: Run `npm run schema:check` to verify sync
3. **In DB adapter work**: Consult `schema-definitions.js` for current schema

---

## Getting a Database Handle

### Simple Usage (Most Common)

```javascript
const { ensureDatabase } = require('../db/sqlite');

// Open database with schema initialized
const db = ensureDatabase('/path/to/db.sqlite');

// Use directly with better-sqlite3 API
const stmt = db.prepare('SELECT * FROM articles WHERE host = ?');
const articles = stmt.all('example.com');
```

### With Query Telemetry

```javascript
const { ensureDatabase, wrapWithTelemetry } = require('../db/sqlite');

// Step 1: Open database
const db = ensureDatabase('/path/to/db.sqlite');

// Step 2: Wrap with telemetry
const instrumentedDb = wrapWithTelemetry(db, {
  trackQueries: true,
  logger: console
});

// Queries tracked in query_telemetry table
const stmt = instrumentedDb.prepare('SELECT * FROM places WHERE kind = ?');
const countries = stmt.all('country');
```

### In Tests (CRITICAL: Single Connection)

```javascript
const { createApp } = require('../src/ui/express/server');

beforeEach(() => {
  // Let createApp initialize the database
  app = createApp({ dbPath: createTempDb(), verbose: false });

  // Use app's shared connection (REQUIRED for WAL mode)
  const db = app.locals.backgroundTaskManager?.db || app.locals.getDb?.();

  // Seed data using SAME connection
  seedArticles(db, 10);
});

afterEach(() => {
  // Clean up WAL files
  const suffixes = ['', '-shm', '-wal'];
  for (const suffix of suffixes) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
});
```

**Why Single Connection Matters**:
- SQLite WAL mode isolates writes between connections
- Multiple connections cause test data to be invisible
- Always use `app.locals.getDb()` or `app.locals.backgroundTaskManager.db`
- ❌ **NEVER** do `new Database(dbPath)` separately in tests

---

## Database Schema Tools

### Quick Inspection (No Approval Dialogs)

```bash
# Table structure and metadata
node tools/db-schema.js tables                    # List all tables
node tools/db-schema.js table analysis_runs       # Show columns
node tools/db-schema.js indexes analysis_runs     # Show indexes
node tools/db-schema.js foreign-keys articles     # Show foreign keys
node tools/db-schema.js stats                     # Row counts + DB size

# Read-only queries
node tools/db-query.js "SELECT * FROM articles LIMIT 5"
node tools/db-query.js --json "SELECT * FROM analysis_runs WHERE status='running'"
```

**Why**: Eliminates PowerShell approval dialogs, read-only for safety

### Common Workflows

```bash
# Verify schema after code changes
node tools/db-schema.js table analysis_runs

# Check if index exists
node tools/db-schema.js indexes analysis_runs

# Query specific records
node tools/db-query.js "SELECT * FROM analysis_runs WHERE background_task_id IS NOT NULL LIMIT 5"

# Check foreign key relationships
node tools/db-schema.js foreign-keys article_place_relations
```

---

## SQLite WAL Mode Architecture

**CRITICAL**: Database uses WAL (Write-Ahead Logging) mode

### Implications

1. **Multiple Connections = Isolation**: Writes from connection A are invisible to connection B until connection A checkpoints
2. **Tests MUST Use Single Connection**: Use app's shared DB handle
3. **Cleanup Requires Three Files**: `db.sqlite`, `db.sqlite-shm`, `db.sqlite-wal`

### Legacy vs New API

**Before (4 Layers - Confusing)**:
```
ensureDb() → createWritableDbAccessor() → baseGetDbRW() → createInstrumentedDb() → getDbRW()
```

**After (2 Layers - Clear)**:
```
ensureDatabase() → wrapWithTelemetry() (optional) → getDb()
```

**Migration Notes**:
- `ensureDb()` - old function, still works but deprecated
- `getDbRW()` / `getDbRO()` - aliases to `getDb()`, same connection
- `createWritableDbAccessor()` - old wrapper, no longer needed

**New code should use**:
- `ensureDatabase()` - replaces `ensureDb()`
- `wrapWithTelemetry()` - replaces `createInstrumentedDb()`
- `getDb()` - clear, simple name

---

## Query Patterns & Optimization

### N+1 Query Problem

**❌ Bad (N+1)**:
```javascript
const queues = db.prepare('SELECT * FROM queues').all();
for (const queue of queues) {
  const count = db.prepare('SELECT COUNT(*) FROM items WHERE queue_id = ?').get(queue.id);
  queue.itemCount = count['COUNT(*)'];
}
```

**✅ Good (Single Query with JOIN)**:
```javascript
const queues = db.prepare(`
  SELECT
    q.*,
    COUNT(i.id) as itemCount
  FROM queues q
  LEFT JOIN items i ON i.queue_id = q.id
  GROUP BY q.id
`).all();
```

### Composite Indexes

```sql
-- For queries with WHERE + ORDER BY
CREATE INDEX idx_articles_host_created ON articles(host, created_at DESC);

-- Enables efficient: WHERE host = ? ORDER BY created_at DESC
```

---

## Database Migration Guide

**See**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for complete migration workflow

**Quick Reference**:

1. **Dual-adapter strategy**: SQLite + JSON export for zero-downtime
2. **Export/import testing**: Verify data integrity after migration
3. **Schema evolution**: Add new tables alongside existing (no breaking changes)

---

## Schema Documentation

### Visual Reference

**See**: `docs/DATABASE_SCHEMA_ERD.md` - Complete visual schema with relationships
**See**: `docs/DATABASE_SCHEMA_ERD.svg` - Interactive SVG diagram

### Key Tables (Normalized Architecture)

**Core Content Flow**:
- `articles` - Article metadata (simplified from 30+ columns)
- `urls` - URL normalization and canonicalization
- `http_responses` - HTTP request/response metadata
- `content_storage` - Compressed content storage
- `content_analysis` - AI/ML analysis results

**Geographic Relations**:
- `places` - Geographic entities (countries, cities, regions)
- `place_names` - Multilingual place names
- `place_hierarchy` - Parent-child relationships
- `article_place_relations` - Article-place relationships with confidence

**Crawl Management**:
- `crawl_jobs` - Foreground crawl operations
- `crawl_types` - Available crawl type configurations
- `queue_events` - Crawl queue telemetry

**Background Tasks**:
- `background_tasks` - Long-running operations
- `analysis_runs` - Analysis execution tracking

**Compression Infrastructure**:
- `compression_types` - Algorithm registry
- `compression_buckets` - Shared compression storage
- `classification_types` - Content classification lookup table

---

## Normalization Status (Current)

**✅ Complete**: Schema normalization finished
- Content separated from metadata
- HTTP responses extracted to dedicated table
- Analysis results in separate table
- Foreign key relationships established
- Schema version 8 implemented

**⚠️ Migration In Progress**: Some legacy data still in articles.html/text columns

**Future**: Complete migration of remaining legacy data

---

## Common Pitfalls

### ❌ Multiple Connections in Tests

```javascript
// ❌ WRONG
const db = ensureDb(dbPath); // Connection 1
seedArticles(db);
db.close();
app = createApp({ dbPath }); // Connection 2 - won't see seeded data!
```

### ❌ Async Without Await

```javascript
// ❌ WRONG: Returns Promise, not value
async function getData() {
  return db.prepare('SELECT * FROM table').all();
}

// ✅ RIGHT: Remove async if not using await
function getData() {
  return db.prepare('SELECT * FROM table').all();
}
```

### ❌ Schema Changes Without Migration

```javascript
// ✅ RIGHT: Check table exists first
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='old_table'"
).get();
if (!tableExists) return [];
```

---

## Related Documentation

**Schema Version**:
- `docs/DATABASE_SCHEMA_ERD.md` ⭐ Current schema documentation (74 tables)
- `docs/DATABASE_SCHEMA_ERD.svg` ⭐ Visual SVG diagram

**Complete Guides**:
- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ Migration workflow
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Normalization implementation
- `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` - Current schema status

**Tools**:
- `tools/debug/README.md` - Database inspection tools
- `src/db/sqlite/v1/queries/README.md` - Query module conventions

**Architecture**:
- `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` - Init patterns
- `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` - System design

## Getting a Database Handle

### Simple Usage (Most Common)

```javascript
const { ensureDatabase } = require('../db/sqlite');

// Open database with schema initialized
const db = ensureDatabase('/path/to/db.sqlite');

// Use directly with better-sqlite3 API
const stmt = db.prepare('SELECT * FROM articles WHERE host = ?');
const articles = stmt.all('example.com');
```

### With Query Telemetry

```javascript
const { ensureDatabase, wrapWithTelemetry } = require('../db/sqlite');

// Step 1: Open database
const db = ensureDatabase('/path/to/db.sqlite');

// Step 2: Wrap with telemetry
const instrumentedDb = wrapWithTelemetry(db, { 
  trackQueries: true,
  logger: console 
});

// Queries tracked in query_telemetry table
const stmt = instrumentedDb.prepare('SELECT * FROM places WHERE kind = ?');
const countries = stmt.all('country');
```

### In Tests (CRITICAL: Single Connection)

```javascript
const { createApp } = require('../src/ui/express/server');

beforeEach(() => {
  // Let createApp initialize the database
  app = createApp({ dbPath: createTempDb(), verbose: false });
  
  // Use app's shared connection (REQUIRED for WAL mode)
  const db = app.locals.backgroundTaskManager?.db || app.locals.getDb?.();
  
  // Seed data using SAME connection
  seedArticles(db, 10);
});

afterEach(() => {
  // Clean up WAL files
  const suffixes = ['', '-shm', '-wal'];
  for (const suffix of suffixes) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
});
```

**Why Single Connection Matters**:
- SQLite WAL mode isolates writes between connections
- Multiple connections cause test data to be invisible
- Always use `app.locals.getDb()` or `app.locals.backgroundTaskManager.db`
- ❌ **NEVER** do `new Database(dbPath)` separately in tests

---

## Database Schema Tools

### Quick Inspection (No Approval Dialogs)

```bash
# Table structure and metadata
node tools/db-schema.js tables                    # List all tables
node tools/db-schema.js table analysis_runs       # Show columns
node tools/db-schema.js indexes analysis_runs     # Show indexes
node tools/db-schema.js foreign-keys articles     # Show foreign keys
node tools/db-schema.js stats                     # Row counts + DB size

# Read-only queries
node tools/db-query.js "SELECT * FROM articles LIMIT 5"
node tools/db-query.js --json "SELECT * FROM analysis_runs WHERE status='running'"
```

**Why**: Eliminates PowerShell approval dialogs, read-only for safety

### Common Workflows

```bash
# Verify schema after code changes
node tools/db-schema.js table analysis_runs

# Check if index exists
node tools/db-schema.js indexes analysis_runs

# Manually upgrade schema (server auto-upgrades)
node tools/upgrade-analysis-schema.js

# Query specific records
node tools/db-query.js "SELECT * FROM analysis_runs WHERE background_task_id IS NOT NULL LIMIT 5"
```

---

## SQLite WAL Mode Architecture

**CRITICAL**: Database uses WAL (Write-Ahead Logging) mode

### Implications

1. **Multiple Connections = Isolation**: Writes from connection A are invisible to connection B until connection A checkpoints
2. **Tests MUST Use Single Connection**: Use app's shared DB handle
3. **Cleanup Requires Three Files**: `db.sqlite`, `db.sqlite-shm`, `db.sqlite-wal`

### Legacy vs New API

**Before (4 Layers - Confusing)**:
```
ensureDb() → createWritableDbAccessor() → baseGetDbRW() → createInstrumentedDb() → getDbRW()
```

**After (2 Layers - Clear)**:
```
ensureDatabase() → wrapWithTelemetry() (optional) → getDb()
```

**Migration Notes**:
- `ensureDb()` - old function, still works but deprecated
- `getDbRW()` / `getDbRO()` - aliases to `getDb()`, same connection
- `createWritableDbAccessor()` - old wrapper, no longer needed

**New code should use**:
- `ensureDatabase()` - replaces `ensureDb()`
- `wrapWithTelemetry()` - replaces `createInstrumentedDb()`
- `getDb()` - clear, simple name

---

## Query Patterns & Optimization

### N+1 Query Problem

**❌ Bad (N+1)**:
```javascript
const queues = db.prepare('SELECT * FROM queues').all();
for (const queue of queues) {
  const count = db.prepare('SELECT COUNT(*) FROM items WHERE queue_id = ?').get(queue.id);
  queue.itemCount = count['COUNT(*)'];
}
```

**✅ Good (Single Query with JOIN)**:
```javascript
const queues = db.prepare(`
  SELECT 
    q.*,
    COUNT(i.id) as itemCount
  FROM queues q
  LEFT JOIN items i ON i.queue_id = q.id
  GROUP BY q.id
`).all();
```

### Composite Indexes

```sql
-- For queries with WHERE + ORDER BY
CREATE INDEX idx_articles_host_created ON articles(host, created_at DESC);

-- Enables efficient: WHERE host = ? ORDER BY created_at DESC
```

---

## Database Migration Guide

**See**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for complete migration workflow

**Quick Reference**:

1. **Dual-adapter strategy**: SQLite + JSON export for zero-downtime
2. **Export/import testing**: Verify data integrity after migration
3. **Schema evolution**: Add new tables alongside existing (no breaking changes)

---

## Schema Documentation

### Visual Reference

**See**: `docs/DATABASE_SCHEMA_ERD.md` - Complete visual schema with relationships

### Key Tables

**Articles**:
- Primary content storage
- Links to `fetches` (HTTP metadata)
- Denormalized (30+ columns) - normalization planned

**Background Tasks**:
- `background_tasks` - Long-running operations
- Links to `analysis_runs`, compression jobs

**Crawl Jobs**:
- `crawl_jobs` - Foreground crawl operations
- `queue_events` - Crawl progress tracking

**Analysis**:
- `analysis_runs` - Analysis executions
- Links to `background_tasks` via `background_task_id`

---

## Normalization Plan (Future)

**Phase 0-1**: Infrastructure + add new tables  
**Phase 2-3**: Dual-write + backfill  
**Phase 4-5**: Cutover + cleanup

**Expected**: 40-50% database size reduction

**See**: `docs/DATABASE_NORMALIZATION_PLAN.md` (1660 lines) for complete plan

---

## Common Pitfalls

### ❌ Multiple Connections in Tests

```javascript
// ❌ WRONG
const db = ensureDb(dbPath); // Connection 1
seedArticles(db);
db.close();
app = createApp({ dbPath }); // Connection 2 - won't see seeded data!
```

### ❌ Async Without Await

```javascript
// ❌ WRONG: Returns Promise, not value
async function getData() {
  return db.prepare('SELECT * FROM table').all();
}

// ✅ RIGHT: Remove async if not using await
function getData() {
  return db.prepare('SELECT * FROM table').all();
}
```

### ❌ Schema Changes Without Migration

```javascript
// ✅ RIGHT: Check table exists first
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='old_table'"
).get();
if (!tableExists) return [];
```

---

## Related Documentation

**Schema Version**:
- `docs/DATABASE_SCHEMA_VERSION_1.md` ⭐ Current schema documentation

**Complete Guides**:
- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ Migration workflow (requires adapter encapsulation)
- `docs/DATABASE_SCHEMA_ERD.md` ⭐ Visual schema
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Future normalization
- `docs/DATABASE_ACCESS_PATTERNS.md` - Query optimization

**Tools**:
- `tools/debug/README.md` - Database inspection tools
- `src/db/sqlite/v1/queries/README.md` - Query module conventions

**Architecture**:
- `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` - Init patterns
- `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` - System design
