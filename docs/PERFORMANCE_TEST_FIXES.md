# Performance Test Fixes

## Problem Summary

The gazetteer performance tests were hanging indefinitely due to:
1. Worker thread complexity that prevented proper Jest cleanup
2. Missing internal timeout enforcement causing promises that never resolved
3. No timeout guards on database operations

## Solutions Implemented

### 1. Removed Worker Thread Complexity
- **Before**: Tests launched Express server in a separate worker thread
- **After**: Tests start server directly in the main Jest process
- **Benefit**: Simpler lifecycle management, proper Jest cleanup, no open handles

### 2. Added Multiple Timeout Layers

#### Test Suite Timeout (3000ms)
```javascript
jest.setTimeout(TEST_TIMEOUT_MS); // 3000ms
```
Ensures entire suite fails if it exceeds this duration.

#### Database Check Timeout (800ms)
```javascript
await withTimeout(dbCheckOperation, DB_CHECK_TIMEOUT_MS, 'DB checks');
```
Database presence checks must complete within 800ms or the test fails fast.

#### Server Startup Timeout (500ms)
```javascript
await withTimeout(serverStartOperation, SERVER_START_TIMEOUT_MS, 'Server startup');
```
Server must emit 'listening' event within 500ms or test fails.

#### Request Timeout (64ms)
```javascript
const timeoutHandle = setTimeout(() => abort('Request'), timeoutMs);
```
HTTP requests are destroyed after 64ms, enforcing the performance budget.

### 3. Enhanced Timeout Helper
```javascript
function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms timeout`)), timeoutMs)
    )
  ]);
}
```
Generic timeout wrapper that works with any async operation.

### 4. WARN-Level Logging
```javascript
function warnSlow(label, durationMs, warnAtMs) {
  if (warnAtMs == null || durationMs < warnAtMs) return;
  const formatted = durationMs.toFixed(1);
  console.warn(`${WARN_COLOUR}WARN${RESET_COLOUR} ${label} took ${formatted}ms (threshold ${warnAtMs}ms)`);
}
```
Orange warnings appear when operations approach their timeout threshold (typically 50% or 80% of max).

### 5. Clean Server Shutdown
```javascript
afterAll(async () => {
  if (server) {
    await new Promise((resolve) => {
      const forceCloseTimer = setTimeout(() => {
        try {
          server.closeAllConnections?.();
        } catch (_) {}
        resolve();
      }, 500);
      
      server.close(() => {
        clearTimeout(forceCloseTimer);
        resolve();
      });
    });
  }
  // Restore env vars
});
```
Ensures tests exit cleanly even if server has lingering connections.

## Test Behavior

### What the Tests Check

1. **Indonesia SSR Page** (`/gazetteer/country/ID`)
   - Must render within 64ms
   - Returns 200 status
   - Contains "Indonesia" in response
   - Emits WARN if takes >32ms

2. **Place 28 SSR Page** (`/gazetteer/place/28`)
   - Must render within 64ms
   - Returns 200 status
   - Contains Gazetteer title markup
   - Emits WARN if takes >32ms

### Current Performance

Based on test output:
- Indonesia page: ~102ms (**failing**, needs optimization)
- Place 28 page: ~59 seconds (** severely failing**, likely hung/crashed)

### What Success Looks Like

```
PASS  src/ui/express/__tests__/gazetteer.country.performance.test.js
  gazetteer country SSR performance
    ✓ Indonesia SSR renders within 64ms (45 ms)
    ✓ Place 28 SSR renders within 64ms (52 ms)
```

## Next Steps

1. **Optimize Indonesia Country Page**
   - Current: 102ms
   - Target: <64ms
   - Likely needs query optimization or caching

2. **Fix Place 28 Page**
   - Currently taking 59+ seconds (probably hanging)
   - Investigate `fetchPlaceDetails` query performance
   - Check for N+1 queries or missing indexes

3. **Apply Pattern to Other Tests**
   - Audit remaining test files for missing timeouts
   - Add WARN logging to long-running operations
   - Document expected performance thresholds

## Key Takeaways

- **Always enforce internal timeouts** - Don't rely solely on Jest's global timeout
- **Layer timeouts** - Database, network, and overall test timeouts
- **Fail fast** - Better to catch performance regressions early
- **Log warnings** - Help developers see when operations are approaching limits
- **Avoid worker threads in tests** - They complicate Jest's lifecycle management
