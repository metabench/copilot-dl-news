# Geography Crawl E2E Testing

**When to Read**: Use this guide when you need to understand, run, or debug the end-to-end tests for the geography crawl feature. It's particularly useful if you are working on the gazetteer system, modifying the geography crawl lifecycle, or investigating E2E test failures related to geography data ingestion.

## Overview

This document describes the comprehensive end-to-end testing for geography crawls. Geography crawls use the gazetteer system to sequentially process countries, regions, and boundaries from external APIs (Wikidata SPARQL, Overpass).

## Test Files

### 1. Basic E2E Tests (Fast) ✅ Run in Normal Suite

**File**: `src/ui/express/__tests__/geography.crawl.e2e.test.js`

**Purpose**: Quick smoke tests that verify startup and initialization without waiting for full completion.

**What it tests**:
- Geography crawl can be started via API
- Server accepts geography crawl requests
- Crawler initializes without hanging
- SSE events stream startup progress
- Startup stages complete (prepare-data, db-open, gazetteer-schema, etc.)
- No startUrl required for geography crawls
- Gazetteer telemetry events are emitted

**Runtime**: ~30-60 seconds total

**Run with**:
```bash
npm test -- geography.crawl.e2e
```

**Included in**: Normal `npm test` suite

---

### 2. Full E2E Tests (Comprehensive) ⚠️ NOT in Normal Suite

**File**: `src/ui/express/__tests__/geography.full.e2e.test.js`

**Purpose**: Complete validation of full geography crawl lifecycle with real API calls and database verification.

**What it tests**:
- ✅ **Complete lifecycle**: Start → Run → Complete
- ✅ **All startup stages**: prepare-data, db-open, gazetteer-schema, enhanced-features
- ✅ **Pipeline configuration**: Ingestors, coordinators, planners
- ✅ **Controller execution**: Initialization and full run
- ✅ **Real API calls**: Wikidata SPARQL for countries/regions, Overpass for boundaries
- ✅ **Database schema**: gazetteer table creation and population
- ✅ **Data ingestion**: Countries, regions, boundaries sequentially processed
- ✅ **Progress reporting**: Country-level progress with telemetry
- ✅ **Multi-stage processing**: Countries → Regions → Boundaries
- ✅ **Telemetry events**: Milestones, progress, problems
- ✅ **Error handling**: Timeout protection, graceful failures
- ✅ **Completion**: Final summary and database validation
- ✅ **Database validation**: Verify ≥180 countries, regions, total places
- ✅ **Concurrency handling**: Test with different values (1, 4, 8)

**Runtime**: 5-15 minutes per test (depends on network and API response times)

**External Dependencies**:
- **Network access** required
- **Wikidata SPARQL** endpoint (query.wikidata.org)
- **Overpass API** (overpass-api.de)

**Run with**:
```bash
# Run all full geography E2E tests
npm run test:geography-full

# Or with environment variable directly
GEOGRAPHY_FULL_E2E=1 npm test -- geography.full.e2e
```

**NOT included in**: Normal `npm test` suite (too slow and requires network)

---

## Test Categories

| Test Suite | File | Runtime | Network | Run in `npm test` | Purpose |
|------------|------|---------|---------|-------------------|---------|
| **Basic E2E** | `geography.crawl.e2e.test.js` | 30-60s | No | ✅ Yes | Smoke tests, startup verification |
| **Full E2E** | `geography.full.e2e.test.js` | 5-15min | Yes | ❌ No | Complete lifecycle, database validation |

---

## Running Tests

### During Development (Quick)

```bash
# Run basic E2E tests only (fast)
npm test -- geography.crawl.e2e
```

### Before Release (Comprehensive)

```bash
# Run full geography E2E suite
npm run test:geography-full

# Expected output:
# 🌍 STARTING FULL GEOGRAPHY E2E TEST
# ================================================================================
# This test performs a complete geography crawl with real API calls.
# Expected duration: 5-15 minutes
# External APIs: Wikidata SPARQL, Overpass API
# ================================================================================
```

### All Test Categories

```bash
# Fast unit tests only (ignores e2e, integration, online)
npm run test:fast

# Basic E2E tests (UI interactions, ~1-2 min)
npm run test:e2e

# Full geography E2E (5-15 min, requires network)
npm run test:geography-full

# Online tests (external API integration)
npm run test:online

# Everything (except geography-full)
npm test
```

---

## Test Details

### Full E2E Test Cases

1. **Complete Geography Crawl with All Stages**
   - Starts SSE event collection
   - POST /api/crawl with `crawlType: geography`
   - Waits for full completion (up to 15 minutes)
   - Verifies all startup stages
   - Verifies gazetteer milestones (schema, pipeline, init, start)
   - Counts progress events
   - Checks for problems
   - **Validates database**: ≥180 countries, regions, total places
   - Reports final statistics and duration

2. **Concurrency Parameter Handling**
   - Tests with concurrency=1, 4, 8
   - Verifies all values work correctly
   - Confirms jobs start successfully
   - Tests stop/cleanup

3. **Pipeline Configuration**
   - Waits for `gazetteer:pipeline-configured` milestone
   - Verifies ingestors, coordinators, planners initialized
   - Checks configuration details

4. **Country-Level Progress Reporting**
   - Starts crawl with limited scope (50 countries)
   - Collects progress events for 1 minute
   - Verifies progress includes country information
   - Checks for `current/totalItems` data

5. **Timeout Protection**
   - Tests 30-second timeout for preparation
   - Verifies normal operation completes well within timeout
   - Ensures no false timeout events

---

## Concurrency Behavior

**Key Design Points**:

1. **Concurrency is a MAXIMUM, not a requirement**
   - The `concurrency` parameter defines the maximum allowed parallelism
   - Current implementation processes **sequentially** (stage by stage)
   - Future optimizations may utilize parallelism within the maximum

2. **Sequential Processing**
   - Countries processed one at a time
   - Regions processed after all countries
   - Boundaries processed after all regions
   - Each stage completes before next begins

3. **Why Sequential?**
   - Gazetteer data has dependencies (regions need parent countries)
   - External API rate limits require careful management
   - Database integrity easier to maintain with sequential writes
   - Current implementation prioritizes correctness over speed

4. **Future Optimizations**
   - Could parallelize within stages (e.g., 4 countries at once)
   - Could batch API requests more efficiently
   - Would respect concurrency maximum in all cases

**See**: `docs/SPECIALIZED_CRAWL_CONCURRENCY.md` for detailed design documentation

---

## Test Environment Variables

| Variable | Value | Effect | Default |
|----------|-------|--------|---------|
| `GEOGRAPHY_FULL_E2E` | `1` | Enable full geography E2E tests | Disabled |
| `UI_E2E` | `1` | Enable UI E2E tests (Puppeteer) | Disabled |
| `ONLINE_TESTS` | `1` | Enable tests requiring network | Disabled |
| `E2E` | `1` | General E2E flag (legacy) | Disabled |

---

## Debugging Failed Tests

### If Basic E2E Tests Fail

1. **Check server startup**:
   ```bash
   npm run gui
   # Visit http://localhost:41001 and test manually
   ```

2. **Check database**:
   - Look in `test-geography-e2e-test/` temp directory
   - Verify DB file was created
   - Check for errors in server output

3. **Check SSE connection**:
   ```bash
   # Start server
   npm run gui
   
   # In another terminal, test SSE
   curl http://localhost:41001/events?logs=1
   ```

### If Full E2E Tests Fail

1. **Network Issues**:
   - Test external APIs directly:
     ```bash
     curl https://query.wikidata.org/sparql
     curl https://overpass-api.de/api/status
     ```
   - Check firewall/proxy settings

2. **API Rate Limits**:
   - Wikidata has rate limits (may need to retry)
   - Overpass has request limits
   - Tests include retry logic but may still hit limits

3. **Timeout Issues**:
   - Increase timeout in test file (currently 15 minutes)
   - Check network speed
   - Consider running on faster connection

4. **Database Validation Fails**:
   - Check country count expectation (≥180)
   - Verify gazetteer table schema
   - Look for ingestion errors in logs

### Test Output Inspection

**Basic E2E**: Shows startup stages and SSE events

**Full E2E**: Detailed output includes:
```
📊 Starting comprehensive geography crawl...
[Crawl] Started with job ID: xxx
[Crawl] Waiting for completion (this may take 5-15 minutes)...
[Crawl] Completed in X.XX minutes
[Crawl] Total events received: XXX

📋 Startup Stages:
  ✓ prepare-data
  ✓ db-open
  ✓ db-gazetteer-schema
  ✓ enhanced-features

🗺️  Gazetteer Milestones:
  ✓ gazetteer-schema:ready
  ✓ gazetteer:pipeline-configured
  ...

📈 Progress Events:
  Total progress events: XX
  Gazetteer progress events: XX

✅ Completion:
  Completion event: crawl-complete

💾 Database Validation:
  Countries: XXX
  Regions: XXX
  Total places: XXX

✅ Full geography crawl test PASSED
```

---

## Performance Expectations

### Basic E2E (Fast)
- **Total runtime**: 30-60 seconds
- **Tests**: 6 test cases
- **Database**: Minimal (empty or seeded for specific tests)
- **Network**: None (mocked or local only)

### Full E2E (Comprehensive)
- **Total runtime**: 5-15 minutes (varies by network)
- **Tests**: 5 test cases (each can take several minutes)
- **Database**: Full gazetteer data (≥180 countries, regions, boundaries)
- **Network**: Heavy (hundreds of API requests)
- **Database size**: ~10-50 MB after completion

### API Request Counts (Full E2E)
- **Wikidata countries**: ~1 SPARQL query (batch)
- **Wikidata regions**: ~195 SPARQL queries (one per country)
- **Overpass boundaries**: ~195+ queries (countries + regions)
- **Total requests**: ~400-600 API calls

---

## Integration with CI/CD

### Recommended CI Strategy

```yaml
# .github/workflows/tests.yml (example)

# Fast tests on every PR
jobs:
  fast-tests:
    runs-on: ubuntu-latest
    steps:
      - name: Run fast tests
        run: npm run test:fast
      
      - name: Run basic E2E
        run: npm test -- geography.crawl.e2e

# Full E2E on main branch only (nightly or on-demand)
  full-e2e:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Run full geography E2E
        run: npm run test:geography-full
        timeout-minutes: 20
```

**Rationale**:
- Basic E2E runs on every PR (fast feedback)
- Full E2E runs on main branch only (thorough but slow)
- Saves CI minutes and prevents flakiness from external APIs

---

## Maintenance

### When to Update Tests

1. **Adding new gazetteer stages**: Update expected milestones in full E2E
2. **Changing API endpoints**: Update retry logic and error handling
3. **Modifying database schema**: Update validation queries
4. **Changing progress reporting**: Update progress event checks

### Test Data Considerations

- **No fixtures required**: Tests use real external APIs
- **Database is ephemeral**: Created and destroyed per test
- **Network dependency**: Tests will fail if external APIs are down

---

## See Also

- `docs/SPECIALIZED_CRAWL_CONCURRENCY.md` - Concurrency design details
- `docs/GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl architecture
- `docs/GAZETTEER_BREADTH_FIRST_IMPLEMENTATION.md` - Gazetteer implementation
- `src/ui/express/__tests__/geography.crawl.e2e.test.js` - Basic E2E source
- `src/ui/express/__tests__/geography.full.e2e.test.js` - Full E2E source
