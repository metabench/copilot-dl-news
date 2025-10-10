# Database Migration Strategy

**Status**: October 10, 2025 - Migration Infrastructure Needed  
**Problem**: Tests failing due to old database schemas with missing columns

**See Also**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ **Complete migration workflow** - Dual-adapter strategy, export/import testing, step-by-step process

---

## Current Situation

### Schema Evolution Issues

The project has evolved its database schema over time, adding new columns:
- `articles.host`, `urls.host`, `fetches.host` - Domain extraction
- `places.wikidata_qid` - Wikidata integration
- `url_aliases.url_exists` - URL validation tracking
- `crawl_jobs.id` - Changed from INTEGER to TEXT for UUID-style IDs

### Test Failures

Tests create temporary databases that persist between runs. When schema changes occur, these temp databases have old schemas, causing failures:
- "no such column: host" errors
- "no such column: wikidata_qid" errors  
- "no such column: url_exists" errors

### Current Migration Approach (Partial)

Added ad-hoc migrations in `src/db/sqlite/schema.js`:
```javascript
// Migration: Add missing 'host' column to articles table
try {
  const articlesInfo = db.prepare("SELECT sql FROM sqlite_master...").get();
  if (articlesInfo && articlesInfo.sql && !articlesInfo.sql.includes('host')) {
    db.exec('ALTER TABLE articles ADD COLUMN host TEXT');
  }
} catch (err) { /* Ignore */ }
```

**Problems with this approach**:
1. Migrations only handle 3-4 columns out of dozens
2. Silent failures (errors caught but not logged)
3. No migration versioning or tracking
4. Indexes fail if columns don't exist (even with defensive creation)

## Recommended Solutions

### Option 1: Comprehensive Migration System (Best Long-term)

Implement the full migration infrastructure from `docs/PHASE_0_IMPLEMENTATION.md`:

**Benefits**:
- Versioned migrations with tracking
- Safe forward/backward migration paths
- Export/import for data preservation
- Professional-grade database evolution

**Effort**: 1-2 days initial setup
**Files**: Requires creating migration infrastructure modules

### Option 2: Test-Specific Fresh Database (Quick Fix) ✅ IMPLEMENTED

Ensure tests ALWAYS start with fresh databases by deleting temp files before each test:

```javascript
beforeEach(() => {
  // Delete temp DB and WAL files BEFORE test runs
  try { fs.unlinkSync(tmp); } catch (_) {}
  try { fs.unlinkSync(tmp + '-wal'); } catch (_) {}
  try { fs.unlinkSync(tmp + '-shm'); } catch (_) {}
});
```

**Benefits**:
- Simple, immediate fix
- No migration complexity
- Tests always use current schema

**Limitations**:
- Doesn't help production databases
- Slower tests (schema recreation each time)

### Option 3: Resilient Schema Initialization (Defensive)

Make schema.js catch and log errors gracefully without failing:

```javascript
function initializeSchemaSafe(db, options) {
  const results = {
    coreTables: tryInit(() => initCoreTables(db, options)),
    gazetteer: tryInit(() => initGazetteerTables(db, options)),
    // ...
  };
  
  if (results.coreTables.error) {
    logger.warn('[schema] Core tables partially initialized:', results.coreTables.error);
  }
  
  return results;
}
```

**Benefits**:
- Server starts even with schema mismatches
- Logs warnings for manual investigation
- Degrades gracefully

**Limitations**:
- Features may not work with missing columns
- Silent data issues possible

## Decision: Hybrid Approach

**For Tests** (Option 2): Clean temp databases before each test  
**For Development** (Option 3): Add resilient initialization  
**For Production** (Option 1): Plan comprehensive migration system

## Immediate Actions Taken (Oct 10, 2025)

1. ✅ Added beforeEach cleanup to `recent-domains.api.test.js`
2. ✅ Added host column migrations for articles, urls, fetches tables
3. ✅ Removed problematic indexes from schema-definitions, create defensively
4. ✅ Added database connection cleanup in test

## Next Steps

### Short-term (This Week)
- [ ] Apply beforeEach cleanup pattern to ALL test files
- [ ] Document temp database naming conventions
- [ ] Add script to clean all temp databases: `npm run test:clean`

### Medium-term (This Month)  
- [ ] Implement resilient schema initialization wrapper
- [ ] Add schema version tracking table
- [ ] Create database health check utility

### Long-term (Q4 2025)
- [ ] Review `docs/DATABASE_NORMALIZATION_PLAN.md` (1660 lines)
- [ ] Implement Phase 0 migration infrastructure from `docs/PHASE_0_IMPLEMENTATION.md`
- [ ] Plan data normalization (40-50% size reduction expected)

## Related Documentation

- `docs/PHASE_0_IMPLEMENTATION.md` - Complete migration infrastructure (ready to implement)
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Future schema improvements (80+ pages)
- `docs/COMPRESSION_IMPLEMENTATION_FULL.md` - Compression for normalized schema
- `AGENTS.md` - "Database Schema Evolution" section

## Migration Examples

### Adding a Column (Safe)
```sql
ALTER TABLE table_name ADD COLUMN column_name TYPE DEFAULT value;
```

### Changing Column Type (Requires Table Rebuild)
```sql
CREATE TABLE table_new (...new schema...);
INSERT INTO table_new SELECT ...from table_old...;
DROP TABLE table_old;
ALTER TABLE table_new RENAME TO table_name;
```

### Creating Indexes Defensively
```javascript
// Remove from ALL_TABLES_SCHEMA, create separately with error handling
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_name ON table(column)');
} catch (err) {
  if (verbose) logger.warn('[schema] Could not create index:', err.message);
}
```

## Lessons Learned

1. **SQLite ALTER TABLE is limited**: Can add columns, but not modify or remove
2. **CREATE INDEX fails on missing columns**: Even with IF NOT EXISTS
3. **WAL mode complicates cleanup**: Need to delete .db, .db-wal, .db-shm files
4. **jest.resetModules() doesn't clear database files**: Only clears module cache
5. **Ad-hoc migrations don't scale**: Need systematic versioning approach
