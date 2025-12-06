# Testing Quick Reference for AI Agents

**When to Read**: 
- Before running ANY tests
- When writing new tests
- When debugging test failures
- When tests hang or won't exit

**Purpose**: Quick lookup for common testing operations and patterns

---

## 🚨 CRITICAL: Check Exit Codes ALWAYS

**VS Code Task Messages are UNRELIABLE**: Tasks show "succeeded" even when tests fail (exit code 1).

**MANDATORY After Every Test Run**:
```javascript
// STEP 1: Run test
await run_task({ id: 'test-task', workspaceFolder: '...' });

// STEP 2: ALWAYS verify exit code
const lastCmd = await terminal_last_command();
// Check: "It exited with code: 0" (pass) or "code: 1" (fail)

// STEP 3: If exit code !== 0, read terminal output
```

**Red Flags**:
- Exit code 1 but task says "succeeded"
- E2E tests >60s (indicates hang)
- Tests in "RUNS" state at end (not completed)
- Total time >400s (multiple hangs)

---

## Test Log Analyzer - PRIMARY TOOL

**Use BEFORE running tests:**

```bash
# Quick status (5 seconds) - DO THIS FIRST
node tests/analyze-test-logs.js --summary

# Full analysis with priorities (10 seconds)
node tests/analyze-test-logs.js

# Check specific test history
node tests/analyze-test-logs.js --test "pattern"
```

**Why**: Saves 5-10 min/session, shows what's broken, avoids duplicate work

**See**: `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` for complete workflow

---

## Simple Query Tools (Fast)

```bash
# Status overview (5s, NO APPROVAL)
node tests/get-test-summary.js --compact

# List failures + messages (5s, NO APPROVAL)
node tests/get-failing-tests.js

# Get log path (2s)
node tests/get-latest-log.js

# Performance check (5s)
node tests/get-slow-tests.js
```

---

## Telemetry Regression Loop

```bash
# 1. Snapshot current telemetry status (<10s)
node tests/get-test-summary.js --compact
node tests/get-failing-tests.js --history --test "telemetry"

# 2. Run fast regression pack (~15s total)
npm run test:file "telemetry-flow.http.test"
npm run test:file "telemetry-flow.e2e.test"
npm run test:file "start-button.e2e.test"
npm run test:file "problems.api.ssr.test"

# 3. Confirm analyzer recorded the pass
node tests/analyze-test-logs.js --test "telemetry-flow"
node tests/analyze-test-logs.js --test "problems.api"
```

**Instrumentation Rules**:
- Emit `telemetry.problem()` for missing or malformed SSE payloads.
- Use `telemetry.milestoneOnce()` for crawl start/stop and server boot checkpoints.
- Keep timeline arrays (`timelineEvents`, `nonGeoTopicSlugs`, `problemSummaries`) populated—even when empty they must be arrays, not `undefined`.

**When to Run**: Any time telemetry, crawl controls, or `analyse-pages-core` changes—run the loop before and after modifications.

---

## Running Tests

### Configuration-Based (NO APPROVAL)

```bash
# Recommended - uses test-config.json
node tests/run-tests.js unit        # Fast (~30s)
node tests/run-tests.js e2e         # Standard E2E (2-5min)
node tests/run-tests.js integration # HTTP tests (~60s)

# Focused test
npm run test:file "pattern"         # Single file(s)
```

### Test Suites Available

- `unit` - Fast unit tests (<30s)
- `integration` - HTTP server tests (~60s)
- `e2e` - Standard E2E (2-5min, excludes dev)
- `e2e-quick` - Quick smoke tests (<1min)
- `all` - All regular tests (excludes dev)
- `dev-geography` - Dev test (5-15min, explicit only)

**See**: `tests/README.md` for complete suite documentation

---

## Writing New Tests

### CRITICAL Rules

```javascript
// 1. Explicit timeout (30s example)
test('name', async () => {
  // test code
}, 30000);

// 2. Use app's shared DB connection (WAL mode)
beforeEach(() => {
  app = createApp({ dbPath: createTempDb() });
  const db = app.locals.backgroundTaskManager.db; // THIS connection
  seedArticles(db); // Same connection
});

// 3. Progress logging for >5s operations
console.log('[TEST] Starting long operation...');

// 4. Clean up in afterAll
afterAll(async () => {
  if (app.locals.backgroundTaskManager) {
    await app.locals.backgroundTaskManager.shutdown();
  }
  // Close DB, clean files, etc.
});
```

---

## Common Test Patterns

### Schema Validation (Catch Bugs Early)

```javascript
test('schema validation', () => {
  const result = db.prepare('INSERT INTO table (col) VALUES (?)').run('value');
  expect(typeof result.lastInsertRowid).toBe('number');
  const row = db.prepare('SELECT * FROM table WHERE id = ?').get(result.lastInsertRowid);
  expect(row).toBeDefined();
  expect(row.id).toBe(result.lastInsertRowid); // Catches TEXT vs INTEGER
});
```

### Single DB Connection (WAL Mode)

```javascript
// ✅ RIGHT: Single app, single connection
beforeEach(() => { tempDbPath = createTempDbPath(); });
test('...', () => {
  const app = createApp({ dbPath: tempDbPath });
  const db = getDbFromApp(app); // Use SAME connection
});

// ❌ WRONG: Multiple connections = WAL isolation
beforeEach(() => { app = createApp({ dbPath }); }); // Connection 1
test('...', () => {
  const testApp = createApp({ dbPath }); // Connection 2 - invisible writes!
});
```

### Async/Await Discipline

```javascript
// ❌ WRONG: async but no await
async function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns Promise<{ jobId }>
}

// ✅ RIGHT: Remove unnecessary async
function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns { jobId } directly
}
```

---

## Debugging Test Failures

### Add Debugging BEFORE Re-Running

**Rule of Thumb**: If you've run a test 3+ times without code changes, STOP and add debugging.

```javascript
// ✅ Add comprehensive debugging first
async execute({ signal, emitProgress }) {
  console.error('[DEBUG] execute() CALLED');
  console.error('[DEBUG] params:', { maxItems: this.maxItems });
  
  const result = await this._fetchData();
  console.error('[DEBUG] fetch result:', result?.items?.length, 'items');
  
  if (result.items.length === 0) {
    console.error('[DEBUG] EARLY RETURN: Zero items');
    return { recordsProcessed: 0 };
  }
  // ... rest
}

// ❌ Don't repeatedly run hoping for different results
```

### External API Errors

```javascript
const response = await fetch(apiUrl);
const data = await response.json();

// CRITICAL: Check for API errors IMMEDIATELY
if (data.error) {
  this.telemetry.problem({
    kind: 'external-api-error',
    scope: 'api-name',
    message: `API error: ${data.error.code}`,
    details: data.error
  });
  throw new Error(`API error: ${data.error.info}`);
}
```

---

## Test Timeouts & Hangs

### Timeout Discipline

```javascript
// Always use AbortController for async operations
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, { signal: controller.signal });
  // process
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error(`Timeout: Operation took >30s`);
  }
  throw error;
} finally {
  clearTimeout(timeout);
}
```

### Preventing "Jest did not exit"

**Common causes**:
1. `setImmediate()` in DB instrumentation
2. `setInterval()` / `setTimeout()` not cleared
3. Worker threads not terminated
4. DB connections not closed
5. File watchers not stopped
6. Event emitters with active listeners

**Solution**: Clean up in afterAll (see docs/TESTING_ASYNC_CLEANUP_GUIDE.md)

---

## Test Log Management

### Migration Tool

```bash
# Migrate legacy logs from root to testlogs/
node tools/migrate-test-logs.js          # Dry run
node tools/migrate-test-logs.js --execute # Execute
node tools/migrate-test-logs.js --audit  # Review existing
```

### Cleanup Tool

```bash
# Default: keep only 2 recent logs per suite (aggressive parallel cleanup)
node tools/cleanup-test-logs.js --stats              # Preview deletions
node tools/cleanup-test-logs.js --execute            # Execute cleanup
node tools/cleanup-test-logs.js --keep 5             # Custom retention (keep 5 per suite)
```

**Strategy**: Minimizes large testlogs directories to speed up AI scanning. Parallel worker threads handle 1,000+ files in <5 seconds.

---

## Iterative Test Fixing Workflow

```bash
# 1. Check logs FIRST (5s, saves 30-60 min)
node tests/analyze-test-logs.js --summary

# 2. Run ONLY failed tests
npm run test:file "specific-pattern"

# 3. Fix one test, verify passes
npm run test:file "specific-pattern"

# 4. Check analyzer confirms fix
node tests/analyze-test-logs.js --test "specific-pattern"

# 5. Move to next failing test
```

**NO full suite reruns** - verify each fix individually

---

## Test Console Output

**Keep <100 lines**: Add noisy patterns to `tests/jest.setup.js` DROP_PATTERNS

**Test-friendly code**:
```javascript
✅ const app = createApp({ dbPath, verbose: false });
✅ const manager = new BackgroundTaskManager({ db, silent: true });
❌ console.warn('[Task] Processing...'); // Appears in every test
```

---

## Related Documentation

**Complete Guides**:
- `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` ⭐ Systematic test fixing
- `docs/TESTING_STATUS.md` ⭐ Current test state
- `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` ⭐ Async patterns
- `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` ⭐ Timeout prevention
- `docs/guides/TEST_HANGING_PREVENTION_GUIDE.md` ⭐ **NEW**: Complete guide to preventing "Jest did not exit" warnings
- `docs/TEST_FIXES_2025-10-10.md` - Recent fix patterns

**Tools**:
- `tests/README.md` - Test runner configuration
- `tests/SIMPLE_TOOLS_README.md` - Query tools documentation

**Specialized**:
- `docs/GEOGRAPHY_E2E_TESTING.md` - Long-running E2E
- `DEBUGGING_CHILD_PROCESSES.md` - SSE/milestone events
- `tools/debug/README.md` - Debugging utilities
