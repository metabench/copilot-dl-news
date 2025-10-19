# Schema Verification Quick Reference

## Purpose

This document provides quick commands to verify the database schema creation process.

## Verification Tool

A dedicated verification tool is available at `tools/verify-schema-creation.js` that comprehensively tests:
- Schema initialization
- URL normalization implementation
- Foreign key constraints
- Index creation
- End-to-end workflow

## Run Full Verification

```bash
node tools/verify-schema-creation.js
```

### Expected Output

```
🔍 Schema Creation Verification Tool

Creating test database: /tmp/schema-verify-*.db

📋 Initializing schema...
[schema] Initializing database schema...
...

✅ All verification checks passed!
The schema creation process is working correctly.
```

## Run Unit Tests

```bash
# Schema version management tests
npx jest src/db/migration/__tests__/schema-versions.test.js --forceExit
```

### Expected Output

```
PASS src/db/migration/__tests__/schema-versions.test.js
  SchemaVersionManager
    ✓ should create schema_migrations table
    ✓ should return version 0 when no migrations applied
    ✓ should record migration
    ✓ should get migration history
    ✓ should throw on duplicate version
    ✓ should get specific migration

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

## Manual Database Inspection

To manually inspect the schema in a test database:

```bash
# Create a test database
node -e "
const Database = require('better-sqlite3');
const { initializeSchema } = require('./src/db/sqlite/schema');
const db = new Database('test-schema.db');
initializeSchema(db, { verbose: true });
console.log('Schema created in test-schema.db');
db.close();
"

# Inspect with sqlite3
sqlite3 test-schema.db

# SQLite commands:
.tables                    # List all tables
.schema urls               # Show urls table schema
.schema links              # Show links table schema
.schema queue_events       # Show queue_events table schema

# Query to verify URL normalization
SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('urls', 'links', 'queue_events', 'http_responses');

# Check foreign keys are enabled
PRAGMA foreign_keys;

# List all indexes
SELECT name, tbl_name FROM sqlite_master WHERE type='index' ORDER BY tbl_name;
```

## Key Schema Points to Verify

### 1. URLs Table
```sql
CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,  -- ← UNIQUE constraint critical
    ...
);
```

### 2. Foreign Key References
All URL-related tables should use `url_id INTEGER REFERENCES urls(id)`:
- `links.src_url_id` and `links.dst_url_id`
- `queue_events.url_id`
- `crawl_jobs.url_id`
- `http_responses.url_id`
- `discovery_events.url_id`

### 3. Indexes
Critical indexes for URL normalization:
- `idx_urls_host` - Fast host lookup
- `idx_links_src` - Link source lookups
- `idx_links_dst` - Link destination lookups
- `idx_http_responses_url` - HTTP response by URL
- `idx_discovery_events_url` - Discovery events by URL

### 4. Foreign Key Enforcement
```sql
PRAGMA foreign_keys;  -- Should return 1 (enabled)
```

## Troubleshooting

### Issue: "No such table: urls"
**Solution**: Schema initialization failed. Check logs for errors during `initializeSchema()`.

### Issue: "FOREIGN KEY constraint failed"
**Good**: This means foreign key enforcement is working correctly. Ensure referenced URL exists in `urls` table first.

### Issue: Missing indexes
**Solution**: Run `initializeSchema()` again. Index creation is idempotent (safe to run multiple times).

## Documentation

- **Full Report**: `docs/SCHEMA_CREATION_VERIFICATION_REPORT.md`
- **Implementation Plan**: `docs/URL_NORMALIZATION_IMPLEMENTATION_PLAN.md`
- **Schema Definitions**: `src/db/sqlite/v1/schema-definitions.js`
- **Schema Initialization**: `src/db/sqlite/v1/schema.js`

## Last Verified

**Date**: October 19, 2025  
**Status**: ✅ ALL CHECKS PASSING
