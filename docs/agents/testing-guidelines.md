---
title: Testing Guidelines for AI Agents
intent: Provide comprehensive testing patterns, rules, and workflows for reliable code changes
audience: agents
owner: AI Agent Team
last_review: 2025-10-19
tags: [testing, tdd, guidelines, patterns]
supersedes: []
related: [testing-quick-reference, testing-review-guide, test-timeout-guards]
---

## Summary

This document contains critical testing guidelines, patterns, and workflows that AI agents must follow when working with the codebase. It covers everything from basic test discipline to advanced patterns for preventing hangs, handling async operations, and debugging failures.

## When to Read

- When writing new code or modifying existing code
- When tests are failing and need systematic fixing
- When implementing new features that require tests
- When debugging test hangs or async issues
- When working with database operations in tests

## Procedure

### Golden Rules

**🚨 GOLDEN RULE**: Tests Must Never Hang Silently
- Set explicit timeouts: `test('name', async () => {...}, 30000)`
- Add progress logging for operations >5s
- Use AbortController with timeouts for network calls
- See `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` for patterns

**🚨 CRITICAL**: Verify Test Results After Every Run
- VS Code task messages are UNRELIABLE (shows "succeeded" even when tests fail)
- ALWAYS use `terminal_last_command` tool to check exit code
- Exit code 0 = pass, exit code 1 = fail
- Read terminal output for details

**🔥 CRITICAL**: Check Logs BEFORE Running Tests
```bash
# Saves 5-10 min per session
node tests/analyze-test-logs.js --summary  # Current status (5s)
node tests/get-failing-tests.js            # List failures (5s)
```

**🔥 CRITICAL**: Single DB Connection in Tests (WAL Mode)
```javascript
// ✅ CORRECT: Use app's shared connection
beforeEach(() => {
  app = createApp({ dbPath: createTempDb() });
  const db = app.locals.backgroundTaskManager.db; // Use THIS
  seedArticles(db); // Same connection
});

// ❌ WRONG: Multiple connections (WAL isolation)
const db = ensureDb(dbPath); // Connection 1
seedArticles(db);
db.close();
app = createApp({ dbPath }); // Connection 2 - won't see seeded data!
```

### Common Patterns

- Schema bugs → 100% failure rate (fix these first)
- Async without await → Returns Promise instead of value
- Multiple DB connections → WAL isolation makes writes invisible
- See `docs/TESTING_QUICK_REFERENCE.md` for complete patterns

### Test Discipline

- Add debugging BEFORE running tests 3+ times
- Fix one test, verify, then next (no batching)
- Use `npm run test:file "pattern"` for focused tests
- Configuration runner: `node tests/run-tests.js <suite>` (no approval dialogs)
- When the user labels a test "broken", move the file into `tests/broken/` (mirroring its subdirectory) so regular suites skip it. Keep the contents intact there for future repair work and note the relocation in your summary.

### Focused Testing When Working on Single Features

**When working on a single thing (like DB migration, UI component, or API endpoint), DON'T run the full unit test suite**:

- ✅ **Run ONLY the relevant tests**: Use `npm run test:file "pattern"` for tests related to your changes
- ✅ **Check logs first**: Use `node tests/analyze-test-logs.js --summary` to see current status without running tests
- ✅ **Iterate on focused tests**: Fix one test file, verify it passes, then move to next
- ✅ **Run full suite only at completion**: Once all related tests pass, run the full suite once to catch regressions

**Why this matters**:
- Full suite runs take 2-5 minutes and provide no value when working on isolated features
- Most test failures are unrelated to your current work (schema bugs, import issues, etc.)
- Focused testing enables rapid iteration (seconds per cycle vs minutes)
- Prevents wasting time on unrelated failures that aren't your responsibility

### Schema Validation

When ALL tests in a suite fail with zero results, suspect schema mismatch BEFORE logic bugs:
```javascript
// ✅ Add schema validation test to catch issues early
test('schema validation', () => {
  const result = db.prepare('INSERT INTO table (col) VALUES (?)').run('value');
  expect(typeof result.lastInsertRowid).toBe('number');
  const row = db.prepare('SELECT * FROM table WHERE id = ?').get(result.lastInsertRowid);
  expect(row).toBeDefined();
  expect(row.id).toBe(result.lastInsertRowid); // Catches TEXT vs INTEGER id bugs
});
```

### Schema Evolution Pattern

When removing tables/columns, check ALL code:
```javascript
// ✅ Check table exists before querying removed features
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='old_table'"
).get();
if (!tableExists) return [];
```

### WAL Mode Single Connection

In SQLite WAL mode, multiple connections to same database create isolation - writes invisible across connections:
```javascript
// ❌ WRONG: Multiple connections = WAL isolation
beforeEach(() => { app = createApp({ dbPath }); }); // Connection 1
test('...', () => {
  const testApp = createApp({ dbPath }); // Connection 2 - invisible writes!
});

// ✅ RIGHT: Single app per test
beforeEach(() => { tempDbPath = createTempDbPath(); }); // No connection yet
test('...', () => {
  const app = createApp({ dbPath: tempDbPath }); // Single connection
  const db = getDbFromApp(app); // Use SAME connection
});
```

### Async/Await Misuse

**Only declare `async` if function uses `await`**. Unnecessary `async` returns Promise instead of value:
```javascript
// ❌ WRONG: async but no await
async function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns Promise<{ jobId }> - caller gets Promise!
}

// ✅ RIGHT: Remove async
function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns { jobId } directly
}
```

### Async Cleanup in Tests

**⚠️ READ FIRST**: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Complete patterns for preventing "Jest did not exit" warnings.

**Quick Summary**: Jest warning means async operations weren't cleaned up (setImmediate, timers, workers, DB connections, file watchers, event listeners, HTTP servers).

**Common Solutions**:
- Use `--forceExit` for instrumented DB tests
- Shutdown managers: `backgroundTaskManager.shutdown()`, `compressionWorkerPool.shutdown()`
- Stop watchers: `configManager.stopWatching()`
- Close connections: `db.close()`
- Clear timers: Track and clear all setTimeout/setInterval

### API Error Detection via Telemetry

External API failures often return HTTP 200 with error objects in JSON, making them invisible without proper telemetry. The geography crawl debug session took 60+ minutes because API errors weren't surfaced until explicitly logging the response structure.

**Telemetry-First Pattern for External APIs**:
```javascript
const response = await fetch(apiUrl);
const data = await response.json();

// CRITICAL: Check for API-level errors IMMEDIATELY
if (data.error) {
  this.telemetry.problem({
    kind: 'external-api-error',
    scope: 'wikidata-api',
    message: `API error: ${data.error.code || 'unknown'}`,
    details: {
      errorCode: data.error.code,
      errorInfo: data.error.info,
      parameter: data.error.parameter,
      limit: data.error.limit
    }
  });
  // Handle error (throw, return empty, retry, etc.)
}
```

**When to Emit PROBLEM Telemetry**:
- ✅ External API returns error object (even with HTTP 200)
- ✅ Rate limit exceeded
- ✅ Invalid response structure (missing expected fields)
- ✅ Partial success (requested 100 items, received 50)
- ✅ Batch operation failures (e.g., batch 3/5 failed, continue with remaining)
- ❌ NOT for expected empty results (zero records found)
- ❌ NOT for normal control flow (cache hit, skip already processed)

### Timeout Discipline and Error Context

When operations can hang indefinitely (API calls, SSE streams, database operations):

1. **Always use AbortController with timeouts**:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, { signal: controller.signal });
  // ... process response
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error(`Timeout: Operation took longer than 30s`);
  }
  throw error;
} finally {
  clearTimeout(timeout);
}
```

2. **Track last successful operation for debugging**:
```javascript
let lastEventTime = Date.now();
let lastEventType = null;

// In event loop:
lastEventTime = Date.now();
lastEventType = event.type;

// On timeout:
logger.error(`Last event: ${lastEventType} (${Date.now() - lastEventTime}ms ago)`);
```

3. **Batch operations should continue on individual failures**:
```javascript
for (let i = 0; i < batches.length; i++) {
  try {
    await processBatch(batches[i]);
  } catch (error) {
    this.telemetry.problem({
      kind: 'batch-operation-failed',
      message: `Batch ${i+1}/${batches.length} failed: ${error.message}`
    });
    // Continue with remaining batches
  }
}
```

4. **Test timeouts should have descriptive messages**:
```javascript
test('should complete operation', async () => {
  // ... test code
}, 30000); // Jest timeout: 30s - must be longer than internal timeouts
```

### Debugging Before Testing

**Rule of Thumb**: If you've run a test 3+ times without code changes, STOP and add debugging instead.

**Debugging-First Approach**:
1. ❌ **Don't**: Repeatedly run tests hoping for different results
2. ✅ **Do**: Add `console.error()` at decision points, log entry/exit/branches/API responses
3. ✅ **Do**: Add PROBLEM telemetry for API errors (surfaces in test output)
4. ✅ **Do**: Research execution flow before testing
5. ✅ **Only run tests when**: New debugging added OR code changed OR hypothesis formed

### Concise E2E Test Output

For development E2E tests that need clean, single-line output:
1. **Suppress console in tests/jest.setup.js**: Check for `GEOGRAPHY_FULL_E2E=1` env var and set `console.log/warn/info/error = () => {}`
2. **Custom reporter**: Create compact reporter that shows errors inline (see `jest-compact-reporter.js`)
3. **LogCondenser utility**: Use `src/utils/LogCondenser.js` for single-line progress (writes to `stderr` to bypass Jest)
4. **Run command**: `npm run test:geography-full` (uses `cross-env` for Windows compatibility)
5. **Output format**: `[•] 0s STEP 1  Setting up` (progress) and `✖ Test Name - Error message` (failures)

### Development E2E Tests

`geography.full.e2e.test.js` and similar are **development/debugging tools**, not regular tests:
- **Purpose**: Live monitoring of long-running processes (5min-hours) with detailed telemetry
- **Usage**: `npm run test:geography-full` (configured in package.json with environment variables)
- **Requirements**: Must show continuous progress (no silent periods >10s), detailed timing/ETAs, defensive completion detection
- **When to use**: Developing ingestors, debugging crawls, understanding system behavior
- **Documentation**: See `docs/DEVELOPMENT_E2E_TESTS.md` for patterns and examples
- **Not for**: CI/CD, regular TDD, regression testing (too slow/expensive)

### Test-Friendly Code

```javascript
✅ const app = createApp({ dbPath, verbose: false });
✅ const manager = new BackgroundTaskManager({ db, silent: true });
❌ console.warn('[Task] Processing...'); // Appears in every test (unless suppressed)
```

### Async Cleanup Checklist

- [ ] All `setInterval()` / `setTimeout()` cleared in afterAll/afterEach
- [ ] Worker pools shut down (`.shutdown()` method)
- [ ] Database connections closed (`.close()` method)
- [ ] File watchers stopped (`.stopWatching()` method)
- [ ] Event listeners removed (`.removeAllListeners()`)
- [ ] HTTP servers closed (`.close()` on Express app)
- [ ] Use `--forceExit` for instrumented DB tests (setImmediate issue)

### Creating Concise E2E Tests

```javascript
// 1. Create LogCondenser for single-line output (writes to stderr)
const { LogCondenser } = require('../../../utils/LogCondenser');
const logger = new LogCondenser({ startTime: Date.now() });

// 2. Use compact logging methods
logger.info('STEP 1', 'Setting up test environment');
logger.success('OK  ', 'Server running at http://...');
logger.error('ERR ', 'Failed to initialize');

// 3. Configure package.json script with environment variable
"test:my-e2e": "cross-env MY_E2E=1 JEST_DISABLE_TRUNCATE=1 node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='my.e2e' --reporters=./jest-compact-reporter.js"

// 4. Update tests/jest.setup.js to suppress console for your test
if (process.env.MY_E2E === '1') {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.error = () => {};
}
```

### Test Discipline

Fix autonomously, report once when done. Don't report after each fix.

**Tests Are Mandatory**: Every new feature/change requires tests. Search for existing tests first, extend them.

**Log Recon Before Reruns**: Jest timing logs (`test-timing-*.log` files in repo root) capture the most recent failures and durations—skim the newest entries and summarize findings before deciding to rerun suites. **ALWAYS check logs before running tests** - saves 30-60 minutes per testing session. See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` Phase 1 for log consultation procedure.

### Iterative Test Fixing Workflow

1. **Check logs FIRST** - Read test-timing-*.log files to see what failed, when, and why (may skip test run entirely)
2. **Consult terminal output** - Read the most recent test failure output to identify which tests failed
2. **Run ONLY failed tests** - Use `npm run test:file "specific-pattern"` to run just the failing test files
3. **Fix and verify individually** - Fix one test file, run it, verify it passes, then move to next
4. **NO full suite reruns** - Once you've verified each failing test passes individually, you're DONE
5. **Use terminal history** - Check previous terminal output to see what failed, don't guess

### Running Focused Tests

**Windows PowerShell**: Use safe npm scripts that avoid confirmation dialogs:

```bash
# ✅ RECOMMENDED: List tests first (safe, no execution)
npm run test:list

# ✅ RECOMMENDED: Run specific test files (safest)
npm run test:by-path -- path/to/test.js

# ✅ RECOMMENDED: Run tests related to changed files
npm run test:related -- src/changed-file.js

# ✅ RECOMMENDED: Run tests by name pattern
npm run test:name -- "test name pattern"

# ❌ WRONG: Unfiltered runs everything
npm test

# ❌ WRONG: Complex piping REQUIRES CONFIRMATION (DO NOT USE)
npm run test:file "pattern" 2>&1 | Select-String -Pattern "..."
# Use npm run test:by-path directly - Jest output is already concise
```

**CRITICAL: Always use safe scripts**:
- ✅ **NO confirmation required** - runs immediately
- ✅ **Full output visible** - see all passes/failures
- ✅ **Simple single command** - no piping complexity
- ❌ **DO NOT pipe to Select-String** - triggers confirmation dialog
- ❌ **DO NOT chain multiple commands** - triggers confirmation dialog

**See**: `docs/tests/FOCUSED_TESTS.md` for canonical focused test commands.

### Test Categories

```bash
npm run test:unit         # Unit tests only (~30s)
npm run test:integration  # HTTP integration tests
npm run test:e2e-quick    # Basic E2E smoke tests
npm run test:dev-geography # Full geography E2E (5-15 min)
npm run test:by-path -- path/to/test.js # Single file(s) - NO CONFIRMATION
```

**See**: `docs/tests/RUNNERS.md` for complete runner guide.

### Telemetry Regression Pack

- **Trigger**: Changes to `analyse-pages-core`, timeline renderers, crawl stop/start controls, or any telemetry/milestone wiring.
- **Fast status check**:
  ```bash
  node tests/get-test-summary.js --compact
  node tests/get-failing-tests.js --history --test "telemetry"
  ```
- **Instrumentation rules**: Emit `telemetry.problem()` whenever SSE payloads are missing or invalid, drop `milestoneOnce` markers for crawl boot/stop, and keep `timelineEvents`, `nonGeoTopicSlugs`, and `problemSummaries` as arrays (never `undefined`).
- **Verification loop (~15s total)**:
  ```bash
  npm run test:file "telemetry-flow.http.test"
  npm run test:file "telemetry-flow.e2e.test"
  npm run test:file "start-button.e2e.test"
  npm run test:file "problems.api.ssr.test"
  ```
- **Post-run checks**: Confirm `terminal_last_command` exit code `0` and record the pass in the analyzer:
  ```bash
  node tests/analyze-test-logs.js --test "telemetry-flow"
  node tests/analyze-test-logs.js --test "problems.api"
  ```
- **Documentation**: Reflect any new telemetry expectations in `docs/TESTING_STATUS.md` (if active) and update this section when workflows change.

### Collateral Wins Pattern

1 schema fix → 10+ tests pass. **Prioritize schema bugs!**
- 75 tests fixed in 90 minutes = 50 tests/hour (schema-first approach)
- Session 1: 11 tests/60min (structure), Session 2: 38 tests/20min (bugs), Session 3: 26 tests/10min (collateral)

## Gotchas

- **VS Code task messages are UNRELIABLE** - Always check exit codes with `terminal_last_command`
- **WAL mode requires single DB connection** - Multiple connections cause invisible writes
- **Async without await returns Promise** - Not the resolved value
- **Schema bugs cause 100% failure rates** - Fix these first for maximum impact
- **Test hangs = silent failures** - Add explicit timeouts and progress logging
- **Focused testing prevents wasting time** - Use `npm run test:file` for single features
- **External APIs return 200 with error objects** - Check `data.error` immediately
- **Jest won't exit = async cleanup missing** - See `docs/TESTING_ASYNC_CLEANUP_GUIDE.md`
- **Development E2E tests are debugging tools** - Not for CI/CD pipelines