# Development E2E Tests

**When to Read**: When creating long-running E2E tests for crawls or background tasks, implementing progress logging for multi-minute operations, or debugging E2E test hangs.

**Status**: Active Development Tools  
**Date**: October 2025

## Overview

The geography E2E tests (`geography.full.e2e.test.js`) are **development and debugging tools**, not regular tests. They provide live monitoring and detailed telemetry for understanding system behavior during development.

## Purpose

These tests are designed for:

1. **Live Development Monitoring**: Watch crawl progress in real-time with detailed telemetry
2. **System Understanding**: See exactly how the system behaves under real-world conditions
3. **Performance Analysis**: Track timing, throughput, and resource usage
4. **Data Validation**: Verify ingestion pipelines produce correct results
5. **Debugging**: Identify bottlenecks, errors, and unexpected behavior

## NOT Regular Tests

❌ **Not for CI/CD**: Too slow and resource-intensive  
❌ **Not for TDD**: Not run frequently during development  
❌ **Not for regression**: Use fast unit/integration tests instead  

✅ **For Development**: Run when building/debugging geography features  
✅ **For Analysis**: Understand system behavior and performance  
✅ **For Validation**: Verify full end-to-end data pipelines  

## Running the Tests

### Prerequisites

- Network access (Wikidata, Overpass API)
- Adequate disk space (~100MB+ for full dataset)
- Time (5-60 minutes depending on scope)

### PowerShell (Windows)

```powershell
# Full geography crawl with detailed output
$env:GEOGRAPHY_FULL_E2E="1"; $env:JEST_DISABLE_TRUNCATE="1"; npm run test:file "geography.full.e2e"
```

### Bash/Linux/Mac

```bash
GEOGRAPHY_FULL_E2E=1 JEST_DISABLE_TRUNCATE=1 npm test -- geography.full.e2e
```

### Environment Variables

- **`GEOGRAPHY_FULL_E2E=1`**: Enable the tests (they're skipped by default)
- **`JEST_DISABLE_TRUNCATE=1`**: Show all console output (no 15-line limit)

## Output Format

The tests provide rich, real-time telemetry:

```
🔍 [2s] Discovery: 195 countries, ~9750 cities expected
   Config: max 50 cities/country, min population 100000

📊 [5s] [1%] US: +50 cities (total: 50/50 upserted) ETA 890s
📊 [8s] [2%] GB: +48 cities (total: 98/98 upserted) ETA 856s
📊 [11s] [5%] FR: +50 cities (total: 248/248 upserted) ETA 812s
   Timing: 10s elapsed, ~1000ms/country

✅ [120s] Complete: 9234 cities, 195 countries
   Timing: 120s total, ~615ms/country, 98% success
```

### Event Types

- **🏁 Milestone**: Major stage transitions (init, complete, shutdown)
- **🔍 Discovery**: Initial planning and configuration
- **📊 Progress**: Per-country updates with timing and ETAs
- **✅ Complete**: Final summary with totals and statistics
- **📈 Telemetry**: System-level metrics and events
- **⚠️ Problem**: Errors and warnings
- **📝 Log**: Additional debug information

## Detailed Telemetry

### Discovery Phase

```javascript
{
  phase: 'discovery',
  totalCountries: 195,
  maxCitiesPerCountry: 50,
  minPopulation: 100000,
  estimatedTotal: 9750
}
```

### Processing Phase (per country)

```javascript
{
  phase: 'processing',
  current: 42,
  totalItems: 195,
  percentComplete: 22,
  countryCode: 'JP',
  citiesProcessed: 50,
  citiesUpserted: 50,
  totalProcessed: 2100,
  totalUpserted: 2100,
  totalErrors: 0,
  timing: {
    elapsedMs: 25000,
    avgPerCountryMs: 595,
    estimatedRemainingMs: 91000
  }
}
```

### Completion Summary

```javascript
{
  phase: 'complete',
  summary: {
    recordsProcessed: 9234,
    recordsUpserted: 9234,
    errors: 3,
    durationMs: 120000,
    countriesProcessed: 195,
    avgCitiesPerCountry: 47,
    successRate: 98,
    avgTimePerCountryMs: 615
  }
}
```

## Use Cases

### 1. Developing New Ingestors

When adding a new ingestor (e.g., OSM boundaries, postal codes):

```javascript
// Add ingestor to src/crawl.js
stages.push({
  name: 'postal-codes',
  kind: 'postal_code',
  ingestors: [new PostalCodeIngestor({ db, logger })]
});

// Run development test to see it work
$env:GEOGRAPHY_FULL_E2E="1"; $env:JEST_DISABLE_TRUNCATE="1"; npm run test:file "geography.full.e2e"

// Watch detailed progress:
// 🔍 [2s] Discovery: Planning postal code ingestion...
// 📊 [5s] [10%] Processing US postal codes: +41000 records
// ✅ [300s] Complete: 1.2M postal codes ingested
```

### 2. Performance Optimization

Track timing improvements:

```bash
# Before optimization
✅ Complete: 9234 cities, 195 countries
   Timing: 180s total, ~923ms/country

# After optimization
✅ Complete: 9234 cities, 195 countries
   Timing: 120s total, ~615ms/country  # 33% faster!
```

### 3. Data Validation

Verify ingestion correctness:

```javascript
// Test validates:
expect(cityCount).toBeGreaterThan(500);
expect(countriesWithWikidata).toBeGreaterThan(150);
expect(countriesWithCoords).toBeGreaterThan(150);

// Console shows details:
Sample countries:
  - United States (US): coords=YES, pop=331900000, wikidata=Q30
  - China (CN): coords=YES, pop=1411100000, wikidata=Q148
```

### 4. Debugging Failures

When something goes wrong:

```
📊 [45s] [23%] BR: +50 cities (total: 4500/4500 upserted)
⚠️  [47s] Problem: wikidata-timeout - SPARQL query timeout for AR
📊 [50s] [24%] AR: +0 cities (total: 4500/4500 upserted)  # Skipped due to error
📊 [52s] [25%] CL: +48 cities (total: 4548/4548 upserted)  # Continues
```

## Future Extensions

These development tests can be extended for other long-running processes:

### OSM Data Ingestion (hours/days)

```javascript
test('OSM full planet import', async () => {
  // Import 8GB+ OSM planet file
  // Expected runtime: 2-8 hours
  // Progress: GB processed, features extracted, database upserted
}, 8 * 60 * 60 * 1000); // 8 hour timeout
```

### Postgres Migration (hours)

```javascript
test('SQLite to Postgres migration', async () => {
  // Migrate entire database to Postgres
  // Expected runtime: 30min - 2 hours
  // Progress: tables migrated, rows transferred, indexes created
}, 2 * 60 * 60 * 1000);
```

### News Archive Crawl (days)

```javascript
test('historical news archive crawl', async () => {
  // Crawl years of archived news
  // Expected runtime: 1-7 days
  // Progress: dates processed, articles scraped, analysis complete
}, 7 * 24 * 60 * 60 * 1000);
```

## Best Practices

### 1. Always Show What's Happening

```javascript
// ✅ GOOD: Detailed progress
console.log(`📊 [${elapsed}s] [${pct}%] ${country}: +${cities} cities (ETA ${eta}s)`);

// ❌ BAD: Silent periods
// ... no output for 60 seconds ...
```

### 2. Use Defensive Completion Detection

```javascript
// ✅ GOOD: Multiple ways to detect completion
const shouldStop = 
  hasCrawlComplete || 
  hasShutdown || 
  hasJobComplete || 
  hasIngestionComplete ||
  hasTotals;

// ❌ BAD: Single specific event
const shouldStop = event.kind === 'crawl-complete'; // Might never come!
```

### 3. Show Timing and ETAs

```javascript
// ✅ GOOD: Shows progress + timing
const eta = (totalItems - current) * avgTimePerItem;
console.log(`Progress: ${current}/${totalItems} (ETA ${eta}s)`);

// ❌ BAD: Just a counter
console.log(`Progress: ${current}/${totalItems}`);
```

### 4. Disable Console Truncation

```javascript
// ✅ GOOD: Set env var
process.env.JEST_DISABLE_TRUNCATE = '1';

// ❌ BAD: Gets cut off at 15 lines
// [jest-truncate] further console output suppressed after 15 lines
```

## Maintenance

### When Adding New Stages

1. Add telemetry to the ingestor (discovery, processing, complete phases)
2. Update test to recognize new completion events
3. Add validation queries for the new data type
4. Update this documentation with expected runtime

### When Modifying Existing Stages

1. Ensure telemetry still emits (phase, current, total, timing)
2. Run development test to verify output is still useful
3. Update expected runtimes if performance changed

## Summary

Development E2E tests are **tools for understanding and debugging**, not regular tests. They provide:

- ✅ Real-time progress visibility
- ✅ Detailed telemetry and timing
- ✅ End-to-end validation
- ✅ Performance insights

Use them when developing geography features, not in normal TDD workflows. Keep them in the project as valuable development tools.
