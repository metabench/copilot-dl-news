# Chapter 17: Gazetteer Architecture

## Overview

The gazetteer is the geographic knowledge base that powers place disambiguation, URL path analysis, and geographic context extraction. This chapter documents the architecture for loading, querying, and maintaining gazetteer data.

## Data Model

### Core Tables

The gazetteer consists of several interconnected tables:

```sql
-- Primary place storage
places (
    id INTEGER PRIMARY KEY,
    kind TEXT,              -- 'country', 'region', 'city', 'island', etc.
    place_type TEXT,        -- standardized: 'country', 'admin1', 'city', 'locality'
    country_code TEXT,      -- ISO 3166-1 alpha-2
    adm1_code TEXT,         -- First-level admin code
    adm2_code TEXT,         -- Second-level admin code
    population INTEGER,
    timezone TEXT,
    lat REAL,
    lng REAL,
    bbox TEXT,              -- JSON bounding box
    canonical_name_id INTEGER,  -- FK to place_names
    source TEXT,            -- 'wikidata', 'osm', 'geonames', 'bootstrap-db'
    wikidata_qid TEXT,
    osm_type TEXT,
    osm_id INTEGER,
    wikidata_props TEXT,    -- JSON additional properties
    osm_tags TEXT,          -- JSON OSM tags
    status TEXT DEFAULT 'current'
)

-- Multi-language place names
place_names (
    id INTEGER PRIMARY KEY,
    place_id INTEGER,       -- FK to places
    name TEXT,              -- Display name
    normalized TEXT,        -- Lowercase, no diacritics
    lang TEXT,              -- BCP-47 language code ('en', 'zh', 'ar')
    script TEXT,            -- ISO 15924 script code ('Latn', 'Hans', 'Arab')
    name_kind TEXT,         -- 'official', 'common', 'alias', 'endonym', 'exonym'
    is_preferred BOOLEAN,
    is_official BOOLEAN,
    source TEXT
)

-- Administrative hierarchy
place_hierarchy (
    parent_id INTEGER,      -- FK to places
    child_id INTEGER,       -- FK to places
    relation TEXT,          -- 'contains', 'capital_of', etc.
    depth INTEGER           -- Hierarchy depth
)

-- External ID mappings
place_external_ids (
    source TEXT,            -- 'wikidata', 'osm', 'geonames'
    ext_id TEXT,            -- External identifier
    place_id INTEGER        -- FK to places
)
```

### Kind to PlaceType Mapping

The `kind` field stores the source's terminology, while `place_type` provides standardized values:

```javascript
const KIND_TO_PLACE_TYPE = {
  'country': 'country',
  'city': 'city',
  'island': 'locality',
  'state': 'admin1',
  'region': 'admin1',
  'territory': 'admin1',
  'province': 'admin1',
  'planet': 'other',
  'continent': 'continent',
  'dependency': 'territory',
  'autonomous': 'admin1',
};
```

## Loading Architecture

### Bootstrap Loading

The bootstrap loader (`src/bootstrap/bootstrapDbLoader.js`) handles initial dataset ingestion:

```javascript
const { loadBootstrapData } = require('../bootstrap/bootstrapDbLoader');

// Load from JSON dataset
const summary = loadBootstrapData({
  db,
  dataset: {
    countries: [...],
    topics: [...],
    skipTerms: { en: [...], fr: [...] }
  },
  source: 'bootstrap-db@1.0'
});
```

**Key Features:**
1. **Idempotent** - Uses `INSERT OR IGNORE` and updates existing records
2. **Name Normalization** - Strips diacritics, lowercases, trims
3. **Multi-language Names** - Supports `official`, `common`, and `alias` names per language
4. **Canonical Name Selection** - Automatically picks best name (official > preferred > English)

### Ingestion Pipeline

For ongoing imports from external sources, use `gazetteer.ingest.js`:

```javascript
const {
  createIngestionStatements,
  upsertPlace,
  insertPlaceName,
  setCanonicalName
} = require('./db/sqlite/v1/queries/gazetteer.ingest');

// Create prepared statements once
const statements = createIngestionStatements(db);

// Upsert a place
const { placeId, created } = upsertPlace(db, statements, {
  wikidataQid: 'Q16',
  kind: 'country',
  countryCode: 'CA',
  population: 38000000,
  lat: 56.0,
  lng: -106.0,
  source: 'wikidata'
});

// Add names
insertPlaceName(statements, placeId, {
  text: 'Canada',
  lang: 'en',
  kind: 'official',
  isPreferred: true,
  isOfficial: true
});

// Set canonical name
setCanonicalName(statements, placeId);
```

### Deduplication Strategy

The ingestion pipeline uses robust deduplication (`gazetteer.deduplication.js`):

1. **Wikidata QID Match** - Exact match on `wikidata_qid`
2. **External ID Match** - Check `place_external_ids` (OSM, GeoNames)
3. **Admin Code Match** - For regions: `country_code + adm1_code + adm2_code`
4. **Normalized Name + Country** - For cities: normalized name within country
5. **Proximity Match** - Coordinate distance threshold for spatial dedup

```javascript
const existingMatch = findExistingPlace(statements, {
  wikidataQid,
  osmType, osmId,
  geonamesId,
  kind,
  countryCode,
  adm1Code,
  normalizedName,
  lat, lng
});
```

## Query Architecture

### In-Memory Matchers

For high-performance text extraction, the system builds in-memory indexes:

```javascript
const { buildGazetteerMatchers } = require('./analysis/place-extraction');

// Build matchers (expensive - do once at startup)
const matchers = buildGazetteerMatchers(db, {
  topicTokens: new Set(['news', 'world', 'politics'])
});

// matchers contains:
// - nameMap: Map<normalized_name, PlaceRecord[]>
// - slugMap: Map<slug, PlaceRecord[]>
// - placeIndex: Map<place_id, PlaceRecord>
// - hierarchy: { parents, children, isAncestor() }
```

**PlaceRecord Structure:**
```javascript
{
  id: 123,
  place_id: 123,
  kind: 'city',
  country_code: 'CA',
  countryCode: 'CA',
  population: 2930000,
  names: Set(['Toronto', 'Торонто']),
  slugs: Set(['toronto']),
  synonyms: ['toronto', 'ca'],
  nameOrder: ['Toronto', 'Торонто'],
  canonicalSlug: 'toronto',
  name: 'Toronto'
}
```

### Database Queries

For database-backed lookups (less common paths):

```javascript
// From gazetteer.places.js
const { getTopCities, getAllCountries } = require('./db/sqlite/v1/queries/gazetteer.places');

const countries = getAllCountries(db);  // Returns with canonical names
const cities = getTopCities(db, 100);   // Top 100 by population

// From gazetteer.search.js
const { searchPlacesByName } = require('./db/sqlite/v1/queries/gazetteer.search');

const results = searchPlacesByName(db, 'London', {
  limit: 10,
  kind: 'city',
  includeIncomplete: false
});
```

### Multi-Language Queries

New in this release - script-aware lookups:

```javascript
const queries = createMultiLanguagePlaceQueries(db);

// Detect script automatically
const script = queries.detectScript('北京');  // Returns 'Hans'

// Search across languages
const candidates = queries.searchByNameAnyLanguage('München', { limit: 10 });

// Get localized name
const name = queries.getPreferredName(placeId, 'zh');  // Returns '北京'
```

## Hierarchy Management

### Building Hierarchy Index

The hierarchy enables coherence scoring (e.g., "Manchester" in "England" in "UK"):

```javascript
// During matcher building
const hierarchy = buildHierarchyIndex(db, placeIndex);

// Check ancestor relationships
const isDescendant = hierarchy.isAncestor(ukId, manchesterId);  // true
```

### Hierarchy Queries

```javascript
// Get place with full hierarchy
const details = getPlaceDetails(db, placeId);
// Returns { ...place, names: [], parents: [], children: [], attributes: [] }

// Direct hierarchy queries
const hierarchy = getPlaceHierarchy(db);
// Returns [{ parent: {...}, child: {...} }, ...]
```

## Instrumentation & Observability

### Debug Logging

Enable verbose logging for debugging:

```javascript
// Set global flag before creating statements
global.__COPILOT_GAZETTEER_VERBOSE = true;

const statements = createIngestionStatements(db);
// Logs: [createIngestionStatements] Starting to create prepared statements...
```

### Progress Events

For long-running imports, use EventEmitter pattern:

```javascript
// Example from gazetteer-import-simulation lab
class GazetteerImport extends EventEmitter {
  async import() {
    for (const place of places) {
      // ... process place ...
      this.emit('progress', { processed, total, current: place.name });
    }
    this.emit('complete');
  }
}

const importer = new GazetteerImport();
importer.on('progress', (p) => console.log(`${p.processed}/${p.total}`));
importer.start();
```

### MCP Logging Integration

Write logs for AI agent consumption:

```javascript
const { createMcpLogger } = require('./utils/mcpLogger');
const logger = createMcpLogger('IMPORT', 'gazetteer-import-2025');

logger.info('Starting import', { source: 'wikidata', count: 1000 });
logger.warn('Dedup conflict', { place: 'London', candidates: 2 });
logger.error('Insert failed', { error: err.message });
```

## PostGIS Integration

For deployments with PostgreSQL/PostGIS:

```javascript
const { PostgisGazetteer } = require('./analysis/PostgisGazetteer');

const gazetteer = new PostgisGazetteer({
  database: 'planet1',
  host: 'localhost'
});

// Async batch lookup
const candidatesMap = await gazetteer.findCandidates(['london', 'paris']);
// Returns Map<name, Place[]>
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GAZETTEER DATA FLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                   │
│  │  Wikidata   │   │   OpenStreetMap  │   │  GeoNames  │                │
│  │    SPARQL   │   │     Overpass     │   │    API     │                │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                   │
│         │                  │                  │                         │
│         ▼                  ▼                  ▼                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                   INGESTION PIPELINE                           │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │  createIngestionStatements(db)                          │   │    │
│  │  │    - Prepared statement pool                            │   │    │
│  │  │    - Deduplication queries                              │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │  upsertPlace() → insertPlaceName() → setCanonicalName() │   │    │
│  │  │    - Find existing (5-strategy dedup)                   │   │    │
│  │  │    - Update or insert                                   │   │    │
│  │  │    - Record external IDs                                │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                         │
│                              ▼                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                     SQLite GAZETTEER                           │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │    │
│  │  │   places     │  │ place_names  │  │place_hierarchy│          │    │
│  │  │  (id,kind,   │  │  (name,lang, │  │(parent,child,│          │    │
│  │  │   lat,lng,   │  │   script,    │  │  depth)      │          │    │
│  │  │  country_code)│  │   name_kind) │  │              │          │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘          │    │
│  │  ┌──────────────┐  ┌──────────────┐                            │    │
│  │  │place_external│  │ place_sources│                            │    │
│  │  │   _ids       │  │              │                            │    │
│  │  └──────────────┘  └──────────────┘                            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                         │
│         ┌────────────────────┴────────────────────┐                    │
│         ▼                                         ▼                    │
│  ┌─────────────────────────────┐    ┌──────────────────────────────┐   │
│  │   IN-MEMORY MATCHERS        │    │    DATABASE QUERIES          │   │
│  │  ┌────────────────────────┐ │    │  ┌─────────────────────────┐ │   │
│  │  │ buildGazetteerMatchers │ │    │  │ searchPlacesByName()    │ │   │
│  │  │ - nameMap              │ │    │  │ getPlaceDetails()       │ │   │
│  │  │ - slugMap              │ │    │  │ getAllCountries()       │ │   │
│  │  │ - placeIndex           │ │    │  │ getTopCities()          │ │   │
│  │  │ - hierarchy            │ │    │  │ multiLanguagePlaces.*   │ │   │
│  │  └────────────────────────┘ │    │  └─────────────────────────┘ │   │
│  └─────────────────────────────┘    └──────────────────────────────┘   │
│         │                                         │                    │
│         ▼                                         ▼                    │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │               PLACE EXTRACTION / DISAMBIGUATION                │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │ extractGazetteerPlacesFromText(text, matchers, ctx)     │   │    │
│  │  │ resolveUrlPlaces(url, matchers)                         │   │    │
│  │  │ pickBestCandidate(candidates, ctx, isTitle)             │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Performance Considerations

### Startup Cost

Building in-memory matchers is expensive (5-10 seconds for large gazetteers):

```javascript
// Do once at application startup
const matchers = buildGazetteerMatchers(db);

// Reuse across all requests
app.locals.matchers = matchers;
```

### Query Optimization

The schema includes indexes for common queries:

```sql
-- Name lookups
CREATE INDEX idx_place_names_normalized ON place_names(normalized);
CREATE INDEX idx_place_names_place_id ON place_names(place_id);

-- Hierarchy traversal
CREATE INDEX idx_place_hierarchy_parent_id ON place_hierarchy(parent_id);
CREATE INDEX idx_place_hierarchy_child_id ON place_hierarchy(child_id);

-- External ID resolution
CREATE UNIQUE INDEX idx_place_external_ids_unique ON place_external_ids(source, ext_id);
```

### Memory Management

For TEST_FAST mode, limit cities loaded:

```javascript
const TEST_FAST = process.env.TEST_FAST === '1';
const CITY_LIMIT = TEST_FAST ? 500 : 5000;

// Only load top N cities by population
const cityRows = db.prepare(`
  SELECT ... FROM place_names pn
  JOIN places p ON p.id = pn.place_id
  WHERE p.kind = 'city'
  ORDER BY p.population DESC
  LIMIT ${CITY_LIMIT}
`).all();
```

## Related Modules

| Module | Purpose |
|--------|---------|
| `gazetteer.ingest.js` | Place/name upsert with deduplication |
| `gazetteer.places.js` | Country/region/city queries |
| `gazetteer.names.js` | Name-specific queries |
| `gazetteer.search.js` | Full-text search |
| `gazetteer.utils.js` | Name normalization |
| `gazetteer.deduplication.js` | Duplicate detection strategies |
| `gazetteer.attributes.js` | Per-source attribute storage |
| `gazetteer.progress.js` | Import progress tracking |
| `multiLanguagePlaces.js` | Script detection, language-aware queries |
| `place-extraction.js` | In-memory matchers, text extraction |
| `PostgisGazetteer.js` | PostgreSQL/PostGIS adapter |

## Lab Experiments

See `labs/gazetteer-import-simulation/` for an observable import simulation with progress events and MCP logging.

To run the simulation:
```bash
cd labs/gazetteer-import-simulation
node server.js
# Open http://localhost:3006
```

## Summary

The gazetteer architecture provides:
1. **Multi-source ingestion** - Wikidata, OSM, GeoNames, custom datasets
2. **Robust deduplication** - 5-strategy matching to avoid duplicates
3. **Multi-language support** - BCP-47 language codes, ISO 15924 scripts
4. **Hierarchy awareness** - Parent-child relationships for coherence
5. **High-performance extraction** - In-memory matchers for text analysis
6. **Observable imports** - Progress events and MCP logging

Next: Chapter 18 will cover integration patterns for wiring the gazetteer into the analysis pipeline.
