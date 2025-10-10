# Geography Crawl Console Errors Investigation

# Geography Crawl Console Errors Investigation

**Date**: October 9, 2025  
**When to Read**: Read this when debugging geography crawl issues, investigating console errors in crawl UI, or understanding progress event handling. Documents investigation and fixes for missing progress events and console errors.  
**Test**: Specialized E2E Feature Tests with Puppeteer Browser Monitoring  
**Status**: 🔴 Critical Issues Detected

---

## Summary

Specialized E2E tests with browser console monitoring detected **4 critical issues** preventing proper geography crawl startup and telemetry display:

1. **Slow Button Response** (2340ms instead of <200ms)
2. **Console Error: JSON Parse Failure** in `CrawlProgress`
3. **HTTP 409 Conflict** when starting crawl
4. **Network Request Aborts** (`/api/status`, `/events`)

---

## Issue 1: Slow Button Response (2340ms)

### Expected Behavior
- User clicks "Start" button
- Button should respond within **<200ms** (instant feedback requirement)
- Button becomes disabled immediately
- Progress container appears

### Actual Behavior
- Button response took **2340ms** (11.7x slower than requirement)
- Delay indicates blocking operation on UI thread or slow server response

### Impact
- **Severity**: HIGH
- User perceives UI as unresponsive
- Violates instant feedback requirement
- Poor user experience

### Test Output
```
[Step 12] Start button clicked: { "responseTimeMs": 2340 }
expect(clickResponseTime).toBeLessThan(200);
Expected: < 200
Received:   2340
```

### Root Cause Analysis
**Hypothesis 1**: Button click triggers synchronous blocking operation
- Possible: Form validation, DOM manipulation, or initialization code blocking event loop
- Check: `createCrawlControls()` click handler in `src/ui/public/crawl-controls/`

**Hypothesis 2**: Server `/api/crawl` endpoint is slow
- Server logs show: `[req] POST /api/crawl -> 202 85.8ms`
- Server response is fast (85ms), so server is NOT the bottleneck
- Issue must be client-side

**Hypothesis 3**: Multiple event handlers attached to same button
- Possible: Button has multiple click listeners executing in sequence
- Check: `index.js` initialization, verify only one listener attached

**Likely Root Cause**: Client-side blocking operation in click handler or initialization code taking >2 seconds before button can respond.

### Next Steps
1. Review `createCrawlControls()` click handler for blocking operations
2. Check if button has multiple event listeners
3. Profile JavaScript execution during button click
4. Add performance.now() timestamps in click handler to identify slow code

---

## Issue 2: Console Error - JSON Parse Failure

### Error Message
```
[CONSOLE] ⚠ Browser console ERROR: {
  "error": "[CrawlProgress] error JSON parse error: JSHandle@error "
}
```

### Location
- File: `src/ui/express/public/assets/index.js`
- Line: 5802
- Function: `attachJsonEventListener()`

### Code Context
```javascript
eventSource.addEventListener(eventName, (event) => {
  let payload;
  try {
    payload = JSON.parse(event.data);
  } catch (parseErr) {
    console.error(`[CrawlProgress] ${eventName} JSON parse error:`, parseErr, event.data);
    return;
  }
  // ... handler code
});
```

### Impact
- **Severity**: CRITICAL
- Telemetry events not processed correctly
- Progress bar cannot update with proper stage information
- User sees "Processing..." instead of specific stages

### Root Cause Analysis
**SSE Event Data Malformed**: Server is sending non-JSON data on SSE stream

**Possible Causes**:
1. Server sends plain text instead of JSON for certain events
2. Server sends empty data: `data: \n\n` (no JSON)
3. Server sends HTML error page instead of JSON (e.g., during shutdown)
4. Event name mismatch: Client expects JSON on event that server sends as text

### Reproduction Context
- Happens during geography crawl startup
- Occurs when SSE connection is active (`readyState: 1`)
- Timing: Shortly after crawl start (within first few seconds)

### Next Steps
1. Add logging to server SSE endpoint to see what data is being sent
2. Capture raw `event.data` in error handler (currently only logs error object)
3. Check if specific event type causes error (progress, telemetry, milestone, queue)
4. Verify server sends `Content-Type: text/event-stream` correctly

### Recommendation
**Add defensive parsing**:
```javascript
try {
  if (!event.data || event.data.trim() === '') {
    return; // Ignore empty events silently
  }
  payload = JSON.parse(event.data);
} catch (parseErr) {
  console.error(`[CrawlProgress] ${eventName} JSON parse error:`, {
    error: parseErr.message,
    rawData: event.data, // ← Log actual data
    dataType: typeof event.data,
    dataLength: event.data?.length
  });
  return;
}
```

---

## Issue 3: HTTP 409 Conflict on Crawl Start

### Error Message
```
[CONSOLE] ⚠ Browser console ERROR: {
  "error": "Failed to load resource: the server responded with a status of 409 (Conflict)"
}
```

### HTTP Details
- **Endpoint**: `POST /api/crawl`
- **Status**: 409 Conflict
- **Meaning**: "Crawl already running"

### Impact
- **Severity**: HIGH
- User cannot start geography crawl (request rejected)
- Button click fails silently (no error UI)
- Test sees 409 error in browser console

### Root Cause Analysis
**Server Logs Show Successful Start**:
```
[api] POST /api/crawl received (runningJobs=0)
[req] POST /api/crawl -> 202 85.8ms
[api] crawler started pid=102964 jobId=mgif9fml-1
```

**First request returns 202** (accepted), but **second test** gets 409.

**Hypothesis**: Test runs two crawls in rapid succession
- Test 1: "Geography crawl starts and displays in client with telemetry"
  - Starts crawl successfully (202)
  - Crawl continues running during test monitoring
- Test 2: "Client displays proper preparation stages"
  - Tries to start another crawl immediately
  - Server rejects with 409 (first crawl still running)

**Server Code** (`api.crawl.js` line 157):
```javascript
if (err instanceof CrawlAlreadyRunningError) {
  console.log('[api] POST /api/crawl -> 409 already-running');
  return next(new ConflictError(err.message));
}
```

### Fix
**Test Isolation Issue**: Tests must wait for previous crawl to complete or kill server between tests.

**Options**:
1. **Option A**: Make tests sequential with proper cleanup
   - `afterEach()` waits for crawl to complete
   - Stop crawler process before next test
   
2. **Option B**: Use separate server instances per test
   - Each test spawns own server on unique port
   - No shared state between tests

3. **Option C**: Mock crawl start to avoid real crawler
   - Only test UI behavior, not actual crawl
   - Faster test execution

**Recommendation**: Option A - proper cleanup in `afterEach()` to stop any running crawl.

---

## Issue 4: Network Request Aborts

### Error Messages
```
[NETWORK] ⚠ Network request failed: {
  "url": "http://localhost:56832/api/status",
  "error": "net::ERR_ABORTED"
}

[NETWORK] ⚠ Network request failed: {
  "url": "http://localhost:56832/events?logs=1",
  "error": "net::ERR_ABORTED"
}
```

### Impact
- **Severity**: MEDIUM
- SSE connection drops during test
- Status polling interrupted
- Progress updates stop flowing

### Root Cause Analysis
**Timing**: Happens when second test starts navigating to app

**Hypothesis**: First test's browser page is still active when second test navigates
- First page still polling `/api/status`
- First page still connected to `/events` SSE stream
- Second test navigation aborts first page's requests

**Server Shutdown**: Possible server restart between tests?
- No evidence of server restart in logs
- Server runs continuously with `--detached` flag

**Likely Cause**: Test isolation issue - first page's network requests aborted when second test navigates.

### Fix
**Ensure Clean Browser State Between Tests**:
```javascript
afterEach(async () => {
  // Close all pages before closing browser
  const pages = await browser.pages();
  await Promise.all(pages.map(p => p.close()));
});
```

---

## Test Results Summary

### Test 1: Geography Crawl Startup and Telemetry
**Status**: ❌ FAILED

**Failures**:
1. Button response time: 2340ms (expected <200ms)
2. Progress container did not appear (timeout after 3000ms)

**Successes**:
- SSE connection established (readyState: 1)
- Server started correctly
- Crawl type dropdown loaded
- Geography option selected
- No console errors during page load

### Test 2: Preparation Stage Display
**Status**: ❌ FAILED

**Failures**:
1. Progress container did not appear (timeout after 3000ms)
2. HTTP 409 Conflict (crawl already running)

**Root Cause**: Test tried to start crawl while first test's crawl still running.

---

## Recommendations

### Priority 1: Fix Button Response Time (HIGH)
- **Action**: Identify and remove blocking operations in click handler
- **Target**: <200ms response (instant feedback)
- **Estimate**: 2-4 hours investigation + fix

### Priority 2: Fix JSON Parse Error (CRITICAL)
- **Action**: Add logging to capture malformed SSE data, fix server to always send JSON
- **Target**: Zero parse errors
- **Estimate**: 1-2 hours investigation + fix

### Priority 3: Fix Test Isolation (HIGH)
- **Action**: Add proper cleanup to stop crawl before next test
- **Target**: Tests can run sequentially without conflicts
- **Estimate**: 1 hour

### Priority 4: Fix Network Aborts (MEDIUM)
- **Action**: Ensure browser pages closed cleanly between tests
- **Target**: No network errors during test execution
- **Estimate**: 30 minutes

---

## Next Steps for Agent

1. **Investigate Button Click Handler**:
   - Read `src/ui/public/crawl-controls/` source files
   - Find `createCrawlControls()` function
   - Identify blocking operations in click handler
   - Profile execution time

2. **Capture SSE Malformed Data**:
   - Modify error handler to log `event.data` (not just error object)
   - Run test again to see what data caused parse failure
   - Check server SSE emission code

3. **Fix Test Isolation**:
   - Add `afterEach()` to stop running crawl
   - Wait for crawl completion before closing browser
   - Verify 409 errors disappear

4. **Re-run Tests**:
   - After fixes, verify <200ms button response
   - Verify zero console errors
   - Verify progress bar shows proper stages
   - Verify telemetry flows correctly

---

## Testing Philosophy Validation

✅ **Specialized E2E tests successfully detected issues that regular unit tests missed:**
- Console error detection caught JSON parse failure
- Network monitoring caught 409 conflicts
- Performance assertions caught slow button response
- Sequential logging provided detailed timeline

**This validates the specialized testing framework approach.**
