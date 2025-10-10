# Geography Crawl E2E Test

**When to Read**: Read this when working on geography crawl E2E tests, understanding full crawl lifecycle testing, or debugging geography crawl integration. Covers test structure, telemetry validation, and completion detection.

## Overview

The geography crawl E2E test (`src/ui/express/__tests__/geography-crawl.e2e.test.js`) provides comprehensive end-to-end validation of the geography crawl workflow with full telemetry monitoring.

**Status**: Disabled by default (long-running test for manual validation)

## What It Tests

1. **Geography Crawl Type Selection**
   - Verifies geography/gazetteer option exists in crawl type dropdown
   - Confirms dropdown is properly populated from `/api/crawl-types`

2. **Crawl Initiation**
   - Tests that clicking "Start" button initiates crawl
   - Verifies server responds with start confirmation
   - Checks that UI updates (start button disabled)

3. **SSE Connection & Telemetry**
   - Monitors SSE connection establishment
   - Captures all telemetry events (progress, telemetry, milestone)
   - Verifies telemetry/progress UI components become visible

4. **Gazetteer-Specific Progress**
   - Monitors for gazetteer ingestor progress data
   - Checks for `totalIngestors`, `currentIngestor` fields
   - Verifies `totalItems`, `current` fields from ingestors
   - Logs detailed gazetteer progress for debugging

5. **Long-Running Monitoring**
   - Monitors crawl for 2 minutes (configurable)
   - Provides checkpoints every 5 seconds
   - Reports progress UI state throughout execution
   - Detects crawl completion or failure

## Running the Test

### Prerequisites

- Puppeteer installed: `npm install --save-dev puppeteer`
- Server can bind to an ephemeral port
- No other services on port 3000 (will auto-select if occupied)

### Enable and Run

```bash
# Enable geography E2E test
GEOGRAPHY_E2E=1 npm run test:file "geography-crawl.e2e"

# Or run all E2E tests with geography
GEOGRAPHY_E2E=1 npm run test:e2e
```

### Expected Output

```
[geography-e2e] Starting server with DB: /tmp/geography-e2e-1234567890/test.db
[geography-e2e] Server ready at: http://localhost:41234
[geography-e2e] Browser launched
[geography-e2e] Starting test...
[geography-e2e] New page created
[geography-e2e] Navigating to: http://localhost:41234
[geography-e2e] Page loaded
[geography-e2e] Crawl type dropdown populated
[geography-e2e] Geography crawl type found
[geography-e2e] Selected crawl type: geography
[geography-e2e] Telemetry monitoring set up
[geography-e2e] Start button clicked
[geography-e2e] Crawl started (start button disabled)
[geography-e2e] SSE connected (telemetry/progress UI visible)
[geography-e2e] Monitoring crawl for 120s...
[geography-e2e] Monitor checkpoint at 5s:
  - Total events: 12
  - Progress events: 5
  - Telemetry events: 7
  - Gazetteer progress: 3
[geography-e2e] Gazetteer progress: {
  "phase": "ingestor-start",
  "ingestor": "wikidata-countries",
  "currentIngestor": 1,
  "totalIngestors": 3,
  ...
}
...
[geography-e2e] ✓ Test completed successfully
```

## Diagnostics

The test provides detailed diagnostics on failure:

```
========== GEOGRAPHY E2E DIAGNOSTICS ==========
Crawl Type Found: true
Crawl Started: true
SSE Connected: true
Telemetry Received: true
Progress Received: true
Gazetteer Data Received: true
Errors: 0
===============================================
```

### Common Failure Scenarios

**Geography crawl type not found**:
```
DIAGNOSTIC: Geography/Gazetteer crawl type not found in dropdown.
Available types: basic, basic-with-sitemap, intelligent, sitemap-only
```
- **Fix**: Register geography crawl type in database (`crawl_types` table)
- **Check**: `/api/crawl-types` endpoint returns geography option

**No telemetry received**:
```
DIAGNOSTIC: No telemetry or progress events received after starting crawl.
SSE may not be working.
```
- **Fix**: Verify SSE endpoint `/api/sse-events` is accessible
- **Check**: Browser console for SSE connection errors
- **Verify**: RealtimeBroadcaster is initialized in server

**No gazetteer progress data**:
```
WARNING: No gazetteer-specific progress data received
This may indicate ingestors are not emitting totalItems/currentIngestor
```
- **Fix**: Verify GazetteerIngestionCoordinator emits `totalIngestors`
- **Check**: Ingestors emit `totalItems` and `current` in progress callbacks
- **Verify**: GazetteerModeController passes progress to telemetry

## Configuration

Adjust test parameters in the test file:

```javascript
jest.setTimeout(600000); // Max test duration (10 minutes)

const monitorDuration = 120000; // Monitor crawl for 2 minutes
const checkInterval = 5000; // Report status every 5 seconds
```

## Test Isolation

- Creates temporary SQLite database per test run
- Uses ephemeral server port (no conflicts)
- Cleans up database files in `afterAll()`
- Spawns isolated server process

## Why Disabled by Default?

1. **Long Duration**: Full geography crawl takes 2-10 minutes
2. **External Dependencies**: Requires Puppeteer, may hit Wikidata/OSM APIs
3. **Resource Intensive**: Spawns browser + server + crawl job
4. **Manual Validation**: Used for telemetry infrastructure verification, not CI

## Integration with CI

To enable in CI pipelines:

```yaml
# .github/workflows/e2e-tests.yml
- name: Run Geography E2E Test
  run: GEOGRAPHY_E2E=1 npm run test:file "geography-crawl.e2e"
  timeout-minutes: 15
```

Consider running on schedule (nightly) rather than every commit.

## Debugging Tips

### View Browser UI During Test

Change Puppeteer launch options:

```javascript
browser = await puppeteer.launch({ 
  headless: false, // Show browser window
  slowMo: 100,     // Slow down actions for visibility
  devtools: true   // Open DevTools
});
```

### Capture Screenshots on Failure

Add to test:

```javascript
if (diagnostics.errors.length > 0) {
  await page.screenshot({ path: 'geography-e2e-error.png' });
  console.log('Screenshot saved: geography-e2e-error.png');
}
```

### Increase Monitoring Duration

```javascript
const monitorDuration = 600000; // 10 minutes
```

### Log All Telemetry Events

```javascript
await page.exposeFunction('logTelemetryEvent', (eventType, data) => {
  console.log(`[telemetry] ${eventType}:`, JSON.stringify(data, null, 2));
  // ... existing logic
});
```

## Related Documentation

- [Geography Crawl Type](./GEOGRAPHY_CRAWL_TYPE.md) - Geography crawl implementation
- [Telemetry Display](../src/ui/express/public/components/TelemetryDisplay.js) - Client-side telemetry rendering
- [Crawl Progress Indicator](../src/ui/express/public/components/CrawlProgressIndicator.js) - Progress UI component
- [Gazetteer Mode Controller](../src/crawler/gazetteer/GazetteerModeController.js) - Server-side telemetry integration

## Maintenance

Update this test when:
- Geography crawl workflow changes
- New telemetry event types added
- Progress UI components refactored
- SSE event structure modified

Last Updated: October 8, 2025
