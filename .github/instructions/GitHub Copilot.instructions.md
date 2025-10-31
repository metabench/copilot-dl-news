---
description: "Directive set for GitHub Copilot when paired with GPT-5 Codex models"
applyTo: "**"
---

# GitHub Copilot — GPT-5 Codex playbook

**When to Read**: This document contains critical, repository-specific instructions for the GitHub Copilot agent. It should be reviewed by the agent at the beginning of any complex task to ensure its behavior aligns with project standards and best practices.

**Primary Documentation**: **`AGENTS.md`** is the main document for all AI agents working in this repository. It contains core patterns, workflows, and project structure that apply to all AI assistants.

**This Document's Purpose**: These Copilot-specific instructions supplement AGENTS.md with:
1. **Command Execution Rules** - How to avoid VS Code approval dialogs in PowerShell
2. **Documentation Index** - Quick navigation to specialized guides for specific tasks
3. **Copilot-Specific Workflows** - Patterns optimized for GitHub Copilot's capabilities

These instructions apply when GitHub Copilot is running with the **GPT-5-Codex** or **GPT-5-Codex (Preview)** models inside this repository. Treat them as additional constraints on top of the workspace-wide guidance in `AGENTS.md`.

**CRITICAL CHANGE (October 2025)**: AGENTS.md has been modularized. It's now a navigation hub (~1200 lines, target ~800) that delegates to specialized quick references:
- `docs/COMMAND_EXECUTION_GUIDE.md` - Before ANY terminal operations
- `docs/TESTING_QUICK_REFERENCE.md` - Before running/writing tests  
- `docs/DATABASE_QUICK_REFERENCE.md` - Before database operations

Read AGENTS.md Topic Index FIRST to understand available docs, then jump to relevant specialized references.

- ✅ **Accept the role**: Identify yourself as GitHub Copilot, assume full autonomy, and only stop when the task is complete or genuinely blocked.
- ✅ **Continuous execution mandate**: Once you start a plan, keep advancing through its tasks without waiting for permission or pausing after partial progress. Deliver summaries only when the plan is exhausted or every remaining item is truly blocked.
- ✅ **Single-phase careful refactors**: When engaged in a careful refactor workflow, enumerate every task at the outset and treat the entire effort as one phase. Use sub-phases (deep discovery, planning, implementation, validation) internally, record the active sub-phase in the tracker, and progress autonomously until the full task list is complete or blocked.
- ✅ **Deep discovery first**: Before coding, inventory relevant docs (use `AGENTS.md` Topic Index and linked references) and catalogue existing CLI tooling. Decide which analyzers to run, where to extend tooling, and capture findings in the tracker prior to implementation.
- ✅ **Read first (right-sized)**: For multi-file or novel work, check AGENTS.md Topic Index (30 seconds), then read relevant quick reference (2-5 min). For single-file changes under ~50 lines, rely on immediate context.
- ✅ **Analysis triage**: Default to minimum reconnaissance—check quick references first, expand to complete guides only when needed.
- ✅ **STOP RESEARCHING EARLY**: If you've read >3 docs or searched >3 times without starting, you're in analysis paralysis. Start coding with what you know.
- ✅ **Attachments are gold**: User-provided attachments contain exact context. Don't re-read from disk. Check them FIRST.
- ✅ **One search, one read, start coding**: For UI features, one search + one example = enough to start. Don't map entire codebase.
- ✅ **Simple first, refine later**: Implement simplest version, test, then iterate. Don't design perfect solution before coding.
- ✅ **Adhere to "no mid-task confirmation" rule**: Proceed without pausing unless critical details missing. Summaries: 1–2 sentences max.
- ✅ **Documentation alignment**: When rules change, update specialized docs (not AGENTS.md unless navigation-related). Keep AGENTS.md <500 lines.
- ✅ **No standalone documents**: Always integrate into existing docs, never create new standalone guides
- ✅ **OS Awareness**: Always maintain awareness that this repository runs on **Windows** with **PowerShell**. Use Windows/PowerShell syntax, avoid Unix commands, keep commands simple without complex piping or chaining.

> **Never stop mid-plan**: When a task list exists, continue executing items back-to-back. Record blockers, then immediately pivot to the next actionable task instead of waiting for new instructions.

If an instruction here conflicts with a newer directive in `AGENTS.md`, defer to the latest `AGENTS.md` guidance and note the discrepancy in your summary.

---

## 🧪 Testing System Documentation Index

**CRITICAL**: This project has comprehensive testing infrastructure. Use this index to find the right documentation for your testing needs.

### � Common User Requests: Quick Response Guide

#### "Fix failing E2E tests" → Follow This Exact Workflow:

1. **Step 1: Discover which E2E tests are failing** (10 seconds):
   ```bash
   # Option 1: Simple query tool (FASTEST - NO APPROVAL)
   node tests/get-failing-tests.js
   
   # Option 2: Comprehensive analyzer with patterns
   node tests/analyze-test-logs.js
   
   # Option 3: Filter for E2E only (if needed)
   node tests/analyze-test-logs.js | grep -i "e2e"
   ```
   - Shows: test name, failure details, runtime
   - Prioritize: Structural failures (100%) → High attempts (>10) → Regressions → Hanging (🐌🐌🐌)

2. **Step 2: Get error messages for specific failing test** (5 seconds):
   ```bash
   # Option 1: Simple query tool (FASTEST - NO APPROVAL)
   node tests/get-latest-log.js              # Get log path
   # Then use read_file tool on returned path
   
   # Option 2: Query analyzer for test history (BEST FOR PATTERNS)
   node tests/analyze-test-logs.js --test "test-name"
   
   # Option 3: Simple PowerShell (if tools unavailable)
   Get-ChildItem testlogs\*e2e*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   ```

3. **Step 3: Follow systematic fixing workflow**:
   - **Read**: `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` Phase 3 (Systematic Test Fixing)
   - **Pattern**: Fix ONE test at a time, verify with analyzer, then move to next
   - **Verify**: After fix, run `node tests/analyze-test-logs.js --test "test-name"` to confirm
   - **Update**: Document insights in AGENTS.md if pattern is broadly applicable

4. **Step 4: If tooling improvements needed**:
   - Make small, focused improvements to `tests/analyze-test-logs.js` or `tests/run-tests.js`
   - Test the improvement: run analyzer to verify new functionality works
   - **Integrate documentation**:
     - Update `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` with new capability
     - Update this file (`.github/instructions/GitHub Copilot.instructions.md`) with new command/workflow
     - Update `tests/README.md` with usage examples
     - Update `AGENTS.md` with concise reference (5-10 lines max)
   - **No standalone documents**: Always integrate into existing docs, never create new standalone guides

**Key Files for E2E Test Fixing**:
- 📘 Master workflow: `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` (Phases 1-4)
- 🔍 Discovery tool: `tests/analyze-test-logs.js` (primary)
- 📂 Log storage: `testlogs/` directory (organized by timestamp/suite)
- ⚙️ Test runner: `node tests/run-tests.js e2e` (no PowerShell confirmation)
- 🛠️ Timeout guards: `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` (if hanging)
- 🧹 Async cleanup: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` (if "Jest did not exit")
- 🔧 Tool improvements: `docs/POTENTIAL_TESTING_IMPROVEMENTS.md` (backlog, max 1 simple change/session)

#### "Fix failing tests" (any type) → Same workflow as above:
- Use analyzer without grep to see ALL failing tests
- Prioritization still applies: structural → high-attempt → regressions → hanging
- Follow Phase 3 systematic fixing workflow (one test at a time)

#### "Continue fixing simple errors" or "Fix a bunch of them" → AUTONOMOUS BATCH MODE:

**When to use**: Multiple tests failing with same structural issue (missing column, wrong import, removed table). See `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` "Batch-Friendly Scenarios" for recognition patterns.

1. **Check what's failing** (5 seconds, NO APPROVAL):
   ```bash
   node tests/get-failing-tests.js           # List all failures
  node tests/get-failing-tests.js --history --test <pattern>  # Confirm fixes via log history
  node tests/get-test-summary.js --compact  # Or get full overview
   ```
2. **Identify 4-6 simplest failures** (runtime <5s, ≤2 failures each)
3. **Run batch test** to see current state:
   ```bash
   npm run test:file "test1|test2|test3|test4|test5"
   ```
4. **Fix failures systematically**:
   - Read test file for failing tests
   - Identify root cause (missing function, wrong expectation, schema issue)
   - Apply fix (create function, update expectation, add migration)
   - NO need to ask permission between fixes
5. **Run batch again** to verify all passing
6. **Update docs** at END of batch (not after each fix)
7. **Move to next batch** if time permits

**Autonomous Mode Rules**:
- ✅ Fix 4-6 tests per batch without asking
- ✅ Use multi_replace_string_in_file for multiple related fixes
- ✅ Create missing functions/files as needed
- ✅ Run tests to verify, then continue
- ❌ Don't ask "should I fix this?" - just fix it
- ❌ Don't report after each fix - report at batch completion
- ❌ Don't create new documentation files - update existing only

#### "What tests are currently failing?" → Use simple query tools:
```bash
node tests/get-failing-tests.js           # List all failures + latest message (5s, NO APPROVAL)
node tests/get-failing-tests.js --history --test <pattern>  # Show recent status for a specific test
node tests/get-test-summary.js --compact  # Full overview (5s, NO APPROVAL)
node tests/analyze-test-logs.js --summary # Detailed analysis (10s)
```

#### "Run E2E tests" → Use configuration runner:
```bash
node tests/run-tests.js e2e        # Standard E2E tests (2-5 min)
node tests/run-tests.js e2e-quick  # Quick E2E smoke tests (1 min)
```
- **ALWAYS verify exit code**: Use `terminal_last_command` tool, check `exit code: 0` = pass
- **Check analyzer after run**: Verify new log shows expected results

#### "Check test status" or "What's broken?" → Simple query tools first:
```bash
node tests/get-test-summary.js --compact  # Quick status (5s, NO APPROVAL)
node tests/get-failing-tests.js           # List failures + latest message (5s, NO APPROVAL)
node tests/get-failing-tests.js --history --logs 6 --test <pattern>  # Verify fix without rerun
node tests/analyze-test-logs.js --summary # Full analysis (10s)
```
- Shows latest results by suite (ALL, unit, e2e, integration)
- No need to run tests - historical logs show current state
- Cross-reference with `docs/TESTING_STATUS.md` for context

#### "Why is test X failing?" → Get history:
```bash
node tests/analyze-test-logs.js --test "partial-test-name"
```
- Shows: pass/fail history, failure rate, attempts, regressions
- Most recent log entry includes error context
- If insufficient detail, read log file directly from `testlogs/`

#### "Add new test" or "Write test for X" → Follow patterns:
1. **Search for similar tests**: `grep_search query:"similar-feature" includePattern:"**/*.test.js"`
2. **Read example**: Use existing test as template
3. **Apply critical rules** (see "Write New Tests" section below):
   - Explicit timeout: `test('name', async () => {...}, 30000)`
   - Shared DB connection: Use app's handle (no parallel connections)
   - Progress logging: For operations >5s
   - Cleanup: afterAll/afterEach for resources
4. **Verify**: Run focused test, check analyzer confirms pass
5. **Document**: If establishing new pattern, update AGENTS.md

#### "Tests are hanging" or "Jest won't exit" → Specific guides:
- **Hanging tests** (>60s, �🐌🐌): `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md`
- **Jest won't exit**: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md`
- **Detection**: Analyzer flags hanging tests automatically
- **Utilities**: `src/test-utils/timeoutGuards.js` (`withTimeout()`, `createWatchdog()`)

#### "Improve test tooling" → Integration requirement:
1. **Make focused improvement**: Small change to analyzer or runner
2. **Test improvement**: Verify new functionality works
3. **Integrate documentation** (MANDATORY):
   - Update `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` (primary workflow)
   - Update this file with new command/workflow in relevant section
   - Update `tests/README.md` with usage example
   - Update `AGENTS.md` with concise reference (max 10 lines)
4. **No standalone docs**: Always integrate into existing documentation structure

### �📋 Quick Reference: Testing Workflow

**Before ANY Testing Work**:
1. ✅ **Check logs first**: `node tests/analyze-test-logs.js --summary` (5s) - see current status
2. ✅ **Read relevant guide**: See documentation index below
3. ✅ **Use configuration runner**: `node tests/run-tests.js <suite>` (no PowerShell confirmation)
4. ✅ **Verify exit codes**: Always check `exit code: 0` = pass, `exit code: 1` = fail

### 🎯 Testing Documentation by Purpose

#### When You Need To...

**Understand Current Test Status**:
- 📊 **Primary**: `docs/TESTING_STATUS.md` - Current passing/failing counts, recent changes
- 🔍 **Tool**: `node tests/analyze-test-logs.js --summary` - Live status in 5 seconds
- 📈 **Details**: `node tests/analyze-test-logs.js` - Full analysis with priorities (10s)

**Fix Failing Tests Systematically**:
- 📘 **Master Guide**: `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` - Complete 4-phase workflow
  - Phase 1: Test Discovery (use analyzer to find broken tests)
  - Phase 2: Documentation Alignment (verify tests match docs)
  - Phase 3: Systematic Fixing (one test at a time, analyzer-first)
  - Phase 4: Quality Improvement (timeout guards, async cleanup)
- 🎯 **Prioritization**: Analyzer shows: structural failures (100%) → high-attempt → regressions → hanging
- 📝 **Recent Fixes**: `docs/TEST_FIXES_2025-10-10.md` - Learn from successful patterns

**Run Tests Without Confirmation Dialogs**:
- ⚙️ **Configuration Runner**: `tests/run-tests.js` - Main entry point
- 📋 **Test Suites**: `tests/test-config.json` - Suite definitions (unit, e2e, integration, etc.)
- 📖 **Usage Guide**: `tests/README.md` - Quick start, available suites, configuration
- 🚀 **Commands**:
  ```bash
  node tests/run-tests.js unit        # Fast unit tests (~30s)
  node tests/run-tests.js e2e         # Standard E2E (~2-5min)
  node tests/run-tests.js integration # HTTP integration (~60s)
  ```

**Analyze Test History Without Running Tests**:
- 🔬 **Test Log Analyzer**: `tests/analyze-test-logs.js` - Main tool
- 📂 **Log Storage**: `testlogs/` directory - Organized by timestamp and suite
- 📊 **Features**:
  - Current status by suite (latest run results)
  - Fixed tests (recently fixed, learn from patterns)
  - Regressions (was passing, now failing - CRITICAL)
  - Still broken (prioritized by failure rate, attempts, runtime)
  - Hanging tests (🐌🐌🐌 >30s - need timeout guards)
  - Test history queries: `--test "test-name"`
- ⏱️ **Performance**: Saves 5-10 min per testing session vs running tests

**Prevent Test Hangs and Timeouts**:
- ⏱️ **Timeout Guards**: `docs/TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md` - Patterns and utilities
- 🧹 **Async Cleanup**: `docs/TESTING_ASYNC_CLEANUP_GUIDE.md` - Prevent "Jest did not exit" warnings
- 🛠️ **Utilities**: `src/test-utils/timeoutGuards.js` - `withTimeout()`, `createWatchdog()`
- 🎯 **Detection**: Analyzer marks hanging tests with 🐌🐌🐌 (>30s runtime)

**Write New Tests**:
- 📐 **Patterns**: AGENTS.md "Testing Guidelines" section - Schema validation, WAL mode, async patterns
- 🧪 **Test Contract**: Every new feature requires tests (search for existing coverage first)
- ⚠️ **Critical Rules**:
  - Use app's shared DB connection (WAL mode isolation will hide writes otherwise)
  - Add explicit timeouts: `test('name', async () => {...}, 30000)`
  - Never use `async` without `await` (returns Promise, not value)
  - Add progress logging for >5s operations
  - Clean up resources in afterAll/afterEach

**Debug Test Failures**:
- 🐛 **Common Patterns**: AGENTS.md "Testing Guidelines" section
  - Schema validation first (100% failure = likely schema bug)
  - Check WAL mode single connection (multiple = isolation)
  - Verify async/await usage (async without await = Promise return)
  - Check initialization order (ReferenceError = used before defined)
- 🔍 **Investigation Tools**:
  - Analyzer history: `node tests/analyze-test-logs.js --test "test-name"`
  - Read recent logs: Check `testlogs/` for latest run
  - Exit codes: Use `terminal_last_command` tool to verify

**Understand Test Patterns and Anti-Patterns**:
- 📚 **AGENTS.md**: "Testing Guidelines" section (~400 lines of patterns)
  - Golden rule: Tests must never hang silently
  - Schema validation pattern (catch TEXT vs INTEGER id bugs early)
  - WAL mode single connection pattern (avoid isolation)
  - Async/await misuse pattern (unnecessary async returns Promise)
  - Iterative test fixing workflow (fix one, verify, move to next)
- 🎓 **Phase 6 Insights**: AGENTS.md includes 2025-10-10 session learnings
  - Schema bugs cause collateral wins (1 fix → 10+ tests pass)
  - Prioritize structural failures (100% failure rate)
  - Check logs before running (saves 30-60 min)

### 🔧 Testing Tools Quick Reference

| Tool | Command | Purpose | Speed |
|------|---------|---------|-------|
| **Test Log Analyzer** | `node tests/analyze-test-logs.js --summary` | Current status, no test run | 5s |
| **Test Log Analyzer** | `node tests/analyze-test-logs.js` | Full analysis with priorities | 10s |
| **Test Log Analyzer** | `node tests/analyze-test-logs.js --test "name"` | Specific test history | 5s |
| **Configuration Runner** | `node tests/run-tests.js unit` | Run unit tests | 30s |
| **Configuration Runner** | `node tests/run-tests.js e2e` | Run E2E tests | 2-5min |
| **Configuration Runner** | `node tests/run-tests.js integration` | Run integration tests | 60s |
| **Focused Test** | `npm run test:file "pattern"` | Run specific test file | 5-30s |

### 🧰 Simple Test Query Tools (October 2025)

**Purpose**: Fast, focused tools for extracting precise information from logs without PowerShell.

**Quick Reference**:
```bash
node tests/get-test-summary.js --compact  # Status overview (5s)
node tests/get-failing-tests.js           # List failures + latest message (5s)
node tests/get-latest-log.js              # Get log path (2s)
node tests/get-slow-tests.js              # Performance check (5s)
```

- `get-failing-tests.js` reads `test-failure-summary.json`, and the reporter also writes per-run snapshots to `testlogs/<timestamp>_<suite>.failures.json`, so history queries surface the original failure messages for older runs.

**All tools**:
- ✅ No PowerShell complexity (no approval dialogs)
- ✅ Single purpose, simple output
- ✅ Fast execution (<5 seconds)
- ✅ Meaningful exit codes for automation
- ✅ Composable via command line

**Complete Documentation**: `tests/SIMPLE_TOOLS_README.md`

### 📊 Test Log Management

**Log Location**: `testlogs/` directory (organized, versioned)  
**Log Format**: `<timestamp>_<suite>.log` (e.g., `2025-10-10T19-30-20-013Z_unit.log`)  
**Current Logs**: ~90 historical logs available for analysis  
**Cleanup Schedule**: Keep 10-20 recent logs, delete after major milestones (50+ fixes)

**What's in Logs**:
- Suite name header (e.g., "Suite: unit")
- Complete pass/fail counts per test file
- Test timings (identifies hanging tests 🐌🐌🐌)
- Top 20 slowest tests (performance indicators)
- Emoji indicators (proper UTF-8 encoding for Windows)

### ⚠️ Critical Testing Rules

1. ✅ **CHECK LOGS FIRST - MANDATORY**: Use `node tests/get-test-summary.js --compact` or `node tests/analyze-test-logs.js --summary` before ANY test run
2. ✅ **Prefer static analysis**: Mine existing logs before running expensive tests
3. ✅ **Verify exit codes**: ALWAYS check exit code (0=pass, 1=fail). Task messages are UNRELIABLE.
4. ✅ **Use configuration runner**: `node tests/run-tests.js <suite>` avoids PowerShell confirmations
5. ✅ **Single DB connection**: Use app's shared handle in tests (WAL mode isolation otherwise)
6. ✅ **Never hang silently**: Add explicit timeouts, progress logging for >5s operations
7. ✅ **Test contract**: Every code change requires matching tests
8. ✅ **Iterative fixing**: Fix one test, verify with analyzer, move to next (no batching)
9. ✅ **Learn from fixes**: Check analyzer's "Fixed Tests" section for successful patterns
10. ✅ **Schema first**: 100% failure rate often indicates schema bug (high priority fix)

### 🚨 Common Testing Pitfalls (October 2025)

**Avoid These Mistakes**:
- ❌ Running tests without checking logs first (wastes 5-10 minutes)
- ❌ Trusting task success messages (check exit code with `terminal_last_command`)
- ❌ Multiple DB connections in tests (WAL isolation makes writes invisible)
- ❌ Using `async` without `await` (returns Promise instead of value)
- ❌ Complex PowerShell commands (use `replace_string_in_file` tool instead)
- ❌ Environment variables in test commands (triggers confirmation dialog)
- ❌ Tests without explicit timeouts (can hang forever silently)
- ❌ Batch fixing multiple tests (fix one, verify, then next)
- ❌ Ignoring structural failures (100% fail rate = likely schema bug)
- ❌ Running E2E tests >60s without progress logging (likely hanging)

### 🎯 Rapid Development Mode: Testing Strategy

**When Moving Fast**:
1. **Check analyzer first** (5s) - know current state
2. **Run focused tests only** - `npm run test:file "pattern"` for changed code
3. **Skip full suite runs** - unless you've changed core infrastructure
4. **Learn from logs** - analyzer shows what was recently fixed successfully
5. **Fix regressions immediately** - analyzer flags these as CRITICAL
6. **Use analyzer verification** - after fix, check `--test "name"` shows pass

**Time Savings**:
- Simple query tools vs full test run: **5s vs 5min** (60x faster)
- Analyzer vs full test run: **10s vs 5min** (30x faster)
- Focused test vs full suite: **10s vs 5min** (30x faster)
- Log analysis vs re-running: **0s (skip run entirely)**

### 📚 Additional Testing Documentation

**Specialized Topics**:
- 🌍 **Geography E2E**: `docs/GEOGRAPHY_E2E_TESTING.md` - Long-running E2E patterns
- 🧪 **E2E Features Suite**: `tests/e2e-features/README.md` - Specialized E2E tests
- 📈 **E2E Progress Logging**: `docs/E2E_TEST_PROGRESS_LOGGING.md` - Telemetry patterns
- 🔍 **Child Process Debugging**: `DEBUGGING_CHILD_PROCESSES.md` - SSE/MILESTONE events
- 🛠️ **Debug Scripts**: `tools/debug/README.md` - Debugging utilities
- 📊 **Test Performance**: `docs/TEST_PERFORMANCE_RESULTS.md` - Historical performance data

**Architecture Context**:
- 🏗️ **System Architecture**: `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` - Critical system distinction
- 🗄️ **Database ERD**: `docs/DATABASE_SCHEMA_ERD.md` - Visual schema reference
- � **Database Migration**: `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` - Dual-adapter strategy, export/import testing
- �🔌 **API Reference**: `docs/API_ENDPOINT_REFERENCE.md` - Complete API documentation

**For More Details**: See AGENTS.md Topic Index for complete documentation map.