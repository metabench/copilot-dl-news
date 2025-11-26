# Gazetteer Ingestion Robustness Improvement Plan

**Date**: 2025-06-20  
**Session**: Gazetteer Ingestion Pipeline Improvements  
**Status**: ✅ COMPLETED  
**Objective**: Make the ingestion pipeline robust and properly integrate Wikidata results to eliminate duplicate entries like the 5 London records.

---

## Implementation Summary

All improvements have been implemented and tested:

### 1. Created `gazetteer-cleanup.js` Tool (Manual & Automatic)

**Location**: `src/tools/gazetteer-cleanup.js`

**Usage**:
```bash
# Analyze duplicates
node src/tools/gazetteer-cleanup.js --analyze

# Preview cleanup (dry-run)
node src/tools/gazetteer-cleanup.js --merge --dry-run

# Run full cleanup
node src/tools/gazetteer-cleanup.js --all

# Filter by country
node src/tools/gazetteer-cleanup.js --all --country=GB
```

**Features**:
- `--analyze`: Show duplicate analysis without changes
- `--merge`: Merge duplicate place records
- `--backfill-qids`: Populate `wikidata_qid` from `place_external_ids`
- `--remove-orphans`: Remove low-quality orphan records
- `--all`: Run all cleanup operations
- `--dry-run`: Preview changes without applying
- `--verbose`: Detailed output
- `--country=XX`: Filter by country code

### 2. Integrated Deduplication Into Capital Creation

**File**: `src/tools/populate-gazetteer.js`

**Changes**:
- Added `findExistingPlace` import from deduplication module
- Before creating a capital city, the code now:
  1. Checks for existing restcountries external ID
  2. Uses 6-strategy deduplication (Wikidata QID, OSM ID, GeoNames ID, name+country, coordinate proximity)
  3. Only creates new record if no match found
  4. Registers restcountries external ID on existing records for future runs

### 3. Added Automatic Cleanup to `populate-gazetteer.js`

**New CLI Options**:
- `--cleanup`: Run duplicate cleanup after ingestion
- `--cleanup-only`: Run cleanup without ingesting new data

**Cleanup Steps**:
1. Backfill `wikidata_qid` from `place_external_ids`
2. Find duplicate groups by normalized name + country + kind
3. Score places (Wikidata > population > name count)
4. Merge duplicates, keeping highest-quality record
5. Transfer names, hierarchy, attributes, external IDs

---

## Results

### Before Cleanup
- 5 London records (IDs 4, 5, 7, 21, 23)
- 4 from `restcountries@v3.1` (no pop, no QID, 1 name each)
- 1 from `wikidata` (pop 8.8M, 405 names, but QID not in `places.wikidata_qid`)

### After Cleanup
- 1 London record (ID 21)
- Source: `wikidata`
- Population: 8,799,728
- Wikidata QID: `Q84` (backfilled)
- 406 name variants

### Statistics
- 252 places got `wikidata_qid` backfilled
- 2 duplicate sets merged (London + Dublin)
- 8 duplicate records deleted
- 0 duplicates remaining

---
