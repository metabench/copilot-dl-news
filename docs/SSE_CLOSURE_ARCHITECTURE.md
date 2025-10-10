# SSE Connection Closure Architecture

**When to Read**: When implementing SSE event streams, debugging connection cleanup issues, or understanding how real-time updates are delivered to the UI.

**Date**: October 2025  
**Issue**: E2E tests hang because SSE streams don't close when jobs complete  
**Root Cause**: Server broadcasts "done" events but clients don't close their EventSource connections

---

## 🚨 Core Problem

The server **correctly broadcasts a "done" event** when jobs complete (via `JobEventHandlerService.js`), but most client-side SSE consumers **don't listen for it or close their connections** in response.

**Result**:
- UI: Connection stays open indefinitely (potential memory/connection leaks)
- E2E tests: Tests hang forever waiting for stream to close

---

## Server-Side Implementation (✅ CORRECT)

**File**: `src/ui/express/services/core/JobEventHandlerService.js` (Line ~275)

```javascript
// Broadcast done event when job completes
this.broadcast('done', { ...job.lastExit, jobId: job.id }, job.id);
```

**File**: `src/ui/express/routes/events.js` (Line ~144)

```javascript
// SSE endpoint broadcasts done event to all connected clients
res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
```

**Status**: ✅ Server correctly emits "done" event on job completion

---

## Client-Side SSE Consumers (Audit)

### 1. ✅ `src/ui/public/app.js` (Favicon updater)

**Lines**: 29-42

```javascript
const source = new EventSource('/events');

source.addEventListener('done', () => {
  updateFavicon('stopped');  // ✅ Listens for 'done'
});
```

**Current State**: ✅ Listens for "done" event, updates favicon  
**Issue**: ❌ Never calls `source.close()`  
**Decision Needed**: Should this connection stay open for persistent monitoring, or close after jobs complete?

**Recommendation**: Keep open (this is a lightweight background listener for multiple jobs over time)

---

### 2. ❌ `src/ui/public/index.js` (Main UI)

**Lines**: 665-672

```javascript
function openEventStream(enableLogs = true) {
  sseClient.close();
  const url = `/events?logs=${enableLogs ? '1' : '0'}`;
  const source = sseClient.open({ url, listeners: {} });
  // ... attachments ...
  return source;
}
```

**Current State**: Uses `sseClient` wrapper, no explicit "done" listener  
**Issue**: ❌ Doesn't handle job completion events  
**Fix Needed**: Add "done" listener that optionally closes or updates UI state

**Recommendation**: Keep connection open (multi-job monitoring UI), but add visual feedback when jobs complete

---

### 3. ❌ `src/ui/express/views/analysisListPage.js`

**Lines**: 208-235

```javascript
const eventSource = new EventSource('/events');

eventSource.addEventListener('analysis-progress', (event) => { ... });
eventSource.addEventListener('analysis-started', (event) => { ... });

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  eventSource.close();  // ✅ Closes on unload
});
```

**Current State**: ❌ No "done" event listener  
**Issue**: Stream stays open after analysis completes  
**Fix Needed**: Add "done" listener to handle completion gracefully

---

### 4. ❌ `src/ui/express/views/analysisDetailPage.js`

**Lines**: 322-405

```javascript
const eventSource = new EventSource('/events');

eventSource.addEventListener('analysis-progress', (e) => { ... });

// Cleanup
function cleanup() {
  eventSource.close();
}
window.addEventListener('beforeunload', cleanup);
```

**Current State**: ❌ No "done" event listener  
**Issue**: Stream stays open after analysis completes  
**Fix Needed**: Add "done" listener, close stream or update UI

---

### 5. ❌ `src/ui/express/__tests__/geography.full.e2e.test.js` (CRITICAL)

**Lines**: Multiple (SSE collector implementation)

**Current State**: 
- Has 500ms timeout workaround after detecting shutdown
- Uses defensive completion detection (7+ indicators)
- ❌ **Does NOT listen for "done" event from server**

**Issue**: Test hangs indefinitely because it never receives or acts on "done" signal

**Fix Needed** (HIGH PRIORITY):
```javascript
// Listen for 'done' event from server
sse.addEventListener('done', (event) => {
  console.log('🏁 [SSE] Received DONE event from server');
  const data = JSON.parse(event.data);
  console.log('   Data:', JSON.stringify(data, null, 2));
  
  // Close stream immediately
  setTimeout(() => {
    console.log('🛑 [SSE] Closing stream after done event');
    resolve(collector.events);
  }, 100); // Short grace period for trailing events
});
```

---

### 6. ✅ `src/ui/public/index/sseClient.js` (SSE Wrapper)

**Lines**: 1-105

```javascript
source.onerror = () => {
  setBadge('SSE: reconnecting…', 'badge-warn');
  scheduleOfflineCheck(Date.now());
};
```

**Current State**: ✅ Has error handler for reconnection  
**Issue**: None (wrapper is correct, consumers need to listen for "done")  
**Recommendation**: No changes needed, works as designed

---

### 7. ⚠️ `src/ui/express/routes/geographyFlowchart.js`

**Lines**: 165-178

```javascript
const sseSource = new EventSource('/events?logs=0');

// ... event listeners ...

// Cleanup
function cleanup() {
  sseSource.close();
}
// Cleanup after page render
setTimeout(cleanup, 100);
```

**Current State**: ⚠️ Closes after 100ms timeout (not ideal but works for SSR)  
**Issue**: Timeout-based, not event-driven  
**Recommendation**: Keep as-is for SSR (page renders then closes), or add "done" listener

---

## Summary of Findings

| File | Has "done" Listener? | Closes Connection? | Priority |
|------|---------------------|-------------------|----------|
| app.js (favicon) | ✅ Yes | ❌ No (by design?) | Low |
| index.js (main UI) | ❌ No | ❌ No | Medium |
| analysisListPage.js | ❌ No | Only on beforeunload | Medium |
| analysisDetailPage.js | ❌ No | Only on beforeunload | Medium |
| **geography.full.e2e.test.js** | ❌ **No** | ❌ **No** | **🚨 CRITICAL** |
| sseClient.js (wrapper) | N/A (no direct listener) | ✅ Has close() method | OK |
| geographyFlowchart.js (SSR) | ❌ No | ⚠️ Timeout-based | Low |

---

## Fix Implementation Plan

### Phase 1: Critical Fix (E2E Test)

**File**: `src/ui/express/__tests__/geography.full.e2e.test.js`

**Change**: Add "done" event listener that closes stream immediately

**Impact**: Unblocks test suite, prevents hangs

---

### Phase 2: UI Pages

**Files**: 
- `src/ui/express/views/analysisListPage.js`
- `src/ui/express/views/analysisDetailPage.js`

**Change**: Add "done" event listeners that:
1. Log completion to console
2. Optionally close EventSource (or keep open for multi-job monitoring)
3. Update UI to show "No active jobs" state

---

### Phase 3: Main UI

**File**: `src/ui/public/index.js`

**Change**: Add "done" listener to `openEventStream()` that:
1. Updates job list UI
2. Shows completion notification
3. Keeps connection open (for next job)

---

### Phase 4: Documentation

**File**: `AGENTS.md`

**Addition**: Add section on SSE lifecycle:
- Server broadcasts "done" when jobs complete
- Clients should listen for "done" and handle gracefully
- E2E tests MUST close stream on "done" to prevent hangs
- UI connections can stay open for multi-job monitoring

---

## Testing Strategy

1. **Unit Test**: Mock EventSource, verify "done" listener attached
2. **Integration Test**: Start job, wait for "done", verify closure
3. **E2E Test**: Run geography E2E, verify clean exit without hang
4. **Manual Test**: Open UI, start job, verify "done" event received in browser console

---

## Expected Outcomes

After implementing fixes:

✅ E2E tests close streams and exit cleanly  
✅ UI shows clear "job complete" feedback  
✅ No memory/connection leaks from orphaned EventSources  
✅ Telemetry and diagnostics respond to SSE closure appropriately  
✅ All client-side code handles SSE closure gracefully

---

## Technical Notes

**EventSource Lifecycle**:
1. Client creates `new EventSource('/events')`
2. Server sends heartbeat + events
3. Job completes → Server broadcasts `event: done`
4. Client receives "done" → Should close or update UI
5. Client calls `eventSource.close()` → Connection terminates

**Key Methods**:
- `eventSource.addEventListener('done', handler)` - Listen for completion
- `eventSource.close()` - Close connection (no reconnection)
- `eventSource.onerror` - Handle disconnection/errors

---

## Related Files

- `src/ui/express/routes/events.js` - SSE endpoint
- `src/ui/express/services/core/JobEventHandlerService.js` - Broadcasts "done"
- `src/ui/public/index/sseClient.js` - SSE wrapper utility
- `src/ui/public/index/sseHandlers.js` - Event handler factory
- `docs/DEVELOPMENT_E2E_TESTS.md` - E2E test patterns

---

**Next Action**: Implement Phase 1 (E2E test fix) to unblock test suite
