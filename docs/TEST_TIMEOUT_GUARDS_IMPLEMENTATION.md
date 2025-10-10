# Test Timeout and Progress Logging - Implementation Summary

**Date**: October 10, 2025  
**Status**: ✅ Complete - Documentation and utilities implemented

**When to Read**: When implementing test timeout guards, when tests hang silently, when reviewing test quality standards

---

## Overview

Implemented comprehensive guidance and utilities to enforce the **GOLDEN RULE**: Tests must never hang silently. If a test gets stuck, it MUST output to console explaining what it's waiting for.

## Changes Made

### 1. Documentation Updates

#### AGENTS.md - Testing Guidelines
- ✅ Added GOLDEN RULE section at top of Testing Guidelines
- ✅ Listed implementation requirements (explicit timeouts, progress logging, AbortController, watchdogs)
- ✅ Cross-referenced TESTING_ASYNC_CLEANUP_GUIDE.md

#### docs/TESTING_ASYNC_CLEANUP_GUIDE.md
- ✅ Added comprehensive "GOLDEN RULE" section with 5 implementation strategies:
  1. Always set explicit timeouts
  2. Add progress logging for long operations
  3. Use AbortController for network operations
  4. Add watchdog timers for complex tests
  5. Use timeout guard utilities
- ✅ Included code examples for each strategy
- ✅ Added test checklist before committing
- ✅ Referenced new timeout guard utilities

#### .github/instructions/GitHub Copilot.instructions.md
- ✅ Added "Tests must never hang silently" requirement
- ✅ Referenced timeoutGuards.js utilities
- ✅ Cross-referenced TESTING_ASYNC_CLEANUP_GUIDE.md

#### docs/TEST_FIXES_2025-10-10.md
- ✅ Added cross-reference to timeoutGuards.js utilities

### 2. Timeout Guard Utilities

Created `src/test-utils/timeoutGuards.js` with four utilities:

#### `withTimeout(promise, timeoutMs, context)`
Wraps a promise with a timeout that logs context before rejecting.

```javascript
const data = await withTimeout(
  fetch('https://api.example.com/data'),
  5000,
  'API call to /data'
);
```

**Output on timeout**: `[TEST TIMEOUT] API call to /data exceeded 5000ms`

#### `createWatchdog(intervalMs)`
Creates a watchdog that logs progress periodically.

```javascript
const watchdog = createWatchdog(3000); // Log every 3s

watchdog.update('Fetching data');
const data = await fetchData();

watchdog.update('Processing data');
await processData(data);

watchdog.clear();
```

**Output**: `[TEST WATCHDOG] 3.2s - Last step: Fetching data`

#### `createAbortTimeout(timeoutMs, context)`
Creates an AbortController with automatic timeout.

```javascript
const { signal, timeout } = createAbortTimeout(5000, 'API call');
try {
  const response = await fetch(url, { signal });
  // ... process response
} finally {
  clearTimeout(timeout);
}
```

**Output on timeout**: `[TEST TIMEOUT] API call exceeded 5000ms, aborting`

#### `withTestGuards(testFn, options)`
Wraps an async test function with progress logging and timeout.

```javascript
test('complex operation', withTestGuards(async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
}, { timeout: 15000, watchdogInterval: 3000 }), 15000);
```

### 3. Example Implementation

Updated `src/ui/express/__tests__/queues.ssr.http.test.js` with timeout guards:

**Before**:
```javascript
function getText(hostname, port, pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ hostname, port, path: pathStr }, (res) => {
      // ... no timeout, could hang forever
    });
  });
}

test('GET /queues/ssr renders HTML', async () => {
  // ... no explicit timeout, no progress logging
});
```

**After**:
```javascript
const { withTimeout } = require('../../../test-utils/timeoutGuards');

function getText(hostname, port, pathStr) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = http.get({ hostname, port, path: pathStr }, (res) => {
        // ...
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error(`HTTP request to ${pathStr} timed out after 5s`));
      });
    }),
    6000,
    `getText(${pathStr})`
  );
}

test('GET /queues/ssr renders HTML', async () => {
  console.log('[TEST] Requesting /queues/ssr...');
  const page = await getText('127.0.0.1', port, '/queues/ssr');
  // ...
}, 10000); // Explicit 10s timeout
```

**Result**: Test now fails quickly with clear output showing exactly what it was doing when it failed, no silent hangs.

## Implementation Patterns

### Pattern 1: HTTP Request with Timeout
```javascript
const { withTimeout } = require('../test-utils/timeoutGuards');

function httpRequest(url) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const req = http.get(url, resolve);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error(`Request to ${url} timed out`));
      });
      req.on('error', reject);
    }),
    6000,
    `HTTP request to ${url}`
  );
}
```

### Pattern 2: Multi-Step Test with Watchdog
```javascript
const { createWatchdog } = require('../test-utils/timeoutGuards');

test('complex workflow', async () => {
  const watchdog = createWatchdog(5000);
  
  try {
    watchdog.update('Step 1: Initializing');
    await initialize();
    
    watchdog.update('Step 2: Processing data');
    await processData();
    
    watchdog.update('Step 3: Validating results');
    const result = await validate();
    
    expect(result).toBeDefined();
  } finally {
    watchdog.clear();
  }
}, 30000);
```

### Pattern 3: External API Call with AbortController
```javascript
const { createAbortTimeout } = require('../test-utils/timeoutGuards');

test('should fetch from external API', async () => {
  const { signal, timeout } = createAbortTimeout(10000, 'External API call');
  
  try {
    const response = await fetch(url, { signal });
    expect(response.ok).toBe(true);
  } finally {
    clearTimeout(timeout);
  }
}, 15000);
```

## Test Quality Checklist

Before committing any test, verify:
- [ ] ✅ Does it have an explicit timeout? (third parameter to `test()`)
- [ ] ✅ If it takes >5s, does it log progress or use watchdog?
- [ ] ✅ If it makes network calls, does it use timeout guards?
- [ ] ✅ If it hangs, will the console output help debug it?
- [ ] ✅ Does it clean up all resources in `afterEach`/`afterAll`?

## Benefits

1. **No Silent Hangs**: Tests that get stuck now output progress, making debugging trivial
2. **Fast Failure**: Tests fail quickly with context instead of hanging for minutes
3. **Better CI**: CI systems can show exactly where tests are hanging
4. **Developer Experience**: Developers immediately know what's wrong when tests hang
5. **Code Quality**: Forces test authors to think about timeouts and edge cases

## Examples of Good Test Output

**Before** (silent hang):
```
RUNS  src/ui/express/__tests__/queues.ssr.http.test.js
  ● Queues SSR pages and redirect › GET /queues/ssr
    [... hangs forever with no output ...]
```

**After** (clear progress):
```
RUNS  src/ui/express/__tests__/queues.ssr.http.test.js
  ● Queues SSR pages and redirect › GET /queues/ssr
    [TEST] Requesting /queues/ssr...
    [TEST TIMEOUT] getText(/queues/ssr) exceeded 6000ms
    ✕ GET /queues/ssr renders HTML (6012 ms)
```

## Future Work

- [ ] Add timeout guards to all existing HTTP tests
- [ ] Add watchdogs to E2E tests (Puppeteer)
- [ ] Create ESLint rule to enforce explicit timeouts
- [ ] Add pre-commit hook to check for timeout guards in new tests

## Test File Header Template

All test files should include this documentation header:

```javascript
/**
 * @fileoverview [Brief description of what this test file covers]
 * 
 * CRITICAL TESTING RULES:
 * - Tests must NEVER hang silently (GOLDEN RULE)
 * - Always add explicit timeouts: test('name', async () => {...}, 30000)
 * - Add progress logging for operations >5s
 * - Use timeout guards from src/test-utils/timeoutGuards.js
 * 
 * See: docs/TESTING_ASYNC_CLEANUP_GUIDE.md for complete patterns
 * See: docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md for utilities
 * See: AGENTS.md "Testing Guidelines" section
 */
```

**Why This Matters**: AI agents scan file headers for context. This ensures timeout prevention guidance is visible at the file level.

## Related Documentation

- **AGENTS.md** - Testing Guidelines section (GOLDEN RULE)
- **docs/TESTING_ASYNC_CLEANUP_GUIDE.md** - Comprehensive timeout patterns
- **docs/TEST_FIXES_2025-10-10.md** - October 2025 test fixes
- **src/test-utils/timeoutGuards.js** - Utility implementations
- **.github/instructions/GitHub Copilot.instructions.md** - Agent testing contract

---

**Summary**: Tests now follow the GOLDEN RULE and never hang silently. All new tests must include explicit timeouts and progress logging for operations >5s.
