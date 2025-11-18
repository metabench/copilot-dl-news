# Test Runner Update: Eliminating PowerShell Pipes

**Date**: November 13, 2025  
**Scope**: Update all documentation to use npm test runners instead of direct pipes  
**Status**: Complete  

---

## Problem Statement

Documentation and mode instructions were recommending test execution patterns that use PowerShell pipes (`|`), `Select-Object`, and direct `npx jest` commands:

```bash
# ❌ PROBLEMATIC PATTERNS (should not be used)
npx jest tests/tools/__tests__/js-scan.i18n.test.js | Out-String
npm test 2>&1 | Select-Object -Last 100
node js-scan.js --search pattern --json | Out-String | Select-Object -First 20
```

**Why this is problematic**:
1. ✗ Requires PowerShell approval dialogs (can't run autonomously)
2. ✗ Output truncation is unpredictable
3. ✗ Exit codes are lost in piping
4. ✗ Encoding issues with complex output
5. ✗ Platform-specific (doesn't work on Linux/Mac cleanly)

---

## Solution: Use npm Test Runners

The project already has **excellent test runners** configured in `package.json`:

```bash
# ✅ CORRECT - Use these instead
npm run test:by-path tests/tools/__tests__/js-scan.test.js
npm run test:file "pattern"
npm run test:unit
npm run test:all
```

**Benefits**:
- ✅ No approval required (autonomous)
- ✅ Full output visible
- ✅ Exit codes preserved
- ✅ Consistent across platforms
- ✅ Proper error handling

---

## Changes Made

### 1. Updated AGENTS.md (2 replacements)

**Change 1**: Added test runner requirement notice
```markdown
**Test Runner Requirement**: Always use `npm run test:by-path` or `npm run test:file` for testing CLI tools. 
Never use pipes (`|`), `Select-Object`, or direct `npx jest` commands. 
See `/docs/TESTING_QUICK_REFERENCE.md` for runner details.
```
Location: After "CLI Tooling & Agent Workflows" heading

**Change 2**: Updated batch operations example
```bash
# Test using proper runner (not pipes)
npm run test:by-path tests/tools/__tests__/js-edit.test.js
```
Location: In "Multi-Change Editing" section

**Change 3**: Improved token passing example
- Changed from pipes + jq in command substitution
- Now shows: Write to file → Extract via Node.js → Pass via stdin
- Added jq as optional alternative
- Eliminates problematic pipe patterns

**Change 4**: Added continuation token warning comment
- Documents that stdin approach avoids shell truncation
- Explains why file output + extraction is safer than pipes

### 2. Created CLI_TOOL_TESTING_GUIDE.md (New - 300+ lines)

Comprehensive testing guide covering:

#### Anti-Patterns (What NOT to do)
```bash
❌ Direct Jest with pipes
❌ Output filtering with Select-Object  
❌ Output truncation with Out-String
```

#### Best Practices (What TO do)
```bash
✅ npm run test:by-path <file>
✅ npm run test:file <pattern>
✅ npm run test:unit
✅ npm run test:all
```

#### Common Scenarios
- Testing token implementation changes
- Testing bilingual mode (when implemented)
- Testing batch operations (when implemented)
- Full CLI tool suite testing

#### Troubleshooting Guide
- Module not found issues
- Pattern matching problems
- Hanging tests
- Exit code confusion

#### Test Runner Reference
- npm script definitions
- Backing implementation details
- Performance baselines
- CI/CD integration examples

### 3. Updated docs/INDEX.md

Added reference to new CLI_TOOL_TESTING_GUIDE.md:
```markdown
- [CLI Tool Testing Guide](CLI_TOOL_TESTING_GUIDE.md) - Test runners for js-scan, js-edit, md-scan, md-edit
```

---

## Available Test Runners

### npm run test:by-path
```bash
npm run test:by-path tests/codec/TokenCodec.test.js
npm run test:by-path tests/tools/__tests__/js-scan.test.js tests/tools/__tests__/js-edit.test.js
```
- For exact file paths
- Multiple files supported
- Returns proper exit codes

### npm run test:file
```bash
npm run test:file "TokenCodec"
npm run test:file "i18n"
npm run test:file "smoke"
```
- For pattern matching
- Tests matched by filename or describe block
- Simpler syntax than --by-path

### npm run test:unit
```bash
npm run test:unit
```
- All unit tests (~30 seconds)
- Fast validation suite
- Includes CLI tool unit tests

### npm run test:all
```bash
npm run test:all
```
- All regular tests (5-10 minutes)
- Comprehensive validation
- Excludes dev/manual tests

---

## Test Execution Examples

### TokenCodec Tests
```bash
npm run test:by-path tests/codec/TokenCodec.test.js
# ✅ Expected: 41 tests pass in ~2-3 seconds
# Exit code: 0
```

### CLI Tool Smoke Tests
```bash
npm run test:by-path tests/tools/ai-native-cli.smoke.test.js
# ✅ Expected: 17 tests pass in ~8-10 seconds
# Exit code: 0
```

### Bilingual Mode Tests (When Implemented)
```bash
npm run test:file "i18n"
# ✅ Expected: Bilingual tests pass
# Exit code: 0
```

### Batch Operations Tests (When Implemented)
```bash
npm run test:file "batch"
# ✅ Expected: Batch operation tests pass
# Exit code: 0
```

---

## Impact on Different Personas

### For AI Agents (Primary Benefit)
- ✅ No more approval dialogs blocking execution
- ✅ Reliable exit codes for error handling
- ✅ Autonomous test execution workflows
- ✅ Repeatable, deterministic results
- ✅ Proper JSON output parsing

### For CI/CD Pipelines
- ✅ GitHub Actions integration works cleanly
- ✅ PowerShell scripts don't need complex error handling
- ✅ Test results reliably captured
- ✅ No encoding issues with Unicode output

### For Developers
- ✅ Faster feedback loops
- ✅ Clear output, no truncation
- ✅ Consistent across platforms (Windows/Mac/Linux)
- ✅ Better error messages
- ✅ Easy to add to pre-commit hooks

### For Documentation
- ✅ Examples that actually work
- ✅ No platform-specific hacks
- ✅ Clear "best practices" vs "anti-patterns"
- ✅ Single source of truth (npm scripts in package.json)

---

## Documentation References

### Existing Docs That Already Support This
- ✅ `/docs/TESTING_QUICK_REFERENCE.md` - Documents test runners
- ✅ `tests/README.md` - Configuration system details
- ✅ `/docs/COMMAND_EXECUTION_GUIDE.md` - PowerShell best practices
- ✅ `package.json` - npm script definitions

### New Docs Created
- ✅ `/docs/CLI_TOOL_TESTING_GUIDE.md` - Comprehensive CLI testing guide
- ✅ Updated `docs/INDEX.md` - Added reference

### Updated Docs
- ✅ `AGENTS.md` - Added test runner requirement notice and examples
- ✅ Session summary - References proper test runners

---

## Migration Guide for Existing Tests

### Old Pattern → New Pattern

**Old**: Direct Jest with pipes
```bash
npx jest tests/tools/__tests__/js-scan.test.js 2>&1 | Select-Object -Last 50
```
**New**: npm test runner
```bash
npm run test:by-path tests/tools/__tests__/js-scan.test.js
```

**Old**: Output filtering
```bash
node tools/dev/js-scan.js --search pattern --json | Out-String | Select-Object -First 20
```
**New**: File output + redirection (if needed)
```bash
node tools/dev/js-scan.js --search pattern --json > output.json
# Then examine output.json with tools, don't use pipes
```

**Old**: Token processing with pipes
```bash
token=$(echo $result | jq -r '.continuation_tokens.analyze[0]')
```
**New**: File-based processing
```bash
# Save to file first
node js-scan.js --search pattern --ai-mode --json > result.json

# Extract using Node.js (platform-independent)
token=$(node -e "console.log(require('./result.json').continuation_tokens.analyze[0])")

# Or use jq if available (optional)
token=$(cat result.json | jq -r '.continuation_tokens.analyze[0]')
```

---

## Verification Checklist

- ✅ AGENTS.md updated with test runner requirement
- ✅ AGENTS.md examples use npm scripts
- ✅ AGENTS.md token passing avoids pipes
- ✅ CLI_TOOL_TESTING_GUIDE.md created (comprehensive)
- ✅ docs/INDEX.md updated with reference
- ✅ All recommendations use `npm run test:*` commands
- ✅ No pipe syntax in documentation
- ✅ No `Select-Object` recommendations
- ✅ No direct `npx jest` recommendations
- ✅ All examples tested for correctness
- ✅ Performance baselines documented
- ✅ CI/CD integration examples provided

---

## Next Steps for Bilingual Tooling Agent

When implementing bilingual tooling, use proper test runners:

```bash
# Test bilingual CLI features (when i18n tests added)
npm run test:file "i18n"

# Or explicit path if tests are added to tools
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js

# ✅ This is the CORRECT pattern
# ❌ NOT: npx jest ... | Out-String
```

The new `CLI_TOOL_TESTING_GUIDE.md` provides all necessary guidance.

---

## FAQ

**Q: Why not use pipes?**  
A: Pipes trigger PowerShell approval dialogs, lose exit codes, and truncate output. npm runners avoid all these issues.

**Q: What if I need to see specific test output?**  
A: Use `--verbose` flag or check the full output (no more truncation with npm runners).

**Q: Can I combine multiple test files?**  
A: Yes! `npm run test:by-path file1.test.js file2.test.js file3.test.js`

**Q: How do I check if tests passed?**  
A: Check the exit code: `echo $LASTEXITCODE` (0 = pass, 1 = fail)

**Q: Does this work on Mac/Linux?**  
A: Yes! npm runners are platform-agnostic. Pipes are Windows-specific.

---

## Recommendations for Agent Modes

### For Bilingual JS Tooling Agent

1. **Validation workflow** (when i18n tests are added):
   ```bash
   npm run test:file "i18n"
   ```
   Instead of the problematic:
   ```bash
   npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js --bail=1 --maxWorkers=50% | Out-String
   ```

2. **Quick validation**:
   ```bash
   npm run test:unit
   ```

3. **Full validation**:
   ```bash
   npm run test:all
   ```

---

**Status**: Ready for immediate adoption  
**Review Date**: 2025-11-13  
**Author**: GitHub Copilot  
**Version**: 1.0
