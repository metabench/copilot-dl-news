# Gazetteer Current State

> **Last Updated**: 2025-11-28  
> **Status**: Production (with known gaps)

## Architecture Overview

The gazetteer is a **place name resolution system** that:
1. Stores geographic entities (countries, regions, cities) with multilingual names
2. Provides fast in-memory lookup for URL segment matching
3. Supports deduplication across multiple data sources

### Data Flow

```
                    INGESTION                           RUNTIME
                    ─────────                           ───────
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Wikidata   │───▶│  Ingestors  │───▶│   SQLite    │───▶│ PlaceLookup │
│  (SPARQL)   │    │             │    │  Gazetteer  │    │  (Memory)   │
└─────────────┘    │  - Cities   │    │             │    │             │
                   │  - Regions  │    │  places     │    │ normalized  │
┌─────────────┐    │  - Countries│    │  place_names│    │  → Place[]  │
│RestCountries│───▶│             │    │  hierarchy  │    │             │
│   (API)     │    └─────────────┘    └─────────────┘    │ url_slug    │
└─────────────┘                                          │  → Place[]  │
                                                         └─────────────┘
```

## Database Schema

### Core Tables

#### `places`
Primary table for geographic entities.

```sql
CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,           -- 'country' | 'region' | 'city'
    country_code TEXT,            -- ISO 3166-1 alpha-2
    adm1_code TEXT,               -- ISO 3166-2 or FIPS
    adm2_code TEXT,               -- County/district code
    population INTEGER,
    timezone TEXT,
    lat REAL,
    lng REAL,
    bbox TEXT,                    -- JSON bounding box
    canonical_name_id INTEGER,    -- FK to place_names
    source TEXT,                  -- Primary source
    extra TEXT,                   -- JSON for additional data
    created_at TEXT,
    updated_at TEXT
);
```

#### `place_names`
All name variants for each place.

```sql
CREATE TABLE place_names (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL,    -- FK to places
    name TEXT NOT NULL,           -- Original name
    normalized TEXT NOT NULL,     -- Lowercase, diacritics removed
    lang TEXT,                    -- ISO 639 language code
    kind TEXT,                    -- 'official' | 'endonym' | 'alias' | 'historical'
    is_preferred INTEGER DEFAULT 0,
    is_official INTEGER DEFAULT 0,
    source TEXT NOT NULL,
    created_at TEXT,
    FOREIGN KEY (place_id) REFERENCES places(id)
);
```

#### `place_external_ids`
Cross-references to external databases.

```sql
CREATE TABLE place_external_ids (
    id INTEGER PRIMARY KEY,
    place_id INTEGER NOT NULL,
    source TEXT NOT NULL,         -- 'wikidata' | 'geonames' | 'osm'
    ext_id TEXT NOT NULL,         -- Q60, 5128581, etc.
    created_at TEXT,
    UNIQUE(source, ext_id)
);
```

#### `place_hierarchy`
Parent-child relationships.

```sql
CREATE TABLE place_hierarchy (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    relation TEXT NOT NULL,       -- 'admin_parent' | 'contains'
    depth INTEGER DEFAULT 1,
    UNIQUE(parent_id, child_id, relation)
);
```

### Indexes

```sql
CREATE INDEX idx_places_kind ON places(kind);
CREATE INDEX idx_places_country_code ON places(country_code);
CREATE INDEX idx_place_names_normalized ON place_names(normalized);
CREATE INDEX idx_place_names_place_id ON place_names(place_id);
CREATE INDEX idx_place_external_ids_source_ext ON place_external_ids(source, ext_id);
```

## Current Data Statistics

### By Kind

| Kind | Count | Notes |
|------|-------|-------|
| country | 250 | Complete (via RestCountries) |
| region | ~3,200 | ADM1 only, patchy coverage |
| city | ~8,000 | Major gaps (UK, large countries) |

### By Source

| Source | Records | Last Updated |
|--------|---------|--------------|
| restcountries | ~250 | Countries + capitals |
| wikidata | ~11,000 | Cities, regions (SPARQL) |
| geonames | 0 | **NOT IMPLEMENTED** |
| osm | 0 | **NOT IMPLEMENTED** |

### Coverage Gaps

#### US Cities (195 total, missing major cities)
- ❌ Chicago (pop 2.7M)
- ❌ Houston (pop 2.3M)
- ❌ Phoenix (pop 1.6M)
- ❌ Philadelphia (pop 1.6M)
- ❌ San Antonio (pop 1.4M)
- ✅ New York City (pop 8.4M)
- ✅ Los Angeles (pop 4.0M)

#### UK Cities (1 total!)
- ❌ Manchester (pop 550K)
- ❌ Birmingham (pop 1.1M)
- ❌ Leeds (pop 500K)
- ❌ Liverpool (pop 500K)
- ❌ Edinburgh (pop 500K)
- ❌ Glasgow (pop 630K)
- ✅ London (pop 8.8M)

## Ingestor Analysis

### WikidataCitiesIngestor

**Location**: `src/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js`

**How it works**:
1. Queries Wikidata SPARQL for cities per country
2. Fetches entity details via Wikidata API
3. Upserts to SQLite with deduplication

**Problems**:
- **Timeout**: 20s limit causes failures for large countries
- **Rate limiting**: 250ms delay between countries
- **Per-country limit**: Max 50 cities per country
- **Population filter**: Only cities > 100K by default

**SPARQL Query Pattern**:
```sparql
SELECT ?city ?cityLabel ?coord ?pop WHERE {
  VALUES ?cityClass { wd:Q515 }
  ?city wdt:P31/wdt:P279* ?cityClass.
  ?city wdt:P17 ?country.
  ?country wdt:P297 "GB".  # Country filter
  OPTIONAL { ?city wdt:P625 ?coord. }
  OPTIONAL { ?city wdt:P1082 ?pop. }
  SERVICE wikibase:label { ... }
}
ORDER BY DESC(?pop)
LIMIT 50
```

### populate-gazetteer.js

**Location**: `src/tools/populate-gazetteer.js`

**What it does**:
1. Fetches all countries from RestCountries API
2. Inserts countries with multilingual names
3. Inserts capitals as cities
4. Optionally fetches ADM1, ADM2, cities via Wikidata

**Limitations**:
- Same Wikidata SPARQL issues
- No GeoNames fallback
- No OSM integration

## Runtime: PlaceLookup

**Location**: `src/knowledge/PlaceLookup.js`

**Architecture**:
```javascript
class PlaceLookup {
  constructor(db) {
    this.normalizedMap = new Map();  // normalized → Place[]
    this.urlSlugMap = new Map();     // url_slug → Place[]
    this._loadFromDatabase(db);
  }
  
  lookupByNormalized(text) { ... }
  lookupByUrlSlug(segment) { ... }
}
```

**Key Points**:
- Loads all places + names into memory at startup
- `url_slug` computed at load time via `toUrlSlug()`
- Returns arrays (multiple places can have same name)
- Memory usage: ~1.5MB for current data, ~15MB at scale

**URL Slug Computation**:
```javascript
// src/knowledge/toUrlSlug.js
function toUrlSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')      // Non-alphanumeric → hyphen
    .replace(/^-|-$/g, '');           // Trim hyphens
}
```

## Known Issues

### 1. Canonical Name Population
Many places have `canonical_name_id = NULL`, causing display issues.

**Impact**: City lists show "null" instead of names.

**Fix Applied**: `scripts/gazetteer/migrate-schema.js` now sets canonical names.

### 2. UK/Large Country Coverage
Wikidata SPARQL times out before returning results for countries with many cities.

**Root Cause**: Complex property path queries (`wdt:P31/wdt:P279*`) are slow.

**Workaround**: Fallback to simpler queries, but returns random cities instead of top by population.

### 3. No Multi-Source Reconciliation
If same city exists in Wikidata and (future) GeoNames, no logic to merge/prefer attributes.

**Impact**: Risk of duplicates or conflicting data.

**Planned Fix**: Multi-Source Attribution system (see separate doc).

### 4. Memory vs Disk Trade-off
All lookups are in-memory for speed, but limits scalability.

**Current**: ~11K places = ~1.5MB
**Projected**: ~100K places = ~15MB (acceptable)
**If needed**: Could add SQLite FTS5 for disk-based search

## Recommendations

### Immediate (This Week)
1. ✅ Fix canonical_name_id population
2. ⏳ Implement GeoNames loader for cities15000.txt
3. ⏳ Add PostGIS integration for OSM data

### Short-term (This Month)
4. Add Multi-Source Attribution layer
5. Implement conflict resolution policies
6. Add admin regions from GeoNames

### Medium-term
7. Daily delta sync from GeoNames
8. OSM boundary polygons for spatial queries
9. Geocoding service endpoint
