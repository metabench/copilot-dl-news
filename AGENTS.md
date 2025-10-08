# AGENTS.md — AI Agent Workflow & Project Structure

_Implementation approach: defend the data boundaries while staying resilience-oriented and observability-focused via the live diagnostics pipeline._

## 🎯 **CRITICAL: Project Structure Analysis FIRST**

**Before implementing ANY feature, UI component, or change, ALWAYS analyze project structure:**

### Mandatory Pre-Implementation Checklist

```
FOR EVERY TASK:

1. ✅ CHECK AGENTS.MD FIRST
   - Is this area documented? Read existing guidance
   - Is structure information current? Verify with files
   - Update AGENTS.md with discoveries

2. ✅ ANALYZE PROJECT STRUCTURE
   - Search for similar files: file_search for patterns
   - Check package.json for build scripts
   - Examine existing code structure
   - Identify conventions (naming, organization)

3. ✅ MATCH EXISTING PATTERNS
   - Don't invent new patterns when one exists
   - Follow established conventions exactly
   - Ask "How would existing code do this?"

4. ✅ DOCUMENT DISCOVERIES
   - Add missing structure info to AGENTS.md
   - Update outdated information
   - Keep AGENTS.md focused on methodology
```

### Example: Adding UI Styles (Mistake Analysis)

**❌ WRONG APPROACH** (What happened in ProposedActionsPopup):
```
1. Implement component JavaScript
2. Create CSS file directly
3. No analysis of existing styling system
4. Result: Wrong file format, wrong location
```

**✅ CORRECT APPROACH**:
```
1. Search for existing styles: file_search "**/*.scss"
2. Check package.json: grep for "sass", "styles", "css"
3. Examine style directory structure
4. Read main style file to understand imports
5. Create _proposed-actions-popup.scss in partials/
6. Import in main ui.scss file
7. Run sass:build to compile
```

### Project Structure Knowledge Base

**UI Styling System**:
- **Source**: `src/ui/express/public/styles/*.scss`
- **Build**: `npm run sass:build` (compiles to CSS)
- **Watch**: `npm run sass:watch` (auto-compile on changes)
- **Pattern**: Create `_partial-name.scss` in `partials/`, import in main `ui.scss`
- **Output**: `src/ui/express/public/*.css` (compiled, don't edit)

**Component Organization**:
- **JS Components**: `src/ui/public/components/*.js` OR `src/ui/express/public/components/*.js`
- **Build**: Auto-build on server start (see auto-build-components.js)
- **Pattern**: ES6 modules with esbuild bundling

**Test Organization**:
- **Unit tests**: `src/**/__tests__/*.test.js`
- **Integration tests**: `src/ui/express/__tests__/*.api.test.js`
- **E2E tests**: `src/ui/express/__tests__/*.e2e.test.js`

**Background Tasks**:
- **Task classes**: `src/background/tasks/*.js`
- **Actions**: `src/background/actions/*.js`
- **Errors**: `src/background/errors/*.js`

### Keeping AGENTS.md Current

**When to Update AGENTS.md**:
1. ✅ Discovered new project structure pattern
2. ✅ Found outdated information in AGENTS.md
3. ✅ Completed a major feature (remove detailed implementation tasks)
4. ✅ Learned a workflow lesson from a mistake

**What to Remove from AGENTS.md**:
1. ❌ Detailed implementation steps for COMPLETED features
2. ❌ Phase-by-phase plans where all phases are ✅ COMPLETE
3. ❌ Code examples for finished implementations
4. ❌ Historical task tracking with all items checked

**What to Keep in AGENTS.md**:
1. ✅ Methodology and workflow principles
2. ✅ Project structure information
3. ✅ Incomplete tasks and roadmaps
4. ✅ Critical patterns and anti-patterns
5. ✅ Testing strategies and tools

---

## 🚀 CURRENT PRIORITY: Performance Optimization (October 2025)

**Status**: ✅ Tests complete in 70 seconds (major improvement)  
**Goal**: Further optimize to 30-40 seconds for development workflow

**Key Achievements**:
- Fixed CompressionWorkerPool hanging in test environment
- 96.8% test pass rate (633/654 tests)
- No tests taking >5 seconds

**Remaining Work**:
- [ ] Fix 16 failing tests (6 test files)
- [ ] Implement shared test infrastructure (save 8-12s)
- [ ] Use in-memory DB for unit tests (save 3-5s)
- [ ] Add database indexes for production speed

### Test Execution Workflow and Logging

**CRITICAL: Do Not Run Tests Unnecessarily**

**If no code (including test code) has been modified, then previous logged test results MUST be referred to instead of running the tests again.**

Tests take ~56 seconds to complete. Always check existing timing logs before running tests:
- Check `test-timing-*.log` files for recent results
- Use PowerShell commands to extract specific information from logs
- Only run tests after code changes or when logs are missing

**Example log analysis commands**:
```powershell
# Get latest test results (simple, fast)
Get-Content test-timing-*.log | Select-Object -Last 50

# Get test summary (simple, fast)
Get-Content test-timing-*.log | Select-String "Test Suites:|Tests:"

# Get failing test files (simple, fast)
Get-Content test-timing-*.log | Select-String "FAIL "
```

**CRITICAL: User Will Ctrl+C If Impatient**

The user will press Ctrl+C if a command takes too long or appears to hang. Agents must:
- ❌ **AVOID** starting servers (can hang on port conflicts, initialization issues)
- ❌ **AVOID** making API calls to servers (requires server to be running, can timeout)
- ❌ **AVOID** long-running processes without clear progress indicators
- ❌ **AVOID** complex `node -e` commands that require approval
- ✅ **PREFER** reading log files instead of running commands
- ✅ **PREFER** checking file existence with `Test-Path` instead of trying to access files
- ✅ **PREFER** static analysis over dynamic testing when investigating issues
- ✅ **PREFER** starting the server directly to test auto-build (logs show if build occurred)

**IMPORTANT**: Tests that hang or run too long may be interrupted with **Ctrl+C** during development.

**Logging Strategy**:
Jest is configured with a custom timing reporter (`jest-timing-reporter.js`) that provides real-time logging:

1. **Test Start Logging**: Each test file logs when it begins execution
   - Format: `PASS/FAIL <test-file-name> (<duration>)`
   - Logged immediately as tests run, **before** completion

2. **Progress Tracking**: Tests write timing data as they proceed
   - Individual test results visible in real-time console output
   - Timing data accumulated throughout execution

3. **Interrupt Recovery**: If tests are stopped with Ctrl+C:
   - **Console output shows last test that was executing**
   - Timing logs in project root directory preserve partial results
   - Format: `test-timing-<timestamp>.log`
   - Agent can review logs to determine exact point of interruption

4. **Log File Locations**:
   ```
   test-timing-<timestamp>.log        # Timestamped timing data (root directory)
   test-timing-report.json            # JSON report (root directory)
   docs/TEST_PERFORMANCE_RESULTS.md   # Latest comprehensive analysis
   ```

5. **Identifying Hanging Tests**:
   - If Ctrl+C is pressed, the console will show which test was running
   - If console is cleared, check the timing log to see the last completed test
   - The next test in the suite order is the one that hung

**Example Workflow**:
```bash
# Start test run
npm test

# [Tests run... agent sees real-time output]
# PASS src/ui/express/__tests__/logs.colorization.test.js (0.5s)
# PASS src/ui/express/__tests__/logs.contrast.test.js (2.3s)
# [Test hangs...]

# User presses Ctrl+C

# Agent checks:
# 1. Console output - last test shown was logs.contrast.test.js
# 2. Timing log - shows logs.contrast completed at 2.3s
# 3. Conclusion - next test in suite is the hanging one
```

**Best Practices for Agents**:
- Always monitor console output during test runs
- Note which test is executing when user interrupts
- Reference timing logs if console is unavailable
- Document hanging tests immediately for investigation
- Add timeouts or skip flags to problematic tests

---

## Build Process

**CRITICAL**: Browser components must be built before the server can serve them correctly.

### Automatic Build on Server Start ✅

**The server automatically checks and rebuilds components if needed when it starts.**

- **Fast Check**: Compares source file timestamps with built file timestamps
- **Only Rebuilds When Necessary**: If sources are newer than outputs, rebuilds automatically
- **Quick**: esbuild makes rebuilds nearly instant (~100-300ms)
- **Zero Manual Intervention**: Just start the server, components are built automatically

**Implementation**: `src/ui/express/auto-build-components.js`
- Checks if `src/ui/express/public/components/*.js` is newer than `public/assets/components/*.js`
- Rebuilds only if needed
- Runs automatically in `startServer()` function

### Manual Build (Optional)

You can still manually build components if needed:

```bash
# Build components once (usually not needed due to auto-build)
npm run components:build

# Watch mode (auto-rebuild on changes) - NOT YET IMPLEMENTED
npm run components:watch
```

### When Auto-Build Triggers

**Auto-build runs automatically when server starts if**:
- Output directory doesn't exist
- Any source file is missing its corresponding output file
- Any source file is newer than its output file

**Example server startup with auto-build**:
```
[auto-build] Components need rebuilding...
[auto-build] Building 2 component(s)...
[auto-build] ✓ All components built successfully
[server] Components rebuilt
GUI server listening on http://localhost:41000
```

### Build Output

- **Source**: `src/ui/express/public/components/*.js` (ES6 with imports)
- **Built**: `src/ui/express/public/assets/components/*.js` (bundled with dependencies)

### Troubleshooting

**Symptom**: "Failed to resolve module specifier" errors in browser console

**Cause**: Auto-build failed silently, or import paths incorrect

**Fix**:
1. Check server startup logs for auto-build errors
2. Run `npm run components:build` manually to see detailed errors
3. Verify import paths use `/assets/components/` (not `/components/`)
4. Restart server to trigger auto-build again

### Architecture Details

**Why This Works**:
- esbuild is extremely fast (~100-300ms for small projects)
- Timestamp comparison is instant (filesystem metadata only)
- Auto-build happens asynchronously - doesn't block server startup
- If build fails, server continues anyway (components might already be built)

**Trade-offs**:
- Small startup delay (100-300ms) if rebuild needed
- No delay if components are already up-to-date
- Better than forgetting to build manually and getting runtime errors

---

## Running Focused Tests (Single Files or Patterns)

**CRITICAL**: On Windows PowerShell, npm does NOT properly forward `--testPathPattern` arguments to Jest when the base script contains `--reporters` arguments. The arguments are silently dropped, causing ALL tests to run.

### ✅ **Correct Methods**

#### Method 1: Use `npm run test:file` (Recommended)

```bash
# Run single test file by name pattern
npm run test:file dbAccess

# Run multiple files matching pattern
npm run test:file "gazetteer.*http"

# Run tests in specific directory
npm run test:file "ui/__tests__"
```

**How it works**: The `test:file` script includes `--testPathPattern` at the end, allowing npm to pass the pattern correctly.

#### Method 2: Direct Jest Invocation (Alternative)

```bash
# Run by file pattern
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="dbAccess"

# Run with verbose output
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="dbAccess" --verbose

# List tests without running
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="dbAccess" --listTests
```

**When to use**: One-off testing, debugging, or when you need exact control over Jest options.

### ❌ **Incorrect Method (Will Run All Tests)**

```bash
# ❌ WRONG - argument silently dropped, runs ALL 127 test suites!
npm test -- --testPathPattern=dbAccess

# Why it fails: npm's argument parser on Windows drops the --testPathPattern
# when the base script already has --reporters arguments
```

### Pattern Matching Examples

Jest uses **regex patterns** to match test file paths:

```bash
# Match by filename
npm run test:file "dbAccess"              # Matches: src/db/__tests__/dbAccess.test.js

# Match by directory
npm run test:file "db/__tests__"          # Matches all tests in db/__tests__/
npm run test:file "ui/express/__tests__"  # Matches all tests in ui/express/__tests__/

# Match by category
npm run test:file "\.api\."              # Matches all files with .api. in path
npm run test:file "\.e2e\."              # Matches all e2e tests
npm run test:file "http\.test"           # Matches all http.test.js files

# Multiple patterns (regex OR)
npm run test:file "dbAccess|pipelines"   # Matches dbAccess OR pipelines tests
```

### Test Suite Categories

The project has several test scripts for different categories:

```bash
# Full test suite (all tests)
npm test                                 # ~75 seconds, 127 test files

# Fast unit tests only (skip HTTP/E2E)
npm run test:fast                        # ~30 seconds, unit tests only

# Unit tests only (skip integration)
npm run test:unit                        # Unit tests, no HTTP/E2E/online

# Integration tests (HTTP servers)
npm run test:integration                 # HTTP integration tests only

# E2E tests (Puppeteer)
npm run test:e2e                         # E2E tests with browser automation

# Online tests (external APIs)
npm run test:online                      # Tests requiring internet

# Single file (focused testing)
npm run test:file "pattern"              # Pattern-matched single file(s)
```

### Verification Commands

Before running tests, verify what will be executed:

```bash
# List tests that match pattern (no execution)
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="dbAccess" --listTests

# Expected output:
# C:\Users\...\copilot-dl-news\src\db\__tests__\dbAccess.test.js
```

### Performance Tips

- **Single file tests**: ~2-20 seconds (fast iteration)
- **Pattern-matched tests**: ~10-60 seconds (multiple files)
- **Full test suite**: ~75 seconds (comprehensive validation)

**Recommendation**: Use `npm run test:file` for rapid iteration during development, run full suite before committing.

### Reference Documentation

- Full investigation: `docs/TEST_INVESTIGATION_DBACCESS.md`
- Test patterns: Search for `__tests__` directories in workspace
- Jest CLI options: https://jestjs.io/docs/cli

---

### Test Timeout Configuration

**Global Timeout**: All tests have a **10-second maximum timeout** enforced globally via `jest.setup.js` and `package.json`.

**Fast Test Optimization**: Pure unit tests (no I/O, no async operations) can opt into a **1-second timeout** for faster failure detection:

```javascript
// In test file
describe('myFastTests', fastTest(() => {
  test('should execute quickly', () => {
    // Pure computation, no I/O
    expect(1 + 1).toBe(2);
  });
}));
```

**Current Fast Tests** (sub-second execution):
- `src/utils/__tests__/pipelines.test.js` (0.20s, 24 tests)
- `src/utils/__tests__/objectHelpers.test.js` (0.19s, 40 tests)
- `src/utils/__tests__/attributeBuilder.test.js` (0.18s, 25 tests)
- `src/utils/__tests__/optionsBuilder.test.js` (0.20s, 31 tests)
- `src/utils/__tests__/domainUtils.test.js` (0.20s, 33 tests)

**Benefits**:
- Tests that hang will fail after 10 seconds maximum (or 1 second for fast tests)
- User can Ctrl+C at any time during development
- Timing logs preserve execution state for debugging
- Fast feedback for unit tests that should never take long

**When to Use Fast Test Timeout**:
- Pure functions with no I/O
- Synchronous computations
- Simple data transformations
- No database, network, or file system access
- No server startup or HTTP requests

**When to Keep 10s Timeout**:
- Integration tests with database
- HTTP server tests
- E2E tests with Puppeteer
- Tests with network requests
- Tests requiring resource cleanup

---

### Timeout Optimization Strategy for Development

**CRITICAL: Choose Minimal Timeouts for Rapid Development Iteration**

When testing functionality during development (not in test suites), always use the **shortest timeout that safely validates the behavior**.

**Development Testing Timeout Guidelines**:

```
FOR MANUAL/AD-HOC TESTING (like server startup verification):

✅ PREFERRED: 2-4 seconds
- Validates basic functionality quickly
- Allows 5-10 iterations per minute
- Sufficient for most server startup checks
- Example: node server.js --auto-shutdown-seconds 2

⚠️ ACCEPTABLE: 5-8 seconds
- Use when testing slower operations
- Still allows rapid iteration (2-3 tests per minute)
- Example: Testing database migrations

❌ TOO SLOW: 10+ seconds
- Only use for genuine long-running operations
- Slows development iteration significantly
- Example: Testing bulk data imports

AVOID ENTIRELY: 20-60 seconds
- Only justified for production-like scenarios
- Wastes developer time during iteration
- Use event-driven verification instead
```

**Examples of Optimal Development Timeouts**:

```bash
# ✅ GOOD: Quick server startup verification (2s is plenty)
node server.js --detached --auto-shutdown-seconds 2

# ✅ GOOD: Test auto-shutdown mechanism (3s validates it works)
node server.js --detached --auto-shutdown-seconds 3

# ⚠️ ACCEPTABLE: Longer test for specific timing validation
node server.js --detached --auto-shutdown-seconds 8

# ❌ BAD: Unnecessarily long timeout for simple verification
node server.js --detached --auto-shutdown-seconds 30
```

**Rule of Thumb**:
- **Server startup check**: 2-3 seconds
- **Feature validation**: 2-5 seconds
- **Timing verification**: Use actual timeout needed + 1 second margin
- **Production simulation**: 10-30 seconds (rare, only when needed)

---

### Event-Driven Testing vs Timeout-Based Testing

**CRITICAL: Prefer Event-Driven Waits Over setTimeout in Tests**

Many tests use `setTimeout` or arbitrary delays when they should use event-driven architecture for faster, more reliable testing.

**❌ Timeout-Based Testing (Slow & Fragile)**:
```javascript
beforeEach(async () => {
  app = createApp({ dbPath });
  server = app.listen(port);
  
  // ❌ BAD: Arbitrary 500ms delay "hoping" server is ready
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Test might fail if server takes >500ms to start
// Test wastes 500ms even if server starts in 50ms
```

**✅ Event-Driven Testing (Fast & Reliable)**:
```javascript
beforeEach(async () => {
  app = createApp({ dbPath });
  server = app.listen(port);
  
  // ✅ GOOD: Wait for actual 'listening' event
  await new Promise(resolve => {
    server.on('listening', resolve);
  });
});

// Test continues immediately when server is ready
// Test never fails due to slow startup
// Test completes in actual time needed, not arbitrary delay
```

**Where to Replace Timeouts with Events**:

| Scenario | ❌ Timeout-Based | ✅ Event-Based |
|----------|-----------------|----------------|
| Server startup | `setTimeout(500)` | `server.on('listening')` |
| Database ready | `setTimeout(200)` | `db.on('open')` |
| HTTP request complete | `setTimeout(1000)` | `await fetch(...)` |
| Background task done | `setTimeout(5000)` | `task.on('complete')` |
| File written | `setTimeout(100)` | `await fs.promises.writeFile()` |
| SSE connection | `setTimeout(300)` | `eventSource.onopen` |

**Timeout Estimation for Unavoidable Waits**:

When timeouts are truly necessary (polling, rate limits, debounce testing), estimate the **minimum safe timeout**:

```javascript
// ✅ GOOD: Minimal timeout with clear justification
test('debounce waits 100ms before executing', async () => {
  debouncedFn();
  // Need 100ms + small margin for debounce logic
  await new Promise(resolve => setTimeout(resolve, 120));
  expect(executionCount).toBe(1);
});

// ❌ BAD: Excessive timeout "to be safe"
test('debounce waits 100ms before executing', async () => {
  debouncedFn();
  // 1000ms is 10x the debounce time!
  await new Promise(resolve => setTimeout(resolve, 1000));
  expect(executionCount).toBe(1);
});
```

**Timeout Estimation Formula**:

```
Safe Timeout = (Expected Duration × 1.5) + Fixed Overhead

Examples:
- Server startup (50-200ms typical): 200 × 1.5 + 50 = 350ms
- Database query (10-50ms typical): 50 × 1.5 + 25 = 100ms
- HTTP request (100-500ms typical): 500 × 1.5 + 100 = 850ms
- Debounce (100ms): 100 × 1.5 + 20 = 170ms
```

**Benefits of Event-Driven Testing**:
- ✅ **Faster**: Tests complete in actual time needed, not arbitrary delay
- ✅ **Reliable**: No race conditions from "guessing" how long to wait
- ✅ **Deterministic**: Tests pass/fail based on logic, not timing luck
- ✅ **Clear**: Intent is obvious (waiting for specific event, not random delay)

**When Timeouts Are Acceptable**:
- Testing timeout behavior itself (e.g., "request fails after 5s")
- Testing debounce/throttle logic that requires time-based delays
- Polling intervals where event emission isn't available
- Testing race conditions or timing-sensitive bugs

**Audit Your Tests**:
```bash
# Find tests using setTimeout (candidates for event-based replacement)
grep -r "setTimeout" src/**/__tests__/**/*.test.js

# Look for common patterns to replace:
# - server.listen() followed by setTimeout
# - Database operations followed by setTimeout
# - HTTP requests with setTimeout instead of await
```

---

## 🎯 CURRENT FOCUS: Feature Development & Bug Fixes (October 2025)

**Status**: ✅ Core infrastructure complete - active feature development  
**Next**: Continue with background tasks, UI improvements, and optimizations

---

## 🤖 AI Agent Guide: Large-Scale Refactoring

This section provides explicit guidance for AI agents working on major refactoring projects, encouraging autonomous decision-making and systematic progress toward a clean codebase.

**⚠️ CRITICAL: Tests Are Mandatory for All Code Changes**

Before implementing any feature, refactoring, or bug fix:
1. ✅ **Search for existing tests** that cover the code you'll modify
2. ✅ **Plan new tests** for functionality you'll add
3. ✅ **Write tests alongside code** (not after implementation)
4. ✅ **Verify all tests pass** before marking work complete

**If you create a new file, create a test file. If you modify an endpoint, update/create tests. If you can't mark tests complete, the feature isn't complete.**

### Testing Workflow: "Tests Are Part of Implementation"

**CRITICAL RULE**: Tests are not a separate phase after implementation. They are an integral part of feature development.

**When to Check/Update Tests** (MANDATORY for ALL code changes):

```
✅ BEFORE starting implementation:
   - Search for existing tests related to code you'll modify
   - Understand current test patterns and coverage
   - Plan what new tests will be needed

✅ DURING implementation:
   - Write tests alongside code (not after)
   - For new APIs: Create API integration tests
   - For new classes: Create unit tests
   - For new services: Create service tests with mocks

✅ AFTER implementation (BEFORE marking complete):
   - Run affected tests to verify nothing broke
   - Create tests for any new functionality
   - Update tests if behavior changed
   - Verify all tests pass
   - ONLY THEN mark work as complete
```

**Test-First Development Pattern**:

```
FOR NEW FEATURES:

1. Check existing test coverage
   - grep_search for test files: **/__tests__/**<feature>*.test.js
   - Read existing tests to understand patterns
   - Identify gaps in coverage

2. Design tests FIRST (before implementation)
   - What APIs/methods will be added?
   - What behavior needs verification?
   - What edge cases must be handled?

3. Create test stubs/structure
   - Create test file with describe blocks
   - Write test case names (can be empty)
   - This clarifies what you're building

4. Implement feature incrementally
   - Write code to make one test pass
   - Run that test
   - Move to next test
   - Keep tests passing throughout

5. Complete implementation
   - All planned tests passing
   - Coverage is comprehensive
   - Edge cases handled
   - NOW feature is complete
```

**Test Creation Checklist** (Use this for EVERY feature/change):

```
□ Searched for existing tests that might be affected
□ Created/updated unit tests for new/modified classes
□ Created/updated API tests for new/modified endpoints  
□ Created/updated integration tests for cross-component features
□ Verified tests pass locally (npm test or npm run test:file)
□ Tests use mocking where appropriate (see Mocking Strategy below)
□ Test files follow project naming conventions (__tests__/*.test.js)
□ Tests are documented with clear descriptions
```

**Mocking Strategy**: When and How to Mock

**✅ PREFER MOCKING FOR**:
- **Unit tests** - Testing single class/function in isolation
- **External dependencies** - Databases, APIs, file systems
- **Time-consuming operations** - Network requests, large computations
- **Non-deterministic behavior** - Random values, timestamps, external state
- **Error scenarios** - Simulating failures that are hard to trigger

**❌ AVOID MOCKING FOR**:
- **Integration tests** - Testing actual interaction between components
- **Simple utilities** - Pure functions with no side effects
- **Critical paths** - Core business logic that must work correctly
- **When real thing is fast** - No performance benefit from mocking

**Mocking Patterns**:

```javascript
// ✅ GOOD: Mock external database for unit test
describe('AnalysisTask', () => {
  it('should count articles needing analysis', async () => {
    const mockDb = {
      prepare: jest.fn(() => ({
        get: jest.fn(() => ({ count: 10 }))
      }))
    };
    
    const task = new AnalysisTask({ db: mockDb, config: {} });
    // Test logic without real database
  });
});

// ✅ GOOD: Mock background task manager for API test
describe('POST /api/analysis/start-background', () => {
  it('should handle missing backgroundTaskManager', async () => {
    // Don't initialize backgroundTaskManager
    const app = createApp({ dbPath, skipBackgroundTasks: true });
    
    const res = await request(app)
      .post('/api/analysis/start-background')
      .expect(503);
    // Tests error handling without full system
  });
});

// ❌ BAD: Real database when mock would work
describe('AnalysisTask', () => {
  beforeEach(() => {
    // Creates temp DB, initializes schema, seeds data
    // Slow, fragile, unnecessary for unit test
    db = createRealDatabase();
  });
  
  it('should parse config correctly', () => {
    const task = new AnalysisTask({ db, config: { version: 2 } });
    expect(task.analysisVersion).toBe(2);
    // Test doesn't use DB, but we initialized it anyway
  });
});

// ✅ GOOD: Real database for integration test
describe('POST /api/analysis/start', () => {
  beforeEach(() => {
    // Integration test NEEDS real DB to verify end-to-end flow
    dbPath = createTempDb();
    app = createApp({ dbPath });
  });
  
  it('should process articles and store results', async () => {
    seedArticles(db, 10);
    await request(app).post('/api/analysis/start').expect(200);
    
    // Verify actual database state
    const analyzed = db.prepare('SELECT * FROM articles WHERE analysis IS NOT NULL').all();
    expect(analyzed.length).toBeGreaterThan(0);
  });
});
```

**Risk Assessment for Mocking**:

```
🟢 RISK-FREE MOCKING (Always safe):
- Database connections in unit tests
- HTTP clients in unit tests
- File system operations in unit tests
- External service APIs
- Time/date functions (Date.now, setTimeout)
- Random number generators

🟡 MODERATE RISK (Mock carefully):
- Core business logic (might miss integration bugs)
- Internal service calls (might diverge from real behavior)
- State management (might miss race conditions)

🔴 HIGH RISK (Avoid mocking):
- Critical algorithm implementations
- Security/auth logic
- Data validation logic
- Error handling paths that must work in production
```

**When Tests Fail During Implementation**:

```
CRITICAL: Do NOT mark feature complete if tests are failing

1. Examine test failure output carefully
   - What test failed?
   - What was expected vs actual?
   - Is it your new code or existing code?

2. Debug the failure
   - Is your implementation wrong?
   - Is the test wrong?
   - Did you break existing functionality?

3. Fix the root cause
   - Update implementation if logic is wrong
   - Update test if expectations changed
   - Revert changes if you broke existing features

4. Verify fix
   - Run the specific test that failed
   - Run full test suite to check for ripple effects
   - ALL tests must pass

5. ONLY THEN continue or mark complete
```

**Why This Matters**:

In the recent background task integration:
- ✅ Implemented AnalysisTask class (330 lines)
- ✅ Added /api/analysis/start-background endpoint
- ✅ Registered with BackgroundTaskManager
- ✅ Documented in ANALYSIS_AS_BACKGROUND_TASK.md
- ❌ Did NOT check existing tests
- ❌ Did NOT create tests for new functionality
- ❌ User had to request: "Review tests to ensure they cover what we have now"

**What Should Have Happened**:
1. Implement AnalysisTask class → **IMMEDIATELY create AnalysisTask.test.js**
2. Add new API endpoint → **IMMEDIATELY create tests in analysis.new-apis.test.js**
3. Integrate with BackgroundTaskManager → **IMMEDIATELY verify existing tests pass**
4. Run `npm run test:file "AnalysisTask"` → **BEFORE marking work complete**
5. User sees: "Implemented AnalysisTask + tests (all passing)" → **No follow-up needed**

**Rule of Thumb**: If you created a new file, there should be a corresponding test file. If you modified an endpoint, there should be tests covering that endpoint. If you can't mark tests as complete, the feature isn't complete.

### Documentation Hygiene: "Code First, Document Last"

**CRITICAL RULE**: AGENTS.md is for **CURRENT** and **FUTURE** work, not historical archives.

**When a major initiative completes**:
1. ✅ Mark COMPLETED phases with completion date
2. ❌ **DELETE** implementation details for COMPLETED phases only
3. ✅ **KEEP** incomplete phases that guide future work
4. ✅ **KEEP** high-level principles, patterns, or lessons learned
5. ✅ Move detailed retrospectives to separate docs (e.g., `docs/REFACTORING_RETROSPECTIVE.md`)

**Example of what to DELETE**:
- ❌ Completed phase implementation checklists (Phase 1-6 all marked ✅)
- ❌ "High-Impact Refactoring Targets" lists when refactoring is done
- ❌ Specific line numbers and code examples for completed work
- ❌ Weekly progress tracking for finished initiatives
- ❌ Completed task metrics and status updates

**Example of what to KEEP**:
- ✅ Incomplete phases and pending tasks (Phase 3-4 marked ⏳)
- ✅ Roadmaps with future work planned
- ✅ AI agent decision-making frameworks (🟢/🟡/🔴)
- ✅ Reusable refactoring patterns (Read-First, Match-Existing)
- ✅ Lessons learned about architectural patterns
- ✅ Tools and workflows for future initiatives
- ✅ Current priorities and active work

**Critical Distinction**:
- "Deliverables from Performance Investigation" with Phases 1-2 ✅ COMPLETE and Phases 3-4 ⏳ PLANNED → **KEEP** (active roadmap)
- "Lang-Tools Refactoring Phases 1-6" all marked ✅ COMPLETE → **DELETE** (no future work planned)

**Why This Matters**:
- AGENTS.md becomes unusable when bloated with historical content
- Agents waste tokens reading completed work instead of current priorities
- User request ambiguity ("update AGENTS.md to reflect this") defaults to additive approach
- **Solution**: Explicitly delete completed details, don't just mark them complete

**Root Cause Analysis** (October 2025):
When Lang-Tools Refactoring completed, agent added "COMPLETE" markers but left 600+ lines of Phase 1-6 details intact. User request "update AGENTS.md to reflect completion" was interpreted as "add status" not "remove content." This created documentation debt that required explicit cleanup request.

---

### Communication Guidelines: Concise Summaries

**CRITICAL: Keep Status Updates and Summaries Brief**

When completing tasks or providing updates, use **minimal, focused communication**:

**✅ GOOD: Concise Summary (1-2 sentences)**
```
Updated AGENTS.md with timeout optimization guidelines. Agents will now use 2-4s 
timeouts for rapid iteration instead of 10-60s, enabling 2-3x faster development.
```

**❌ BAD: Excessive Summary (multi-section, bullet-heavy)**
```
## Summary of Changes ✅

### 1. Added "Timeout Optimization Strategy"
**Key Guidelines**:
- ✅ PREFERRED: 2-4 seconds
- ⚠️ ACCEPTABLE: 5-8 seconds
[...50+ more lines...]

### 2. Added "Event-Driven Testing"
[...detailed breakdown...]

### 3. Performance Improvement Demonstrated
[...before/after comparison...]
```

**Length Guidelines**:
- ✅ **Simple tasks**: 1 sentence ("Created server.js wrapper in root directory.")
- ✅ **Moderate tasks**: 1-2 sentences ("Fixed npm argument forwarding issue. Created gui:detached script that accepts timeout as positional argument.")
- ✅ **Complex tasks**: 1-2 short paragraphs (3-5 sentences max)
- ❌ **Never**: Multi-section summaries with headers, bullet lists, tables, or "before/after" comparisons

**When to Elaborate**:
- User explicitly asks for details ("explain what you did")
- Debugging complex issues that need context
- Documenting breaking changes or architectural decisions
- **NOT** for routine task completion

**Rule of Thumb**: If your summary has markdown headers (##, ###), it's too long.

---

### Core Philosophy: "Read-First, Match-Existing"

When approaching refactoring work, **always follow this pattern**:

1. **📖 Read Existing Code FIRST** - Fully understand current architecture before designing changes
2. **🔍 Assess If Refactoring Needed** - Don't refactor code that's already well-architected
3. **🎯 Design to Match Existing Contracts** - Fit your changes to existing patterns, don't force new ones
4. **✅ Test in Isolation** - Create and test services independently before integration
5. **🔄 Integrate Incrementally** - One method/endpoint at a time, tests passing at each step
6. **🧹 Clean Up** - Delete dead code only after proving replacement works

### When to Refactor vs When to Leave Alone

**DO refactor when**:
- ❌ Routes contain 300+ lines of business logic that belongs in services
- ❌ Repeated code patterns across multiple files (DRY violation)
- ❌ Tight coupling makes testing difficult (can't test without full system)
- ❌ God classes mixing multiple unrelated responsibilities
- ❌ Error handling is inconsistent or missing

**DON'T refactor when**:
- ✅ Code is already well-factored (thin controllers, clean helpers)
- ✅ Coordinator classes properly delegate to services (length is acceptable)
- ✅ Tests are passing and code is maintainable
- ✅ Patterns are consistent across the codebase
- ✅ Your proposed service doesn't match existing architecture

**Critical Rule**: If you create a service and discover it doesn't fit the existing architecture, **delete it** rather than forcing integration. The mistake in this project: created AnalysisCoordinationService without reading api.analysis-control.js first. Solution: Deleted service, read existing code, discovered it was already well-factored.

### Large-Scale Refactoring Workflow (AI Agent Instructions)

When given a large refactoring task (e.g., "refactor 10 routes to use services"), follow this systematic workflow:

#### Phase 1: Assessment (Read Everything First)

```
GOAL: Understand current state before making any changes

1. Read all files in scope (don't skip this!)
   - Examine structure, patterns, dependencies
   - Note what's already clean vs what needs work
   - Document existing architectural patterns

2. Create assessment summary
   - Files that need refactoring: [list with reasons]
   - Files already clean: [list - NO WORK NEEDED]
   - Architectural patterns to match: [document]

3. Make go/no-go decisions
   - If file already clean → SKIP IT (mark complete)
   - If file needs work → Add to work queue
   - If unclear → Read more code until clear
```

**Example Assessment Output**:
```markdown
Assessment: api.problems.js (52 lines)
├── Structure: Thin controller, delegates to fetchProblems()
├── Error handling: Clean InternalServerError usage
├── Tests: Passing
└── DECISION: ✅ Already clean - NO REFACTORING NEEDED
```

#### Phase 2: Autonomous Execution (Work Without Asking)

**For AI Agents: You have permission to proceed autonomously through refactoring work. DO NOT ask for approval at each step unless there's an essential architectural decision.**

```
GOAL: Make steady progress with minimal human interruption

FOR EACH FILE IN WORK QUEUE:

1. Design service (if needed)
   - Match existing architectural patterns
   - Identify clear responsibility boundaries
   - Plan incremental integration path

2. Create service + comprehensive tests (MANDATORY)
   - Write service implementation
   - Write 20-40 unit tests (high coverage)
   - Use mocking for external dependencies (DB, network, file system)
   - Run service tests in isolation
   - ALL TESTS MUST PASS before proceeding

3. Check existing tests that might be affected
   - Search for tests covering code you're modifying
   - Read tests to understand expected behavior
   - Identify tests that will need updates

4. Integrate service incrementally
   - ONE method at a time (not all at once)
   - Update affected tests for each method
   - Run full test suite after each integration
   - If tests fail → fix immediately, don't continue
   - Commit after each successful integration

5. Delete old code (only after proving replacement)
   - Comment out old code first
   - Run tests with new code
   - If tests pass → delete commented code
   - If tests fail → restore old code, debug new code

6. Verify test coverage is complete
   - New service has unit tests ✓
   - Modified endpoints have API tests ✓
   - Integration scenarios covered ✓
   - All tests passing ✓

7. Move to next file
   - Don't wait for approval
   - Continue systematically through work queue
```

**Testing Strategy During Large Refactoring**:

```
WHEN TO RUN TESTS:

✅ After creating new service (isolated unit tests)
✅ After integrating first method (full test suite)
✅ After completing each file (full test suite)
✅ After completing all work (full test suite + manual smoke test)

❌ NOT after every single line change
❌ NOT after every small edit
❌ NOT excessively (trust your unit tests)

FOCUS ON: Steady progress with checkpoint validation

CRITICAL: User will Ctrl+C if tests hang or take too long
- Tests should complete in ~70 seconds
- If tests appear to hang, user will interrupt
- Check test-timing-*.log files for results instead of re-running

TIMEOUT SELECTION FOR MANUAL TESTING:
- ✅ Use 2-4 second timeouts for rapid iteration (5-10 tests/minute)
- ✅ Server startup verification: 2-3 seconds is sufficient
- ✅ Feature checks: 2-5 seconds allows fast feedback
- ❌ Avoid 10+ second timeouts unless truly necessary
- ❌ Never use 20-60 second timeouts for simple checks

MOCKING STRATEGY:
✅ Mock database connections in unit tests (fast, isolated)
✅ Mock external APIs in unit tests (no network dependency)
✅ Mock file system in unit tests (no side effects)
✅ Use real DB in integration tests (verify actual behavior)
```

#### Phase 3: Batch Testing & Cleanup

```
GOAL: Validate all changes work together, clean up artifacts

1. Run full test suite
   - npm test (all tests)
   - Review any failures
   - Fix failures systematically

2. Verify integration
   - Check imports are correct
   - Verify no unused code remains
   - Confirm error handling works

3. Update documentation (only at end)
   - Update AGENTS.md with completion status
   - Document any new patterns introduced
   - Record metrics (lines reduced, tests added)

4. Commit final changes
   - One commit per completed file/service
   - Clear commit messages
   - Don't ask before committing
```

#### Autonomous Test Fixing Workflow

**CRITICAL**: When tests fail, work autonomously with minimal user interaction.

```
Fix tests systematically without status updates:

1. Run tests → Analyze ALL failures at once
2. Fix issues silently (test bugs vs implementation bugs)
3. Run tests again → Repeat until all pass
4. Report ONCE: "Fixed N tests. Issues: [brief list]. All passing."

REPORT ONLY WHEN:
✅ All tests passing (1 paragraph summary)
✅ Genuinely blocked (specific question)
✅ Critical design flaw needing decision

DO NOT REPORT:
❌ After each individual fix
❌ Progress updates mid-work
❌ Multi-paragraph explanations
❌ Detailed failure analysis
```

### Test Console Output Guidelines

**CRITICAL**: Keep test console output minimal (~100 lines max, ideally <50).

**Console Truncation System** (jest.setup.js):
- Wraps console.log/warn/error in beforeEach
- Applies DROP_PATTERNS regex filters to suppress common noise
- Limits per-test output: 15 lines max, 800 chars max, 150 chars per line
- **If tests produce >100 lines**: Add patterns to DROP_PATTERNS or reduce verbosity

**Current Configuration** (as of October 2025):
```javascript
MAX_LINES: 15              // Drop everything after 15 lines per test
MAX_LINE_LEN: 150          // Truncate lines longer than 150 chars
MAX_TOTAL_CHARS: 800       // Drop output if total exceeds 800 chars

DROP_PATTERNS: [
  /^\[AnalysisTask\]/i,              // Background task logs
  /^\[BackgroundTaskManager\]/i,     // Task manager logs
  /Could not count articles/i,       // Known AnalysisTask warnings
  /at .* \(.*:\d+:\d+\)$/,          // Stack trace lines
  /at Layer\.handleRequest/,         // Express middleware traces
  // ... 30+ more patterns
]
```

**Writing Test-Friendly Code**:
```javascript
✅ GOOD: Pass verbose: false to suppress server logs
const app = createApp({ dbPath, verbose: false });

✅ GOOD: Use silent: true for background tasks
const manager = new BackgroundTaskManager({ db, silent: true });

✅ GOOD: Wrap noisy operations in tests
if (!process.env.JEST_WORKER_ID) {
  console.log('[AnalysisTask] Processing...');
}

❌ BAD: Unconditional logging in libraries
console.warn('[AnalysisTask] Could not count articles');  // Appears in every test

❌ BAD: Full stack traces without necessity
console.error('Error:', error);  // Logs 50+ lines of Express internals
```

**When Tests Are Too Noisy**:
1. **Check DROP_PATTERNS first**: Add patterns to jest.setup.js
2. **Add verbose: false to tests**: Suppress server/manager logs at source
3. **Reduce limits if needed**: Lower MAX_LINES or MAX_TOTAL_CHARS
4. **Test the fix**: Run test to verify <100 lines output

**Example Pattern Additions**:
```javascript
// Add to DROP_PATTERNS in jest.setup.js
/Your noisy message here/i,                 // Exact message
/^\[YourClassName\]/i,                      // All logs from class
/specific error text/i,                     // Specific errors
/at YourModule\./,                          // Stack traces from module
```

**Why This Matters**:
- User complained: "tests outputted far too much to the console"
- Excessive output makes test results unreadable
- Developers need to see actual failures, not noise
- 500+ lines of output per test run is unacceptable
- Target: <100 lines for full test suite (ideally <50)

### Decision-Making Framework for AI Agents

When faced with decisions during refactoring, use this framework:

**🟢 PROCEED AUTONOMOUSLY (No approval needed)**:
- Creating services that match existing patterns
- Writing comprehensive unit tests
- Integrating code incrementally with tests passing
- Fixing test failures caused by your changes
- Deleting dead code after replacement is proven
- Moving to next file in work queue
- Committing completed work
- **CONTINUING IMPLEMENTATION WITHOUT DOCUMENTATION**: Keep coding, skip progress docs/summaries during active work
- **PROVIDING BRIEF SUMMARIES**: 1-2 sentences when work completes (not multi-section explanations)
- **RESUMING IMPLEMENTATION AFTER DOCUMENTATION**: When user requests AGENTS.md updates mid-feature, complete the documentation work then immediately return to TODO list unless user indicates otherwise
- **CONTINUING AFTER SUMMARIES**: After providing completion summary, immediately continue with next TODO item - don't wait for user confirmation

**🟡 THINK CAREFULLY (Assess first, then proceed)**:
- Service doesn't match existing architecture → DELETE IT, read more, try again
- Tests failing unexpectedly → DEBUG, don't continue until fixed
- File is already clean → SKIP IT, mark complete, move on
- Uncertain about approach → READ MORE CODE until clarity emerges

**🔴 ASK FOR HUMAN DECISION (Essential architectural questions)**:
- Major architectural pattern changes (e.g., switching from callbacks to promises)
- Breaking changes to public APIs
- Performance trade-offs with unclear implications
- Deprecating widely-used functionality
- Choosing between multiple valid approaches with different trade-offs

### Example: Autonomous Refactoring Session

**Task**: "Refactor 5 routes to use service layer"

**AI Agent Execution** (no human interruption):

```
[Hour 1-2] Assessment Phase
- Read all 5 routes
- Route 1: 400 lines, needs service extraction
- Route 2: 55 lines, already clean → SKIP
- Route 3: 300 lines, needs service extraction  
- Route 4: 60 lines, already clean → SKIP
- Route 5: 450 lines, needs service extraction
- Decision: Work on routes 1, 3, 5 only

[Hour 3-4] Route 1 Implementation
- Create OrderProcessingService (350 lines, 35 tests)
- Run service tests: 35/35 passing ✅
- Integrate createOrder method: tests passing ✅
- Integrate updateOrder method: tests passing ✅
- Integrate deleteOrder method: tests passing ✅
- Delete old code: tests passing ✅
- Commit: "refactor(orders): extract OrderProcessingService"

[Hour 5-6] Route 3 Implementation
- Create PaymentService (280 lines, 28 tests)
- Run service tests: 28/28 passing ✅
- Integrate processPayment method: tests passing ✅
- Integrate refundPayment method: tests passing ✅
- Delete old code: tests passing ✅
- Commit: "refactor(payments): extract PaymentService"

[Hour 7-9] Route 5 Implementation
- Create ReportGenerationService (420 lines, 40 tests)
- Run service tests: 40/40 passing ✅
- Integrate generateReport method: 2 tests FAILING ❌
- Debug: Missing parameter in service method signature
- Fix service + tests: 40/40 passing ✅
- Integrate again: tests passing ✅
- Integrate scheduleReport method: tests passing ✅
- Delete old code: tests passing ✅
- Commit: "refactor(reports): extract ReportGenerationService"

[Hour 10] Final Validation
- Run full test suite: npm test
- All 850 tests passing ✅
- Update AGENTS.md with completion status
- Commit: "docs: mark route refactoring complete"

TASK COMPLETE - 3 services created, 2 routes skipped (already clean)
Total time: 10 hours, 0 questions asked
```

### PowerShell Command Complexity Guidelines

**CRITICAL: Avoid Complex PowerShell Commands That Require Approval**

When making file edits during iterative testing, agents must avoid complex PowerShell commands that require user approval. These commands trigger VS Code's approval dialog and interrupt the workflow.

**❌ Commands That Require Approval**:
```powershell
# Complex regex replace with Get-Content/Set-Content pipeline
(Get-Content "file.js") -replace 'pattern', 'replacement' | Set-Content "file.js"

# Multi-line commands with backticks or line breaks
Get-Content "file.js" `
  -replace 'pattern1', 'replacement1' `
  -replace 'pattern2', 'replacement2' | Set-Content "file.js"

# Commands with complex escaping or nested quotes
(Get-Content "file.js") -replace 'const config = JSON\.parse\(taskRes\.body\.task\.config\);', 'const config = taskRes.body.task.config; // Already parsed by API' | Set-Content "file.js"
```

**✅ Use These Instead**:
```javascript
// Option 1: replace_string_in_file tool (PRIMARY CHOICE - 95% of cases)
replace_string_in_file({
  filePath: "file.js",
  oldString: "const config = JSON.parse(taskRes.body.task.config);",
  newString: "const config = taskRes.body.task.config; // Already parsed"
})

// Option 2: Multiple sequential replacements (if pattern appears multiple times)
replace_string_in_file({ filePath, oldString: "pattern1", newString: "replacement1" })
replace_string_in_file({ filePath, oldString: "pattern2", newString: "replacement2" })

// Option 3: create_file to overwrite (ONLY if rewriting entire file is simpler)
// Rare scenario: >50% of file content changing
create_file({ filePath: "file.js", content: "entire new file content..." })
```

**Available Editing Tools Research** (October 2025):
- ✅ **replace_string_in_file** - Direct VS Code API, never requires approval, handles exact string replacement
- ✅ **create_file** - Can overwrite existing files, useful for massive rewrites (rare)
- ❌ **edit_files** - Placeholder tool marked "do not use" (may be enabled in Edit2 mode)
- ❌ **edit_notebook_file** - Only for Jupyter notebooks (.ipynb)
- ❌ **run_in_terminal** - PowerShell commands trigger approval dialogs
- ❌ **MCP tools** - GitHub/Context7 MCPs are for repository ops and docs, not local file editing

**Edit2 Mode** (October 2025):
VS Code has an "Edit2" option that changes editing tool behavior. This mode:
- Requires tool-calling capabilities
- May enable additional editing interfaces (e.g., `edit_files` tool)
- Can be toggled in VS Code settings
- May require new conversation session to take effect
- **Current status**: Investigating tool availability in Edit2 mode
- **Recommendation**: Until Edit2 capabilities are confirmed, continue using `replace_string_in_file` as primary editing method

**Why `replace_string_in_file` Doesn't Require Approval**:
- Uses VS Code's internal file editing API
- No shell command execution
- No regex parsing complexity
- Validation built into the tool

**Why PowerShell Commands DO Require Approval**:
- Shell command execution with potential side effects
- Complex regex patterns with escaping
- Piping through Get-Content/Set-Content
- String interpolation and special characters

**When Tempted to Use Complex PowerShell**:
1. ✅ **Use `replace_string_in_file` tool instead** (PRIMARY - 95% of cases)
2. ✅ If pattern appears multiple times, call `replace_string_in_file` sequentially
3. ✅ If unsure about pattern match, read file first to verify exact string
4. ✅ If rewriting >50% of file, consider `create_file` to overwrite (rare)
5. ❌ **NEVER** use Get-Content piped to Set-Content for code changes
6. ❌ **NEVER** use complex regex in PowerShell commands
7. ❌ **NEVER** assume there's a magic tool you haven't seen - `replace_string_in_file` IS the tool

**Additional Commands That Require Approval** (October 2025):
```powershell
# ❌ WRONG: Complex multi-command pipelines
Start-Job -ScriptBlock { ... } | Out-Null; Start-Sleep -Seconds 3; curl http://...

# ❌ WRONG: Commands with multiple stages, sleeps, and conditionals
Start-Sleep -Seconds 5; (Invoke-WebRequest -Uri http://... -UseBasicParsing).Content

# ❌ WRONG: Chained commands with semicolons and complex expressions
command1; Start-Sleep -Seconds N; command2 | ConvertFrom-Json | Select-Object

# ✅ RIGHT: Simple, single-purpose commands
Test-Path "file.js"
Get-Content "file.log" | Select-Object -Last 20
node server.js --detached --auto-shutdown-seconds 10

# ✅ RIGHT: Use tools instead of complex shell commands
# Instead of: curl + ConvertFrom-Json + Select-Object
# Read log files or check server output via get_terminal_output
```

**When Testing Servers or APIs**:
- ✅ Start server with `--detached --auto-shutdown-seconds N` (simple command)
- ✅ Check server logs via `get_terminal_output` tool (no HTTP request needed)
- ✅ Read existing log files instead of making live API calls
- ❌ Don't chain Start-Sleep with HTTP requests (requires approval)
- ❌ Don't use Start-Job with complex scriptblocks (requires approval)
- ❌ Don't try to test APIs in the same command that starts the server

**Example From This Session**:
```powershell
# ❌ REQUIRED APPROVAL (complex regex, special chars, long line)
(Get-Content "analysis.new-apis.test.js") -replace 'const config = JSON\.parse\(taskRes\.body\.task\.config\);', 'const config = taskRes.body.task.config; // Already parsed by API' | Set-Content "analysis.new-apis.test.js"

# ✅ NO APPROVAL NEEDED (tool-based, researched October 2025)
replace_string_in_file({
  filePath: "analysis.new-apis.test.js",
  oldString: "const config = JSON.parse(taskRes.body.task.config);",
  newString: "const config = taskRes.body.task.config; // Already parsed"
})
```

---

### Database Architecture and Connection Management

**CRITICAL: SQLite WAL Mode Connection Isolation**

This project uses **SQLite in WAL (Write-Ahead Log) mode** with **better-sqlite3**. Understanding connection isolation is critical for writing correct tests.

**Key Facts About SQLite in This Project**:
1. **WAL Mode Enabled**: All databases use `pragma('journal_mode = WAL')`
2. **Connection Isolation**: Each `new Database(path)` creates an isolated connection
3. **Writes Are Isolated**: Writes on Connection A not visible to Connection B until checkpoint
4. **Single Connection Pattern**: Tests MUST use app's shared connection, not create separate ones

**Database Library**: `better-sqlite3`
- Synchronous API (no promises needed)
- Each instance is a separate database connection
- WAL mode means multiple connections see isolated snapshots

**Where Databases Are Created**:
```javascript
// src/db/sqlite/ensureDb.js
const Database = require('better-sqlite3');
function ensureDb(dbPath, options = {}) {
  const db = new Database(dbPath, options);
  db.pragma('journal_mode = WAL'); // ← WAL mode enabled here
  // ... initialize schema
  return db;
}

// src/ui/express/server.js (via getDbRW)
function getDbRW() {
  if (!dbRW) {
    dbRW = ensureDb(urlsDbPath); // Creates connection
  }
  return dbRW;
}

// BackgroundTaskManager (via createApp)
app.locals.backgroundTaskManager = new BackgroundTaskManager({
  db: getDbRW() // Uses SAME connection as routes
});
```

**❌ WRONG: Multiple Connections in Tests (WAL Isolation)**:
```javascript
beforeEach(() => {
  dbPath = createTempDb();
  
  // Connection 1 (for seeding)
  const db = ensureDb(dbPath);
  seedArticles(db, 10);
  db.close();
  
  // Connection 2 (app's connection, created by getDbRW)
  app = createApp({ dbPath });
  
  // ❌ PROBLEM: Task created via Connection 2 not visible to Connection 2
  //    because seeding used Connection 1 (different snapshot!)
});
```

**✅ RIGHT: Single Shared Connection**:
```javascript
beforeEach(() => {
  dbPath = createTempDb();
  
  // Let app create THE ONLY connection
  app = createApp({ dbPath, verbose: false });
  
  // Use app's connection for ALL database operations
  const db = app.locals.backgroundTaskManager.db;
  seedArticles(db); // Same connection as app uses
  // Don't close - let app manage it
});
```

**Why This Caused Test Failures**:
- Tests created task via POST (writes to Connection A)
- Tests queried task via GET (reads from Connection A, but different snapshot)
- SQLite WAL mode isolated the write until checkpoint
- Solution: Use same connection for seeding and queries

**Database Schema Locations**:
- `src/db/sqlite/ensureDb.js` - Main schema initialization
- `src/db/sqlite/SQLiteNewsDatabase.js` - Articles table (40+ columns)
- Tables: articles, analysis_runs, background_tasks, gazetteer_*, crawl_types, etc.

**Test Database Helpers**:
```javascript
// ✅ Create temp DB path (file only, no connection)
function createTempDb() {
  const tmpDir = path.join(os.tmpdir(), 'test-name');
  fs.mkdirSync(tmpDir, { recursive: true });
  const unique = `${process.pid}-${Date.now()}-${Math.random()}`;
  return path.join(tmpDir, `test-${unique}.db`);
}

// ✅ Use app's connection for seeding
beforeEach(() => {
  app = createApp({ dbPath: createTempDb() });
  const db = app.locals.backgroundTaskManager.db;
  // Now seed using db
});

// ✅ Clean up WAL files in afterEach
afterEach(() => {
  const suffixes = ['', '-shm', '-wal'];
  for (const suffix of suffixes) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
});
```

**Router Instantiation Bug** (Fixed October 2025):
```javascript
// ❌ WRONG: Router created at module level
const router = express.Router(); // Shared across all calls!
function createBackgroundTasksRouter(taskManager) {
  router.get('/:id', ...); // Routes added to SAME router
  return router;
}

// ✅ RIGHT: Router created per invocation
function createBackgroundTasksRouter(taskManager) {
  const router = express.Router(); // Fresh router per call
  router.get('/:id', ...);
  return router;
}
```

**Summary**: Always use app's shared DB connection in tests. Never create separate connections in WAL mode.

---

### Anti-Patterns to Avoid

**❌ Don't Do This**:
- ❌ Creating services without reading existing code first
- ❌ Forcing new patterns when existing code already works
- ❌ **Creating UI files without checking project structure** ← NEW (ProposedActionsPopup mistake)
- ❌ **Creating CSS files when project uses SCSS/SASS** ← NEW
- ❌ Asking for approval at every tiny step
- ❌ Running tests after every single-line edit
- ❌ Continuing integration when tests are failing
- ❌ Leaving commented-out dead code after proving replacement
- ❌ Creating progress documents during active feature implementation
- ❌ Writing summaries or status docs when you should be coding
- ❌ **Writing multi-section summaries with headers, bullets, and tables**
- ❌ Calling async prerequisites without await (fire-and-forget when order matters)
- ❌ **Implementing features without creating tests** ← CRITICAL MISTAKE
- ❌ **Marking work "complete" when tests don't exist or are failing**
- ❌ **Using real database/network in unit tests when mocking would work**
- ❌ **Waiting for user to request test coverage review**
- ❌ **Using complex PowerShell commands that require user approval**
- ❌ **Creating separate database connections in tests (WAL isolation issues)**

**✅ Do This Instead**:
- ✅ Read existing code completely before designing
- ✅ Match existing architectural patterns
- ✅ **Check project structure FIRST (file_search, package.json, existing patterns)** ← NEW
- ✅ **Use SCSS partials in `partials/` directory, import in main file** ← NEW
- ✅ Work autonomously through systematic workflow
- ✅ Run tests at strategic checkpoints (after services, after integration, at end)
- ✅ Stop and fix when tests fail
- ✅ Delete dead code promptly after replacement proven
- ✅ Update documentation only at completion
- ✅ **Keep summaries to 1-2 sentences (or 1-2 short paragraphs max)**
- ✅ Make prerequisite functions async and await them (if X must finish before Y, await X)
- ✅ **Create tests alongside implementation, not after** ← CORRECT APPROACH
- ✅ **Search for existing tests before modifying code**
- ✅ **Use mocking for unit tests (DB, network, file system)**
- ✅ **Verify all tests pass before marking work complete**
- ✅ **Use `replace_string_in_file` tool instead of PowerShell regex**
- ✅ **Use app's shared DB connection in tests (never create separate connections)**

### Handling Mistakes During Refactoring

**Mistake: Created CSS file instead of SCSS** (ProposedActionsPopup, October 2025)

```
WRONG RESPONSE:
- Jump straight to creating CSS file
- Don't check existing styling system
- Assume CSS is correct format

RIGHT RESPONSE:
1. Search for existing style files: file_search "**/*.scss"
2. Check package.json: grep for "sass", "styles", "css"
3. Examine style directory structure (src/ui/express/public/styles/)
4. Read main style file to understand import patterns
5. Create _partial-name.scss in partials/ directory
6. Import in main ui.scss file
7. Run npm run sass:build to compile
8. Verify compiled CSS appears in public/ directory
9. Learn: Always check project structure FIRST
```

**Mistake: Implemented feature without creating tests**

```
WRONG RESPONSE:
- Assume tests will be added later
- Mark feature as complete without tests
- Wait for user to request test coverage

RIGHT RESPONSE:
1. Stop implementation immediately
2. Search for existing tests related to your changes
3. Create test file(s) for new functionality
4. Write comprehensive test cases covering:
   - Happy path scenarios
   - Edge cases
   - Error handling
   - Integration with existing systems
5. Run tests and verify they pass
6. ONLY THEN mark feature as complete
7. Learn: Tests are PART of implementation, not separate
```

**Mistake: Created service that doesn't fit architecture**

```
WRONG RESPONSE:
- Try to force service into existing code
- Modify existing code to use service
- Ask human what to do

RIGHT RESPONSE:
1. Recognize the mismatch (service doesn't match existing patterns)
2. Delete the unsuitable service immediately
3. Read existing code more carefully
4. Understand the actual patterns used
5. Design new approach that matches existing architecture
6. If existing code is already clean → mark as complete, move on
```

**Mistake: Tests failing after integration**

```
WRONG RESPONSE:
- Continue integrating more code
- Hope it will work itself out
- Run tests again expecting different result

RIGHT RESPONSE:
1. Stop immediately - don't proceed
2. Examine test failure output carefully
3. Debug the specific failure
4. Fix the root cause (service bug, integration bug, test bug)
5. Verify tests pass
6. ONLY THEN continue with next integration step
```

**Mistake: File is already clean but agent created service anyway**

```
WRONG RESPONSE:
- Force the new service into the codebase
- Justify the work to avoid "wasting" effort

RIGHT RESPONSE:
1. Recognize the file is already well-architected
2. Delete the unnecessary service
3. Mark the file as complete (already clean)
4. Move to next file in queue
5. Learn: Always assess before creating services
```

### Success Metrics for Refactoring

Track these metrics to measure progress:

```
QUANTITATIVE METRICS:
- Files assessed: X/Y
- Files refactored: X
- Files skipped (already clean): Y
- Services created: Z
- Unit tests added: N
- Integration tests passing: M/M (100%)
- Lines of code reduced: -X lines (-Y%)

QUALITATIVE METRICS:
- Routes are thin controllers (< 100 lines)
- Services have single responsibility
- Test coverage maintained or increased
- Error handling consistent across codebase
- Patterns match existing architecture
- No forced integrations
```

---

## UI Server CLI Reference

The Express UI server (`src/ui/express/server.js`) supports the following command-line options for development and testing:

### Starting the Server

```bash
# Default mode (responds to SIGINT/SIGTERM)
node src/ui/express/server.js

# Detached mode (ignores SIGINT/SIGTERM, useful for background testing)
node src/ui/express/server.js --detached

# Auto-shutdown after N milliseconds
node src/ui/express/server.js --auto-shutdown 60000

# Auto-shutdown after N seconds (more convenient)
node src/ui/express/server.js --auto-shutdown-seconds 60

# Combined: detached + auto-shutdown (recommended for API testing)
node src/ui/express/server.js --detached --auto-shutdown-seconds 60
```

### CLI Options

- **`--detached`**: Runs the server in detached mode. Signal handlers (SIGINT/SIGTERM) are disabled, allowing the terminal to be released while the server stays running. The server will only shut down via:
  - Auto-shutdown timer (if specified)
  - Manual termination (kill command)
  - Server error

- **`--auto-shutdown <milliseconds>`**: Schedules automatic shutdown after the specified number of milliseconds. The timer starts when the server begins listening.

- **`--auto-shutdown-seconds <seconds>`**: Same as `--auto-shutdown` but accepts seconds for convenience (converted to milliseconds internally).

### Use Cases

**API Testing**: Start server with auto-shutdown to test endpoints without manual cleanup:
```bash
# Start server for 60 seconds
node src/ui/express/server.js --detached --auto-shutdown-seconds 60

# In another terminal, test endpoints
curl http://localhost:41001/api/crawl-types
curl http://localhost:41001/api/status

# Server automatically shuts down after 60 seconds
```

**Background Development**: Keep server running while working on other tasks:
```bash
# Start server in detached mode (manual shutdown required)
node src/ui/express/server.js --detached

# Server runs until explicitly killed
kill <pid>
```

**Normal Development**: Use default mode for interactive development (Ctrl+C to stop):
```bash
npm run gui
# or
node src/ui/express/server.js
```

### Implementation Details

- **Port selection**: Server tries PORT environment variable first, then high ports (41000-61000), finally ephemeral port (0)
- **Auto-shutdown timer**: 
  - In detached mode: Timer is kept referenced so process stays alive
  - In normal mode: Timer is unreferenced to prevent blocking process exit
- **Shutdown sequence**: Stops all jobs, closes SSE connections, closes database connections, then exits
- **Graceful shutdown**: 500ms timeout for socket cleanup before forced exit

---

## Database Schema Evolution

**Status**: Ready for Implementation (2025-10-06)  
**Main Document**: `docs/DATABASE_NORMALIZATION_PLAN.md`  
**Quick Start**: `docs/PHASE_0_IMPLEMENTATION.md` ⭐ **START HERE**

The project has identified significant opportunities for database normalization and compression infrastructure. A comprehensive 80+ page plan has been developed that enables schema evolution **without requiring immediate export/import cycles**.

### Implementation Documents

1. **`docs/PHASE_0_IMPLEMENTATION.md`** ⭐ — **Ready-to-run Phase 0 code**
   - Complete module implementations with tests
   - Schema version tracking infrastructure
   - Database exporter for backups/analytics
   - CLI tool for migration management
   - Zero risk (no schema changes)
   - Time: 1-2 days

2. **`docs/COMPRESSION_IMPLEMENTATION_FULL.md`** ⭐ — **Complete gzip + brotli implementation (all levels)**
   - 17 compression variants: gzip (1-9), brotli (0-11), zstd (3, 19)
   - Ultra-high quality brotli (levels 10-11) with 256MB memory windows
   - Full compression utility module with auto-selection
   - Bucket compression supporting both gzip and brotli
   - Benchmarking tool for compression ratio testing
   - Expected: 70-85% database size reduction, 6-25x compression ratios
   - Time: 2-4 hours for full implementation

3. **`docs/COMPRESSION_TABLES_MIGRATION.md`** — Quick-start guide for adding tables
   - `compression_types` table seeding
   - `compression_buckets` and `content_storage` tables
   - Code examples for basic usage
   - Time: 30 minutes to add tables

3. **`docs/DATABASE_NORMALIZATION_PLAN.md`** — Full technical specification (80+ pages)
4. **`docs/SCHEMA_NORMALIZATION_SUMMARY.md`** — Executive summary with priorities
5. **`docs/SCHEMA_EVOLUTION_DIAGRAMS.md`** — Visual architecture diagrams
6. **`docs/COMPRESSION_BUCKETS_ARCHITECTURE.md`** — Bucket lifecycle and caching strategies

### Key Innovations

1. **Migration-Free Normalization**: Add new normalized tables alongside existing schema, use dual-write + views for compatibility, gradually migrate data
2. **Compression Infrastructure**: Individual compression (zstd/gzip) + bucket compression (20x for similar files)
3. **Backward Compatibility**: Views reconstruct denormalized tables for zero-downtime migration
4. **Programmatic Groundwork**: Complete migration infrastructure (exporter, importer, transformer, validator) ready for future use

### Current Schema Issues Identified

**Critical Denormalization** (articles table):
- 30+ columns mixing URL identity, HTTP metadata, content, timing, and analysis
- Duplicate data between `articles` and `fetches` tables
- Cannot efficiently query just HTTP metadata or just content

**Proposed Normalized Schema**:
- `http_responses`: Pure HTTP protocol metadata
- `content_storage`: Content with compression support (inline, compressed, bucket)
- `content_analysis`: Analysis results (multiple versions per content)
- `discovery_events`: How URLs were discovered
- `compression_types` + `compression_buckets`: Compression infrastructure
- `place_provenance` + `place_attributes`: Normalized gazetteer provenance

### Implementation Strategy (No Breaking Changes)

**Phase 0-1 (Weeks 1-4)**: Infrastructure + add new tables
- Migration modules: exporter, importer, transformer, validator
- Add normalized tables without modifying existing tables
- Record as schema version 2

**Phase 2-3 (Weeks 5-10)**: Dual-write + backfill
- Write to both old and new schemas
- Backfill historical data incrementally
- Create backward compatibility views

**Phase 4-5 (Weeks 11-20)**: Cutover + cleanup
- Switch reads to views, then to normalized tables
- Archive legacy tables after validation period
- 40-50% database size reduction expected

### Compression Performance

| Method | Compression Ratio | Access Time | Use Case |
|--------|------------------|-------------|----------|
| Uncompressed | 1.0x | <1ms | Hot data |
| zstd level 3 (individual) | 3.0x | ~2ms | Warm data |
| zstd level 19 (bucket) | 19.6x | ~150ms (first), <1ms (cached) | Cold data, archives |

### Next Steps

1. Review `docs/DATABASE_NORMALIZATION_PLAN.md` for full technical details
2. Decide on implementation timeline (can proceed incrementally)
3. Begin Phase 0: Create migration infrastructure modules
4. Begin Phase 1: Add normalized tables (no breaking changes)

**Critical**: The plan enables future schema changes without export/import cycles by using dual-write and views during transition.

---

*This refactoring transforms the codebase into a more idiomatic, maintainable state while preserving all existing functionality. Follow the workflow systematically, test continuously, and document progress transparently.*