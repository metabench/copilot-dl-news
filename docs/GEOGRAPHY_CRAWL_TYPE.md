# Geography Crawl Type

**When to Read**: When working with geography crawls, understanding Wikidata integration, gazetteer breadth-first traversal, or debugging country/ADM1/city discovery issues.

## Overview

The **geography** crawl type is a specialized mode that ingests geographic place data from external data sources (Wikidata and OpenStreetMap) rather than crawling traditional websites. It populates the gazetteer database with countries, administrative divisions, and geographic boundaries.

## How It Works

### Data Sources
- **Wikidata**: SPARQL endpoint provides structured geographic entity data (countries, administrative divisions, population, area, etc.)
- **OpenStreetMap**: Boundaries and geographic coordinates

### Architecture
1. **Crawl Type Detection**: When `--crawl-type=geography` is passed, the crawler sets `this.isGazetteerMode = true` and `this.gazetteerVariant = 'geography'`
2. **URL Placeholder**: Geography crawls don't need a traditional website URL, so a placeholder (`https://placeholder.example.com`) is used to satisfy constructor requirements
3. **Gazetteer Pipeline**: Instead of fetching web pages, the crawler uses `GazetteerModeController` to orchestrate data ingestion from external APIs
4. **Database Storage**: Place data is stored in the `places` table with normalized attributes

### Code Flow

```
UI Form (crawl type: geography)
  ↓
POST /api/crawl { crawlType: 'geography' }
  ↓
buildArgs() → ['src/crawl.js', 'https://placeholder.example.com', '--crawl-type=geography', ...]
  ↓
NewsCrawler constructor
  - Sets this.crawlType = 'geography'
  - Sets this.gazetteerVariant = 'geography' (via _resolveGazetteerVariant)
  - Sets this.isGazetteerMode = true
  ↓
_setupGazetteerModeController()
  - Creates GazetteerModeController with mode='geography'
  ↓
Crawler start()
  - Skips robots.txt loading (not needed for external APIs)
  - Runs gazetteer ingestion pipeline
  - Stores place data in database
```

## UI Behavior

When "geography" is selected as the crawl type:

1. **Hidden Fields**:
   - Start URL input (disabled and hidden)
   - Depth input (disabled and hidden)

2. **Shown Fields**:
   - Max Pages (controls how many places to ingest)
   - Concurrency (parallel API requests)
   - Sitemap checkboxes (enabled but unchecked by default)

3. **Contextual Note**:
   > Geography crawl: Aggregates gazetteer data from Wikidata and OpenStreetMap boundaries

## Implementation Files

### Core Logic
- **`src/crawl.js`** (lines 734-747): `_resolveGazetteerVariant()` - Detects geography/wikidata/gazetteer types
- **`src/crawl.js`** (lines 748-762): `_applyGazetteerDefaults()` - Configures crawler for gazetteer mode
- **`src/crawl.js`** (lines 764-780): `_setupGazetteerModeController()` - Creates controller for data ingestion

### UI Layer
- **`src/ui/public/index/initialization.js`** (lines 200-240): Form field visibility logic
- **`src/ui/public/index/crawlControls.js`** (lines 237-241): Form submission logic (excludes startUrl for gazetteer types)

### API Layer
- **`src/ui/express/services/buildArgs.js`** (lines 5-16): Converts HTTP request to CLI arguments, uses placeholder URL for gazetteer types
- **`src/ui/express/routes/api.crawl.js`** (lines 63-295): POST /api/crawl endpoint handler

### Gazetteer Pipeline
- **`src/crawler/gazetteer/GazetteerModeController.js`**: Orchestrates ingestion from Wikidata/OSM
- **`src/crawler/gazetteer/ingestors/`**: Individual ingestors for countries, admin divisions, etc.

## Database Schema

### Places Table
```sql
CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  qid TEXT UNIQUE,           -- Wikidata QID (e.g., 'Q145' for UK)
  name TEXT,                 -- Place name
  kind TEXT,                 -- 'country', 'adm1', 'adm2', etc.
  parent_qid TEXT,           -- Parent place QID
  geometry TEXT,             -- GeoJSON geometry
  created_at INTEGER,
  updated_at INTEGER
);
```

### Place Attributes Table
```sql
CREATE TABLE place_attributes (
  id INTEGER PRIMARY KEY,
  place_id INTEGER REFERENCES places(id),
  kind TEXT,                 -- 'population', 'area_km2', 'capital', etc.
  value TEXT,                -- Attribute value
  source TEXT,               -- 'wikidata', 'osm', etc.
  created_at INTEGER
);
```

## Usage Examples

### Via UI
1. Navigate to http://localhost:41001
2. Select "Geography" from crawl type dropdown
3. Optionally adjust Max Pages and Concurrency
4. Click "Start Crawl"
5. Monitor progress in logs panel

### Via CLI
```bash
node src/crawl.js https://placeholder.example.com --crawl-type=geography --max-pages=100
```

## Query Tooling

Geography crawls now expose their Wikidata SPARQL templates through a shared query module (`src/crawler/gazetteer/queries/geographyQueries.js`) and a lightweight CLI helper.

- **Inspect or run queries**: `node src/tools/geography-crawl-queries.js <countries|adm1|cities> [options]`
- **Quick preview**: append `--print-only` (or use the `print` sub-command) to dump the exact SPARQL string without hitting Wikidata.
- **Narrow scope**: provide `--country-code=US` and/or `--country-qid=Q30` when running ADM1 or city discovery.
- **Adjust defaults**: tweak `--limit`, `--min-population`, `--languages`, or `--preview` to control result size and output formatting.

Behind the scenes, the same builders power the runtime ingestors, so any edits to `geographyQueries.js` stay in lockstep across the CLI, tests, and the crawl pipeline. Queries now standardize on `VALUES` blocks for type selection, `[AUTO_LANGUAGE]`-aware `SERVICE wikibase:label` clauses, and optional filters that can be toggled from the CLI.

### Via API
```bash
curl -X POST http://localhost:41001/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"crawlType": "geography", "maxPages": 100}'
```

## Differences from Web Crawling

| Feature | Web Crawl | Geography Crawl |
|---------|-----------|-----------------|
| Start URL | Required (target website) | Placeholder only |
| Depth | Used (link traversal) | Ignored |
| Robots.txt | Loaded and respected | Skipped |
| Sitemap | Used for discovery | Ignored |
| Content Source | HTTP/HTTPS requests | Wikidata SPARQL + OSM API |
| Data Storage | `articles` table | `places` + `place_attributes` tables |
| Priority Queue | URL-based | Entity-based (countries first, then subdivisions) |

## Related Crawl Types

### Wikidata
```javascript
{ crawlType: 'wikidata' }
```
Ingests only from Wikidata SPARQL endpoint (no OSM boundaries). Faster but less geographic detail.

### Gazetteer (Legacy)
```javascript
{ crawlType: 'gazetteer' }
```
Legacy alias for geography mode. Maintained for backward compatibility.

## Troubleshooting

### "Crawl type is taking ages to load"
**Cause**: Database not seeding crawl types on startup  
**Fix**: Added `this.ensureCrawlTypesSeeded()` to `SQLiteNewsDatabase._init()` (fixed in this session)

### "Starting the geography crawl in the UI did not actually do anything"
**Cause**: Form still sending empty startUrl, buildArgs not handling gazetteer types  
**Fix**: 
1. Updated `crawlControls.js` to exclude geography/wikidata from startUrl submission
2. Updated `buildArgs.js` to use placeholder URL for gazetteer types (fixed in this session)

### "openEventStream is not defined"
**Cause**: Missing function definition in `index.js`  
**Fix**: Added `openEventStream()` wrapper around `sseClient.open()` (fixed in earlier session)

## Performance Considerations

- **Concurrency**: Parameter is treated as MAXIMUM allowed, not a requirement. Geography crawls currently process data sequentially (effectively concurrency=1) due to API rate limits and database transaction ordering. Setting higher values (3-5) establishes an upper bound for future optimizations but does not currently increase speed.
- **Max Pages**: Controls total places ingested (countries first, then subdivisions by hierarchy)
- **API Rate Limits**: Wikidata SPARQL (~60 req/min) and Overpass API have rate limits that necessitate sequential processing
- **Database Size**: Each country ~50 KB, each admin division ~5 KB (rough estimates)
- **Processing Time**: Expect ~5-10 minutes for full global dataset (195 countries + ~5000 subdivisions)

**Note**: See `docs/SPECIALIZED_CRAWL_CONCURRENCY.md` for detailed explanation of why geography crawls ignore the concurrency parameter.

## Future Enhancements

- **Limited Parallelism**: Run independent ingestors simultaneously (within concurrency maximum)
- **Batched API Requests**: Fetch multiple entities per SPARQL query to reduce round-trips
- **Incremental Updates**: Only fetch places modified since last crawl
- **Boundary Simplification**: Reduce GeoJSON complexity for faster rendering
- **Progress Granularity**: Show per-country/per-admin-level progress
- **Provenance Tracking**: Record which specific SPARQL query returned each place
