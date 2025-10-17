# Testing Review and Improvement Guide

**Status**: Active Process Guide for AI Agents  
**Purpose**: Systematic approach to testing review, validation, and improvement  
**When to Use**: When user requests "test review", "fix tests", "validate tests", or "test audit"

---

## Overview

This guide provides a structured approach for AI agents to review, validate, and improve project tests. It ensures tests are reliable, maintainable, and verify that documented functionality actually works.

**CRITICAL: This guide is about DOING testing review work, not creating reports ABOUT testing work.**

**Prerequisites**:
1. **Read first**: `docs/DOCUMENTATION_REVIEW_AND_IMPROVEMENT_GUIDE.md` for process methodology
2. **Read second**: `AGENTS.md` Testing Guidelines section for testing rules (GOLDEN RULE)
3. **Read third**: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` for async test patterns
4. **Read fourth**: `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` for timeout prevention

**🚨 CRITICAL DISCOVERY (October 2025): VS Code Task Messages are UNRELIABLE**

When running tests via `run_task` tool, VS Code displays "The task succeeded with no problems" EVEN WHEN TESTS FAIL (exit code 1). This creates FALSE POSITIVES where agents believe tests passed.

**MANDATORY Verification After Every Test Run**:
```javascript
// STEP 1: Run test
await run_task({ id: 'test-task', workspaceFolder: '...' });

// STEP 2: ALWAYS verify exit code
const lastCmd = await terminal_last_command();
// Check: lastCmd contains "It exited with code: 0" (pass) or "code: 1" (fail)

// STEP 3: If exit code !== 0, read terminal output for details
// Look for: "Test Suites: X failed", "Tests: X failed", tests in "RUNS" state
```

**Red Flags Indicating Test Failure/Hang**:
- Exit code 1 but task shows "succeeded"
- E2E tests >60s (e.g., "🐌 359.67s - e2e.logs.test.js")
- Tests listed as "RUNS" at end of output (not completed)
- Total time >400s for E2E suite (multiple hangs)
- "28 failed" in test suite summary

**🚨 TEST LOG ANALYZER - PRIMARY TESTING TOOL** (October 2025):

**CRITICAL**: Use Test Log Analyzer BEFORE running tests to understand current status.

```bash
# Quick status check (5 seconds) - DO THIS FIRST
node tests/analyze-test-logs.js --summary

# Full analysis with priorities (10 seconds) - For planning work
node tests/analyze-test-logs.js

# Check specific test history - To verify fixes or understand patterns
node tests/analyze-test-logs.js --test "compression"
```

**Test Log Analyzer Features**:
- ✅ **Current Status**: Latest test run results (passing/failing counts)
- ✅ **Fixed Tests**: Shows what was recently fixed (avoid duplicate work)
- ✅ **Regressions**: Tests that broke recently (investigate immediately)
- ✅ **Still Broken**: Prioritized by failure rate, attempts, runtime
- ✅ **Pattern Detection**: Identifies hanging tests (🐌🐌🐌 >30s), structural failures (100% failure rate)
- ✅ **Historical Tracking**: See when test started failing, how many attempts, success rate
- ✅ **Smart Prioritization**: Fix structural issues first (high failure rate), then intermittent failures

**When to Use**:
1. **Before starting work** - Understand what's broken, what priorities are
2. **After running tests** - Verify fixes were captured in logs
3. **To check if fixed** - See if test now passes after your changes
4. **To learn patterns** - Review recently fixed tests for solutions
5. **To avoid duplicate work** - Check if test was already fixed in recent logs

**Integration with Test Fixing**:
```bash
# STEP 1: Check current status BEFORE running tests
node tests/analyze-test-logs.js --summary
# Output: unit suite has 110 passing, 21 failing

# STEP 2: Run focused tests (only what needs fixing)
node tests/run-tests.js unit

# STEP 3: Verify fix was captured
node tests/analyze-test-logs.js --test "compression"
# Output: Shows latest run as ✅ PASS if fixed

# STEP 4: Check overall progress
node tests/analyze-test-logs.js --summary
# Output: unit suite now has 111 passing, 20 failing
```

**Complete Documentation**: See `tests/TEST_LOG_ANALYZER.md` for comprehensive usage guide including:
- Pattern recognition (hanging tests, regressions, intermittent failures)
- AI agent workflow integration
- Understanding output sections (fixes, regressions, still broken)
- Troubleshooting and advanced usage

### Simple Query Tools (NEW - October 2025)

**Purpose**: Fast, focused tools for extracting specific information from logs without PowerShell.

**Available Tools**:

1. **`get-latest-log.js`** - Find latest log file path (2s)
   ```bash
   node tests/get-latest-log.js              # Latest log (any suite)
   node tests/get-latest-log.js unit         # Latest unit log
   # Returns: Full path to log file for use with read_file tool
   ```

2. **`get-failing-tests.js`** - List only failing tests (5s)
  ```bash
  node tests/get-failing-tests.js           # List all failing tests + latest message
  node tests/get-failing-tests.js --count   # Count: 3
  node tests/get-failing-tests.js --simple  # Just file paths
  node tests/get-failing-tests.js --history          # Last 5 runs (latest suite)
  node tests/get-failing-tests.js --history --logs 8 # Last 8 runs
  node tests/get-failing-tests.js --history --test crawl.e2e # Track a specific test
  # Exit code: 0 = no failures, 1 = failures exist (latest run)
  ```
  - Pulls the most recent failure message for each file from `test-failure-summary.json`.
  - The reporter now saves per-run snapshots (`testlogs/<timestamp>_<suite>.failures.json`), enabling history queries to show original failure messages when available.

3. **`get-test-summary.js`** - Quick status overview (5s)
   ```bash
   node tests/get-test-summary.js            # Human-readable
   node tests/get-test-summary.js --json     # JSON output
  node tests/get-test-summary.js --compact  # One-line status snapshot
  # Shows: Files, tests, runtime, failures, slow tests, follow-up fixes, quarantined tests
   ```
  - Ignores `imported_*` logs, verifies `_ALL` runs include ≥50 suites, and automatically rolls back to the most recent real full-suite log when needed.
  - Replays every baseline failure across newer logs so newly passing tests appear under **Fixed since baseline** instead of the failing list.
  - Tags anything under `tests/broken/**` with `[broken-suite]` and surfaces a broken count to steer agents away from quarantined suites. When the user says a test is "broken", move the file into `tests/broken/` (preserving its subdirectory) so it is quarantined from normal test runs.

4. **`get-slow-tests.js`** - Find performance bottlenecks (5s)
   ```bash
   node tests/get-slow-tests.js              # Tests >5s
   node tests/get-slow-tests.js 10           # Tests >10s
   node tests/get-slow-tests.js --count      # Count only
   ```

**Quick Workflow Example**:
```bash
# 1. Check status (5s)
node tests/get-test-summary.js --compact
# Output: 129 tests, 3 failed

# 2. List failures (5s)
node tests/get-failing-tests.js
# Output: analyze.api.test.js (Latest failure: Expected 200 but received 500)

# 3. Get log path for detailed reading (2s)
node tests/get-latest-log.js
# Output: C:\...\testlogs\2025-10-10T22-05-32-514Z_ALL.log
# Then use read_file tool on this path

# Total: 12 seconds vs. 30-60+ seconds with PowerShell
```

**Design Principles**: Single-purpose, simple output, fast execution (<5s), no approval dialogs, meaningful exit codes. Failure text is captured once per run by the custom reporter, so AI agents can read context without rerunning suites.

**Complete Tool Documentation**: See `tests/SIMPLE_TOOLS_README.md` for full usage examples and integration patterns.

### Telemetry & Timeline Workflow (October 2025)

**Purpose**: Ensure crawl telemetry, SSE problem propagation, and timeline renderers stay aligned while keeping the verification loop fast.

**When to Use**:
- Intelligent crawl telemetry changes (timeline, milestones, problem feeds)
- SSE/API regressions reported by `telemetry-flow.*`, `start-button.*`, or `problems.api.*` suites
- Any change that touches `analyse-pages-core`, crawl stop/start controls, or server boot announcements

**Workflow Overview**:
1. **Get current state in <15s**
  ```bash
  node tests/get-test-summary.js --compact
  node tests/get-failing-tests.js --history --test "telemetry"
  ```
  - Confirms which telemetry suites failed last, and surfaces the exact failure text without rerunning anything.
2. **Inspect most recent full log once**
  ```bash
  node tests/get-latest-log.js ALL
  ```
  - Use `read_file` on the returned path to validate the timeline payload and note missing milestones or problem events.
3. **Instrument or adjust telemetry**
  - Ensure every external API or SSE branch emits `telemetry.problem()` when payloads are missing or invalid.
  - Emit one-line `milestone` events for crawl start/stop, server boot, and timeline hydration so tests have deterministic checkpoints.
  - Keep `analyse-pages-core.js` outputs structured: `nonGeoTopicSlugs`, `timelineEvents`, and `problemSummaries` must be populated even when empty.
4. **Run the focused verification set (≈15s total)**
  ```bash
  npm run test:file "telemetry-flow.http.test"
  npm run test:file "telemetry-flow.e2e.test"
  npm run test:file "start-button.e2e.test"
  npm run test:file "problems.api.ssr.test"
  ```
  - Tests cover HTTP telemetry wiring, SSE end-to-end flow, crawl control regressions, and SSR/problem APIs respectively.
  - Use `terminal_last_command` after each run to confirm exit code `0`.
5. **Validate analyzer captured the fix**
  ```bash
  node tests/analyze-test-logs.js --test "telemetry-flow"
  node tests/analyze-test-logs.js --test "problems.api"
  ```
  - Confirms the latest log records the passing state and that regressions cleared.
6. **Document the outcome**
  - Update `docs/TESTING_STATUS.md` (if active) and add any new telemetry expectations back into `AGENTS.md` Testing Guidelines.

**Key Principles**:
- Always fail fast when telemetry payloads are missing—emit `telemetry.problem()` with structured details instead of relying on console output.
- Keep timeline arrays stable: prefer empty arrays over `undefined` to avoid snapshot drift.
- Use the same four focused tests as a regression pack before and after telemetry changes; they are intentionally fast and complementary.
- Never run the full suite to validate telemetry—stick to targeted files and rely on the analyzer for historical confirmation.

---

## Test Log Management (October 2025)

**Purpose**: Keep `testlogs/` directory organized and manageable while preserving important historical data.

### Migration Tool: `tools/migrate-test-logs.js`

**When to Use**:
- Repository root has many old `test-timing-*.log` files (>50 files)
- Before major cleanup sessions (safely preserve logs)
- When testlogs has suspicious "ALL" labels (tool detects mislabeled suites)
- After test suite reconfigurations (ensure correct suite names)

**Features**:
- ✅ Smart import: Only imports most recent root log (ignores old logs as outdated)
- ✅ Hash-based duplicate detection: SHA256 comparison prevents re-importing identical files
- ✅ Suite validation: Checks if "ALL" suite logs actually test comprehensively (≥100 tests, ≥50 files)
- ✅ Safe by default: Dry-run mode unless `--execute` flag provided
- ✅ Audit mode: Reviews existing testlogs for mislabeled suites

**Common Commands**:
```bash
# Audit existing testlogs (validate suite claims, detect issues)
node tools/migrate-test-logs.js --audit

# Dry run - see what would be migrated
node tools/migrate-test-logs.js

# Execute migration and cleanup (DESTRUCTIVE - deletes root logs)
node tools/migrate-test-logs.js --execute

# Verbose mode (detailed analysis)
node tools/migrate-test-logs.js --verbose
```

**Typical Workflow**:
```bash
# 1. Check what's in root
(Get-ChildItem test-timing-*.log).Count  # e.g., 805 files

# 2. Audit testlogs to find issues
node tools/migrate-test-logs.js --audit
# Shows: Many "ALL" logs with only 1-30 tests (mislabeled)

# 3. Dry run to preview migration
node tools/migrate-test-logs.js
# Shows: Would import most recent, delete 804 old logs

# 4. Execute if satisfied
node tools/migrate-test-logs.js --execute
# Imports recent log, deletes old root logs
```

### Cleanup Tool: `tools/cleanup-test-logs.js`

**Aggressive Strategy** (October 2025):
- Default: Keep only **2 most recent logs per suite type** (not 20)
- NO time-based retention (ignore age, focus on suite coverage)
- Parallel processing: Worker threads scan 1,000+ files in <5 seconds
- Rationale: Large testlogs directory slows AI code scanning and git operations

**Common Commands**:
```bash
# Preview deletions (dry run, default: keep 2 per suite)
node tools/cleanup-test-logs.js --stats

# Execute cleanup (DESTRUCTIVE - removes ~99% of old files)
node tools/cleanup-test-logs.js --execute

# Custom retention (keep 5 most recent per suite instead of 2)
node tools/cleanup-test-logs.js --keep 5 --execute

# Only "ALL" suite logs (for aggressive archival)
node tools/cleanup-test-logs.js --all-only --execute

# Parallel options (default: auto-detect CPU count, max 2 workers)
node tools/cleanup-test-logs.js --parallel 4 --execute
```

**Performance**:
- Scans: ~1,250 logs/thread in parallel
- Runtime: <5 seconds for 2,000+ files
- Cleanup result: 99.6% reduction (2,290 → 10 files typical)

**Typical Workflow**:
```bash
# 1. Check what will be deleted
node tools/cleanup-test-logs.js --stats
# Shows: X files found, Y to keep, Z to delete, space freed

# 2. Execute cleanup
node tools/cleanup-test-logs.js --execute
# Fast deletion with parallel processing

# 3. Verify result
node tools/count-testlogs.js --breakdown
# Confirms only 2-3 recent logs remain
```
- ❌ After major milestones (preserve baseline logs)
- ❌ All logs are recent (<7 days) and count is reasonable (<50)

**Integration with Test Log Analyzer**:
```bash
# Before cleanup: Check what test history would be lost
node tests/analyze-test-logs.js --summary
# Shows: Current test status across all logs

# After cleanup: Verify important history preserved
node tests/analyze-test-logs.js --summary
# Should still show recent test status
```

**Aggressive Strategy** (October 2025):
- **Default**: Keep only 2 most recent logs per suite type
- **Custom**: Use `--keep N` to adjust per suite retention
- **All Options**: Run `node tools/cleanup-test-logs.js --help` for complete options (--parallel, --all-only, --stats)
- **Result**: Typically keeps 3-5 logs total, deletes 99% of old files (saves 12+ MB, speeds AI scanning)

---

## Configuration-Based Test Execution (October 2025)

**CRITICAL FOR AUTONOMOUS OPERATION**: Use configuration-based test runner to avoid PowerShell confirmation dialogs.
Get-ChildItem test-timing-*.log | Sort-Object LastWriteTime | Select-Object Name, LastWriteTime

# Keep newest 10 logs, delete older ones (after confirming criteria above)
Get-ChildItem test-timing-*.log | Sort-Object LastWriteTime | Select-Object -SkipLast 10 | Remove-Item

# Or delete logs older than 7 days
$cutoff = (Get-Date).AddDays(-7)
Get-ChildItem test-timing-*.log | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item
```

**When NOT to Delete**:
- ❌ During active test fixing (need logs for comparison)
- ❌ When investigating test failures (need historical context)
- ❌ Logs from major milestones (e.g., "all E2E passing")
- ❌ Recent logs (<7 days old)
- ❌ When less than 10 logs total

**Best Practice**: Keep 10-20 recent logs for diagnostics, delete older ones periodically during tidying phases.

**Integration with Documentation Review**:
- Tests MUST validate functionality described in documentation
- When docs claim a feature exists, tests MUST verify it works
- When tests fail, check if documentation is inaccurate
- When documentation changes, update corresponding tests

**Key Principles**:
- ✅ **Autonomous Operation**: Fix tests without asking for confirmation
- ✅ **Single Test Focus**: Run one test file at a time, never full suite
- ✅ **Incremental Progress**: Fix, verify, document, move to next
- ✅ **Status Tracking**: Keep `TESTING_STATUS.md` current with failing tests only
- ✅ **Timeout Discipline**: Use own timeouts to detect hanging tests
- ✅ **Small Functionality**: Each test should verify small, specific behavior
- ✅ **ALWAYS Verify Exit Codes**: Use `terminal_last_command` after EVERY test run - exit code 0 = pass, non-zero = fail
- ✅ **Read Terminal Output**: Task success messages are UNRELIABLE - always read actual test output for failures/hangs
- ❌ **Never Run Full Suite**: Full test suite hangs - always run individual files
- ⚠️ **Single-Test Default**: Fix one test file, verify it passes, then move to next (batch only for simple structural fixes with same root cause)
- ❌ **Never Trust Task Success Messages**: VS Code tasks show "succeeded" even with exit code 1 (failure)

---

## TESTING_STATUS.md Management

**Location**: `docs/TESTING_STATUS.md` (create if doesn't exist)  
**Purpose**: Single source of truth for current testing state  
**Max Size**: 200 lines (enforced)  
**Update Frequency**: After every test run

### TESTING_STATUS.md Structure

```markdown
# Testing Status

**Last Updated**: [Timestamp]  
**Passing Tests**: [Count] / [Total Known]  
**Failing Tests**: [Count] (max 2 tracked)  
**Status**: [ACTIVE | BLOCKED | COMPLETE]

---

## Currently Passing Tests (Summary Only)

**Total Passing**: [Count]

### By Category
- Unit Tests: [X] passing
- Integration Tests: [X] passing  
- E2E Tests: [X] passing

### Recently Fixed
- `file.test.js` - Fixed [date] - [brief reason]
- `other.test.js` - Fixed [date] - [brief reason]

**Note**: Do not re-run passing tests unless:
- Their source code changed
- Related dependencies changed
- Testing specific regression

---

## Currently Failing Tests (Detail - Max 2)

### 1. [Test File Name 1]

**File**: `path/to/test1.test.js`  
**Status**: FAILING  
**Last Run**: [Timestamp]  
**Timeout Used**: [30s / 60s / custom]  
**Failure Type**: [HANG | ASSERTION | ERROR | TIMEOUT]

**Symptoms**:
- [Specific error message or behavior]
- [What the test was doing when it failed]

**Investigation**:
- [ ] Read test file and understand intent
- [ ] Check if documented functionality exists
- [ ] Verify test setup/teardown
- [ ] Check for async issues
- [ ] Review related source code

**Attempted Fixes**:
1. [Date] - [What was tried] - [Result]
2. [Date] - [What was tried] - [Result]

**Current Hypothesis**:
[Your current understanding of why it's failing]

**Next Actions**:
1. [Specific next step to try]
2. [Alternative if that fails]

---

### 2. [Test File Name 2]

[Same structure as above]

---

## Backlog (Failing Tests Not Currently Tracked)

**Note**: Only list names, no details. Work on max 2 at a time.

- `test3.test.js` - [One-line summary]
- `test4.test.js` - [One-line summary]

---

## Testing Insights

### Patterns Discovered
- [Common failure pattern across multiple tests]
- [Common fix that worked multiple times]

### Blockers
- [Systemic issues preventing progress]
- [Missing infrastructure or tools]

---
```

### Update Rules

**When to Update TESTING_STATUS.md**:
1. ✅ After EVERY test run (even if result unchanged)
2. ✅ When starting work on a new test file
3. ✅ When a test passes (move to "Recently Fixed", remove from failing)
4. ✅ When discovering new failing test (add to backlog)
5. ✅ When hypothesis changes based on investigation
6. ✅ When attempting a fix (add to "Attempted Fixes")

**🚨 CRITICAL: Autonomous Operation Rule**:
- ✅ **CONTINUE ITERATING** when there are clearly more tests to fix (don't stop for confirmation)
- ✅ **Use NEW TOOLS**: `node tests/analyze-failures.js` shows exact errors with line numbers
- ✅ **Fix tests until**: All passing, OR stuck on same issue 3+ times, OR unclear how to proceed
- ✅ **Verify with targeted rerun**: `node tests/run-failed-tests.js` (30s vs 2min)
- ✅ **Track progress**: `node tests/compare-test-runs.js` after each iteration
- ✅ **Only stop to ask** when: Genuinely blocked, need architectural decision, unclear requirements
- ❌ **Never stop** just because you made progress - keep going until done or blocked

**Decision Tree for AI Agents**:
```
After a test run:
│
├─ All tests passing? 
│  └─ YES → ✅ Report success and stop
│  └─ NO → Continue below
│
├─ Run: node tests/analyze-failures.js
│  ├─ Shows clear error types (SqliteError, TypeError, etc.)? 
│  │  └─ YES → ✅ Fix the issue, run targeted rerun, repeat
│  │  └─ NO → Continue below
│  │
│  ├─ Same error 3+ times in a row?
│  │  └─ YES → ❌ Stop and ask for help
│  │  └─ NO → ✅ Try different approach, continue
│  │
│  └─ Architectural decision needed?
│     └─ YES → ❌ Stop and ask for guidance
│     └─ NO → ✅ Continue fixing
```

**Size Enforcement**:
- If file exceeds 200 lines, archive old "Recently Fixed" entries
- Keep only last 5 "Recently Fixed" entries
- Move older entries to `docs/testing-archive/YYYY-MM-DD-fixes.md`

**Content Rules**:
- ❌ **Never list all passing tests individually** (too verbose)
- ✅ **Only list passing test categories with counts**
- ❌ **Never track more than 2 failing tests in detail**
- ✅ **Always include timestamps for "Last Run"**
- ✅ **Always include timeout values used**
- ✅ **Always update "Current Hypothesis"**

---

## Configuration-Based Test Execution (October 2025)

**CRITICAL FOR AUTONOMOUS OPERATION**: Use configuration-based test runner to avoid PowerShell confirmation dialogs.

### Enhanced Test Analysis Tools (NEW - October 2025)

**MANDATORY WORKFLOW**: Always analyze failures BEFORE running tests.

**New Tools Available**:

1. **`node tests/analyze-failures.js`** - Detailed failure analysis
   - Shows exact error types (SqliteError, TypeError, etc.)
   - Provides line numbers and code snippets
   - Categorizes failures by test file
   - Includes full error messages and stack traces
   - **Speed**: 5-10 seconds
   - **Use when**: Starting debugging session, need detailed error info

2. **`node tests/analyze-failures.js --list`** - Generate failed tests list
   - Creates `tests/failed-tests.json` with all failed test files
   - Used by targeted rerun tool
   - **Speed**: 5 seconds
   - **Use when**: Preparing for targeted rerun

3. **`node tests/run-failed-tests.js`** - Rerun only failed tests
   - Runs ONLY tests that failed in previous run
   - **Speed**: 20-60 seconds (vs 2-5 min for full suite)
   - **Savings**: 80-90% faster iteration
   - **Use when**: After making fixes, want quick verification

4. **`node tests/compare-test-runs.js`** - Compare before/after
   - Shows newly fixed tests
   - Shows new regressions
   - Shows still broken tests
   - Calculates fix rate and progress
   - **Speed**: 5 seconds
   - **Use when**: After test run, want to track progress

**Example Workflow**:
```bash
# 1. Analyze failures in detail (10s)
node tests/analyze-failures.js

# 2. Fix issues in code based on error types/line numbers

# 3. Rerun ONLY failed tests (30s vs 2min)
node tests/run-failed-tests.js

# 4. Compare before/after to see progress (5s)
node tests/compare-test-runs.js

# 5. If failures remain, repeat from step 1
```

**Time Comparison**:
- **Old workflow**: Analyze (10s) → Fix → Full suite (2-5min) → Repeat = 3-6min/iteration
- **New workflow**: Analyze (10s) → Fix → Targeted rerun (30s) → Compare (5s) = 45s/iteration
- **Savings**: 75-90% faster iteration cycles

### Test Runner System

**Files**:
- `tests/test-config.json` - Test suite configurations (AI agents can modify)
- `tests/run-tests.js` - Test runner script
- `tests/analyze-failures.js` - Detailed failure analysis (NEW)
- `tests/run-failed-tests.js` - Targeted rerun (NEW)
- `tests/compare-test-runs.js` - Progress tracking (NEW)
- `tests/README.md` - Complete documentation

**Running Tests**:
```bash
# ✅ CORRECT: Configuration-based (no confirmation needed)
node tests/run-tests.js e2e
node tests/run-tests.js unit
node tests/run-tests.js integration

# ✅ NEW: Targeted rerun (80-90% faster)
node tests/run-failed-tests.js

# ❌ WRONG: Environment variables (triggers confirmation)
cross-env E2E=1 npm test
GEOGRAPHY_E2E=1 npm test -- --testPathPattern=geography
```

**Available Suites** (see `tests/test-config.json`):
- `unit` - Fast unit tests
- `integration` - HTTP server tests
- `e2e` - Standard E2E tests (excludes dev tests)
- `e2e-quick` - Quick E2E smoke tests
- `all` - All regular tests
- `dev-geography` - Development/debugging test (long-running)

**Modifying Test Behavior**:
Edit `tests/test-config.json` to:
- Adjust timeouts
- Change test patterns
- Set max workers
- Add new test suites

**See**: `tests/README.md` for complete details.

---

## Phase 1: Test Discovery & Inventory (30-60 minutes)

**CRITICAL CHANGE (October 2025)**: Use Test Log Analyzer instead of running full test suite.

### Step 1.1: Analyze Historical Test Logs

**DO THIS FIRST** - Understand current state without running tests:

```bash
# Full analysis with priorities (10 seconds)
node tests/analyze-test-logs.js

# Output sections to review:
# - 📊 CURRENT TEST STATUS: Latest run results
# - ✅ FIXED TESTS: Recently fixed (learn from these)
# - ❌ REGRESSIONS: Tests that broke recently (high priority)
# - 🔴 STILL BROKEN: Prioritized by failure rate
# - 🎯 AI AGENT SUMMARY: Smart prioritization
```

**What to Extract**:
1. **Total test count**: How many unique tests tracked
2. **Passing count**: Latest full run passing tests
3. **Failing count**: Tests currently broken
4. **Regression count**: Tests that broke recently (investigate immediately)
5. **Priority broken tests**: Top 10 from AI Agent Summary
6. **Hanging tests**: Look for 🐌🐌🐌 emoji (>30s runtime)

### Step 1.2: Categorize Broken Tests by Pattern

From analyzer output, group failures by type:

**Pattern 1: Structural Failures** (100% failure rate, many attempts)
```
Example: compression.test.js - Failure rate: 93% | Attempts: 15
```
- Indicates schema mismatch, missing dependency, or wrong setup
- **Fix first** - these block other work

**Pattern 2: Hanging Tests** (🐌🐌🐌 emoji, >30s runtime)
```
Example: geography-crawl.e2e.test.js - Runtime: 608.4s
```
- Indicates missing AbortController, no async cleanup
- Read `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` before fixing

**Pattern 3: Regressions** (Was passing, broke recently)
```
Example: compression.test.js - Was passing: 2025-10-09, Broke: 2025-10-10
```
- New code broke existing functionality
- Check recent commits for root cause

**Pattern 4: Intermittent Failures** (50-80% failure rate)
```
Example: queues.ssr.http.test.js - Failure rate: 95% | Attempts: 20
```
- Race conditions, timing dependencies, flaky tests
- Add delays, check async/await usage

### Step 1.3: Create Work Plan

Based on analyzer priority output:

1. **Fix structural failures first** (highest failure rate)
2. **Then fix regressions** (broke recently, easier to find cause)
3. **Then fix hanging tests** (require async cleanup patterns)
4. **Finally fix intermittent failures** (hardest to diagnose)

**Document in TESTING_STATUS.md**:
```markdown
## Priority Work Plan (from Test Log Analyzer)

### High Priority (Structural Failures)
1. compression.test.js - 93% failure rate, 15 attempts
2. compressionBuckets.test.js - 93% failure rate, 15 attempts

### Medium Priority (Regressions)
1. BackgroundTaskManager.test.js - Was passing, broke 2025-10-10

### Lower Priority (Hanging Tests)
1. geography-crawl.e2e.test.js - 608s runtime (needs async cleanup)
```

### Step 1.4: Learn from Recent Fixes

Check what was recently fixed to understand patterns:

```bash
node tests/analyze-test-logs.js | grep "✅ RECENTLY FIXED" -A 20
```

Review code changes that fixed similar issues to your current problems.

### Step 1.5: Verify with Focused Test Run (Optional)

Only run tests if analyzer data is stale (>1 day old):

```bash
# Run specific suite to generate fresh logs
node tests/run-tests.js unit

# Re-analyze to capture new results
node tests/analyze-test-logs.js --summary
```

**Previous Approach (Deprecated)**:
- ❌ Running full test suite first (takes 75s, hangs, unreliable)
- ❌ Parsing terminal output manually
- ❌ Guessing which tests to fix first

**New Approach (October 2025)**:
- ✅ Analyze historical logs first (10s, comprehensive)
- ✅ Smart prioritization built-in
- ✅ See patterns across multiple runs
- ✅ Learn from recent fixes

### Objectives
- **Consult existing test logs FIRST** (avoid redundant test runs)
- Discover all test files in project
- Categorize tests by type and coverage area
- Identify which tests are currently passing vs failing
- Build initial TESTING_STATUS.md

### Tasks

**1.0 Consult Existing Test Logs** ⭐ **DO THIS FIRST**

**CRITICAL**: Before running ANY tests, check existing logs to understand previous test runs.

```bash
# Option 1: Simple query tools (NO APPROVAL NEEDED - FASTEST)
node tests/get-test-summary.js --compact  # Quick overview (5s)
node tests/get-failing-tests.js           # List failures + message (5s)
node tests/get-failing-tests.js --history --test <pattern>  # Confirm specific test pass/fail history

# Option 2: Direct file reading (NO APPROVAL NEEDED - DETAILED)
node tests/get-latest-log.js              # Get log path (2s)
# Then use read_file tool on returned path

# Option 3: Comprehensive analysis (BEST FOR PATTERNS)
node tests/analyze-test-logs.js --summary # Full analysis (10s)

# Option 4: Simple PowerShell (if tools unavailable)
Get-ChildItem testlogs\*unit*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

**What to Extract from Logs**:
- [ ] **Identify failing tests**: Which tests failed in last run? (focus on these first)
- [ ] **Check failure messages**: What errors occurred? (saves diagnosis time)
- [ ] **Note test durations**: Which tests are slow? (>10s = needs timeout guards)
- [ ] **Count passing tests**: How many passed? (don't re-run these unless needed)
- [ ] **Check for hangs**: Any tests that exceeded timeout? (priority for timeout guards)
- [ ] **Review patterns**: Multiple tests failing with same error? (common root cause)

**Update TESTING_STATUS.md from Logs**:
- [ ] Add failed tests from logs to "Currently Failing Tests" (max 2) or "Backlog"
- [ ] Add passing test counts to "Passing Tests" summary
- [ ] Note common failure patterns in "Testing Insights"
- [ ] Record log timestamp as "Last Known Test Run"

**When to Skip Log Consultation**:
- ✅ Logs are >7 days old (likely stale)
- ✅ Code changes made since last run (tests need re-run)
- ✅ No test logs exist (first time running tests)
- ❌ **NEVER skip if recent logs exist** - saves 30-60 minutes of test runs

**Example Log Analysis** (5-10 minutes):
```markdown
# From test-timing-2025-10-10T14-30-22.log

Failed Tests (3):
1. src/ui/express/__tests__/crawls.controls.api.test.js
   Error: Cannot read property 'status' of undefined
   Duration: 2.3s

2. src/background/__tests__/compression.test.js
   Error: Test exceeded 30s timeout
   Duration: 30.1s (HANG)

3. src/crawler/__tests__/gazetteer.test.js
   Error: Expected 200, got 404
   Duration: 1.8s

Passing Tests: 124/127 (97.6%)
Slow Tests (>10s): 8 tests need timeout review

→ Add these 3 to TESTING_STATUS.md "Backlog"
→ Start with crawls.controls.api.test.js (quickest to fix)
→ compression.test.js needs timeout guards (Phase 4 work)
```

**1.1 Discover Test Files**
```bash
# Find all test files
file_search query:"**/*.test.js"
file_search query:"**/__tests__/**/*.js"
file_search query:"**/*.e2e.test.js"
```

- [ ] List all test files found (count)
- [ ] Categorize by type: unit, integration, E2E
- [ ] Categorize by area: crawler, background, UI, database, etc.
- [ ] Check package.json for test scripts and their configs

**1.2 Review Test Running Infrastructure**
- [ ] Read `jest.config.js` or equivalent test runner config
- [ ] Check `jest.setup.js` for global test configuration
- [ ] Review test timeouts, reporters, and environment settings
- [ ] Identify which tests have custom configurations
- [ ] Check for test-specific scripts in package.json

**1.3 Sample Test Execution (Discovery Phase)**

**CRITICAL: Run tests ONE FILE AT A TIME with timeout wrapper**

```bash
# Pattern: Use timeout command with individual test file
npm run test:file "specific-test-name"

# If no dedicated script, use direct Jest with timeout
node --experimental-vm-modules node_modules/jest/bin/jest.js path/to/test.test.js --testTimeout=30000
```

**Timeout Wrapper Strategy**:
```powershell
# Create a timeout wrapper function for PowerShell (if needed)
# Run test with maximum 60s timeout
$job = Start-Job -ScriptBlock { npm run test:file "test-name" }
$result = Wait-Job -Job $job -Timeout 60
if ($result -eq $null) {
    Stop-Job -Job $job
    Write-Output "TEST HUNG: Exceeded 60s timeout"
} else {
    Receive-Job -Job $job
}
```

**Discovery Sampling Strategy**:
- [ ] Pick 5-10 representative test files (mix of unit, integration, E2E)
- [ ] Run each with 30-60s timeout
- [ ] Record: PASS, FAIL (reason), HANG (timeout exceeded)
- [ ] Build initial passing/failing/hanging categorization
- [ ] **DO NOT run full test suite** - it hangs

**1.4 Create Initial TESTING_STATUS.md**
- [ ] Create `docs/TESTING_STATUS.md` if doesn't exist
- [ ] Populate with template structure
- [ ] Fill in "Passing Tests" counts based on sampling
- [ ] Add 1-2 failing tests to "Currently Failing" section
- [ ] List remaining known failing tests in "Backlog"
- [ ] Add timestamp and status

### Deliverables
- **TESTING_STATUS.md** created with current state
- **Test inventory** (list of all test files by category)
- **Initial pass/fail status** (from sampling run)

---

## Phase 2: Documentation-Test Alignment (1-2 hours)

### Objectives
- Verify that tests exist for documented features
- Verify that tests validate what documentation claims
- Identify gaps where docs claim features but no tests exist
- Identify tests that test undocumented behavior

### Tasks

**2.1 Map Documentation to Tests**

For each major documentation file:
- [ ] Read documentation file (e.g., `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`)
- [ ] Extract claimed behaviors/features (what it says the system does)
- [ ] Search for corresponding tests: `grep_search query:"feature-name" includePattern:"**/*.test.js"`
- [ ] Verify tests exist for each claimed behavior
- [ ] Record gaps: documented features with no tests

**2.2 Map Tests to Documentation**

For each test file in scope (work through systematically):
- [ ] Read test file and understand what it validates
- [ ] Search for corresponding documentation: `semantic_search query:"behavior being tested"`
- [ ] Verify documentation describes what test validates
- [ ] Record gaps: tests validating undocumented behavior (may indicate missing docs)

**2.3 Validate Test Accuracy**

For critical behaviors (API contracts, data transformations, state machines):
- [ ] Read documentation claim (e.g., "API returns 200 with job object")
- [ ] Read corresponding test code
- [ ] Verify test actually validates the claim (not just mocking/stubbing)
- [ ] **Check analyzer first**: `node tests/analyze-test-logs.js --test "test-name"` to see historical status
- [ ] Run test to confirm current status: `npm run test:file "test-name"`
- [ ] If test fails, determine: is code broken or docs wrong?

**Example Workflow**:
```markdown
# Documentation Claim (from API_ENDPOINT_REFERENCE.md)
POST /api/crawl/pause/:id
Returns: 200 OK with { success: true, message: "..." }

# Find Test
grep_search query:"POST.*pause" includePattern:"**/*.test.js"
→ Found: src/ui/express/__tests__/pause-resume.api.test.js

# Check History First (NEW - saves time)
node tests/analyze-test-logs.js --test "pause-resume.api"
→ Shows: 15 runs, 14 passes, 1 fail (99% pass rate)
→ Decision: Test is stable, skip running unless code changed

# Read Test
read_file filePath:"src/ui/express/__tests__/pause-resume.api.test.js"
→ Verify it checks for 200 status and success:true

# Run Test (only if needed based on history)
npm run test:file "pause-resume.api"
→ PASS (documentation claim verified)

# Update TESTING_STATUS.md
Add pause-resume.api.test.js to "Recently Fixed" or "Passing Tests"
```

**2.4 Update TESTING_STATUS.md**

For each test validated:
- [ ] **Use analyzer for bulk status**: `node tests/analyze-test-logs.js --summary`
- [ ] If test passes and validates documented behavior: Add to passing count
- [ ] If test fails: Add to "Currently Failing" (max 2) or "Backlog"
- [ ] If test hangs: Note timeout issue, add to "Currently Failing"
- [ ] Record any documentation-test mismatches discovered

### Deliverables
- **Updated TESTING_STATUS.md** with alignment results
- **Doc-to-Test Gap List** (documented features needing tests)
- **Test-to-Doc Gap List** (tested behaviors needing documentation)
- **Mismatch List** (tests/docs that contradict each other)

---

## Phase 3: Systematic Test Fixing (Ongoing - 2-4 hours per iteration)

### Objectives
- Fix failing tests one at a time
- Verify each fix before moving to next
- Keep TESTING_STATUS.md updated
- Never work on more than 2 tests simultaneously

### Workflow: Single Test Fix Cycle

**CRITICAL: Follow this cycle for EACH test file.** 

**Exception - Batch Testing for Simple Fixes**: When multiple tests share the same structural issue (e.g., missing schema column, wrong import path, removed table), you may run them together to verify the fix works across all affected tests. Batch size: 4-6 tests max, runtime <10s total. Run batch → verify all pass → move to next batch. See "Batch-Friendly Scenarios" in Efficiency Guidelines.

#### Step 1: Select Test (2-5 minutes)

**Use Analyzer for Priority** (RECOMMENDED):
```bash
# Get prioritized list of failing tests
node tests/analyze-test-logs.js --summary

# Check specific test history
node tests/analyze-test-logs.js --test "test-name"
```

**Analyzer-Based Selection**:
- [ ] **Structural failures first** (100% failure rate) - likely schema/config issues
- [ ] **High-attempt failures** (>10 attempts) - indicates blocking issues
- [ ] **Recent regressions** (was passing, now failing) - recent code broke it
- [ ] **Hanging tests** (🐌🐌🐌 >30s) - need timeout guards
- [ ] **Intermittent failures** (50-80% fail rate) - may be timing/race conditions

**Select Test**:
- [ ] Review analyzer output or TESTING_STATUS.md "Currently Failing Tests"
- [ ] Pick ONE test to work on (prefer simpler/quicker wins first)
- [ ] **If analyzer shows structural (100%)**: Likely schema bug, high priority
- [ ] **If analyzer shows hanging**: Add timeout guards, often straightforward
- [ ] **If analyzer shows regression**: Check recent commits
- [ ] Update TESTING_STATUS.md: Note "Started work on [test] at [time]"

#### Step 2: Understand Test (5-15 minutes)

- [ ] Read test file completely: `read_file filePath:"path/to/test.test.js"`
- [ ] Understand test intent: What functionality is being validated?
- [ ] Check test file header: Does it have CRITICAL TESTING RULES? (from AGENTS.md)
- [ ] Identify test structure: setup, execution, assertions, teardown
- [ ] Check for async patterns: promises, async/await, callbacks
- [ ] Check for timeout guards: explicit timeouts, withTimeout(), AbortController
- [ ] Note dependencies: what external services, DBs, APIs does it use?

#### Step 3: Check Documentation Alignment (5-10 minutes)

- [ ] Find related documentation: `semantic_search query:"feature being tested"`
- [ ] Read documentation claim about this functionality
- [ ] Verify test validates what docs claim (not something else)
- [ ] If mismatch: determine if test is wrong or docs are wrong
- [ ] Update documentation if needed (fix-as-you-go principle)

#### Step 4: Run Test with Timeout (2-5 minutes)

**Check Analyzer First** (saves time if already run recently):
```bash
# Check test history
node tests/analyze-test-logs.js --test "test-name"
```

**Decision**: 
- If analyzer shows recent PASS (100%) and code unchanged → Skip run, move to next test
- If analyzer shows recent FAIL → Use last log error for diagnosis (Step 5)
- If no log entry or code changed → Run test now

```bash
# Run individual test file with explicit timeout
npm run test:file "test-name"

# OR direct Jest with timeout
node --experimental-vm-modules node_modules/jest/bin/jest.js path/to/test.test.js --testTimeout=30000
```

**Timeout Strategy**:
- Start with 30s timeout
- If test is known E2E or integration: 60s timeout
- If test hangs at timeout: It has async issues (needs timeout guards)
- Record timeout used in TESTING_STATUS.md

**Outcome Categories**:
1. **PASS**: Test passes → Update TESTING_STATUS.md, move to next test
2. **FAIL (assertion)**: Test runs but assertion fails → Proceed to Step 5
3. **FAIL (error)**: Test throws error → Proceed to Step 5
4. **HANG (timeout)**: Test exceeds timeout → Add timeout guards (Step 5)

#### Step 5: Diagnose Failure (10-30 minutes)

**For Assertion Failures**:
- [ ] Read assertion error message carefully
- [ ] Identify what was expected vs what was received
- [ ] Check if test expectations are correct (re-read documentation)
- [ ] Check if implementation matches documentation
- [ ] Add debugging output if needed: `console.error('[DEBUG]', variable)`
- [ ] Re-run test to see debugging output
- [ ] Form hypothesis about root cause

**For Runtime Errors**:
- [ ] Read error stack trace
- [ ] Identify which line/file caused error
- [ ] Check for: missing imports, undefined variables, wrong API usage
- [ ] Use `read_file` to check implementation if needed
- [ ] Form hypothesis about root cause

**For Timeout/Hang Issues**:
- [ ] Check if test has explicit timeout: `test('name', async () => {...}, 30000)`
- [ ] Check if test uses timeout guards: `withTimeout()`, `createWatchdog()`
- [ ] Check for progress logging: `console.log('[TEST] Step X')`
- [ ] Check for AbortController with timeout on network calls
- [ ] Add missing timeout guards (see `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md`)
- [ ] Add progress logging to identify where it hangs

#### Step 6: Implement Fix (10-45 minutes)

**Fix Categories**:

**A. Test Code Fix** (test expectations wrong):
```javascript
// Example: Test expected wrong status code
// Before
expect(response.status).toBe(404); // Wrong expectation

// After (verify against API_ENDPOINT_REFERENCE.md)
expect(response.status).toBe(200); // Correct expectation
```

**B. Implementation Fix** (code doesn't match docs):
```javascript
// Example: API not returning documented field
// Read documentation → Check implementation → Fix implementation
// Update route handler to return documented response structure
```

**C. Timeout Guard Addition** (test hangs):
```javascript
// Before
test('should process items', async () => {
  await longRunningOperation();
  expect(result).toBeDefined();
});

// After (add explicit timeout + progress logging)
test('should process items', async () => {
  console.log('[TEST] Starting operation');
  await longRunningOperation();
  console.log('[TEST] Operation complete');
  expect(result).toBeDefined();
}, 30000); // Explicit 30s timeout
```

**D. Async Cleanup Fix** (open handles):
```javascript
// Before
afterAll(() => {
  db.close();
});

// After (proper async cleanup)
afterAll(async () => {
  if (app.locals.backgroundTaskManager) {
    await app.locals.backgroundTaskManager.shutdown();
  }
  const db = app.locals.getDb?.();
  if (db?.close) db.close();
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

**Fix Implementation Steps**:
- [ ] Make ONE focused change (don't fix multiple things at once)
- [ ] Use `replace_string_in_file` for code changes (never PowerShell commands)
- [ ] Add comments explaining why fix was needed
- [ ] Update TESTING_STATUS.md: Add to "Attempted Fixes" with timestamp

#### Step 7: Verify Fix (2-5 minutes)

- [ ] Run test again with same timeout
- [ ] Check result: PASS, FAIL, HANG
- [ ] If PASS: Proceed to Step 8
- [ ] If still FAIL/HANG: Return to Step 5 with new information
- [ ] Update TESTING_STATUS.md: Record result of attempted fix

**Iteration Limit**: If test still failing after 3 fix attempts:
- [ ] Update TESTING_STATUS.md with detailed status
- [ ] Move to "BLOCKED" status with blocker description
- [ ] Move to next test (come back later with fresh perspective)

#### Step 8: Update Status (2 minutes)

**If Test Now Passes**:
- [ ] Update TESTING_STATUS.md:
  - Remove from "Currently Failing Tests"
  - Add to "Recently Fixed" with date and brief reason
  - Increment "Passing Tests" count
  - Update timestamp
- [ ] Check file size: If >200 lines, archive old entries
- [ ] Commit fix with clear message: "fix(tests): [test-name] - [brief reason]"

**If Test Still Failing**:
- [ ] Update TESTING_STATUS.md:
  - Update "Current Hypothesis"
  - Update "Next Actions"
  - Add latest "Attempted Fix"
  - Update "Last Run" timestamp
- [ ] Decide: continue with this test or move to next?

#### Step 9: Select Next Test

- [ ] Review TESTING_STATUS.md "Currently Failing Tests" count
- [ ] If <2 failing tests tracked: Pull next from "Backlog"
- [ ] Repeat cycle from Step 1

### Efficiency Guidelines

**Time Boxing**:
- Understanding test: Max 15 minutes (if longer, test is too complex)
- Diagnosis: Max 30 minutes (if longer, add to BLOCKED)
- Fix implementation: Max 45 minutes (if longer, break into smaller steps)
- Total per test: Aim for 1-2 hours max

**Batch-Friendly Scenarios** (when same fix applies to multiple tests):
- ✅ **Structural issues**: Missing schema column, wrong table name, removed dependency
- ✅ **Import path changes**: Module moved, renamed, or export changed
- ✅ **Simple expectation updates**: Status string changed ('active' → 'running'), removed table returns empty
- ✅ **Shared function addition**: Multiple tests need same utility function
- **Batch guidelines**: 4-6 tests max, runtime <10s total, verify all pass together before moving on
- **Recognition pattern**: If analyzer shows same error message/type across multiple tests, likely batch-friendly

**When to Move On**:
- ✅ Test passes → Always move on
- ✅ 3 fix attempts failed → Move on (come back later)
- ✅ Blocked by external dependency → Move on (add to BLOCKED)
- ✅ Would take >2 hours → Move on (needs refactoring, not quick fix)

**Parallel Work**:
- ❌ Never work on more than 2 tests simultaneously
- ❌ Never run multiple test files in parallel (unless batch scenario above)
- ✅ Can work on test A while test B is blocked
- ✅ Can investigate test B while waiting for human input on test A

### Deliverables (Per Iteration)
- **1-2 tests fixed and verified**
- **Updated TESTING_STATUS.md** with current state
- **Committed fixes** with clear messages

---

## Phase 4: Test Quality Improvement (Ongoing)

### Objectives
- Improve existing tests to follow best practices
- Add timeout guards to tests that hang
- Add progress logging to long-running tests
- Improve test clarity and maintainability
- **Enhance testing tools when friction is encountered** (max 1 simple change/session)

### Testing Tool Improvements

**When to Improve Tools**: When debugging friction is encountered (e.g., can't see error messages, child processes silent, SSE events unclear).

**Process**:
1. ✅ **Consult backlog first**: Check `docs/POTENTIAL_TESTING_IMPROVEMENTS.md` for planned enhancements
2. ✅ **Assess priority**: Is this improvement worth the time RIGHT NOW?
3. ✅ **Keep it simple**: Implement at most 1 simple tool improvement per testing session
4. ✅ **Document fully**: Update all relevant docs (see POTENTIAL_TESTING_IMPROVEMENTS.md for checklist)

**Rule**: AI agents MAY improve testing tools autonomously, but changes must be simple, focused, and fully documented. Do not let tool improvements distract from primary task (fixing tests).

**Example Good Improvements** (Simple, High ROI):
- Add `--errors` flag to analyzer to show error messages
- Add `TEST_SYNC_START` environment variable for synchronous process start
- Add `--debug-startup` flag to crawler for initialization visibility
- Create `captureChildProcess()` helper for capturing stderr/stdout

**Example Bad Improvements** (Complex, Low ROI):
- Refactoring existing tools with breaking changes
- Creating multiple new tools in one session
- Adding experimental features without clear use case

### Tasks

**4.1 Identify Quality Issues with Analyzer**

Use analyzer to find tests needing improvement:
```bash
# Find hanging tests (need timeout guards)
node tests/analyze-test-logs.js | grep "🐌🐌🐌"

# Find intermittent tests (may need better cleanup)
node tests/analyze-test-logs.js --verbose | grep "intermittent"
```

**4.2 Add Test File Headers**

For each test file reviewed:
- [ ] Check if file has `@fileoverview` header with testing rules
- [ ] If missing, add header (use template from `TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md`)
- [ ] Include link to TESTING_ASYNC_CLEANUP_GUIDE.md
- [ ] Include link to TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md

**4.3 Add Timeout Guards**

For tests that hang (analyzer shows 🐌🐌🐌) or take >5s:
- [ ] Add explicit timeout parameter: `test('name', async () => {...}, 30000)`
- [ ] Add progress logging: `console.log('[TEST] Step X')`
- [ ] Wrap async operations with `withTimeout()` if available
- [ ] Add watchdog timer for complex tests: `createWatchdog()`
- [ ] Verify test now fails fast with clear output
- [ ] **Verify with analyzer**: Check that next run shows improved timing

**4.4 Improve Async Cleanup**

For tests with "Jest did not exit" warning:
- [ ] Review afterAll/afterEach cleanup
- [ ] Ensure all timers cleared: `clearTimeout()`, `clearInterval()`
- [ ] Ensure all resources closed: DB connections, file handles, servers
- [ ] Ensure background services shut down: `.shutdown()` methods
- [ ] Add `--forceExit` flag if using instrumented DB (acceptable workaround)
- [ ] **Verify with analyzer**: Check that intermittent failures reduce

**4.5 Improve Test Clarity**

For tests that are hard to understand:
- [ ] Add descriptive test names: "should [expected behavior] when [condition]"
- [ ] Add comments explaining setup steps
- [ ] Break complex tests into smaller, focused tests
- [ ] Extract common setup into helper functions
- [ ] Document non-obvious assertions

**4.6 Update Documentation with Insights**

After fixing patterns of failures:
- [ ] Run analyzer to see cumulative fixes: `node tests/analyze-test-logs.js`
- [ ] Document common patterns discovered (schema issues, WAL isolation, etc.)
- [ ] Update AGENTS.md with new anti-patterns if broadly applicable
- [ ] Update TESTING_STATUS.md noting quality improvements

---

## Phase 5: Test Coverage Analysis (Optional - 1-2 hours)

### Objectives
- Identify untested code paths
- Prioritize areas needing new tests
- Create new tests for critical gaps

### Tasks

**5.1 Coverage Measurement**

```bash
# Run coverage for specific test file
npm test -- --coverage --testPathPattern="test-name"

# Or if coverage script exists
npm run test:coverage
```

- [ ] Identify files with <80% coverage
- [ ] Identify critical code paths with no coverage
- [ ] Prioritize by: API endpoints > core logic > utilities > UI

**5.2 Create Missing Tests**

For critical gaps:
- [ ] Create new test file using naming convention
- [ ] Add test file header with testing rules
- [ ] Write tests for uncovered code paths
- [ ] Run tests to verify they pass
- [ ] Update TESTING_STATUS.md with new tests

**5.3 Update Documentation**

- [ ] Update test counts in README.md if applicable
- [ ] Update TESTING_STATUS.md with new passing tests
- [ ] Add testing guidance to feature documentation if missing

### Deliverables
- **New test files** for critical gaps
- **Coverage report** highlighting remaining gaps
- **Updated TESTING_STATUS.md**

---

## Autonomous Operation Guidelines

**CRITICAL: This process is designed for autonomous execution.**

### Execution Rules

1. **No Mid-Task Confirmations**:
   - ✅ Make fixes autonomously
   - ✅ Run tests and verify results
   - ✅ Update TESTING_STATUS.md continuously
   - ❌ Don't ask "should I fix this?" - just fix it
   - ❌ Don't ask "should I run this test?" - just run it

2. **When to Ask for Input**:
   - 🟡 Test is BLOCKED by external dependency (need human to fix)
   - 🟡 Test reveals fundamental architectural issue (need design decision)
   - 🟡 Fix would require major refactoring (>2 hours work)
   - 🟡 Unclear if behavior is bug or intentional (need clarification)

3. **Progress Reporting**:
   - ✅ Update TESTING_STATUS.md after each test run (not user-facing)
   - ✅ Report summary only when phase complete or blocked
   - ❌ Don't report after each individual fix
   - ❌ Don't create separate status reports

4. **Continue Signals**:
   - If user says "continue" or similar: Execute remaining work without pausing
   - Work through checklist systematically until complete or blocked
   - Only report when all work done or genuinely blocked

### Anti-Patterns to Avoid

❌ **Don't**:
- Run full test suite (it hangs)
- Work on >2 tests simultaneously
- Batch fixes across multiple tests without verification
- Ask for confirmation before each fix
- Create dated test status reports (use TESTING_STATUS.md)
- Let TESTING_STATUS.md grow beyond 200 lines
- Re-run passing tests unnecessarily
- Skip documentation alignment checks
- **Run tests without checking logs first** ⭐ (wastes time)
- **Ignore patterns across multiple test failures** (common root cause)
- **Skip Phase 6 self-improvement** (process won't improve)

✅ **Do**:
- Run one test file at a time with timeout
- Fix, verify, update status, move to next
- Fix autonomously using established patterns
- Keep TESTING_STATUS.md current and concise
- Check documentation claims against test reality
- Add timeout guards to hanging tests
- Use progress logging for long tests
- Archive old status entries to keep file small

---

## Phase 6: Process Self-Improvement (30-60 minutes per cycle)

### Objectives
- Reflect on testing review process effectiveness
- Identify bottlenecks and inefficiencies in the testing workflow
- Capture lessons learned for next testing cycle
- Update this guide to incorporate improvements
- Make future testing cycles faster and more effective

### Tasks

**6.1 Review Efficiency Metrics**

Analyze what worked and what slowed you down:
- [ ] **Time per test**: Did fixes take expected time? Which took longer?
- [ ] **Log utilization**: Did logs save test runs? How much time saved?
- [ ] **First-attempt fix rate**: What % of tests fixed on first try?
- [ ] **Re-run rate**: How many times did you re-run same test?
- [ ] **Diagnosis speed**: How long to identify root cause?
- [ ] **Documentation accuracy**: Did docs match test reality?

**Example Metrics** (track in TESTING_STATUS.md or separate notes):
```markdown
# Efficiency Metrics - Testing Cycle [Date]

Tests Fixed: 12
Total Time: 8 hours
Avg Time per Test: 40 minutes
Log-Saved Runs: 18 tests (saved ~2 hours)
First-Attempt Fixes: 8/12 (67%)
Tests Requiring Re-runs: 4 (avg 2.5 runs each)
Tests Blocked: 2 (external dependencies)
```

**6.2 Identify Process Bottlenecks**

What slowed down testing work?
- [ ] **Log access**: Were logs hard to find or parse?
- [ ] **Test selection**: Unclear which test to work on next?
- [ ] **Diagnosis tools**: Missing tools to understand failures?
- [ ] **Documentation gaps**: Tests without corresponding docs?
- [ ] **Test infrastructure**: Flaky tests, timeout issues, setup problems?
- [ ] **Iteration loops**: Too many re-runs to verify fixes?

**Common Bottlenecks** (check which apply):
- ❌ Logs not consulted → Redundant test runs
- ❌ Working on >2 tests → Context switching overhead
- ❌ No timeout guards → Tests hang silently
- ❌ Poor test isolation → Tests affect each other
- ❌ Unclear failure messages → Long diagnosis time
- ❌ Missing documentation → Don't know expected behavior
- ❌ Full suite runs → Wasted time, hangs

**6.3 Capture Lessons Learned**

Document specific insights for future testing:
- [ ] **Common failure patterns**: What errors appeared multiple times?
- [ ] **Quick wins**: What fixes worked across multiple tests?
- [ ] **Anti-patterns discovered**: What coding patterns cause test failures?
- [ ] **Tool discoveries**: What commands/tools were most helpful?
- [ ] **Documentation mismatches**: Where did docs contradict tests?

**Example Lessons**:
```markdown
# Lessons Learned - October 2025

1. Common Pattern: API tests failing with "undefined status"
   → Root cause: Response not awaited properly
   → Fix: Always check async/await in HTTP calls
   → Applied to: 5 tests

2. Common Pattern: Tests hanging at database operations
   → Root cause: Using separate DB connection (WAL isolation)
   → Fix: Always use app.locals.getDb()
   → Applied to: 3 tests

3. Tool Discovery: grep_search with test name finds related docs faster
   → Saved 10+ minutes per test on documentation lookup

4. Documentation Gap: Background task API not documented
   → Created docs/BACKGROUND_TASKS_API.md
   → Prevented future confusion
```

**6.4 Update TESTING_STATUS.md Template**

Based on what you learned, improve the template:
- [ ] Add new sections discovered as useful (e.g., "Common Error Patterns")
- [ ] Remove sections that weren't helpful
- [ ] Adjust "max 2 failing tests" limit if too restrictive or too loose
- [ ] Update "Recently Fixed" retention (currently 5 entries)
- [ ] Add new categories if needed (e.g., "Tests Needing Refactor")

**6.5 Update This Guide**

Make concrete improvements to this document:
- [ ] **Add new checklist items**: Tasks you performed that aren't documented
- [ ] **Remove redundant steps**: Items that weren't necessary
- [ ] **Clarify ambiguous instructions**: Steps that were confusing
- [ ] **Update time estimates**: Adjust phase durations based on actual time
- [ ] **Add examples**: Where examples would have helped
- [ ] **Document new patterns**: Quick fixes that worked multiple times
- [ ] **Add new anti-patterns**: Common mistakes discovered

**Example Updates**:
```markdown
# Before (vague)
- [ ] Run test to verify it passes

# After (specific, based on experience)
- [ ] Run test with 30s timeout for unit tests, 60s for integration tests
- [ ] Check logs first - if passed recently and code unchanged, skip run
- [ ] If fails, capture full error output for TESTING_STATUS.md
```

**6.6 Archive Old Testing Status**

Clean up TESTING_STATUS.md for next cycle:
- [ ] Move all "Recently Fixed" entries older than 30 days to archive
- [ ] Create `docs/testing-archive/YYYY-MM-fixes.md` if needed
- [ ] Keep only most recent insights in "Testing Insights"
- [ ] Reset "Currently Failing Tests" to empty (if all fixed)
- [ ] Update "Last Updated" timestamp

**6.7 Document Improvement Recommendations**

Create actionable recommendations for project improvements:
- [ ] **Test infrastructure**: What needs to be built/improved?
- [ ] **Test quality**: Which tests need refactoring?
- [ ] **Documentation**: What docs are missing or wrong?
- [ ] **Code quality**: What code patterns cause test failures?
- [ ] **Tooling**: What tools would speed up future testing?

**Example Recommendations**:
```markdown
# Testing Process Improvements - October 2025

## High Priority
1. Add timeout guards to all E2E tests (8 tests remaining)
2. Create helper function for common API test setup (DRY principle)
3. Document background task lifecycle in ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md

## Medium Priority
4. Build script to parse test-timing logs into TESTING_STATUS.md format
5. Add test file headers to remaining 85% of test files
6. Create troubleshooting section in README.md

## Low Priority
7. Investigate Jest reporter that shows progress for hanging tests
8. Consider test parallelization strategy (currently sequential)
```

### Deliverables
- **Updated TESTING_STATUS.md** with process metrics and lessons learned
- **Updated TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md** (this file, improved)
- **Archived old test status entries** to keep file under 200 lines
- **Improvement recommendations document** (optional, can be in TESTING_STATUS.md)

### Self-Improvement Questions

Answer these after each testing cycle:

1. **Efficiency**: How could testing have been faster without sacrificing quality?
2. **Effectiveness**: What fixes had biggest impact? Focus more on those?
3. **Blind spots**: What issues did you miss that became apparent later?
4. **Tool gaps**: What tools or scripts would have made this easier?
5. **Pattern recognition**: Did you notice repeated issues suggesting systemic problems?
6. **Log utilization**: How much time did log consultation save?
7. **Scalability**: As test suite grows, will this process scale?
8. **Automation**: What parts could be automated?

### Continuous Improvement Cycle

This Phase 6 makes testing review a **self-improving process**:

```
Testing Cycle 1 → Phase 6 improvements → Updated guide
                                              ↓
Testing Cycle 2 → Phase 6 improvements → Updated guide (now better)
                                              ↓
Testing Cycle 3 → Phase 6 improvements → Updated guide (even better)
                                              ↓
                            ... and so on ...
```

**Key Principle**: Each testing cycle should make the NEXT cycle faster, easier, and more effective.

**When to Run Phase 6**:
- ✅ After fixing 10+ tests (enough data for patterns)
- ✅ After completing a major testing push
- ✅ When process feels inefficient (bottlenecks identified)
- ✅ Every 2-4 weeks during active testing
- ❌ Not after every single test fix (too frequent)

---

## Integration with Documentation Review

**Two-Way Validation**:

1. **Documentation Review → Testing Review**:
   - When reviewing docs, check if claimed features have tests
   - When docs claim behavior, run corresponding test to verify
   - When docs are updated, update tests to match

2. **Testing Review → Documentation Review**:
   - When test fails, check if documentation is wrong
   - When test validates undocumented behavior, add documentation
   - When test is confusing, check if better docs would help

**Workflow Integration**:

```markdown
# Example: Reviewing API documentation
Step 1: Read API_ENDPOINT_REFERENCE.md claim
  "POST /api/pause returns 200 with {success: true}"

Step 2: Find corresponding test
  grep_search query:"pause.*api" includePattern:"**/*.test.js"
  → Found pause-resume.api.test.js

Step 3: Run test to verify claim
  npm run test:file "pause-resume.api"
  → FAIL: Expected 200, got 503

Step 4: Investigate mismatch
  read_file "src/ui/express/routes/pause.js"
  → Code returns 503 when job not found

Step 5: Determine correct behavior
  - Is 503 correct? (job not found = service unavailable)
  - Or should it be 404? (job not found = not found)
  → 404 is more appropriate

Step 6: Fix implementation
  replace_string_in_file: Change route to return 404

Step 7: Update documentation
  replace_string_in_file: Update API_ENDPOINT_REFERENCE.md

Step 8: Verify test now passes
  npm run test:file "pause-resume.api"
  → PASS

Step 9: Update TESTING_STATUS.md
  Add pause-resume.api.test.js to "Recently Fixed"
```

---

## Success Metrics

Track these metrics in TESTING_STATUS.md:

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Passing Tests** | >95% | Count passing / total tests |
| **Test Execution Time** | <60s per file | Time each test run |
| **Timeout Guards** | 100% async tests | Count tests with explicit timeouts |
| **Documentation Alignment** | 100% features | Count features with tests / documented features |
| **Hanging Tests** | 0 | Count tests exceeding timeout |
| **Open Handles** | 0 | Count tests with "did not exit" warning |
| **Test Clarity** | >80% with headers | Count tests with @fileoverview headers |
| **Log Utilization** ⭐ | >80% tests | Count log consultations / total tests fixed |
| **First-Attempt Fix Rate** | >60% | Count tests fixed on first try / total |
| **Process Efficiency** | <45 min/test | Avg time per test fix |

---

## Templates

### TESTING_STATUS.md Initial Template

See "TESTING_STATUS.md Management" section above for full template.

### Test Fix Commit Message Template

```
fix(tests): [test-file-name] - [brief reason]

- [Specific change made]
- [Why it was needed]
- [What behavior it now validates]

Fixes: [Issue number if applicable]
Related: [Documentation file updated]
```

### Test File Header Template

See `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` for complete template.

---

## Real-World Example

**Scenario**: Test `geography.e2e.test.js` hangs silently

**Before**:
- Test runs indefinitely with no output
- No way to know what it's stuck on
- Have to manually kill process
- Blocking other test work

**After Following This Guide**:

1. **Phase 1**: Discovered test via inventory
2. **Phase 2**: Found it validates geography crawl (from docs)
3. **Phase 3**: 
   - Ran with 60s timeout → HANG
   - Added progress logging → Found stuck at "waiting for SSE"
   - Added withTimeout() wrapper → Failed fast with clear error
   - Added AbortController → Test now passes
4. **Phase 4**: Added test file header with timeout rules
5. **Updated TESTING_STATUS.md**: Moved to "Recently Fixed"

**Result**: Test now runs in 12s (was hanging), clear failure messages, validates documented behavior.

---

## Quick Reference

**Common Commands**:
```bash
# CHECK STATUS FIRST ⭐
node tests/get-test-summary.js --compact  # Quick overview (5s, NO APPROVAL)
node tests/get-failing-tests.js           # List failures + message (5s, NO APPROVAL)
node tests/get-failing-tests.js --history --test <pattern>  # Confirm fix history fast

# GET LOG PATH FOR DETAILED READING
node tests/get-latest-log.js              # Returns path (2s, NO APPROVAL)
# Then use read_file tool on returned path

# COMPREHENSIVE ANALYSIS
node tests/analyze-test-logs.js --summary # Full analysis (10s)

# RUN SINGLE TEST
npm run test:file "test-name"

# FIND TEST FOR FEATURE
grep_search query:"feature-name" includePattern:"**/*.test.js"

# CHECK TEST STATUS DOCUMENT
read_file filePath:"docs/TESTING_STATUS.md"
```

**Decision Tree**:
```
Test Result?
├─ PASS → Update TESTING_STATUS.md, move to next test
├─ FAIL (assertion) → Diagnose, fix, re-run
├─ FAIL (error) → Check imports/setup, fix, re-run  
└─ HANG (timeout) → Add timeout guards, add logging, re-run
```

**Time Budget**:
- Understand test: 5-15 min
- Diagnose: 10-30 min  
- Fix: 10-45 min
- Total per test: 1-2 hours max

---

## Phase 6 Insights: Pattern Recognition and Process Improvement

**When to Run**: After fixing 5+ tests or encountering repeated failure patterns  
**Purpose**: Capture learnings to prevent similar issues in future tests

### Recent Insights (October 2025)

#### 1. Schema Mismatches Are Silent Killers

**Pattern Discovered**: `crawl_jobs.id` was `TEXT PRIMARY KEY` instead of `INTEGER PRIMARY KEY AUTOINCREMENT`
- **Impact**: All inserts without explicit `id` created rows with `id = NULL`
- **Symptom**: Queries returned rows but `normalizeQueueRow()` filtered them out (id === null check)
- **Silent Failure**: No errors during insert, only zero results from queries
- **Detection Time**: 60+ minutes (10 temporal dead zone fixes before finding root cause)

**Prevention Strategy**:
```javascript
// ✅ ALWAYS verify schema matches test expectations
// Run this in beforeEach to catch schema issues immediately:
test('schema validation', () => {
  const result = db.prepare('INSERT INTO crawl_jobs (url, status) VALUES (?, ?)').run('https://example.com', 'running');
  expect(typeof result.lastInsertRowid).toBe('number');
  expect(result.lastInsertRowid).toBeGreaterThan(0);
  const row = db.prepare('SELECT * FROM crawl_jobs WHERE id = ?').get(result.lastInsertRowid);
  expect(row).toBeDefined();
  expect(row.id).toBe(result.lastInsertRowid); // ← This would have caught TEXT id!
});
```

**Lesson**: When ALL tests in a suite fail with zero results, suspect schema mismatch before logic bugs.

#### 2. WAL Mode Requires Single Connection Per Test

**Pattern Discovered**: Multiple `createApp()` calls with same dbPath create isolated connections
- **Impact**: Writes to one connection invisible to reads from another (WAL isolation)
- **Symptom**: Data inserted successfully but queries return zero rows
- **Hidden Complexity**: beforeEach creates app, test creates another app, both use same dbPath

**Prevention Strategy**:
```javascript
// ❌ WRONG: Multiple apps = multiple connections
beforeEach(() => {
  app = createApp({ dbPath }); // Connection 1
});
test('...', () => {
  const testApp = createApp({ dbPath }); // Connection 2 - WAL isolation!
  const db = getDbFromApp(testApp);
  db.prepare('INSERT ...').run(); // Invisible to Connection 1!
});

// ✅ RIGHT: Single app per test
beforeEach(() => {
  // Just create tempDbPath, don't open connection
  tempDbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
});
test('...', () => {
  const app = createApp({ dbPath: tempDbPath }); // Single connection
  const db = getDbFromApp(app); // Use SAME connection
  db.prepare('INSERT ...').run(); // Visible to all queries
});
```

**Lesson**: In WAL mode, one app instance per test. Never create multiple apps with same dbPath.

#### 3. Temporal Dead Zone Errors Indicate Test Structure Problems

**Pattern Discovered**: `ReferenceError: Cannot access 'app' before initialization`
- **Impact**: 10 tests failing with identical error at different lines
- **Root Cause**: Tests called `getDbFromApp(app)` BEFORE `const app = createApp(...)`
- **Why It Happened**: Refactoring moved app creation but forgot to move db access

**Prevention Strategy**:
```javascript
// ❌ WRONG: Using variable before declaration
test('...', () => {
  const db = getDbFromApp(app); // ← app used here
  // ... insert data
  const app = createApp({ ... }); // ← app declared here (temporal dead zone!)
});

// ✅ RIGHT: Declare before use
test('...', () => {
  const app = createApp({ ... }); // ← Declare FIRST
  const db = getDbFromApp(app);   // ← Use AFTER
  // ... insert data
});
```

**Lesson**: When 5+ tests fail with same "before initialization" error, check test structure for moved declarations.

#### 4. Error Messages Reveal Root Cause Sequence

**Pattern Discovered**: Fixing temporal dead zone errors revealed schema bug
- **Session Flow**: 
  1. 10 temporal dead zone errors (ReferenceError)
  2. Fixed structure → 10 "resumed: 0" errors (wrong results)
  3. Fixed WAL isolation → Still "resumed: 0" (different cause!)
  4. Found schema bug → All 11 tests pass
- **Insight**: Each fix layer revealed the NEXT underlying issue

**Prevention Strategy**:
1. **Fix structural errors first** (imports, initialization order)
2. **Then fix logic errors** (wrong parameters, missing calls)
3. **Then fix data errors** (schema mismatches, WAL isolation)
4. **Finally fix assertion errors** (wrong expectations)

**Lesson**: Test failures form layers. Fix from outside-in: structure → logic → data → assertions.

#### 5. Targeted Test Runs Exponentially Faster Than Full Suite

**Pattern Discovered**: `npm run test:file "pattern"` runs in 5-6 seconds, full suite hangs indefinitely
- **Time Saved**: 5s vs 600s+ (120x faster, or infinite if full suite never completes)
- **Confidence**: Same test coverage, faster feedback loop
- **Iteration Speed**: Fix 10 tests in 90 minutes vs 10+ hours with full suite

**Prevention Strategy**:
```bash
# ✅ ALWAYS use targeted test runs
npm run test:file "resume-all.api"     # 5s, clear output
npm run test:file "urls.test"          # 2s, 4 tests

# ❌ NEVER use full suite during development
npm test                                # Hangs indefinitely, no output
```

**Lesson**: NEVER run full test suite. Always use `npm run test:file "pattern"` for targeted testing.

#### 6. Multi-Replace is Safer Than Sequential Edits

**Pattern Discovered**: Using `multi_replace_string_in_file` for 10 identical temporal dead zone fixes
- **Attempt 1**: Failed because oldString patterns didn't match (included code after my attempted fix)
- **Lesson**: Multi-replace requires EXACT current file state, not assumed state
- **Better Approach**: Read file, verify exact text, THEN multi-replace

**Prevention Strategy**:
```javascript
// ❌ RISKY: Multi-replace with assumed file state
multi_replace_string_in_file([
  { oldString: "code I think exists", newString: "fixed code" }
]);

// ✅ SAFE: Read first, verify, then replace
read_file({ filePath, offset, limit }); // See actual current state
// Verify oldString matches exactly what's in file
multi_replace_string_in_file([
  { oldString: "exact text from file", newString: "fixed code" }
]);

// ✅ SAFEST: Sequential replace for tricky edits
replace_string_in_file({ oldString, newString }); // One at a time when unsure
```

**Lesson**: Multi-replace is efficient but requires perfect string matching. When first attempt fails, switch to sequential single replacements.

#### 7. Schema Evolution Bugs Are Silent (Session 2, 2025-10-10)

**Pattern Discovered**: `article_places` table removed from schema but code still queries it
- **Impact**: HTTP 500 errors, test failures with "no such table" errors
- **Locations**: `gazetteerPlace.js`, `analyse-pages-core.js`
- **Silent Failure**: No compile-time errors, only runtime failures when code path executes

**Prevention Strategy**:
```javascript
// ✅ Add table existence checks before querying removed tables
const tableExists = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='article_places'"
).get();
if (!tableExists) return [];
```

**Lesson**: When removing schema features, `grep_search` for ALL references in codebase.

#### 8. Async/Await Mismatch Pattern (Session 2, 2025-10-10)

**Pattern Discovered**: `startCrawl()` declared `async` but returns synchronously
- **Symptom**: Caller gets Promise object instead of {jobId, startedAt}, properties undefined
- **Root Cause**: Function uses `setTimeout()` for deferred work, doesn't `await` anything
- **Detection**: If caller doesn't `await` and result is a Promise → function shouldn't be async

**Prevention Strategy**:
```javascript
// ❌ WRONG: async but no await
async function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns Promise<{ jobId }>
}

// ✅ RIGHT: Remove async
function startCrawl() {
  setTimeout(() => { work(); }, 0);
  return { jobId }; // Returns { jobId } directly
}
```

**Rule**: **Only declare `async` if function actually uses `await`**

**Lesson**: 5 tests fixed by removing one `async` keyword.

#### 9. Massive Collateral Win Pattern (Session 3, 2025-10-10)

**Pattern Discovered**: After fixing 2 schema bugs, 10 test suites passed without direct fixes
- **Schema Fixes**: `crawl_jobs.id` (INTEGER vs TEXT), `analysis_version` column
- **Collateral Wins**: urls.test, gazetteer.ssr.http, gazetteer.country.storage, crawl.pending-and-sse, and 6 more
- **Multiplier Effect**: 1 schema fix → 10+ tests passing

**Testing Velocity**:
- Session 1: 11 tests in 60 min (structure/schema fixes)
- Session 2: 38 tests in 20 min (systematic bugs)
- Session 3: 26 tests in 10 min (collateral wins)
- **Total**: 75 tests in 90 min = **50 tests/hour** with systematic approach

**Strategy Shift**: **Don't fix tests individually - find schema bugs first!**

**Lesson**: Schema bugs have multiplicative effect. Prioritize schema issues over individual test failures.

---

## Conclusion

This guide provides a systematic, autonomous, **self-improving** approach to testing review and improvement. It integrates with documentation review to ensure tests validate documented functionality and catches doc-code mismatches.

**Key Takeaways**:
1. **Always consult logs first** - saves 30-60 minutes per cycle
2. **Check schema FIRST** - schema bugs → multiple test failures (1 fix → 10+ tests pass)
3. Never run full test suite (hangs) - use targeted test files
4. Work on one test at a time (max 2 tracked)
5. Keep TESTING_STATUS.md current (max 200 lines)
6. Verify tests match documentation claims
7. Add timeout guards to all async tests
8. Fix autonomously, report only when complete or blocked
9. **Only use `async` if function uses `await`** - avoid Promise return mismatches
10. **One app per test in WAL mode** - multiple connections = isolation
11. **Fix errors in layers** - structure → logic → data → assertions
12. **Check for collateral wins** - after schema fix, run other failing tests
13. **Run Phase 6 after each cycle** - process improves over time

**Next Steps**:
1. **Check logs**: Read test-timing-*.log files for recent failures
2. Run Phase 1 to create/update TESTING_STATUS.md
3. Begin Phase 3 with first failing test from logs
4. Update TESTING_STATUS.md after each test
5. **Run Phase 4 tidying after significant progress** (50+ tests fixed)
6. Run Phase 6 after fixing 10+ tests to improve process
7. Integrate with documentation review when updating docs

**Success Indicators**: 
- TESTING_STATUS.md always reflects current state
- Failing test count decreases steadily
- All tests have timeout guards and validate documented behavior
- **Log utilization >80%** (most test runs informed by logs)
- **Each testing cycle is faster than the last** (process improvement working)

**Key Innovation**: Phase 6 (Self-Improvement) ensures this guide gets better with each use, making future testing cycles faster and more effective.

---

## Related Documentation

**Testing Infrastructure**:
- `docs/TESTING_STATUS.md` - Current test state (passing/failing counts, recent changes)
- `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` - Timeout prevention patterns
- `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Async cleanup patterns
- `docs/TEST_FIXES_2025-10-10.md` - Successful fix examples
- `docs/POTENTIAL_TESTING_IMPROVEMENTS.md` - Testing tool enhancement backlog ⭐ **Consult before improving tools**

**Central Guidance**:
- `AGENTS.md` - Testing guidelines and patterns
- `.github/instructions/GitHub Copilot.instructions.md` - Quick reference workflows

**Testing Tools**:
- `tests/analyze-test-logs.js` - Primary discovery tool
- `tests/run-tests.js` - Configuration-based test runner
- `tests/README.md` - Test runner usage and configuration
