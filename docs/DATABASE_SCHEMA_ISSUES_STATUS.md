# Database Schema Issues - Status and Fix Summary

**Date**: October 10, 2025  
**Status**: Tests failing due to schema evolution without migrations

## Root Cause Analysis

### The Problem

Tests are failing with errors like:
- "no such column: host" (articles, urls, fetches tables)
- "no such column: wikidata_qid" (places table)
- "no such column: url_exists" (url_aliases table)

### Why This Happens

1. **Schema evolution without migrations**: The schema has been updated to add new columns, but no ALTER TABLE migrations exist
2. **IF NOT EXISTS doesn't update**: `CREATE TABLE IF NOT EXISTS places (...)` does nothing if table already exists
3. **Index creation fails on missing columns**: `CREATE INDEX ... ON places(wikidata_qid)` fails if column doesn't exist
4. **Persistent temp databases**: Tests reuse database files between runs, preserving old schemas

### Current Schema Initialization Flow

```
initializeSchema() 
├─ run('Core Tables', initCoreTables)  
│  └─ db.exec(ALL_TABLES_SCHEMA)  // Creates articles, urls, fetches, etc.
│     └─ CREATE INDEX IF NOT EXISTS idx_articles_host ON articles(host);  ❌ Fails if column missing
├─ run('Gazetteer', initGazetteerTables)
│  └─ db.exec(`CREATE TABLE IF NOT EXISTS places (...wikidata_qid...); CREATE INDEX ... ON places(wikidata_qid);`)  ❌ Fails if column missing
├─ run('Place Hubs', ...)
├─ run('Compression', ...)
├─ run('Background Tasks', ...)
└─ run('Query Telemetry', ...)
```

##Fixed So Far (Oct 10, 2025)

✅ **Resilient error handling**: Schema initialization no longer throws on errors, logs warnings instead  
✅ **Host column migrations**: Added ALTER TABLE migrations for articles, urls, fetches  
✅ **Defensive index creation**: Removed host indexes from schema-definitions.js, create with try-catch  
✅ **Test cleanup**: Added beforeEach to delete temp databases  
✅ **Database connection cleanup**: Tests close app database connections  
✅ **crawl_jobs.id migration**: Changed from INTEGER to TEXT with table rebuild  

## Remaining Issues

❌ **Gazetteer schema**: places table missing wikid ata_qid in old databases  
❌ **URL aliases schema**: url_aliases table missing url_exists column  
❌ **Large db.exec() blocks**: Can't catch individual index creation errors  
❌ **No migration tracking**: No way to know which migrations have been applied  

## Recommended Fix (Immediate)

**Option A: Delete All Temp Databases** (2 minutes) ✅ DONE
```bash
# Delete all old temp databases to force schema recreation
Remove-Item "src\ui\express\__tests__\tmp_*.db*" -Force
```

**Option B: Add Comprehensive Migrations** (1-2 hours)

Add migrations for ALL missing columns before schema creation:

```javascript
function initGazetteerTables(db, { verbose, logger }) {
  // Migration: Add missing columns to existing tables
  try {
    const placesInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='places'").get();
    if (placesInfo && placesInfo.sql) {
      if (!placesInfo.sql.includes('wikidata_qid')) {
        db.exec('ALTER TABLE places ADD COLUMN wikidata_qid TEXT');
      }
      if (!placesInfo.sql.includes('osm_type')) {
        db.exec('ALTER TABLE places ADD COLUMN osm_type TEXT');
      }
      // ... add other missing columns ...
    }
  } catch (err) { /* Table doesn't exist yet */ }
  
  // Now create tables and indexes
  db.exec(`CREATE TABLE IF NOT EXISTS places (...);`);
}
```

**Option C: Split Index Creation** (1 hour)

Break up large db.exec() blocks to create indexes separately with error handling:

```javascript
// Create tables first (without indexes)
db.exec(`CREATE TABLE IF NOT EXISTS places (...);`);

// Create indexes defensively
try { db.exec('CREATE INDEX IF NOT EXISTS idx_places_wikidata_qid ON places(wikidata_qid)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_places_osm ON places(osm_type, osm_id)'); } catch (_) {}
```

## Long-term Solution

Implement Phase 0 migration infrastructure from `docs/PHASE_0_IMPLEMENTATION.md`:
- Versioned migrations with tracking table
- Safe forward/backward migration paths
- Export/import for data preservation
- Professional-grade schema evolution

## Impact on Features

With current resilient error handling:
- ✅ **Server starts successfully** even with schema errors
- ✅ **Most features work** (crawling, background tasks, compression)
- ⚠️ **Gazetteer features degraded** if places table schema is old
- ⚠️ **URL analysis limited** if url_aliases table schema is old
- ⚠️ **Host-based features partial** if articles/urls lack host column

## Test Status

### Passing Tests (with resilient schema)
- Analysis run tests (crawl_jobs fix)
- Queue API tests (crawl_jobs fix)
- Fallback tests (mocked database)

### Failing Tests
- recent-domains API (expects host column + data)
- AnalysisTask (expects analysis tables)
- background-tasks API (tasks aborting - separate issue)

## Next Steps

1. ✅ Document current situation (this file)
2. ⬜ Choose immediate fix approach (A, B, or C)
3. ⬜ Apply fix and verify tests pass
4. ⬜ Plan Phase 0 migration infrastructure (Q4 2025)
5. ⬜ Document migration patterns in AGENTS.md

## Files Modified This Session

- `src/db/sqlite/schema.js` - Added migrations, resilient error handling
- `src/db/sqlite/schema-definitions.js` - Removed problematic indexes, fixed crawl_jobs.id
- `src/ui/express/__tests__/recent-domains.api.test.js` - Added cleanup and connection close
- `docs/DATABASE_MIGRATION_STRATEGY.md` - Created migration strategy doc
- `docs/DATABASE_SCHEMA_ISSUES_STATUS.md` - This file

## Related Documentation

- `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` ⭐ **Complete migration workflow** - Dual-adapter strategy, export/import testing, step-by-step process
- `docs/DATABASE_MIGRATION_STRATEGY.md` - Migration approaches and lessons learned
- `docs/PHASE_0_IMPLEMENTATION.md` - Complete migration infrastructure (ready to implement)
- `docs/DATABASE_NORMALIZATION_PLAN.md` - Future schema improvements (80+ pages)
- `AGENTS.md` - "Database Schema Evolution" section
