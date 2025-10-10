# Test Analysis Tools

Simple, focused tools for extracting precise information from test logs without PowerShell complexity.

## Quick Reference

```bash
# Get latest log path
node tests/get-latest-log.js              # Latest log (any suite)
node tests/get-latest-log.js unit         # Latest unit test log

# Get failing tests
node tests/get-failing-tests.js           # List all failing tests
node tests/get-failing-tests.js --count   # Count failing tests
node tests/get-failing-tests.js --simple  # Just file paths

# Get summary
node tests/get-test-summary.js            # Human-readable summary
node tests/get-test-summary.js --json     # JSON output

# Get slow tests
node tests/get-slow-tests.js              # Tests >5s
node tests/get-slow-tests.js 10           # Tests >10s
node tests/get-slow-tests.js --count      # Count slow tests
```

## Tools

### 1. `get-latest-log.js` - Find Latest Test Log

Returns the absolute path to the most recent test log file.

**Usage:**
```bash
node tests/get-latest-log.js              # Latest log (any suite)
node tests/get-latest-log.js unit         # Latest unit test log
node tests/get-latest-log.js e2e          # Latest E2E test log
node tests/get-latest-log.js integration  # Latest integration test log
node tests/get-latest-log.js ALL          # Latest full test suite log
```

**Output:**
```
C:\Users\james\Documents\repos\copilot-dl-news\testlogs\2025-10-10T22-05-32-514Z_ALL.log
```

**Use Case:** Get log path for reading with `read_file` tool (no PowerShell needed).

---

### 2. `get-failing-tests.js` - Extract Failing Tests

Lists only the tests that failed in the latest log.

**Usage:**
```bash
node tests/get-failing-tests.js           # All failing tests from latest log
node tests/get-failing-tests.js unit      # Failing tests from latest unit log
node tests/get-failing-tests.js --count   # Just count failing tests
node tests/get-failing-tests.js --simple  # Just test file paths (no details)
```

**Output (detailed mode):**
```
❌ Found 3 test file(s) with failures:

1. src\ui\express\__tests__\analyze.api.test.js
   Runtime: 4.23s | Failed: 2/8 tests

2. src\crawler\__tests__\sitemap.test.js
   Runtime: 1.45s | Failed: 1/5 tests

3. src\db\__tests__\migration.test.js
   Runtime: 3.12s | Failed: 3/10 tests
```

**Output (simple mode):**
```
src\ui\express\__tests__\analyze.api.test.js
src\crawler\__tests__\sitemap.test.js
src\db\__tests__\migration.test.js
```

**Output (count mode):**
```
3
```

**Exit Code:** 0 if no failures, 1 if failures exist.

**Use Case:** Quickly identify what needs fixing without reading full log.

---

### 3. `get-test-summary.js` - Quick Status Overview

Extracts key metrics from the latest test log.

**Usage:**
```bash
node tests/get-test-summary.js              # Summary from latest log
node tests/get-test-summary.js unit         # Summary from latest unit log
node tests/get-test-summary.js --json       # Output as JSON
```

**Output (human-readable):**
```
📊 Test Summary (ALL)
   Timestamp: 2025-10-10T22:05:32.514Z
   Runtime: 9.39s

   Files:  13 test files
   Tests:  129 total (129 passed, 0 failed)
   Slow:   4 files >5s, 0 files >10s

   ✅ All tests passing
```

**Output (JSON):**
```json
{
  "timestamp": "2025-10-10T22:05:32.514Z",
  "suite": "ALL",
  "totalRuntime": 9.39,
  "totalFiles": 13,
  "totalTests": 129,
  "passedTests": 129,
  "failedTests": 0,
  "slowTests": 4,
  "verySlowTests": 0,
  "failingFiles": []
}
```

**Exit Code:** 0 if all tests pass, 1 if any failures.

**Use Case:** Quick status check before starting work, or verifying fix results.

---

### 4. `get-slow-tests.js` - Find Performance Bottlenecks

Lists tests exceeding a runtime threshold.

**Usage:**
```bash
node tests/get-slow-tests.js              # Tests >5s from latest log
node tests/get-slow-tests.js 10           # Tests >10s from latest log
node tests/get-slow-tests.js 3 unit       # Tests >3s from latest unit log
node tests/get-slow-tests.js --count      # Just count slow tests
```

**Output:**
```
⏱️  Found 4 test(s) exceeding 5s:

1. ✅ 5.61s - src\db\__tests__\dbAccess.test.js
2. ✅ 5.47s - src\tools\__tests__\maintain-db.test.js
3. ✅ 5.28s - src\crawler\gazetteer\__tests__\StagedGazetteerCoordinator.planner.test.js
4. ✅ 5.11s - src\utils\__tests__\compressionBuckets.test.js
```

**Use Case:** Identify tests that might benefit from optimization or timeout guards.

---

## Integration with Testing Workflow

These tools are designed to be used in the testing workflow documented in `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`.

**Typical AI Agent Workflow:**

1. **Check current status** (5 seconds):
   ```bash
   node tests/get-test-summary.js
   ```

2. **If failures exist, list them** (5 seconds):
   ```bash
   node tests/get-failing-tests.js
   ```

3. **Get log path for detailed reading** (2 seconds):
   ```bash
   node tests/get-latest-log.js
   # Then use read_file tool on the returned path
   ```

4. **After fixing, verify** (5 seconds):
   ```bash
   node tests/get-test-summary.js
   ```

**Total time:** ~17 seconds vs. 30-60+ seconds with PowerShell command chains.

## Design Principles

1. **Single Purpose:** Each tool does one thing well
2. **Simple Output:** Easy to parse, no complex formatting
3. **Fast Execution:** <5 seconds per tool
4. **No Confirmation:** Never triggers PowerShell approval dialogs
5. **Composable:** Tools can be chained via command line
6. **Exit Codes:** Meaningful exit codes for automation

## See Also

- `tests/analyze-test-logs.js` - Comprehensive historical analysis
- `tests/run-tests.js` - Configuration-based test runner
- `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` - Full testing workflow guide
