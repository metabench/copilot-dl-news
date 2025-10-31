# Place Hub Hierarchy

**When to Read**: When working with geographic place hubs; when understanding the continent/country/region/city taxonomy; when implementing place-based crawling logic.

## Overview

**Place hubs** are news website sections dedicated to geographic locations. They follow a hierarchical structure from large regions down to specific cities.

## Terminology

- **Place Hub**: General term for any geographic hub (continent, country, region, city, etc.)
- **Country Hub**: A specific type of place hub for countries (e.g., `/world/france`, `/uk`, `/australia`)
- **Continent Hub**: A specific type of place hub for continents (e.g., `/africa`, `/asia`, `/europe`)
- **Region Hub**: A specific type of place hub for administrative regions (e.g., `/california`, `/scotland`). Constituent countries of the United Kingdom (England, Scotland, Wales, Northern Ireland) are treated as region hubs so they appear alongside traditional states and provinces.
- **City Hub**: A specific type of place hub for cities (e.g., `/newyork`, `/london`, `/tokyo`)

## Hierarchy

```
Place Hubs
├── Continent Hubs (7 continents)
│   ├── Africa
│   ├── Antarctica
│   ├── Asia
│   ├── Europe
│   ├── North America
│   ├── Oceania
│   └── South America
├── Country Hubs (250 countries)
│   └── Each country is within a continent
├── Region Hubs (states, provinces, etc.)
│   └── Each region is within a country
└── City Hubs
    └── Each city is within a region/country
```

## Implementation

### Current Status (October 2025)

1. **Continent Hubs**: ✅ Implemented
   - 7 continents tracked
   - Detection via URL patterns and gazetteer
   - Displayed in intelligent plan output

2. **Country Hubs**: ✅ Fully Implemented
   - ~250 countries from gazetteer
   - Gap analysis service (`CountryHubGapService`)
   - Pattern learning and prioritization
   - Completion detection

3. **Region Hubs**: ✅ Implemented (Updated October 2025)
   - Database support exists (~11 regions including UK constituent countries)
   - `guess-place-hubs` CLI now supports region hub discovery via `--kinds region`
   - Hierarchical place-place hub gap analysis implemented (`PlacePlaceHubGapAnalyzer`)
   - Multi-strategy URL prediction (DSPL patterns, gazetteer learning, common patterns)
   - Audit trail system for validation evidence persistence
   
4. **City Hubs**: ✅ Implemented (Updated October 2025)
   - Database support exists (~257 cities)
   - `guess-place-hubs` CLI supports city hub discovery via `--kinds city`
   - Hierarchical relationship discovery from parent-child place mappings
   - Priority scoring based on population and importance
   - Batch processing with CSV import and JSON report emission

5. **Hierarchical Place-Place Hubs**: ✅ NEW (October 2025)
   - PlacePlaceHubGapAnalyzer for geographic hierarchies like `/us/california`
   - Gap analysis with confidence scoring and priority calculation
   - Pattern extraction from existing verified URLs for learning
   - Integration with existing database query modules

### Code References

**Continent Data**: `src/data/continents.js`
- Continent list with codes and slugs
- Helper functions for lookup by name/slug

**Country Hub Gap Service**: `src/crawler/CountryHubGapService.js`
- Detects missing country hubs
- Generates gap predictions
- Learns URL patterns
- Emits completion milestone

**Place-Place Hub Gap Service**: `src/services/PlacePlaceHubGapAnalyzer.js` ⭐ NEW (October 2025)
- Hierarchical place-place hub gap analysis for geographic hierarchies
- Multi-strategy URL prediction (DSPL, gazetteer-learned, common patterns, regional fallbacks)
- Confidence scoring based on population, importance, and pattern verification
- Integration with existing database query modules

**Hub Categorization**: `src/crawler/planner/HubSeeder.js`
- `_categorizeHubsByType()` - Classifies hubs by type
- `seedPlan()` - Seeds hubs with categorization
- Displays breakdown: `🗺️ N place (X continent, Y country) + 📂 N topic`

**CLI Tools**: 
- `src/tools/guess-place-hubs.js` - Main CLI for hub discovery with batch processing, CSV import, JSON reporting
- `tests/fixtures/mixed-hub-responses.js` - Test fixtures for mixed response scenarios (success, 404, rate limit, server errors)

**Orchestration Layer**: `src/orchestration/placeHubGuessing.js`
- Pure business logic separated from CLI interface
- Batch processing and validation orchestration
- Audit trail and evidence persistence

**Database Queries**: 
- `src/db/sqlite/v1/queries/gazetteer.places.js` - Place hierarchy and relationship queries
- `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js` - Hub guessing and audit queries

### Database Schema

**places table**:
```sql
CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,  -- 'country', 'city', 'region'
  country_code TEXT,
      wikidata_admin_level INTEGER, -- Wikidata admin level (P2959)
  population INTEGER,
  -- ... other fields
);
```

**Current place kinds**:
- `country` (250 rows)
- `city` (257 rows)
- `region` (11 rows)

**Note**: Continents are not stored in the database yet. They're defined in `src/data/continents.js`.

## Usage in Crawling

### Intelligent Plan Output

When an intelligent crawl starts, it displays the hub breakdown:

```
Intelligent plan: seeded 46 hub(s) — 🗺️  30 place (1 continent, 29 country) + 📂 20 topic
```

This shows:
- Total hubs: 46
- Place hubs: 30 (broken down by type)
  - Continent hubs: 1
  - Country hubs: 29
- Topic hubs: 20

### Priority

Place hubs have different priorities based on their scope:

1. **Continent Hubs**: Priority bias 20 (high - broad coverage)
2. **Country Hubs**: Priority bias 20 (high - comprehensive coverage goal)
3. **Region Hubs**: Priority bias 15 (high - regional coverage)
4. **City Hubs**: Priority bias 10 (medium - local coverage)
5. **Hierarchical Place-Place Hubs**: Priority bias 12 (medium-high - geographic hierarchies)

## Guess → Validate → Export Workflow

**Updated October 2025**: Complete workflow for place hub discovery and validation.

### Step 1: Hub Discovery (guess-place-hubs CLI)

```bash
# Single domain discovery
node src/tools/guess-place-hubs.js example.com --kinds country,region,city --apply

# Multi-domain batch processing
node src/tools/guess-place-hubs.js news1.com news2.com news3.com --apply --emit-report

# CSV import for large batches
node src/tools/guess-place-hubs.js --import domains.csv --apply --emit-report batch-report.json

# Hierarchical place-place hub discovery
node src/tools/guess-place-hubs.js example.com --kinds region,city --hierarchical --apply
```

**New Features (October 2025)**:
- **Batch Processing**: Multiple domains in single invocation
- **CSV Import**: Process domain lists from files
- **JSON Reports**: Structured output for automation
- **Hierarchical Discovery**: Parent-child place relationships
- **Audit Trail**: Evidence persistence in `place_hub_audit` table

### Step 2: Validation & Gap Analysis

```bash
# Validate existing hubs
node src/tools/analyse-pages-core.js --validate-hubs

# Gap analysis for missing hubs
node src/services/CountryHubGapService.js analyze
node src/services/PlacePlaceHubGapAnalyzer.js analyze
```

### Step 3: Data Export

```bash
# Export gazetteer data
node src/tools/export-gazetteer.js --format ndjson > gazetteer.ndjson

# Export with summary
node src/tools/export-gazetteer.js --format json --summary-format ascii
```

### Step 4: Dashboard & Monitoring

- **Analysis Dashboard**: `/analysis` endpoint shows hub guessing runs
- **SSE Events**: Real-time progress for batch operations
- **Report Archives**: JSON reports stored for historical analysis

### Error Handling & Recovery

- **Rate Limiting**: Automatic retry with exponential backoff
- **Server Errors**: Graceful degradation with retry logic
- **Audit Trail**: Complete evidence chain for troubleshooting
- **Timeout Protection**: Readiness probes prevent hanging operations

### Testing Infrastructure

**Mixed Response Fixtures**: `tests/fixtures/mixed-hub-responses.js`
- Success responses (200) with realistic hub HTML
- Error responses (404, 429, 500, 503) for failure scenarios
- Redirect responses (301, 302) for URL changes
- Batch response generation for multi-domain testing

```javascript
// Example usage in tests
const { createMockFetch, scenarios, createMixedBatchResponses } = require('../fixtures/mixed-hub-responses');

const mockFetch = createMockFetch({
  'https://example.com/world/france': scenarios.successfulCountryHub.response,
  'https://example.com/world/atlantis': scenarios.notFoundCountryHub.response
});
```

## Future Enhancements

1. **Store continents in database**
   - Add `kind='continent'` to places table
   - Populate from `src/data/continents.js`

2. **Enhanced Hierarchical Discovery** ✅ PARTIALLY COMPLETE (October 2025)
   - ✅ PlacePlaceHubGapAnalyzer implemented for geographic hierarchies
   - ✅ Multi-strategy URL prediction (DSPL, gazetteer-learned, common patterns)
   - ✅ Confidence scoring and gap analysis
   - ⏳ Integration with intelligent planner (pending)

3. **Region Hub Integration** ✅ COMPLETE (October 2025)
   - ✅ Region hub gap analysis via PlacePlaceHubGapAnalyzer
   - ✅ CLI support via `--kinds region` and `--hierarchical`
   - ✅ URL pattern detection and learning
   - ✅ UK constituent countries coverage maintained

4. **City Hub Integration** ✅ COMPLETE (October 2025)
   - ✅ City hub gap analysis via PlacePlaceHubGapAnalyzer
   - ✅ CLI support via `--kinds city` and `--hierarchical`
   - ✅ Priority system based on population and importance
   - ⏳ Integration with intelligent planner (pending)

5. **Place-Topic Combinations**
   - Track hubs like `/world/politics` (country + topic)
   - Special categorization for combined hubs
   - Enhanced coverage tracking

6. **Advanced Batch Processing**
   - Parallel domain processing (currently sequential)
   - Resume capability for interrupted batches
   - Progress persistence across sessions

## Related Documentation

- **HIERARCHICAL_PLANNING_INTEGRATION.md** - Multi-level strategic planning
- **GEOGRAPHY_CRAWL_TYPE.md** - Geographic crawl patterns
- **INTELLIGENT_CRAWL_OUTPUT_LIMITING.md** - Startup analysis and hub reporting
- **CountryHubGapService.js** - Country hub gap detection (reference implementation for other place types)
