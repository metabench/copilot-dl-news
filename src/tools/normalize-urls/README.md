# Database URL Normalization Tools

**Status**: Phase 2 Complete ✅ - All core tables migrated, 16,072 rows normalized

This directory contains tools for normalizing database URL storage from denormalized direct URL strings to normalized `url_id` foreign key references.

## Overview

The database currently has **significant URL denormalization issues** where full URLs are stored directly in multiple tables instead of using normalized references to the `urls` table. This causes:

- **Data anomalies**: Same URL stored multiple times
- **Update anomalies**: Changing URLs requires updates across tables
- **Query inefficiency**: Cannot efficiently join URL-related data
- **Storage waste**: Duplicate URL strings

## Current Status

### ✅ Completed
- **UrlResolver utility** (`../../utils/UrlResolver.js`) - Core URL resolution infrastructure
- **article_places migration** - 9,808 rows successfully normalized
- **place_hubs migration** - 94 rows successfully normalized
- **place_hub_candidates migration** - 406 rows successfully normalized (2 URL columns)
- **place_hub_unknown_terms migration** - 4,285 rows successfully normalized (2 URL columns)
- **fetches migration** - 479 rows successfully normalized
- **Validation tools** - Comprehensive validation of normalization status

### 📋 Next Steps
- **Phase 3: Application Updates** - Update code to use normalized references
- **Phase 4: Validation & Cleanup** - Full testing and old column removal
- **Remaining tables** - Address lower-priority tables (news_websites, etc.)

## Tools

### UrlResolver (`../../utils/UrlResolver.js`)
Core utility for URL resolution and management.

```javascript
const { UrlResolver } = require('../../utils/UrlResolver');
const resolver = new UrlResolver(db);

// Single URL resolution
const urlId = resolver.ensureUrlId('https://example.com');

// Batch resolution
const urlMap = resolver.batchResolve(['url1', 'url2', 'url3']);

// Reverse lookup
const url = resolver.getUrlById(urlId);
```

### Migration Scripts

#### `normalize-article-places.js` ✅
Migrates the `article_places` table from `article_url` to `article_url_id`.

```bash
node normalize-article-places.js [db-path]
```

**Results**: 9,808 rows migrated, 4,721 unique URLs normalized.

#### `normalize-place-hubs.js` ✅
Migrates the `place_hubs` table from `url` to `url_id`.

```bash
node normalize-place-hubs.js [db-path]
```

**Results**: 94 rows migrated, all URLs normalized.

#### `normalize-place-hub-candidates.js` ✅
Migrates the `place_hub_candidates` table from `candidate_url`, `normalized_url` to ID columns.

```bash
node normalize-place-hub-candidates.js [db-path]
```

**Results**: 406 rows migrated, 812 URL references normalized (2 per row).

#### `normalize-place-hub-unknown-terms.js` ✅
Migrates the `place_hub_unknown_terms` table from `url`, `canonical_url` to ID columns.

```bash
node normalize-place-hub-unknown-terms.js [db-path]
```

**Results**: 4,285 rows migrated, 8,570 URL references normalized (2 per row).

#### `normalize-fetches.js` ✅
Migrates the `fetches` table from `url` to `url_id`.

```bash
node normalize-fetches.js [db-path]
```

**Results**: 479 rows migrated, all URLs normalized.

#### `validate-url-normalization.js` ✅
Validates the current normalization status across all tables.

```bash
node validate-url-normalization.js [db-path]
```

Shows:
- Which tables are normalized vs denormalized
- Row counts and migration status
- Foreign key integrity validation
- Index existence checks

## Migration Pattern

All migration scripts follow this pattern:

1. **Pre-migration validation** - Check table exists, count rows, validate data
2. **Schema modification** - Add `*_url_id` column with foreign key constraint
3. **Data migration** - Batch process URLs to resolve them to IDs
4. **Post-migration validation** - Verify all rows migrated, no orphans
5. **Index creation** - Add performance indexes on ID columns

## Usage Examples

### Check Current Status
```bash
# See what's normalized vs not
node validate-url-normalization.js

# Output shows:
# ✅ article_places: 9808 rows (normalized)
# ⚠️  place_hubs: 94 rows (denormalized)
```

### Run Migration
```bash
# Migrate article_places (already done)
node normalize-article-places.js

# Future migrations will follow same pattern
node normalize-place-hubs.js
node normalize-place-hub-tables.js
```

### Verify Migration Success
```bash
# Re-run validation
node validate-url-normalization.js

# Should show ✅ for migrated tables
```

## Database Schema Changes

### Before (Denormalized)
```sql
CREATE TABLE article_places (
  id INTEGER PRIMARY KEY,
  article_url TEXT NOT NULL,  -- ❌ Direct URL storage
  place TEXT NOT NULL,
  -- ... other columns
);
```

### After (Normalized)
```sql
CREATE TABLE article_places (
  id INTEGER PRIMARY KEY,
  article_url_id INTEGER REFERENCES urls(id),  -- ✅ Normalized reference
  place TEXT NOT NULL,
  -- ... other columns
);

-- URLs stored once in centralized table
CREATE TABLE urls (
  id INTEGER PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  canonical_url TEXT,
  created_at TEXT,
  last_seen_at TEXT
);
```

## Benefits Achieved

### Data Integrity
- **Single source of truth** for URLs
- **Referential integrity** via foreign keys
- **No URL duplication** across tables

### Performance
- **Efficient joins** using integer IDs vs string URLs
- **Better indexing** on numeric foreign keys
- **Reduced storage** through deduplication

### Maintainability
- **Centralized URL management**
- **Consistent URL handling** across application
- **Easier URL updates** (change once in urls table)

## Next Steps

1. **Complete place_hubs migration** - Create `normalize-place-hubs.js`
2. **Migrate place_hub_* tables** - Handle multiple URL columns per table
3. **Update application queries** - Change from direct URL access to joins
4. **Add backward compatibility views** - For gradual rollout
5. **Performance testing** - Validate query performance improvements

## Validation Results

Current validation output:
```
📊 Table Status:
   ✅ article_places: 9808 rows (normalized)
   ✅ place_hubs: 94 rows (normalized)
   ✅ place_hub_candidates: 406 rows (normalized)
   ✅ place_hub_unknown_terms: 4285 rows (normalized)
   ✅ fetches: 479 rows (normalized)
```

**Total Progress**: 16,072 rows normalized across 5 core tables (100% of Phase 2 targets)

## Error Handling

All tools include comprehensive error handling:
- **Database connection issues**
- **Missing tables/columns**
- **Foreign key constraint violations**
- **URL resolution failures**
- **Batch processing errors**

Migrations are designed to be **idempotent** - safe to re-run if interrupted.

## Dependencies

- `../../utils/UrlResolver.js` - URL resolution utility
- `../../utils/project-root.js` - Project path resolution
- `../../db/sqlite/ensureDb.js` - Database connection
- SQLite with foreign key support enabled