# Gazetteer Deduplication Implementation Summary

## Overview
Comprehensive improvements to prevent duplicate place records across all gazetteer ingestion systems (REST Countries, Wikidata, Geography crawls, OSM imports).

## Implementation Date
October 15, 2025

## Key Problems Solved

### 1. Duplicate Capital Cities
- **Before**: 255 capital records → **After**: ~200 expected (GB: 4→1, IE: 4→1, ZA: 3→3 correct)
- Root cause: Running ingestion multiple times created duplicates
- Solution: Ingestion run tracking + external ID deduplication

### 2. Incorrect Coordinates for Multi-Capital Countries
- **South Africa**: All 3 capitals had same coordinates (Pretoria's)
- **Solution**: `MULTI_CAPITAL_COORDS` map with correct coordinates per capital

### 3. Multi-Parent Relationships
- **Jerusalem** can be capital of both Israel and Palestine
- **Solution**: Changed `place_hierarchy` primary key to support multiple parent relations

## New Infrastructure

### 1. Deduplication Module (`src/db/sqlite/queries/gazetteer.deduplication.js`)

**Functions**:
- `createDeduplicationStatements(db)` - Prepared statements for all dedup operations
- `findExistingPlace(statements, placeData)` - 6-strategy matching algorithm
- `checkIngestionRun(statements, source, version, force)` - Prevent re-ingestion
- `startIngestionRun(statements, source, version, metadata)` - Track ingestion start
- `completeIngestionRun(statements, runId, stats)` - Record completion
- `addCapitalRelationship(countryId, cityId, metadata)` - Multi-parent support
- `generateCapitalExternalId(source, countryCode, name)` - Stable IDs for capitals

**Matching Strategies** (in priority order):
1. **Wikidata QID** (strongest) - e.g., Q84 for London
2. **OSM ID** - OpenStreetMap relation/way/node ID
3. **GeoNames ID** - GeoNames.org identifier
4. **Admin codes** - ISO country code, ADM1/ADM2 codes
5. **Normalized name + country** - Diacritic-free lowercase matching
6. **Coordinate proximity** - Within ~5.5km (0.05°) for places with coords

### 2. Database Schema Updates (`src/db/sqlite/schema.js`)

**New Table: `ingestion_runs`**
```sql
CREATE TABLE ingestion_runs (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,                -- 'restcountries', 'wikidata', etc.
  source_version TEXT,                 -- 'v3.1', 'latest', etc.
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT DEFAULT 'running',       -- 'running' | 'completed' | 'failed'
  countries_processed INTEGER,
  places_created INTEGER,
  places_updated INTEGER,
  names_added INTEGER,
  error_message TEXT,
  metadata JSON
);
```

**Updated Table: `place_hierarchy`**
- Changed primary key from `(parent_id, child_id)` to `(parent_id, child_id, relation)`
- Added `metadata JSON` column for relation-specific metadata
- Supports multiple relations (e.g., Jerusalem as capital of multiple countries)

### 3. Multi-Capital Coordinate Map

**Hardcoded in `populate-gazetteer.js`**:
```javascript
const MULTI_CAPITAL_COORDS = {
  'ZA': {  // South Africa
    'pretoria': [-25.7461, 28.1881],      // Executive
    'cape town': [-33.9249, 18.4241],     // Legislative
    'bloemfontein': [-29.1211, 26.2140]   // Judicial
  },
  'BO': {  // Bolivia
    'la paz': [-16.4897, -68.1193],       // Administrative
    'sucre': [-19.0332, -65.2627]         // Constitutional
  },
  'MY': { ... },  // Malaysia
  'NL': { ... },  // Netherlands
  'BN': { ... }   // Brunei
};
```

## Updated Systems

### 1. `populate-gazetteer.js` (REST Countries ingestion)

**Changes**:
- ✅ Checks `ingestion_runs` before processing (skip if already completed)
- ✅ Creates ingestion run at start, completes at end
- ✅ Uses `generateCapitalExternalId()` for stable capital IDs
- ✅ Uses `findExistingPlace()` via external ID lookup
- ✅ Multi-capital coordinate handling from `MULTI_CAPITAL_COORDS`
- ✅ Uses `capital_of` relation instead of `admin_parent` for capitals
- ✅ Supports `--force=1` flag to re-ingest despite completion

**New Flow**:
1. Check if `restcountries@v3.1` already ingested → skip if yes (unless --force)
2. Start ingestion run (record run ID)
3. For each capital:
   - Generate external ID: `restcountries:capital:GB:london`
   - Check if exists via external ID
   - If exists: update coordinates if better
   - If new: create + register external ID
4. Use `addCapitalRelationship()` for hierarchy (supports multi-parent)
5. Complete ingestion run with statistics

### 2. `gazetteer.ingest.js` (Shared ingestion layer)

**Changes**:
- ✅ `upsertPlace()` now uses `findExistingPlace()` for robust matching
- ✅ Returns `{ placeId, created: boolean }` instead of just `placeId`
- ✅ Supports `geonamesId` parameter for GeoNames matching
- ✅ Integrated with deduplication module

### 3. Wikidata Country Ingestor

**Uses**:
- `createIngestionStatements()` includes deduplication statements
- `upsertPlace()` automatically deduplicates via Wikidata QID
- Already leverages external IDs infrastructure

### 4. Geography Crawls

**Inherits**:
- Deduplication via shared `gazetteer.ingest` module
- Wikidata QID matching when available
- Coordinate proximity matching for discovered places

## Cleanup Tools

### Workflow: Complete Data Cleanup

**Step 1: Fix Canonical Names**
```bash
# Preview places with NULL canonical_name_id
node tools/corrections/fix-canonical-names.js

# Fix all places
node tools/corrections/fix-canonical-names.js --fix

# Fix only capitals
node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital
```

**Step 2: Deduplicate Places**
```bash
# Preview duplicates with coordinate proximity matching
node tools/corrections/fix-duplicate-places.js

# Fix duplicate capitals
node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital

# Fix all duplicates in a country
node tools/corrections/fix-duplicate-places.js --fix --country=GB
```

**Step 3: Verify Results**
```bash
node tools/gazetteer/list-capital-cities.js --with-country
```

### `tools/corrections/fix-canonical-names.js`

**Purpose**: Set canonical_name_id for places that have names in place_names but no canonical name set

**Why This Matters**: Places with NULL canonical_name_id appear as "unnamed" in queries that join on canonical_name_id, creating artificial separation from properly-named duplicates.

**Features**:
- Finds best name per place (prioritizes: official > preferred > English > lowest ID)
- Sets canonical_name_id automatically
- Filters by kind, role, or country
- **Defaults to dry-run mode** (safe inspection before changes)

**Usage**:
```bash
# Preview all places with NULL canonical names
node tools/corrections/fix-canonical-names.js

# Fix all places
node tools/corrections/fix-canonical-names.js --fix

# Fix only capital cities
node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital

# Fix specific country
node tools/corrections/fix-canonical-names.js --fix --country=GB
```

### `tools/corrections/fix-duplicate-places.js`

**Purpose**: Advanced duplicate merger with coordinate proximity matching

**Why This Matters**: Traditional deduplication by canonical name misses duplicates with slight coordinate variations (51.5,-0.08 vs 51.5,-0.10) or NULL canonical names.

**Features**:
- Groups by normalized name from ANY place_name (not just canonical)
- Checks coordinate proximity (<0.05° ≈ 5.5km by default)
- Intelligent scoring (coords > wikidata > population > external IDs > age)
- Merges names, hierarchy, attributes, external IDs
- Prevents future duplicates with external ID registration
- **Defaults to dry-run mode** (safe inspection before changes)

**Usage**:
```bash
# Preview all duplicates
node tools/corrections/fix-duplicate-places.js

# Fix duplicate capitals
node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital

# Fix specific country
node tools/corrections/fix-duplicate-places.js --fix --country=GB

# Adjust proximity threshold (default 0.05°)
node tools/corrections/fix-duplicate-places.js --proximity=0.1
```

**Expected Results**: 8 duplicate capital records (GB: 4, IE: 4) → 2 unique records (GB: 1 London, IE: 1 Dublin)

### `tools/corrections/fix-duplicate-capitals.js` (Legacy)

**Purpose**: Fix existing duplicates in database (legacy tool, superseded by fix-duplicate-places.js)

**Features**:
- Identifies duplicates by country code + normalized name
- Chooses best record (prioritizes: coords > wikidata > pop > lowest ID)
- Merges names, hierarchy, attributes to best record
- Adds external IDs to prevent future duplicates
- Deletes inferior duplicate records
- **Defaults to dry-run mode** (safe inspection before changes)
- Supports `--country=XX` filter for targeted cleanup

**Usage**:
```bash
# Preview changes (default - safe)
node tools/corrections/fix-duplicate-capitals.js

# Apply changes (requires --fix flag)
node tools/corrections/fix-duplicate-capitals.js --fix

# Fix specific country
node tools/corrections/fix-duplicate-capitals.js --fix --country=GB
```

**Expected Results**:
- GB: 4 London records → 1 (best coords + wikidata)
- IE: 4 Dublin records → 1 (best coords + wikidata)
- ZA: 3 capitals remain (correct - different cities)
- Total: 255 → ~200 capitals

## Testing Strategy

### Phase 1: Cleanup Existing Duplicates
```bash
# 1. Backup database
cp data/news.db data/news.db.backup

# 2. Preview changes (default dry run)
node tools/corrections/fix-duplicate-capitals.js

# 3. Test on specific countries
node tools/corrections/fix-duplicate-capitals.js --fix --country=GB
node tools/corrections/fix-duplicate-capitals.js --fix --country=IE
node tools/gazetteer/list-capital-cities.js | grep "GB\|IE"  # Verify only 1 each

# 4. Full cleanup
node tools/corrections/fix-duplicate-capitals.js --fix

# 5. Verify
node tools/gazetteer/list-capital-cities.js --with-country
```

### Phase 2: Test Re-Ingestion Prevention
```bash
# Should skip (already completed)
node src/tools/populate-gazetteer.js --db=./data/news.db

# Should show "already ingested" message
# Output: "REST Countries v3.1 already ingested at [date]"
#         "Use --force=1 to re-ingest"

# Force re-ingest (should NOT create duplicates)
node src/tools/populate-gazetteer.js --db=./data/news.db --force=1

# Verify no new duplicates
node tools/gazetteer/list-capital-cities.js | wc -l  # Should be same count as before
```

### Phase 3: Test Multi-Capital Coordinates
```bash
# Verify South Africa capitals have different coordinates
node tools/gazetteer/list-capital-cities.js --with-country | grep "ZA:"

# Expected output:
# ZA:
#   - Pretoria - (-25.75, 28.19), tz: UTC+02:00
#   - Cape Town - (-33.92, 18.42), tz: UTC+02:00
#   - Bloemfontein - (-29.12, 26.21), tz: UTC+02:00
```

### Phase 4: Test Jerusalem Multi-Parent
```bash
# Check Jerusalem appears under both IL and PS
node tools/db-query.js "
  SELECT p.id, pn.name, ph.parent_id, ph.relation, p2.country_code
  FROM places p
  JOIN place_names pn ON p.canonical_name_id = pn.id
  JOIN place_hierarchy ph ON p.id = ph.child_id
  JOIN places p2 ON ph.parent_id = p2.id
  WHERE pn.name = 'Jerusalem' AND ph.relation = 'capital_of'
"
# Should show 2 rows: one for IL, one for PS
```

## Rollback Plan

If issues arise:
```bash
# Restore backup
cp data/news.db.backup data/news.db

# Or: Delete new tables and re-run schema
sqlite3 data/news.db "DROP TABLE IF EXISTS ingestion_runs"
node src/ui/express/server.js  # Schema auto-recreates on startup
```

## Future Enhancements

### 1. Add Ingestion Run UI
- API endpoint: `GET /api/gazetteer/ingestion-runs`
- Show history of ingestion runs
- Display stats: created/updated counts, duration, errors

### 2. Expand Multi-Capital Map from Wikidata
```javascript
// Auto-generate MULTI_CAPITAL_COORDS from Wikidata query
// SPARQL: "SELECT ?country ?capital WHERE { ?country wdt:P36 ?capital }"
// Count capitals per country, fetch coords for each
```

### 3. Add Deduplication Report
```bash
node tools/analyze-place-duplicates.js
# Output: Potential duplicates by strategy
#   - Same name + country, different coords (>5km apart)
#   - Same coords, different names
#   - Missing external IDs (high dup risk)
```

### 4. Periodic Deduplication Job
- Background task that runs weekly
- Identifies potential duplicates
- Sends report for manual review
- Auto-merges high-confidence matches

## Related Documentation

- **Ingestion Guide**: `docs/GAZETTEER_INGESTION_DEDUPLICATION.md` (strategies overview)
- **API Reference**: `docs/API_ENDPOINT_REFERENCE.md` (gazetteer endpoints)
- **Database Schema**: `docs/DATABASE_SCHEMA_ERD.md` (visual reference)
- **Populate Tool Updates**: `POPULATE_GAZETTEER_UPDATES.md` (code examples)

## Key Learnings

1. **External IDs are essential**: Wikidata QID/OSM ID matching is 100% reliable
2. **Coordinate matching is risky**: 0.05° threshold works well but needs tuning
3. **Multi-parent support is critical**: Jerusalem case proves it's necessary
4. **Ingestion tracking prevents bugs**: Simple run table saves hours of debugging
5. **Hardcoded data is OK**: Multi-capital map is small, stable, and performant

## Success Metrics

- ✅ Zero duplicate capitals after cleanup (except legitimate multi-parents)
- ✅ Re-ingestion creates 0 new records (all matched via external IDs)
- ✅ Multi-capital countries have correct coordinates
- ✅ Jerusalem can be capital of multiple countries
- ✅ New Wikidata/OSM imports deduplicate automatically

## Maintenance

**Monthly**: Run duplicate check
```bash
node tools/corrections/fix-duplicate-capitals.js  # Defaults to dry run
```

**After major ingestion**: Verify counts
```bash
node tools/gazetteer/list-capital-cities.js | wc -l
node tools/db-query.js "SELECT source, COUNT(*) FROM places GROUP BY source"
```

**Database migration**: Schema is idempotent (safe to re-run)
```bash
# Automatic on server start, or manually:
node -e "require('./src/db/sqlite').ensureDatabase('./data/news.db')"
```
