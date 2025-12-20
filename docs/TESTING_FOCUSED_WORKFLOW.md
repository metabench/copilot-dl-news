# Testing Focused Workflow - Query-Driven Test Fixing

**Status**: Active - Primary Testing Workflow  
**Purpose**: Use test failure analysis tools to focus work on specific failing tests  
**Created**: October 10, 2025

---

## Overview

This workflow uses specialized tooling to:
1. **Query test failures** from logs without running tests
2. **Extract detailed failure info** (line numbers, error types, categories)
3. **Run only failed tests** in isolation for faster iteration
4. **Compare test runs** to see what fixed and what broke

**Time Savings**: 20-40 minutes per testing session by avoiding full test runs and focusing on failures.

---

## Core Tools

### 1. Query Test Failures (`tests/query-test-failures.js`)

**Purpose**: Extract and categorize test failures from latest log file

**Basic Usage**:
```bash
# Get detailed summary with categories and line numbers
node tests/query-test-failures.js --suite=unit

# Get just the file paths (for focused runs)
node tests/query-test-failures.js --suite=unit --format=files-only

# Get full detailed error output
node tests/query-test-failures.js --suite=unit --format=detailed

# Filter by test name
node tests/query-test-failures.js --suite=unit --test-name="analysis"

# Output as JSON for scripting
node tests/query-test-failures.js --suite=unit --format=json
```

**Output Includes**:
- **Test file paths** - Exact file locations
- **Test names** - Specific test case that failed
- **Error categories** - assertion, database, schema, timeout, import-error, runtime-error
- **Line numbers** - Where the failure occurred
- **Key error messages** - Extract the critical error text
- **Focused test commands** - Ready-to-run commands for just failed tests

**Example Output**:
```
═══════════════════════════════════════════════════════════
TEST FAILURES SUMMARY - 2025-10-10T20:23:49.218Z
═══════════════════════════════════════════════════════════

📋 src/ui/express/__tests__/analysis.api.ssr.test.js
────────────────────────────────────────────────────────────

  ❌ Analysis API and SSR › analysis start triggers real analysis run
     Line: 205 (src/ui/express/__tests__/analysis.api.ssr.test.js)
     Type: schema
     Error: SqliteError: no such table: analysis_runs

📋 src/db/__tests__/dbAccess.test.js
────────────────────────────────────────────────────────────

  ❌ dbAccess › openNewsDb › should default to data/news.db when no path provided
     Line: 69 (src/db/__tests__/dbAccess.test.js)
     Type: schema
     Error: SqliteError: table articles has no column named host

═══════════════════════════════════════════════════════════
SUMMARY STATISTICS
═══════════════════════════════════════════════════════════
Total Failures: 21
Failed Test Files: 16

Failures by Category:
  schema: 8
  assertion: 6
  timeout: 3
  database: 2
  runtime-error: 2

═══════════════════════════════════════════════════════════
FOCUSED TEST COMMAND
═══════════════════════════════════════════════════════════

Run only failed tests:
node tests/run-tests.js unit --files="src/ui/express/__tests__/analysis.api.ssr.test.js,src/db/__tests__/dbAccess.test.js,..."
```

### 2. Enhanced Test Runner (`tests/run-tests.js`)

**New Feature**: `--files` parameter to run specific test files

**Usage**:
```bash
# Run only specific files
node tests/run-tests.js unit --files="file1.test.js,file2.test.js"

# Combine with query tool output
FAILED=$(node tests/query-test-failures.js --suite=unit --format=files-only)
node tests/run-tests.js unit --files="$FAILED"

# PowerShell version
$failed = node tests/query-test-failures.js --suite=unit --format=files-only
node tests/run-tests.js unit --files="$failed"
```

**Benefits**:
- Run only the 5 failing tests instead of all 131 test files
- Faster iteration: 10-30s instead of 120s
- Logs automatically captured with suite name
- No PowerShell confirmation dialogs

### 3. Test Log Analyzer (`tests/analyze-test-logs.js`)

**Purpose**: Compare test runs, detect regressions, show fixes

```bash
# Quick status
node tests/analyze-test-logs.js --summary

# Full analysis
node tests/analyze-test-logs.js

# Check specific test
node tests/analyze-test-logs.js --test "compression"
```

**Use After Each Fix**:
- Shows if your fix worked (test moved from "broken" to "passing")
- Detects if you broke something else (regressions)
- Tracks overall progress (X more tests passing)

---

## Complete Workflow

### Step 1: Query Current Failures (10 seconds)

```bash
# Get failure summary
node tests/query-test-failures.js --suite=unit
```

**Review Output**:
- How many tests are failing?
- What categories dominate? (schema issues = batch fix potential)
- What line numbers? (helps locate exact problem)
- Which files have multiple failures? (common root cause)

### Step 2: Categorize by Fix Strategy

**Schema Issues** (highest priority - collateral wins):
- Missing tables (`analysis_runs`, etc.)
- Missing columns (`host`, `exists`, etc.)
- Fix schema initialization → many tests pass

**Import Errors** (quick wins):
- `not a constructor` - wrong import style
- `Cannot find module` - path issue
- Fix 1-2 lines → tests pass immediately

**Assertion Failures** (need analysis):
- `expect(received).toBe(expected)` - logic bug
- `expect(received).toBeGreaterThan(0)` - missing data
- Requires understanding test intent

**Timeouts** (need timeout guards):
- `Exceeded timeout of Xms` - operation too slow
- Tests hanging (🐌🐌🐌) - no progress output
- Add timeout guards, progress logging

### Step 3: Fix ONE Category at a Time

**Example: Schema Issues**

```bash
# Query shows 8 schema errors
node tests/query-test-failures.js --suite=unit

# All need analysis_runs table
# 1. Check if schema init function exists
grep_search query:"analysis_runs" includePattern:"**/schema.js"

# 2. Find initialization code
grep_search query:"CREATE TABLE.*analysis_runs" includePattern:"**/*.js"

# 3. Add schema initialization to failing tests
# (Use apply_patch, or js-edit for guarded JS-only edits)

# 4. Run ONLY the schema-related tests
node tests/run-tests.js unit --files="src/ui/express/__tests__/analysis.api.ssr.test.js,src/tools/__tests__/analysis-run.run.test.js"
```

### Step 4: Verify Fixes with Analyzer (5 seconds)

```bash
# After running focused tests, check progress
node tests/analyze-test-logs.js --summary

# Should show:
# ✅ Fixed: analysis.api.ssr.test.js (was failing, now passing)
# ✅ Overall: 918 passing (up from 917)

# If test still fails:
node tests/query-test-failures.js --suite=unit --test-name="analysis"
# Shows updated error message, helps iterate
```

### Step 5: Iterate Until All Fixed

Repeat Steps 1-4:
1. Query failures → categorize → pick batch
2. Fix that batch
3. Run focused tests (just those files)
4. Verify with analyzer
5. Move to next batch

**Stop Conditions**:
- ✅ `node tests/query-test-failures.js` shows "No test failures found!"
- ✅ `node tests/analyze-test-logs.js --summary` shows 0 failing
- ✅ Full test run: `node tests/run-tests.js unit` passes

---

## AI Agent Integration

### Pattern: Autonomous Test Fixing

```javascript
// PHASE 1: Query current state (no test run needed!)
await run_in_terminal({
  command: 'node tests/query-test-failures.js --suite=unit',
  explanation: 'Query test failures to plan fixes',
  isBackground: false
});

// Analyze output → categorize failures → pick strategy

// PHASE 2: Fix batch of related tests
// (Use apply_patch, or js-edit for guarded JS-only edits)

// PHASE 3: Run ONLY the tests you fixed
await run_in_terminal({
  command: 'node tests/run-tests.js unit --files="file1.test.js,file2.test.js"',
  explanation: 'Verify fixes for specific tests',
  isBackground: false
});

// PHASE 4: Verify progress
await run_in_terminal({
  command: 'node tests/analyze-test-logs.js --summary',
  explanation: 'Check overall test status',
  isBackground: false
});

// PHASE 5: Iterate (repeat 2-4 until done)
```

### When to Use Full Test Run

**Avoid full runs during iteration** - they take 2-10 minutes and provide the same info as query tool.

**Run full suite only when**:
- ✅ All focused runs pass (final validation)
- ✅ You've fixed schema/global changes (need to see ripple effects)
- ✅ Preparing to commit (CI will run full suite anyway)

---

## Example Session

**Starting Point**: 21 failing tests

```bash
# 1. Query failures (10s)
node tests/query-test-failures.js --suite=unit

# Output shows:
# - 8 schema errors
# - 6 assertion failures
# - 3 timeouts
# - 2 import errors
# - 2 database errors

# 2. Fix import errors first (quick wins)
# Edit 2 test files to fix imports

# 3. Run just those 2 tests (10s)
node tests/run-tests.js unit --files="src/crawler/__tests__/OsmBoundaryIngestor.test.js,src/crawler/gazetteer/__tests__/WikidataAdm1Ingestor.test.js"

# 4. Verify (5s)
node tests/analyze-test-logs.js --summary
# ✅ 918 passing (up from 916)

# 5. Fix schema errors (8 tests affected)
# Add schema initialization to test setup

# 6. Run just those 8 tests (25s)
node tests/run-tests.js unit --files="src/ui/express/__tests__/analysis.api.ssr.test.js,src/tools/__tests__/analysis-run.run.test.js,..."

# 7. Verify (5s)
node tests/analyze-test-logs.js --summary
# ✅ 926 passing (up from 918)

# 8. Continue with assertions, timeouts, etc.

# Total time: ~10 minutes (vs 40+ minutes with full runs)
```

---

## Troubleshooting

### Query Tool Shows No Failures But Tests Are Failing

**Cause**: Log file is stale or missing

**Fix**:
```bash
# Check log file age
Get-ChildItem testlogs\*unit*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# If >1 hour old, run fresh test
node tests/run-tests.js unit

# Then query again
node tests/query-test-failures.js --suite=unit
```

### Focused Test Run Fails with "Cannot find module"

**Cause**: File path format mismatch (backslashes vs forward slashes)

**Fix**: Use forward slashes in --files parameter:
```bash
# ❌ Wrong (Windows backslashes)
node tests/run-tests.js unit --files="src\ui\__tests__\test.js"

# ✅ Right (forward slashes)
node tests/run-tests.js unit --files="src/ui/__tests__/test.js"
```

### Test Passes in Focused Run, Fails in Full Suite

**Cause**: Test interdependencies or shared state

**Fix**:
```bash
# Run with test isolation
node tests/run-tests.js unit --files="problem.test.js" --maxWorkers=1

# Or check if test cleanup is incomplete
# Review afterEach/afterAll blocks
```

---

## Benefits Over Previous Approach

| Aspect | Old Approach | New Approach (Query-Driven) |
|--------|-------------|----------------------------|
| **Discovery** | Run full suite (120s) | Query logs (10s) |
| **Iteration** | Run full suite each fix (120s) | Run 2-5 files (10-30s) |
| **Focus** | All 131 files every time | Only the 5-10 failing |
| **Visibility** | Manual terminal parsing | Categorized, prioritized output |
| **Line Numbers** | Manually search logs | Extracted automatically |
| **Commands** | Type manually | Generated ready-to-run |
| **Progress** | Hard to track | Analyzer shows deltas |
| **Time per Session** | 40-60 minutes | 10-20 minutes |

---

## Documentation Updates

When adding new tools or improving workflow:

1. **Update this file** (`TESTING_FOCUSED_WORKFLOW.md`) with new commands
2. **Update TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md** Phase 1 to reference query tool
3. **Update AGENTS.md** Testing Guidelines section with tool commands
4. **Update tests/README.md** with usage examples
5. **Add inline docs** to tool files (--help text)

---

## Future Enhancements

**Potential Improvements**:
- [ ] Auto-fix common patterns (import errors, schema missing)
- [ ] Generate fix suggestions based on error category
- [ ] Interactive mode: pick which tests to run
- [ ] Watch mode: auto-run tests when files change
- [ ] Integration with git diff: run tests for changed code
- [ ] Slack/notification on test fix completion
- [ ] Historical trend charts: tests fixed over time
