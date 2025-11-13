# Bilingual JS Tooling Agent — Test Runner Guidelines

**For**: Bilingual js tooling mode instructions  
**Purpose**: Define correct validation patterns without pipes or approval dialogs

---

## ⚠️ IMPORTANT: Mode Instructions Need Update

The current Bilingual Tooling agent mode instructions in the preamble include:

```bash
# ❌ PROBLEMATIC - Uses pipes and Out-String (requires approval)
npx jest --config jest.careful.config.js --runTestsByPath \
  tests/tools/__tests__/js-scan.i18n.test.js \
  tests/tools/__tests__/js-edit.i18n.test.js \
  --bail=1 --maxWorkers=50% | Out-String
```

This should be **replaced with**:

```bash
# ✅ CORRECT - Uses npm test runner (no approval needed)
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js
```

---

## Validation Workflow for Bilingual Implementation

### 1. Quick Check (Development)
```bash
npm run test:unit
```
- Validates changes don't break existing CLI unit tests
- Runs in ~30 seconds
- Exit code 0 = ready to continue

### 2. Comprehensive Check (Implementation Phase)
```bash
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js
```
- Tests bilingual-specific functionality
- Validates Chinese flag aliases
- Tests language mode detection
- Tests output switching
- Validates all bilingual edge cases

### 3. Full Integration Check (Pre-Merge)
```bash
npm run test:all
```
- All CLI tool tests including bilingual
- All other test suites
- Ensures no regressions
- Takes 5-10 minutes

---

## Implementation Checklist

When implementing bilingual tooling, use this checklist:

```markdown
### Bilingual Implementation Validation

1. **Unit Tests Created**
   - [ ] Tests for Chinese flag aliases (--搜, --编, --限, etc.)
   - [ ] Tests for auto-detection of Chinese mode
   - [ ] Tests for terse Chinese output format
   - [ ] Tests for English mode still works (--lang en)
   - [ ] Tests for mixed English/Chinese input
   - Run: `npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js`
   
2. **Integration Tests Created**
   - [ ] End-to-end bilingual workflow tests
   - [ ] Token generation with bilingual mode
   - [ ] Batch operations with bilingual output
   - Run: `npm run test:by-path tests/tools/__tests__/js-edit.i18n.test.js`

3. **Validation Before Merge**
   ```bash
   # Unit + integration for bilingual
   npm run test:by-path \
     tests/tools/__tests__/js-scan.i18n.test.js \
     tests/tools/__tests__/js-edit.i18n.test.js
   
   # Full suite to catch regressions
   npm run test:all
   
   # Check exit codes
   echo "Exit code: $LASTEXITCODE"  # Should be 0
   ```

4. **Performance Validation**
   - [ ] Bilingual token generation < 1ms
   - [ ] Language detection < 1ms
   - [ ] Output switching < 1ms
   - [ ] No performance regression on existing tests
   - Run: `npm run test:unit` (includes performance baselines)

5. **Documentation Updated**
   - [ ] README.md mentions bilingual support
   - [ ] AGENTS.md CLI Tooling section explains --lang flag
   - [ ] CLI_TOOL_TESTING_GUIDE.md includes bilingual examples
   - [ ] Examples in docs use proper npm runners
```

---

## Exit Code Checking (Critical!)

Always verify exit codes after running tests:

```bash
# Run tests
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js

# Check result
if ($LASTEXITCODE -eq 0) {
    Write-Output "✓ All bilingual tests passed"
} else {
    Write-Error "✗ Bilingual tests failed (exit code: $LASTEXITCODE)"
    exit 1
}
```

---

## Recommended Mode Instructions Section

For the Bilingual Tooling agent mode instructions, add this section:

```markdown
## Validation Checkpoint

### Pre-Implementation: Test Infrastructure
```bash
# Verify test runners work
npm run test:by-path tests/codec/TokenCodec.test.js
npm run test:by-path tests/tools/__tests__/js-scan.test.js
```

### During Implementation: Bilingual Feature Tests
```bash
# Test Chinese flag aliases
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js

# Test output format switching
npm run test:by-path tests/tools/__tests__/js-edit.i18n.test.js

# Full CLI validation
npm run test:by-path tests/tools/__tests__/*.test.js
```

### Pre-Merge: Full Suite
```bash
# Verify no regressions
npm run test:all

# Check exit code
if [ $? -eq 0 ]; then
    echo "Ready to merge ✓"
else
    echo "Fix failures before merging"
    exit 1
fi
```
```

---

## Pattern Translations

### What Was Wrong
| Pattern | Problem | Fix |
|---------|---------|-----|
| `npx jest ... \| Out-String` | Pipes, truncation, approval | Use `npm run test:*` |
| `... \| Select-Object -Last 100` | PowerShell approval needed | Use proper test runner |
| `Get-Content file.js \| ...` | Complex escaping, approval | Use `read_file` tool |
| `node script.js 2>&1 \| Out-String` | Exit code lost, truncation | Use `npm run` runner |

### What's Right
| Pattern | Benefit | Use Case |
|---------|---------|----------|
| `npm run test:by-path file.test.js` | Exact file control, clear output | Single or multiple test files |
| `npm run test:file "pattern"` | Pattern matching, simpler syntax | Finding related tests |
| `npm run test:unit` | Fast validation, predefined suite | Quick checks |
| `npm run test:all` | Comprehensive coverage | Pre-merge validation |

---

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run Bilingual Tests
  run: npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js
  
- name: Verify Exit Code
  if: failure()
  run: |
    echo "Tests failed"
    exit 1
```

### PowerShell Scripts
```powershell
# Run tests
Write-Output "Testing bilingual features..."
npm run test:by-path tests/tools/__tests__/js-scan.i18n.test.js tests/tools/__tests__/js-edit.i18n.test.js

# Check result
if ($LASTEXITCODE -ne 0) {
    Write-Error "Bilingual tests failed!"
    exit 1
}

Write-Output "✓ All tests passed"
```

---

## For Future Reference

When implementing other CLI tool features (batch operations, etc.), follow the same pattern:

```bash
# Instead of: npx jest ... | Out-String
# Use: npm run test:by-path <exact-paths>
```

This is now the **standard approach** for all CLI tool testing.

---

**Status**: Ready for immediate adoption by Bilingual Tooling agent  
**Tested**: Yes (all existing tests pass with proper runners)  
**Documentation**: CLI_TOOL_TESTING_GUIDE.md + AGENTS.md + this file
