# CLI Tool Testing Guide

**When to Read**: Before testing any CLI tools (js-scan, js-edit, md-scan, md-edit)

**Purpose**: Provide correct test runner patterns without PowerShell pipes, `Select-Object`, or direct Jest commands

---

## 🚫 NEVER DO THIS

```bash
# ❌ Direct Jest with pipes (triggers approval, hard to track output)
npx jest tests/tools/__tests__/js-scan.test.js 2>&1 | Select-Object -Last 100

# ❌ Complex output filtering (requires approval in PowerShell)
node tools/dev/js-scan.js --search pattern --json | Out-String | Select-Object -First 20

# ❌ Output truncation
npx jest --runTestsByPath tests/tools/__tests__/js-edit.test.js | Out-String
```

**Why**: These require PowerShell approval, can't be run autonomously, and truncate output unpredictably.

---

## ✅ DO THIS INSTEAD

### Pattern 1: Test Single CLI Tool File

**Use `npm run test:by-path`** with absolute paths:

```bash
# Test js-scan
npm run test:by-path tests/tools/__tests__/js-scan.test.js

# Test js-edit
npm run test:by-path tests/tools/__tests__/js-edit.test.js

# Test multiple files at once
npm run test:by-path tests/tools/__tests__/js-scan.test.js tests/tools/__tests__/js-edit.test.js

# Test all tools
npm run test:by-path tests/tools/__tests__/*.test.js
```

**What this does**:
- ✅ Runs Jest via proper npm script (no approval needed)
- ✅ Formats output cleanly (no truncation)
- ✅ Returns proper exit codes (0 = pass, 1 = fail)
- ✅ Full output visible in terminal
- ✅ Works in any CI/CD system

### Pattern 2: Test by Pattern

**Use `npm run test:file` with a pattern**:

```bash
# Test all bilingual tests
npm run test:file "i18n"

# Test token codec
npm run test:file "TokenCodec"

# Test smoke tests
npm run test:file "smoke"

# Wildcard patterns work too
npm run test:file "js-edit.*test"
```

**What this does**:
- ✅ Finds tests matching pattern in testPathPattern
- ✅ No need to know exact file paths
- ✅ Flexible pattern matching
- ✅ Great for grouping related tests

### Pattern 3: Run Fast Test Suite (CLI Tools Included)

**Use predefined test suites**:

```bash
# Fast unit tests (~30s, includes js-scan unit tests)
npm run test:unit

# All regular tests (~5-10min, includes CLI tests)
npm run test:all
```

### Pattern 4: Check Results

**After running tests, verify exit code**:

```bash
# In PowerShell, check the exit code (NOT the task output)
npm run test:by-path tests/tools/__tests__/js-scan.test.js
$exitCode = $LASTEXITCODE
echo "Exit code: $exitCode"  # 0 = pass, 1 = fail

# For CI/scripting: 
if ($exitCode -ne 0) { 
  Write-Error "Tests failed"
  exit 1 
}
```

---

## Common CLI Tool Test Scenarios

### Scenario 1: Testing Token Implementation Changes

```bash
# Test TokenCodec module
npm run test:by-path tests/codec/TokenCodec.test.js

# Test js-scan integration with tokens
npm run test:by-path tests/tools/ai-native-cli.smoke.test.js

# Test both together
npm run test:by-path tests/codec/TokenCodec.test.js tests/tools/ai-native-cli.smoke.test.js
```

**Expected**: All 41 TokenCodec tests + 17 smoke tests = 58 total passing

### Scenario 2: Testing Bilingual Mode

```bash
# Test bilingual i18n module (once implemented)
npm run test:file "i18n"

# Test both scan and edit bilingual features
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js
```

**Expected**: Bilingual tests validate Chinese flag aliases and output modes

### Scenario 3: Testing Batch Operations

```bash
# Test batch search features (once implemented)
npm run test:file "batch"

# Test specific batch operation test file
npm run test:by-path tests/tools/__tests__/js-edit.batch.test.js
```

**Expected**: All batch operation tests pass with atomic semantics verified

### Scenario 4: Full CLI Tool Suite (Comprehensive)

```bash
# All CLI tool tests
npm run test:file "tools/__tests__"

# Or use explicit pattern
npm run test:by-path tests/tools/__tests__/*.test.js
```

---

## Troubleshooting Test Runners

### Issue: "Cannot find module" or "Test file not found"

```bash
# ✅ CORRECT: Use exact file path (relative to workspace root)
npm run test:by-path tests/tools/__tests__/js-scan.test.js

# ❌ WRONG: Using tools/ prefix or incomplete path
npm run test:by-path tools/__tests__/js-scan.test.js  # Missing "tests/"
npm run test:by-path js-scan.test.js                   # No path
```

### Issue: "Pattern doesn't match any tests"

```bash
# ✅ Check available patterns first
npm run test:list

# ✅ Use pattern that matches test filenames or describe blocks
npm run test:file "scanWorkspace"   # Works if describe("scanWorkspace...") exists

# ❌ WRONG: Exact path as pattern
npm run test:file "tests/tools/__tests__/js-scan.test.js"  # Use with --by-path instead
```

### Issue: Tests seem to hang or take too long

```bash
# Check test timeouts (default 10 seconds)
# Each test should have explicit timeout if >5s

# Run with bail flag to stop on first failure
npm run test:by-path tests/tools/__tests__/js-scan.test.js -- --bail=1

# Check specific test duration
npm run test:by-path tests/tools/__tests__/js-scan.test.js -- --verbose
```

### Issue: Exit code shows failure but output looks OK

```bash
# ALWAYS check exit code, not just output
echo "Exit code: $LASTEXITCODE"

# Get detailed failure info
npm run test:by-path tests/tools/__tests__/js-scan.test.js

# If unclear, run with verbose output
npm run test:by-path tests/tools/__tests__/js-scan.test.js -- --verbose --no-coverage
```

---

## Test Runner Reference

### npm Test Scripts

```json
{
  "test:file": "npm run test:by-path",
  "test:by-path": "node scripts/jest_careful_runner.mjs --runTestsByPath",
  "test:unit": "node tests/run-tests.js unit",
  "test:all": "node tests/run-tests.js all",
  "test:list": "node scripts/jest_careful_runner.mjs --list-only"
}
```

### What Each Runner Does

| Runner | Purpose | Usage |
|--------|---------|-------|
| `npm run test:by-path` | Run specific test files | When you have exact file paths |
| `npm run test:file` | Run by pattern (alias) | When testing pattern matches describe blocks |
| `npm run test:unit` | Run all unit tests | Quick validation suite (~30s) |
| `npm run test:all` | Run all regular tests | Full suite excluding dev tests |
| `npm run test:list` | List all available tests | Discovery and planning |

### Implementation Details

**`scripts/jest_careful_runner.mjs`** (the backing runner):
```javascript
- Accepts --runTestsByPath flag for file-based execution
- Accepts --list-only to discover available tests
- Passes remaining args to npx jest
- Returns proper exit codes (0 = pass, 1 = fail)
- No PowerShell approval required
```

**`tests/run-tests.js`** (configuration-based runner):
```javascript
- Reads from tests/test-config.json for suite definitions
- Supports custom test paths and patterns
- Supports testPathIgnorePatterns for exclusions
- Can accept --files argument for dynamic file lists
- Perfect for conditional test runs
```

---

## Data Files and Caching

### Cache Management for CLI Tests

CLI tools use temporary cache files during operation:

```
tmp/.ai-cache/
├── tokens-2025-11-13.json    # Cache from today's tests
├── tokens-2025-11-12.json    # Cache from yesterday
└── ...
```

**When to clean cache**:
```bash
# Clean old cache files (keep last 7 days)
npm run tmp:prune

# During intensive testing, cache is auto-cleaned after 1 hour (TTL)
# No manual intervention needed unless debugging
```

**Cache doesn't affect test results** - Each test run creates new tokens and caches them.

---

## CLI Tool Test Structure

### Typical Test File Organization

```javascript
// tests/tools/__tests__/js-scan.test.js

describe('js-scan CLI', () => {
  describe('search operations', () => {
    test('searches for function definitions', () => {
      // Test code
    });
  });

  describe('token generation', () => {
    test('generates compact continuation tokens', () => {
      // Test code
    });
  });

  describe('with --ai-mode flag', () => {
    test('includes metadata in JSON output', () => {
      // Test code
    });
  });
});
```

**Running specific tests**:
```bash
# All search tests
npm run test:file "search operations"

# All token tests
npm run test:file "token"

# Specific test
npm run test:file "generates compact"
```

---

## Performance Baseline

### Expected Test Durations

| Test Suite | Duration | Exit Code |
|-----------|----------|-----------|
| TokenCodec unit tests (41 tests) | 2-3s | 0 (pass) |
| CLI smoke tests (17 tests) | 8-10s | 0 (pass) |
| All CLI tools (~80 tests) | 20-30s | 0 (pass) |
| Bilingual tests (coming soon) | 10-15s | 0 (pass) |
| Batch operations (coming soon) | 15-20s | 0 (pass) |

**If tests take significantly longer**, check for:
- Timeout issues (see troubleshooting above)
- Filesystem problems (tmp/.ai-cache/ permission issues)
- Resource constraints (CPU/memory)

---

## Integration with CI/CD

### PowerShell Integration

```powershell
# Run tests with proper error handling
$testCommand = 'npm run test:by-path tests/tools/__tests__/js-scan.test.js'
Invoke-Expression $testCommand

# Check exit code
if ($LASTEXITCODE -ne 0) {
    Write-Error "CLI tests failed!"
    exit 1
}

Write-Output "All CLI tests passed ✓"
```

### GitHub Actions (Example)

```yaml
- name: Run CLI Tool Tests
  run: npm run test:by-path tests/tools/__tests__/*.test.js
  
- name: Report Results
  if: always()
  run: |
    if [ $? -ne 0 ]; then
      echo "::error::CLI tests failed"
      exit 1
    fi
```

---

## Best Practices

✅ **DO**:
- Use `npm run test:by-path` with exact file paths
- Use `npm run test:file` with pattern matching
- Check exit codes explicitly (`$LASTEXITCODE`)
- Run smoke tests first for quick validation
- Test CLI tools separately from main test suites
- Document new test patterns in this guide

❌ **DON'T**:
- Use pipes (`|`) or `Select-Object` for output processing
- Run `npx jest` directly (use npm scripts)
- Assume "task succeeded" from VS Code output (check exit code)
- Mix test and non-test output in shell commands
- Leave cache files without cleanup policy

---

## Related Documentation

- **Full test docs**: `/docs/TESTING_QUICK_REFERENCE.md`
- **Test configuration**: `tests/README.md`
- **CLI tools overview**: `/AGENTS.md` (CLI Tooling & Agent Workflows section)
- **Token implementation**: `/docs/COMPACT_TOKENS_IMPLEMENTATION.md`
- **Command execution**: `/docs/COMMAND_EXECUTION_GUIDE.md`

---

**Version**: 1.0 (November 2025)  
**Status**: Current  
**Last Updated**: 2025-11-13
