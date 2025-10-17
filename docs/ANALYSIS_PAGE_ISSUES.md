# Analysis Page Issues - Diagnosis (October 9, 2025)

**When to Read**:
- When debugging issues related to the `/analysis` pages.
- To understand the history of bugs and fixes for the analysis feature.
- As a reference for the root cause of the geography crawl hanging issue.

## Issues Found

### 1. Module Export Error (FIXED ✅)
**Error**: `The requested module '/assets/components/AnalysisProgressBar.js' does not provide an export named 'createAnalysisProgressBar'`

**Root Cause**: `AnalysisProgressBar.js` used only CommonJS exports (`module.exports`), but SSR pages tried to import it as ES6 module.

**Fix Applied**:
```javascript
// Added dual export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createAnalysisProgressBar };
}
if (typeof window !== 'undefined') {
  window.createAnalysisProgressBar = createAnalysisProgressBar;
}

export { createAnalysisProgressBar };
```

**Status**: Fixed and rebuilt (`node scripts/build-ui.js` completed successfully)

---

### 2. Analysis Routes Not Mounted (NOT FIXED ❌)
**Error**: Accessing `/analysis/runs` returns the crawler homepage instead of analysis list page

**Root Cause**: Analysis SSR routes exist in `src/ui/express/routes/ssr.analysis.js` but are never mounted in `server.js`

**Files Affected**:
- `src/ui/express/routes/ssr.analysis.js` - Routes exist
- `src/ui/express/views/analysisListPage.js` - Page template exists
- `src/ui/express/views/analysisDetailPage.js` - Detail page exists
- `src/ui/express/server.js` - Routes NOT mounted

**Required Fix**:
```javascript
// In server.js, add after other route mountings:
const ssrAnalysisRouter = require('./routes/ssr.analysis');
app.use('/analysis', ssrAnalysisRouter);
```

**Status**: NOT FIXED - requires code change

---

### 3. E2E Test Issues
**Test File**: `src/ui/express/__tests__/analysis.page.e2e.test.js`

**Issues**:
1. Database schema mismatch - test uses `run_id` column that doesn't exist
2. Test expectations don't match actual page structure
3. Missing error telemetry checks in SSR pages

**Status**: Test created but needs fixes after routes are mounted

---

## Next Steps

1. **Mount analysis routes** in `server.js` (highest priority)
2. **Fix E2E test** to use correct database schema
3. **Add error telemetry** to SSR pages for better browser error tracking
4. **Verify geography crawl** startup issue (separate from this issue)

---

## Testing

### Manual Test
1. Start server: `node server.js` or `npm run gui`
2. Navigate to: `http://localhost:PORT/analysis/runs`
3. Should see "Analysis Runs" page, not crawler homepage

### Automated Test
```bash
npm run test:file "analysis.page.e2e"
```

Currently fails because routes aren't mounted. Will pass once fixed.

---

## Related Files

- `src/ui/express/public/components/AnalysisProgressBar.js` - ✅ Fixed
- `src/ui/express/routes/ssr.analysis.js` - Needs mounting
- `src/ui/express/server.js` - Needs route mounting code
- `src/ui/express/__tests__/analysis.page.e2e.test.js` - E2E test

---

## Geography Crawl Issue (Separate) ⚠️ ROOT CAUSE IDENTIFIED

**Status**: Root cause identified via code analysis

User reported geography crawl gets stuck at "Preparing data directory complete".

### E2E Test Results

Created focused test: `src/ui/express/__tests__/geography.crawl.e2e.test.js`

**Findings**:
- ✅ Crawl **does start** (returns 202, gets jobId)
- ✅ SSE connection **establishes**
- ❌ **No telemetry events** received after startup
- ❌ **No progress events** received
- ❌ Subsequent crawl attempts fail with **409 Conflict** (previous crawl still running/stuck)

**Diagnostic Output**:
```
Crawl Started: true
SSE Connected: true
Telemetry Received: false
Progress Received: false
```

### Root Cause Analysis ✅

**Flow**:
1. `POST /api/crawl` → `CrawlOrchestrationService.startCrawl()`
2. Service spawns child process asynchronously via `setTimeout(() => runner.start())`
3. Child process runs `src/crawl.js` with `--crawl-type=geography`
4. Constructor sets `isGazetteerMode=true`, `gazetteerVariant='geography'`
5. `crawl()` method checks `isGazetteerMode` → calls `crawlConcurrent()`
6. `crawlConcurrent()` calls `await init()` → completes successfully
7. Then calls `await _runGazetteerMode()` → **HANGS HERE**

**The Hang Location** (src/crawl.js line 914-926):
```javascript
async _runGazetteerMode() {
  // ...
  await this._trackStartupStage('gazetteer-prepare', 'Preparing gazetteer services', async () => {
    this.gazetteerModeController.dbAdapter = this.dbAdapter;
    this._configureGazetteerPipeline();  // ← Synchronous, OK
    await this.gazetteerModeController.initialize();  // ← Async, likely hangs
    return { status: 'completed' };
  });
  
  this._markStartupComplete('Gazetteer services ready');  // ← Never reached
  // ...
}
```

**Problem**: `gazetteerModeController.initialize()` or `_configureGazetteerPipeline()` contains blocking operation without timeout

**Evidence**:
- User sees "Preparing data directory complete" (last stage before gazetteer-prepare)
- No "Gazetteer services ready" message
- No startup-complete milestone
- Process remains alive but unresponsive

### Fixes Required

1. **Add timeout to gazetteer initialization** (HIGH PRIORITY)
2. **Add more granular telemetry** in `_configureGazetteerPipeline()`
3. **Add error handling** for hanging promises
4. **Verify all awaits** have corresponding promise resolutions

**Files to Fix**:
- `src/crawl.js` - Add timeout wrapper for `_runGazetteerMode()`
- `src/crawler/gazetteer/GazetteerModeController.js` - Add telemetry in `initialize()`
- `src/crawler/gazetteer/GazetteerIngestionCoordinator.js` - Add timeout guards

### Proposed Fix

```javascript
// In src/crawl.js _runGazetteerMode()
async _runGazetteerMode() {
  if (!this.gazetteerModeController) {
    throw new Error('Gazetteer mode controller not configured');
  }

  await this._trackStartupStage('gazetteer-prepare', 'Preparing gazetteer services', async () => {
    this.gazetteerModeController.dbAdapter = this.dbAdapter;
    
    // Add telemetry before configure
    this.telemetry.milestoneOnce('gazetteer:configuring', {
      kind: 'gazetteer-config',
      message: 'Configuring gazetteer pipeline'
    });
    
    this._configureGazetteerPipeline();
    
    // Add timeout to initialize
    const initTimeout = 30000; // 30 seconds
    await Promise.race([
      this.gazetteerModeController.initialize(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Gazetteer initialization timeout')), initTimeout)
      )
    ]);
    
    return { status: 'completed' };
  });
  
  this._markStartupComplete('Gazetteer services ready');
  // ... rest of method
}
```
