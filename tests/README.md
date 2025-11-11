# Test Configuration System

## Overview

This directory contains a **configuration-based test runner system** designed for **autonomous AI agent operation**. The system allows AI agents to modify test configurations without triggering PowerShell confirmation dialogs.

## Key Concepts

### Problem with Environment Variables

Environment variables in PowerShell commands require user confirmation:
```powershell
# ❌ REQUIRES CONFIRMATION - Cannot be run autonomously
cross-env GEOGRAPHY_E2E=1 npm test
```

### Solution: Configuration File + Test Runner

Instead, we use:
1. **`test-config.json`** - Configuration file that AI agents can modify freely
2. **`run-tests.js`** - Simple Node.js script that reads config and runs Jest
3. **File naming conventions** - `.dev.test.js` suffix for development/manual tests

```bash
# ✅ NO CONFIRMATION - Runs autonomously
node tests/run-tests.js e2e
```

## File Structure

```
tests/
├── test-config.json       # Test suite configurations (AI-editable)
├── run-tests.js           # Test runner script
├── README.md              # This file
├── e2e-features/          # Quick E2E tests
├── broken/                # Quarantined tests (skipped by default suites)
└── helpers/               # Test utilities
```

## Available Test Suites

Configure in `test-config.json`:

| Suite | Description | Runtime | Use Case |
|-------|-------------|---------|----------|
| `unit` | Fast unit tests only | <30s | Quick validation |
| `integration` | HTTP server tests | ~60s | API testing |
| `e2e` | Standard E2E tests | 2-5min | Regular E2E validation |
| `e2e-quick` | Quick E2E smoke tests | <1min | Fast E2E validation |
| `all` | All regular tests | 5-10min | Full suite (excludes dev tests) |
| `dev-geography` | Full geography crawl | 5-15min | Development/debugging only |

## Test Analysis Tools (NEW - October 2025)

### Quick Start: Fixing Tests Efficiently

**Recommended workflow for AI agents and developers**:

```bash
# 1. Analyze failures in detail (10s)
node tests/analyze-failures.js
# → Shows error types, line numbers, code snippets

# 2. Fix code based on error info

# 3. Rerun ONLY failed tests (30s vs 2min)
node tests/run-failed-tests.js
# → 80-90% time savings

# 4. Track progress (5s)
node tests/compare-test-runs.js
# → See what fixed, what regressed

# Repeat until done
```

**Time comparison**:
- Old: 3-6 min/iteration (full suite each time)
- New: 45s/iteration (targeted rerun)
- **Savings: 75-90% faster**

### Tool 1: Detailed Failure Analysis

**`node tests/analyze-failures.js`**

Provides detailed diagnostics for test failures:
- Exact error types (SqliteError, TypeError, etc.)
- Line numbers where failures occur
- Code snippets (3 lines context)
- Full error messages
- Stack traces
- Categorized by test file

**Usage**:
```bash
# Latest run
node tests/analyze-failures.js

# All recent runs
node tests/analyze-failures.js --all

# Filter by pattern
node tests/analyze-failures.js --test "database"

# Specific suite
node tests/analyze-failures.js --suite unit

# JSON output
node tests/analyze-failures.js --json

# Generate rerun list
node tests/analyze-failures.js --list
```

**Example output**:
```
❌ src/db/__tests__/dbAccess.test.js (1 failing)

   1. should default to data/news.db
      Error: SqliteError
      table articles has no column named host
      Line: 69

    > 67 |     // Article statements
      68 |
    > 69 |     this.insertArticleStmt = this.db.prepare(`
      70 |       INSERT INTO articles (url, host...
```

### Tool 2: Targeted Test Rerun

**`node tests/run-failed-tests.js`**

Reruns ONLY tests that failed in the last run. **80-90% faster** than full suite.

**Usage**:
```bash
# Run all failed tests
node tests/run-failed-tests.js

# Specific suite
node tests/run-failed-tests.js --suite unit

# First 5 only (quick iteration)
node tests/run-failed-tests.js --limit 5
```

**How it works**:
1. Analyzes latest log to find failures
2. Generates `tests/failed-tests.json`
3. Uses Jest's `testPathPattern` to run only those files
4. Creates new log for comparison
5. Shows analyzer summary after

**Benefits**:
- Skip all passing tests (huge time savings)
- Fast verification after fixes
- Automatic log management
- Progress tracking built-in

### Tool 3: Progress Tracking

**`node tests/compare-test-runs.js`**

Compares two test runs to show progress.

**Usage**:
```bash
# Compare latest 2 runs
node tests/compare-test-runs.js

# Specific runs
node tests/compare-test-runs.js --before TIMESTAMP --after TIMESTAMP

# Specific suite
node tests/compare-test-runs.js --suite unit
```

**What it shows**:
- ✅ **Fixed** (was failing → now passing)
- ⚠️ **Regressions** (was passing → now failing)
- 🔴 **Still broken** (failing in both)
- 📊 **Fix rate** (percentage)
- 📈 **Net progress** (change in failure count)

**Example output**:
```
Before: 25 failures | After: 18 failures
📉 Net change: -7

✅ FIXED (7):
  compression.test.js
  bucketCache.test.js
  ...

⚠️ NEW REGRESSIONS (0)

🔴 STILL BROKEN (18):
  ...

📈 Fix rate: 28.0% (7/25)
```

### Tool 4: Historical Analysis

**`node tests/analyze-test-logs.js`** (existing tool)

Tracks tests across all historical runs:
| `dev-geography-monitor` | Geography telemetry | 10min | Development/debugging only |

## Usage

### Test Log Analyzer

**Analyze test results without running tests** - understand what's broken, what's fixed, and prioritize debugging work.

### Quick Start

```bash
# Quick status check (5 seconds)
node tests/analyze-test-logs.js --summary

# Full analysis with priorities (10 seconds)
node tests/analyze-test-logs.js

# Check specific test history
node tests/analyze-test-logs.js --test "compression"

# Import legacy logs from root directory (one-time)
node tests/analyze-test-logs.js --import
```

### Key Features

1. **Current Status**: See latest test run results (passing/failing counts)
2. **Fixed Tests**: Tests that were broken but now pass (learn from these!)
3. **Regressions**: Tests that broke recently (investigate immediately)
4. **Still Broken**: Prioritized by failure rate and attempts
5. **AI Agent Summary**: Smart prioritization for debugging work

### When to Use

✅ **Before starting test fixing work** - Get overview of what's broken  
✅ **To prioritize fixes** - See which tests fail most consistently  
✅ **To verify fixes** - Check if test now passes after your changes  
✅ **To avoid duplicate work** - See if test was recently fixed  
✅ **To learn patterns** - Review recently fixed tests for solutions

### Output Explained

- **🐌🐌🐌** = Super slow test (>30s, likely hanging)
- **🐌🐌** = Very slow test (10-30s)
- **🐌** = Slow test (5-10s)
- **⏱️** = Reasonable speed (<5s)
- **Failure rate** = % of runs that failed (100% = always fails, structural issue)
- **Attempts** = Number of test runs (high count = lots of debugging effort)

### Complete Documentation

See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` for comprehensive workflow including:
- Test Log Analyzer integration (Phase 1)
- Pattern recognition (hanging tests, regressions, intermittent failures)
- AI agent systematic test fixing workflow
- Troubleshooting tips and common patterns

---

## Running Tests

```bash
# Run a configured test suite
node tests/run-tests.js <suite-name>

# Examples
node tests/run-tests.js unit              # Fast unit tests
node tests/run-tests.js e2e               # Standard E2E tests
node tests/run-tests.js dev-geography     # Development test (long-running)
```

### API regression quick-runner

The API handlers ship with a focused Jest harness that exercises the background
task, analysis, and crawl routers via SuperTest. Run it directly or through the
convenience npm script:

```bash
node scripts/jest_api_tests.mjs          # Runs all API endpoint suites
npm run test:api                         # Same as above via package.json
node scripts/jest_api_tests.mjs --list   # Show the default test files
node scripts/jest_api_tests.mjs tests/server/api/crawls.test.js -- --detectOpenHandles
```

- Without positional arguments the runner executes:
  - `tests/server/api/background-tasks.test.js`
  - `tests/server/api/analysis.test.js`
  - `tests/server/api/crawls.test.js`
- Provide one or more test file paths to target a subset while keeping the
  guard-rail flags (`--bail=1`, `--maxWorkers=50%`, and `--runTestsByPath`).
- Use `--` to forward options directly to Jest (for example,
  `--detectOpenHandles` when chasing lingering handles).
- Invoke `node scripts/jest_api_tests.mjs --help` for a full usage summary.

### Modifying Configuration

AI agents can edit `test-config.json` to:
- Add new test suites
- Adjust timeouts
- Change test patterns
- Modify environment variables
- Set max workers

```json
{
  "testSuites": {
    "my-custom-suite": {
      "description": "Custom test suite",
      "testPathPattern": "my-pattern",
      "timeout": 30000,
      "forceExit": true,
      "maxWorkers": 2
    }
  }
}
```

## Naming Conventions

### Test File Suffixes

- **`.test.js`** - Regular test (runs in default suite)
- **`.dev.test.js`** - Development/debugging test (excluded from regular runs)
- **`.manual.test.js`** - Manual-only test (excluded from all automated runs)

### Examples

```
geography.crawl.e2e.test.js        # ✅ Regular E2E test
geography.full.e2e.dev.test.js     # 🔧 Development test (excluded)
some-feature.manual.test.js        # 👤 Manual test (excluded)
```

## Configuration Options

### Suite Configuration

```json
{
  "description": "Human-readable description",
  "testPathPattern": "regex pattern for test files",
  "testPathIgnorePatterns": ["pattern1", "pattern2"],
  "timeout": 60000,
  "forceExit": true,
  "maxWorkers": 2,
  "detectOpenHandles": false,
  "environment": {
    "VAR_NAME": "value"
  },
  "note": "Additional notes for humans"
}
```

### Available Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | string | Human-readable description |
| `testPathPattern` | string | Regex pattern to match test files |
| `testPathIgnorePatterns` | array | Patterns to exclude |
| `timeout` | number | Test timeout in milliseconds |
| `forceExit` | boolean | Force exit after tests complete |
| `maxWorkers` | number | Maximum parallel workers |
| `detectOpenHandles` | boolean | Detect open handles (slow) |
| `environment` | object | Environment variables to set |
| `note` | string | Additional notes |

## Autonomous Operation Guidelines

### For AI Agents

✅ **DO**:
- Modify `test-config.json` to adjust test behavior
- Use `node tests/run-tests.js <suite>` to run tests
- Create new test suites in `test-config.json`
- Use `.dev.test.js` suffix for long-running/development tests
- Check test timing logs before running tests

❌ **DON'T**:
- Use environment variables in test commands (triggers confirmation)
- Run complex PowerShell pipelines (triggers confirmation)
- Chain multiple commands with semicolons (triggers confirmation)
- Use `cross-env` or similar tools (triggers confirmation)

### Example Workflow

```bash
# 1. Check logs first
Get-ChildItem test-timing-*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# 2. Run appropriate test suite
node tests/run-tests.js e2e

# 3. Verify exit code
# (terminal_last_command tool)

# 4. Read results from log files
Get-Content test-timing-*.log | Select-Object -First 50
```

## Integration with Documentation

### Referenced In

- **`AGENTS.md`** - Core testing workflow and autonomous operation
- **`docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`** - Systematic testing process
- **`.github/instructions/GitHub Copilot.instructions.md`** - Agent instructions
- **`docs/POST_MORTEM_FALSE_POSITIVE_TEST_RESULTS.md`** - Testing verification patterns

### Key Documentation Sections

1. **Autonomous Operation** (AGENTS.md)
   - No confirmation dialogs
   - Configuration-based test execution
   - Test naming conventions

2. **Testing Workflow** (TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md)
   - Check logs first
   - Run tests via `node tests/run-tests.js`
   - Verify exit codes

3. **Test Suites** (this file)
   - Available test suites
   - When to use each suite
   - Development vs. regular tests

## Development Tests

### What Are Development Tests?

Development tests (`.dev.test.js`) are:
- Long-running (5+ minutes)
- Resource-intensive
- Network-dependent (external APIs)
- Used for debugging/understanding system behavior
- NOT run in regular test suites

### Examples

- **`geography.full.e2e.dev.test.js`** - Full geography crawl with live Wikidata/OSM APIs
- **`geography-crawl.e2e.dev.test.js`** - Full telemetry monitoring (600s timeout)

### When to Run Development Tests

Run explicitly when:
- Debugging geography crawl system
- Validating telemetry infrastructure
- Understanding system behavior under load
- Testing with real external APIs

```bash
# Explicitly run development test
node tests/run-tests.js dev-geography
```

## Troubleshooting

### Test Hangs

If a test hangs:
1. Check `test-timing-*.log` files for previous results
2. Increase timeout in `test-config.json`
3. Add progress logging to test
4. Check for missing async cleanup

### Test Fails but Task Says "Succeeded"

This is a known issue with VS Code tasks. **Always verify exit code**:
```bash
# Use terminal_last_command tool
# Check: "exit code: 0" = pass, "exit code: 1" = fail
```

### Confirmation Dialog Appears

If PowerShell asks for confirmation:
1. You're using environment variables - use config file instead
2. You're using complex pipelines - use simple commands
3. You're chaining commands - run separately

## Future Enhancements

Potential improvements:
- [ ] Add test result caching
- [ ] Parallel test suite execution
- [ ] Test flakiness detection
- [ ] Automatic timeout adjustment
- [ ] Test performance tracking

## Related Files

- **`jest.setup.js`** - Jest global setup
- **`jest-timing-reporter.js`** - Test timing reporter (generates logs)
- **`jest-compact-reporter.js`** - Compact output reporter
- **`package.json`** - NPM scripts (legacy, prefer `run-tests.js`)

## Version History

- **v1.0.0** (2025-10-10) - Initial configuration-based test runner system
