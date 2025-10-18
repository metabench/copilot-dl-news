# Testing: Async Cleanup Guide

**Problem**: "Jest did not exit one second after the test run has completed"

**Quick Solution**: Add `--forceExit` to your test command (recommended for integration tests with instrumented databases)

**When to Read**: When writing tests, when tests hang after completion, when Jest shows async operation warnings

**See Also**: `docs/TEST_FIXES_2025-10-10.md` for recent examples and patterns

---

## 🚨 GOLDEN RULE: Tests Must Never Hang Silently

**The Rule**: If a test gets stuck, it MUST output to console explaining what it's waiting for.

**Why This Matters**: Silent hangs waste developer time and make debugging impossible. When tests hang without output, developers don't know if:
- The test is stuck in an infinite loop
- It's waiting for an async operation that will never complete
- It's making an API call that's taking too long
- It's waiting for a database operation that's deadlocked

**Implementation Strategy**:

### 1. Always Set Explicit Timeouts

```javascript
// ❌ BAD: No timeout, hangs forever
test('should complete operation', async () => {
  await someLongOperation();
});

// ✅ GOOD: Explicit timeout with descriptive message
test('should complete operation', async () => {
  await someLongOperation();
}, 30000); // 30s timeout - fails with clear message if exceeded
```

### 2. Add Progress Logging for Long Operations

```javascript
// ✅ GOOD: Progress updates show test is alive
test('should process large dataset', async () => {
  console.log('[TEST] Starting data processing...');
  const data = await fetchData();
  console.log(`[TEST] Fetched ${data.length} items, processing...`);
  
  const result = await processData(data);
  console.log('[TEST] Processing complete, validating...');
  
  expect(result).toBeDefined();
  console.log('[TEST] Test complete');
}, 60000);
```

### 3. Use AbortController for Network Operations

```javascript
// ✅ GOOD: Timeout with context
test('should fetch from API', async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error('[TEST] API call timed out after 10s');
    controller.abort();
  }, 10000);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    expect(response.ok).toBe(true);
  } finally {
    clearTimeout(timeout);
  }
}, 15000);
```

### 4. Add Watchdog Timers for Complex Tests

```javascript
// ✅ GOOD: Watchdog reports last known state
test('should complete multi-step process', async () => {
  let lastStep = 'initialization';
  const watchdog = setInterval(() => {
    console.log(`[TEST WATCHDOG] Last completed: ${lastStep}`);
  }, 5000);
  
  try {
    lastStep = 'fetching data';
    const data = await fetchData();
    
    lastStep = 'processing data';
    const processed = await processData(data);
    
    lastStep = 'saving results';
    await saveResults(processed);
    
    expect(processed).toBeDefined();
  } finally {
    clearInterval(watchdog);
  }
}, 30000);
```

### 5. Use Timeout Guard Utilities

The project provides utilities in `src/test-utils/timeoutGuards.js` to make timeout handling easier:

```javascript
const { withTimeout, createWatchdog, createAbortTimeout } = require('../test-utils/timeoutGuards');

test('should complete complex operation', async () => {
  const watchdog = createWatchdog(3000); // Log every 3s
  
  try {
    watchdog.update('Fetching data');
    const data = await withTimeout(
      fetch(url),
      10000,
      'Data fetch'
    );
    
    watchdog.update('Processing data');
    const result = await withTimeout(
      processData(data),
      20000,
      'Data processing'
    );
    
    expect(result).toBeDefined();
  } finally {
    watchdog.clear();
  }
}, 35000);
```

### 6. Test Checklist

Before committing any test:
- [ ] Does it have an explicit timeout? (third parameter to `test()`)
- [ ] If it takes >5s, does it log progress or use watchdog?
- [ ] If it makes network calls, does it use `withTimeout()` or `createAbortTimeout()`?
- [ ] If it hangs, will the console output help debug it?
- [ ] Does it clean up all resources in `afterEach`/`afterAll`?

---

## Understanding the Problem

Jest waits for all async operations to complete before exiting. If operations are still pending (timers, workers, connections), Jest hangs and eventually times out.

### Common Sources of Open Handles

| Source | Location | Symptom | Fix |
|--------|----------|---------|-----|
| `setImmediate()` | `src/db/sqlite/v1/instrumentation.js` | 3+ open handles | Use `--forceExit` or uninstrumented DB |
| `setInterval()` | Background tasks, polling | Infinite wait | Clear in `afterAll()` |
| Worker threads | `CompressionWorkerPool` | Jest hangs | Call `.shutdown()` |
| Database connections | SQLite handles | File locks | Call `.close()` |
| File watchers | `ConfigManager` | fs.watch handles | Call `.stopWatching()` |
| Event emitters | Various managers | Listener memory | Call `.removeAllListeners()` |
| HTTP servers | Express app | Port bound | Call `.close()` |

---

## Detection: Finding Open Handles

```bash
# Step 1: Run with --detectOpenHandles to identify the source
npm run test:file "mytest" -- --detectOpenHandles

# Output shows exactly what's keeping Jest alive:
# ✕  Immediate
#       144 |         setImmediate(() => {
#           |         ^
#       at Statement.setImmediate (src/db/sqlite/v1/instrumentation.js:144:9)
```

**Reading the Output**:
- **Immediate**: `setImmediate()` calls (usually from instrumentation.js)
- **Timeout**: `setTimeout()` or `setInterval()` not cleared
- **TCPSERVERWRAP**: HTTP server still listening
- **FSREQCALLBACK**: File system operations (watchers)

---

## Solutions by Component

### 1. Database Instrumentation (Most Common)

**Problem**: `src/db/sqlite/v1/instrumentation.js` uses `setImmediate()` for async query telemetry, creating open handles.

**Solution A: Use --forceExit (Recommended for Integration Tests)** ⭐:

This is the **recommended approach** for HTTP integration tests that use the full server stack with instrumented databases. The `setImmediate()` calls in `src/db/sqlite/v1/instrumentation.js` are intentional for async query telemetry and don't indicate a problem.

```json
// package.json (October 2025 Update)
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit --reporters=default --reporters=./jest-timing-reporter.js",
    "test:file": "node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit --reporters=default --reporters=./jest-timing-reporter.js --testPathPattern",
    "test:integration": "node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='http.test.js' --forceExit"
  }
}
```

**Why This Works**: `--forceExit` tells Jest to exit immediately after tests complete, even if there are open handles. This is appropriate when:
- The open handles are intentional (query telemetry)
- You've added proper cleanup but some async operations persist
- The test results are valid despite the open handles

**Solution B: Use Uninstrumented DB (Unit Tests)**:
```javascript
// Instead of this (creates instrumented DB with setImmediate):
const { ensureDatabase } = require('../db/sqlite');
const db = ensureDatabase(dbPath);

// Use this (direct connection, no instrumentation):
const { openDatabase } = require('../db/sqlite/connection');
const { initializeSchema } = require('../db/sqlite/schema');
const db = openDatabase(dbPath);
initializeSchema(db);
```

**Solution C: Mock Instrumentation**:
```javascript
jest.mock('../db/sqlite/instrumentation', () => ({
  wrapWithTelemetry: (db) => db, // Return unwrapped DB
  recordQuery: jest.fn()
}));
```

### 2. BackgroundTaskManager

```javascript
afterAll(async () => {
  if (app.locals.backgroundTaskManager) {
    // Stop all active tasks first
    const manager = app.locals.backgroundTaskManager;
    const activeTasks = Array.from(manager.activeTasks.keys());
    for (const taskId of activeTasks) {
      try {
        manager.stopTask(taskId);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    // Then shutdown the manager
    await manager.shutdown();
  }
});
```

### 3. CompressionWorkerPool

```javascript
afterAll(async () => {
  if (app.locals.compressionWorkerPool) {
    // Terminates worker threads
    await app.locals.compressionWorkerPool.shutdown();
  }
});
```

### 4. ConfigManager (File Watchers)

```javascript
afterAll(() => {
  if (app.locals.configManager) {
    // Stops fs.watch() handles
    if (typeof app.locals.configManager.stopWatching === 'function') {
      app.locals.configManager.stopWatching();
    }
  }
});
```

### 5. Database Connections

```javascript
afterAll(() => {
  // Close the database handle
  const db = app.locals.getDbRW?.();
  if (db && typeof db.close === 'function') {
    db.close();
  }
  
  // Clean up WAL files
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch (_) {
      // Ignore missing files
    }
  }
});
```

### 6. HTTP Servers

```javascript
afterAll(async () => {
  if (server) {
    // Close Express server
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});
```

---

## Complete Test Template

### Fast Unit Test (No Server)

```javascript
const { openDatabase } = require('../db/sqlite/connection');
const { initializeSchema } = require('../db/sqlite/schema');

describe('My Unit Test', () => {
  let db;
  let dbPath;

  beforeAll(() => {
    dbPath = createTempDb();
    
    // Use uninstrumented DB (no setImmediate)
    db = openDatabase(dbPath);
    initializeSchema(db);
  }, 2000);

  afterAll(() => {
    // Just close the DB
    if (db?.close) db.close();
    
    // Clean up files
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch (_) {}
    }
  });

  test('my test', () => {
    // Test code here
  }, 1000);
});
```

### Integration Test (With Server)

```javascript
const { createApp } = require('../server');

describe('My Integration Test', () => {
  let app;
  let dbPath;

  beforeAll(() => {
    dbPath = createTempDb();
    app = createApp({ dbPath, verbose: false });
  }, 5000);

  afterAll(async () => {
    // Shutdown in reverse order of creation
    
    // 1. Background services
    if (app.locals.backgroundTaskManager) {
      await app.locals.backgroundTaskManager.shutdown();
    }
    if (app.locals.compressionWorkerPool) {
      await app.locals.compressionWorkerPool.shutdown();
    }
    if (app.locals.analysisRunManager?.shutdown) {
      await app.locals.analysisRunManager.shutdown();
    }
    
    // 2. File watchers
    if (app.locals.configManager?.stopWatching) {
      app.locals.configManager.stopWatching();
    }
    
    // 3. Database
    const db = app.locals.getDbRW?.();
    if (db?.close) db.close();
    
    // 4. Allow async operations to settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 5. Clean up files
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch (_) {}
    }
  });

  test('my test', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
  }, 3000);
});
```

**Note**: Even with perfect cleanup, instrumented DB tests may need `--forceExit` due to `setImmediate()` in query telemetry.

---

## Jest Configuration

### Per-Test Timeouts

```javascript
// Individual test timeout (2 seconds)
test('my test', async () => {
  // ...
}, 2000);

// Hook timeout (3 seconds for setup)
beforeAll(() => {
  // ...
}, 3000);
```

### Global Configuration

```javascript
// jest.config.js
module.exports = {
  testTimeout: 5000,           // Default timeout for all tests (5s)
  forceExit: false,            // Don't force exit by default (detect issues)
  detectOpenHandles: false,    // Only use when debugging (slows tests)
  maxWorkers: 1,               // Run tests serially (better for debugging)
};
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:unit": "npm test -- --testPathPattern='unit'",
    "test:integration": "npm test -- --testPathPattern='integration' --forceExit",
    "test:debug": "npm test -- --detectOpenHandles --runInBand",
    "test:file": "npm test --"
  }
}
```

**Usage**:
```bash
# Run all tests
npm test

# Run unit tests (no --forceExit, should exit cleanly)
npm run test:unit

# Run integration tests (with --forceExit for instrumented DB)
npm run test:integration

# Debug open handles
npm run test:debug -- src/my.test.js

# Run specific file
npm run test:file "background-tasks"
```

---

## The --forceExit Strategy (Recommended Approach)

**TL;DR**: For integration tests with full server stack, use `--forceExit` instead of trying to track down every async operation.

### Why This is the Right Approach

1. **Instrumented DB is Intentional**: The `setImmediate()` calls in query telemetry are by design, not a bug
2. **Cleanup is Complex**: Full server stack has 10+ services with async operations
3. **Time vs Value**: Spending hours hunting down every `setImmediate` provides little benefit
4. **Industry Standard**: Most Node.js test suites use `--forceExit` for integration tests

### Implementation (October 2025)

The project now uses `--forceExit` on all main test commands:

```json
// package.json
{
  "scripts": {
    "test": "... --forceExit ...",           // All tests
    "test:timing": "... --forceExit ...",    // Timing reports
    "test:file": "... --forceExit ..."       // Single file tests
  }
}
```

**Combined with Cleanup**: The strategy is:
1. ✅ Add proper cleanup (shutdown services, close connections)
2. ✅ Add 100ms delay for async operations to settle
3. ✅ Use `--forceExit` to handle remaining instrumentation handles

This gives you **best of both worlds**: clean shutdown when possible, forced exit when needed.

---

## When to Use --forceExit

### ✅ Use --forceExit For:
- **Integration tests with instrumented database** (setImmediate in query telemetry) ⭐ **Recommended**
- **E2E tests with Puppeteer** (browser may have pending operations)
- **Tests with full server stack** (many async components) ⭐ **Recommended**
- **CI/CD pipelines** (don't want false failures from cleanup timing)
- **After adding proper cleanup** but tests still hang

### ❌ Don't Use --forceExit For:
- Unit tests that mock dependencies (should exit cleanly)
- As first resort (add cleanup first, then use --forceExit)
- Hiding real bugs (if tests hang during execution, not after completion)

### 🤔 When in Doubt:
- If you've added `afterAll()` cleanup and tests still hang → Use `--forceExit` ✅
- If tests hang during execution (not after) → Debug the test, don't use `--forceExit` ❌
- If tests exit cleanly without `--forceExit` → Don't add it ✅

### Example: Separate Unit and Integration Scripts

```json
{
  "scripts": {
    "test:unit": "npm test -- --testPathPattern='unit|.test.js$'",
    "test:integration": "npm test -- --testPathPattern='integration|.http.test.js$' --forceExit",
    "test:e2e": "npm test -- --testPathPattern='e2e' --forceExit --testTimeout=30000"
  }
}
```

---

## Debugging Checklist

When tests hang after completion:

1. **Identify the source**:
   ```bash
   npm test -- src/my.test.js --detectOpenHandles
   ```

2. **Check for common culprits**:
   - [ ] Database instrumentation (setImmediate)
   - [ ] Timers not cleared (setInterval, setTimeout)
   - [ ] Worker threads not terminated
   - [ ] File watchers active
   - [ ] Event listeners attached

3. **Add cleanup**:
   - [ ] Add `afterAll()` hook
   - [ ] Shutdown all services in reverse order
   - [ ] Close database connections
   - [ ] Add 100ms delay for async settle

4. **Verify fix**:
   ```bash
   # Should exit cleanly (or use --forceExit if instrumented DB)
   npm test -- src/my.test.js
   ```

5. **Document the pattern**:
   - Update AGENTS.md if new pattern discovered
   - Add comments in test explaining cleanup order

---

## Anti-Patterns

### ❌ Don't: Ignore the warning
```javascript
// BAD: No cleanup, test hangs
test('my test', async () => {
  const app = createApp({ dbPath });
  // ... test code ...
  // Missing afterAll cleanup
});
```

### ❌ Don't: Use --forceExit as first resort
```bash
# BAD: Hiding a real issue
npm test -- --forceExit  # Why is it hanging? Investigate first!
```

### ❌ Don't: Close DB between tests
```javascript
// BAD: Closes shared DB connection
afterEach(() => {
  const db = app.locals.getDbRW();
  db.close();  // Breaks subsequent tests!
});

// GOOD: Close only in afterAll
afterAll(() => {
  const db = app.locals.getDbRW();
  if (db?.close) db.close();
});
```

### ✅ Do: Shutdown in reverse order
```javascript
// GOOD: Services, then watchers, then DB
afterAll(async () => {
  await app.locals.backgroundTaskManager?.shutdown();  // 1. Services
  app.locals.configManager?.stopWatching();            // 2. Watchers
  app.locals.getDbRW()?.close();                       // 3. Database
  await new Promise(resolve => setTimeout(resolve, 100)); // 4. Settle
});
```

---

## Summary: Quick Reference

| Symptom | Cause | Solution |
|---------|-------|----------|
| Jest hangs after tests | Open async handles | Add cleanup in `afterAll()` |
| "3 open handles potentially keeping Jest from exiting" | setImmediate in instrumentation | Use `--forceExit` or uninstrumented DB |
| Tests timeout during execution | Per-test timeout too short | Increase timeout: `test('...', () => {}, 5000)` |
| "Cannot find module" during cleanup | Import path error | Check require() paths in cleanup code |
| Subsequent tests fail after first | Shared resources not reset | Move cleanup to `afterEach()` or reset state |
| File locks on DB | Connection not closed | Add `db.close()` in `afterAll()` |

**Golden Rule**: If you create it in a test, clean it up in `afterAll()`.

---

## Related Documentation

- **AGENTS.md**: "Testing Guidelines" section for high-level patterns
- **jest.setup.js**: Console output filtering configuration
- **jest.config.js**: Global Jest settings
- **package.json**: Test script examples and configuration
