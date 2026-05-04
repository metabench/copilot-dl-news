# Cities Integration Status

**When to Read**:
- To get a quick, high-level summary of how the "cities" feature is configured in the geography crawl.
- As a historical snapshot of the integration status as of October 2025.
- For troubleshooting, to quickly see the intended configuration and expected results.

**Date**: October 9, 2025  
**Status**: ✅ **INTEGRATED AND CONFIGURED**

## Summary

Cities loading is **already integrated** into the geography crawl type. The `WikidataCitiesIngestor` runs as part of the staged ingestion pipeline after countries and regions are loaded.

## Current Configuration

### Stage Order (src/crawl.js lines 895-965)

1. **countries** (crawlDepth: 0, priority: 1000)
   - `WikidataCountryIngestor`
   - Loads all countries globally

2. **adm1** (crawlDepth: 1, priority: 100)
   - `WikidataAdm1Ingestor`
   - Loads first-level administrative divisions (states, provinces)

3. **cities** (crawlDepth: 2, priority: 90) ✅ **ACTIVE**
   - `WikidataCitiesIngestor`
   - **Configuration**:
     - `maxCitiesPerCountry`: 50
     - `minPopulation`: 100,000
     - Caching enabled
   - **Data extracted**:
     - Population, coordinates, elevation, timezone
     - OSM IDs (node, way), GeoNames IDs
     - Multilingual names (labels + aliases)
     - Hierarchy: country → city, region → city

4. **boundaries** (crawlDepth: 1, priority: 80) - geography variant only
   - `OsmBoundaryIngestor`
   - Loads geographic boundaries from OpenStreetMap

### Depth Filtering

- **Default maxDepth**: 3 (from src/crawl.js line 181)
- **Cities crawlDepth**: 2
- **Result**: Cities **will load** by default since 2 ≤ 3 ✅

Stages are filtered at runtime:
```javascript
const filteredStages = typeof this.maxDepth === 'number'
  ? stages.filter(s => s.crawlDepth <= this.maxDepth)
  : stages;
```

## How Cities Load

### 1. Discovery Phase
- Query Wikidata SPARQL for cities per country
- Filter by `minPopulation` (100,000)
- Limit to top `maxCitiesPerCountry` (50) by population
- SPARQL query:
  ```sparql
  SELECT ?city ?cityLabel ?coord ?pop WHERE {
    ?city wdt:P31/wdt:P279* wd:Q515.  # Instance of city
    ?city wdt:P17 ?country.           # Country
    ?country wdt:P297 "US".           # ISO code
    OPTIONAL { ?city wdt:P625 ?coord. }
    OPTIONAL { ?city wdt:P1082 ?pop. }
    FILTER(?pop > 100000)
  }
  ORDER BY DESC(?pop)
  LIMIT 50
  ```

### 2. Entity Enrichment
- Fetch full entity data from Wikidata Entity API
- Extract comprehensive properties (population, coordinates, etc.)
- Create multilingual name records

### 3. Database Storage
- Insert into `places` table with `kind='city'`
- Create hierarchy relationships to parent country and region
- Store attributes in `place_attributes` table

## Expected Results

For a **full geography crawl** (maxDepth=3, all countries):

- **Countries**: ~196 countries
- **Regions**: ~5,000+ first-level administrative divisions
- **Cities**: ~9,800 cities (196 countries × 50 cities/country)
  - Only cities with population ≥ 100,000
  - Top 50 most populous per country
- **Total places**: ~15,000+

For **test mode** (maxPages ≤ 1000):
- **Countries**: 10 (limited)
- **Regions**: ~200-500 (10 countries × ~20-50 regions/country)
- **Cities**: ~500 (10 countries × 50 cities/country)
- **Total places**: ~700-1,000

## Testing

### E2E Test Updated

File: `src/ui/express/__tests__/geography.full.e2e.test.js`

The test now validates:
- Country count (minimum 5)
- Region count (logged)
- **City count** (logged with warning if 0) ✅ **NEW**

```javascript
const cityCount = kindBreakdown.find(k => k.kind === 'city')?.count || 0;
logger.info(`City count: ${cityCount}`);
if (cityCount > 0) {
  logger.success(`Cities loaded: ${cityCount} cities found`);
} else {
  logger.warn(`No cities loaded - check maxDepth setting`);
}
```

### Running the Test

```bash
# Full geography crawl (takes 5-15 minutes)
npm run test:geography-full

# Or manually:
$env:GEOGRAPHY_FULL_E2E="1"; $env:JEST_DISABLE_TRUNCATE="1"; npm run test:file "geography.full.e2e"
```

## Implementation Files

### Core Ingestor
- **`src/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js`** (620 lines)
  - SPARQL discovery + Entity API enrichment
  - Configurable population threshold and city limit
  - Caching support
  - Rate limiting

### Integration
- **`src/crawl.js`** (lines 933-947)
  - Stage configuration in `_configureGazetteerPipeline()`
  - Part of staged ingestion coordinator

### Documentation
- **`docs/CITIES_IMPLEMENTATION_COMPLETE.md`** - Full implementation details
- **`docs/GEOGRAPHY_CRAWL_TYPE.md`** - Geography crawl overview

## Configuration Options

Cities can be customized when instantiating the ingestor:

```javascript
new WikidataCitiesIngestor({
  db,
  logger,
  cacheDir: path.join(cacheRoot, 'wikidata'),
  useCache: true,
  maxCitiesPerCountry: 50,    // Configurable: 10-100+
  minPopulation: 100000,       // Configurable: 10k-1M+
  timeoutMs: 20000,
  sleepMs: 250                 // Rate limiting between countries
})
```

## Troubleshooting

### "No cities loaded"

**Check these**:
1. **Depth filter**: Ensure `maxDepth >= 2` (default is 3, so should be fine)
2. **Test mode**: If `maxPages <= 1000`, only 10 countries load → ~500 cities expected
3. **Logs**: Look for "cities" stage in crawl logs
4. **Database**: Query `SELECT COUNT(*) FROM places WHERE kind='city'`

### "Cities stage not running"

**Verify**:
1. Crawl type is `geography` (not `wikidata` - that's countries only)
2. Stage not filtered by depth (`crawlDepth: 2` requires `maxDepth >= 2`)
3. Check coordinator logs for "STARTING STAGE: cities"

### "Too few cities"

**Possible causes**:
1. Population threshold too high (100k filters out smaller cities)
2. Limit per country too low (50 is reasonable but configurable)
3. SPARQL query timeout or rate limiting
4. Missing regions (cities need parent regions for hierarchy)

## Future Enhancements

1. **ADM2 cities**: Cities associated with second-level divisions
2. **Variable thresholds**: Different population minimums per country size
3. **Parallel loading**: Process multiple countries simultaneously (within concurrency limit)
4. **Incremental updates**: Only fetch cities modified since last crawl
5. **Custom queries**: Allow filtering by additional properties (capital status, etc.)

## Related Documentation

- `docs/CITIES_IMPLEMENTATION_COMPLETE.md` - Full implementation details
- `docs/GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl overview
- `docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` - Staged ingestion architecture
- `src/crawler/gazetteer/ingestors/WikidataCitiesIngestor.js` - Source code

---

**Status**: Cities are fully integrated and load by default in geography crawls. The E2E test now validates city counts and reports them in the final summary.
