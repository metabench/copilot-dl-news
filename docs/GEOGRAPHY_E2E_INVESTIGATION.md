# Geography E2E Investigation

**Date**: October 2025  
**When to Read**: Read this when debugging geography E2E test failures, understanding completion detection issues, or investigating "0 countries" problems. Documents root causes and fixes for geography crawl integration issues.

## Critical Bug Fixed: Start Button Handler

### Issue Discovered
The start button in the UI had **no click handler** - clicking it did nothing. This affected ALL crawl types, not just geography.

### Root Cause
`src/ui/public/index.js` imported `createCrawlControls` from `crawlControls.js` but **never called it**. The modular refactoring extracted the handler logic into a factory function but the initialization call was never added.

```javascript
// ❌ WRONG (what was in index.js):
import { createCrawlControls } from './index/crawlControls.js';
// ... no call to createCrawlControls() anywhere

// ✅ CORRECT (after fix):
import { createCrawlControls } from './index/crawlControls.js';

// Later in initialization:
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
// ... define all required elements

createCrawlControls({
  elements: { startBtn, stopBtn, pauseBtn, resumeBtn, analysisBtn, ... },
  formElements: { crawlType, startUrl, depth, maxPages, ... },
  actions: { setCrawlType, resetInsights, renderAnalysisLink, ... },
  formatters: { formatRelativeTime }
});
```

### Fix Applied
1. Added element declarations in `index.js` (lines 575-590)
2. Added `createCrawlControls()` call with proper dependencies (lines 593-626)
3. Rebuilt UI assets: `node scripts/build-ui.js`

### Verification
- **Before**: `hasClickListener: false` in test diagnostics
- **After**: `hasClickListener: true` - handler properly attached
- **Crawl Start**: Successfully triggers with "Started:" log appearing

### Lesson Learned
**Import ≠ Activation**: Importing a factory function does nothing unless you call it with dependencies. Always trace initialization chains:
1. Import module ✓
2. Call factory with deps ✓
3. Verify handlers attached ✓

---

## Remaining Issue: Telemetry Events Not Flowing

### Current Status
✅ **Crawl starts successfully** - "Started:" appears in logs with job ID  
✅ **Button handler works** - click properly triggers /api/crawl POST  
❌ **Telemetry/progress events not received** - test times out after 120s waiting for SSE events  

### Possible Causes

#### 1. Gazetteer Crawl Characteristics
Geography/gazetteer crawls are fundamentally different from traditional web crawls:
- Use placeholder URL (`https://placeholder.example.com`)
- Crawl external data sources (Wikidata, OpenStreetMap) not websites
- May have different progress emission patterns
- Might complete very quickly or emit events at different intervals

#### 2. Progress Event Frequency
```javascript
// src/crawl.js line 914
this.emitProgress(true);  // Only called at completion
```

Gazetteer crawls may only emit progress at:
- Startup (initial status)
- Completion (final status)
- No intermediate events during data ingestion

#### 3. SSE Connection Timing
Test may be establishing SSE listener AFTER crawl completes if:
- Gazetteer ingests data quickly (<1 second)
- SSE connection setup has delay
- Events emitted before listener ready

#### 4. Event Format Differences
Gazetteer telemetry structure might differ from web crawl telemetry:
- Different event names
- Different data structure
- Test expectations may not match gazetteer reality

### Debugging Recommendations

#### Short-Term: Add Crawl Logging
```javascript
// In test, monitor ALL console output from crawler
page.on('console', msg => {
  const text = msg.text();
  console.log('[crawler-log]', text);
  if (text.includes('Gazetteer') || text.includes('progress')) {
    diagnostics.crawlerLogs.push(text);
  }
});
```

#### Medium-Term: Check Actual Events
```javascript
// Monitor what events ARE being emitted
const allEvents = [];
page.on('request', req => {
  if (req.url().includes('/events')) {
    console.log('[geography-e2e] SSE connection opened');
  }
});

// Or check server logs for event emission
// Server should log what it sends via SSE
```

#### Long-Term: Adjust Test Expectations
Geography crawls may need different monitoring strategy:
1. **Wait for completion** instead of progress events
2. **Check database** for ingested records
3. **Verify final state** rather than incremental updates
4. **Short timeout** (5-10s) since data ingestion is fast

### Recommended Test Strategy

```javascript
// Instead of waiting for telemetry events:
await page.waitForFunction(
  () => {
    const logs = document.getElementById('logs');
    const logsText = logs?.textContent || '';
    // Look for completion indicators
    return /Gazetteer crawl completed/.test(logsText) ||
           /visited:\s*\d+/.test(logsText) ||
           /Database contains \d+ article records/.test(logsText);
  },
  { timeout: 30000 } // 30s should be plenty for gazetteer
);

// Then verify database has records
const recordCount = await page.evaluate(() => {
  // Query status endpoint or check logs for record count
  return fetch('/api/status')
    .then(r => r.json())
    .then(status => status.stats?.visited || 0);
});

expect(recordCount).toBeGreaterThan(0);
```

### Alternative: Unit Test Gazetteer Progress
Rather than full E2E, test progress emission directly:

```javascript
// Unit test for gazetteer mode
test('gazetteer mode emits progress events', async () => {
  const events = [];
  const crawler = new NewsCrawler({
    startUrl: 'https://placeholder.example.com',
    crawlType: 'gazetteer',
    onProgress: (data) => events.push(data)
  });
  
  await crawler.run();
  
  expect(events.length).toBeGreaterThan(0);
  expect(events.some(e => e.gazetteerData)).toBe(true);
});
```

---

## Files Modified

- `src/ui/public/index.js` - Added createCrawlControls() initialization
- `src/ui/express/__tests__/geography-crawl.e2e.test.js` - Changed button wait to logs wait
- `AGENTS.md` - Documented initialization pattern and anti-pattern

## Next Steps

1. **Investigate event emission** - Check what events gazetteer actually emits
2. **Adjust test expectations** - May need to wait for completion not progress
3. **Consider alternative monitoring** - Database records vs telemetry events
4. **Document gazetteer behavior** - Update test expectations for data ingestion crawls
