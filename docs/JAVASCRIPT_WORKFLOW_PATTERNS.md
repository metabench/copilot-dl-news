---
title: "JavaScript Workflow Patterns: Agent-Friendly Refactoring Helpers"
description: "Domain-specific helpers for common JS refactoring patterns that agents encounter"
date: "2025-11-12"
---

# JavaScript Workflow Patterns: Targeted Agent Helpers

**Focus**: Beyond generic `js-scan`/`js-edit`, what **JavaScript-specific** patterns would help agents refactor faster?

This document identifies **6-8 lightweight domain helpers** that would complement the core tooling and unlock faster workflows for common JavaScript refactoring tasks.

---

## Context: Agent Refactoring Patterns in This Codebase

### Observed Refactoring Tasks (from project docs)

1. **Module Reorganization** (most common)
   - Move functions between files
   - Consolidate related utilities
   - Extract shared logic to new module
   - Time: 15-30 minutes per task

2. **Function Signature Evolution** (common)
   - Add/remove parameters
   - Rename parameters
   - Change async/await patterns
   - Time: 10-20 minutes

3. **Export/Import Rewiring** (frequent)
   - Update imports when module moves
   - Fix circular dependencies
   - Consolidate scattered exports
   - Time: 10-15 minutes

4. **Object/Class Refactoring** (medium frequency)
   - Add/remove properties
   - Extract methods
   - Convert class to factory
   - Time: 20-40 minutes

5. **Error Handling Improvements** (ongoing)
   - Add try/catch blocks
   - Standardize error messages
   - Add error logging
   - Time: 15-25 minutes

6. **Testing Infrastructure** (common)
   - Mock object extraction
   - Test fixture creation
   - Setup/teardown consolidation
   - Time: 20-30 minutes

---

## Helper 1: Module Dependency Mapper (1 Hour)

### Problem

Agent needs to move a function to a new module. Before doing so, must understand:
- What does this function import?
- What else imports this function?
- Will moving it create circular dependencies?
- What other imports does it pull in?

**Current workflow** (manual and slow):
1. Find all imports in source file
2. Manually trace each one
3. Find all importers of source function
4. Build mental model of dependency graph
5. Predict if move will work
6. Time: 10-15 minutes just for analysis

### Solution: Dependency Mapper Tool

**New standalone CLI tool**: `js-dep-map`

```bash
# Show all dependencies of a function
node tools/dev/js-dep-map.js --file src/services/data.js --function processData

# Output:
# ┌ IMPORT TREE ─────────────────────────
#   → ../db/sqlite (ensureDatabase, query)
#   → ../utils/validation (validateInput)
#   → ../utils/logger (debug, warn)
#
# ┌ DEPENDENTS ──────────────────────────
#   ← src/api/routes.js (imported in handler)
#   ← src/background/tasks.js (imported in worker)
#   ← tests/services/data.test.js (imported in tests)
#
# ┌ CIRCULARITY CHECK ───────────────────
#   ✓ SAFE: No circular dependencies
#
# ┌ MOVE IMPACT ─────────────────────────
#   If moved to: src/utils/helpers.js
#   - Update 3 import statements
#   - Imports remain: ../db/sqlite, ../utils/validation, ../utils/logger
#   - No new circular deps introduced
```

**Flags**:
```bash
# Analyze entire module
node js-dep-map.js --file src/services/data.js

# Predict move to destination
node js-dep-map.js --file src/services/data.js --function processData --move-to src/utils/

# Export as JSON for agents
node js-dep-map.js --file src/services/data.js --json

# Show only external dependencies
node js-dep-map.js --file src/services/data.js --external-only

# Transitive closure (what does it transitively depend on)
node js-dep-map.js --file src/services/data.js --transitive --depth 3
```

**Implementation** (pseudocode):
```javascript
// Parse target function
const targetFunc = findFunction(file, functionName);
const targetImports = extractImports(file);

// Find all importers
const importers = scanWorkspace(file, functionName);

// Build dependency graph
const graph = buildDependencyGraph({
  sourceFile: file,
  targetFunction: functionName,
  imports: targetImports,
  importers: importers
});

// Check for circularity
const circular = detectCycles(graph);

// Predict move impact
const moveImpact = predictMoveImpact(graph, newDestination);
```

**Agent benefit**: Before moving, agent knows exactly what will break

**Tests needed**:
```javascript
it('maps all direct imports of a function', () => {
  const map = mapDependencies('src/services/data.js', 'processData');
  expect(map.imports).toContain('src/db/sqlite');
  expect(map.imports).toContain('src/utils/validation');
});

it('identifies all functions that import target', () => {
  const map = mapDependencies('src/services/data.js', 'processData');
  expect(map.importers).toContain('src/api/routes.js');
  expect(map.importers).toContain('tests/services/data.test.js');
});

it('detects circular dependencies', () => {
  const map = mapDependencies('src/circular-a.js', 'funcA');
  expect(map.circular).toBe(true);
  expect(map.circularPath).toContain('circular-b.js');
});

it('predicts move impact', () => {
  const impact = predictMoveImpact(map, 'src/utils/helpers.js');
  expect(impact.importUpdates).toBe(3);
  expect(impact.newCircularDeps).toBe(0);
});
```

**Workflow improvement**: Module move analysis from 10-15 min → <1 min

---

## Helper 2: Async Function Converter (1 Hour)

### Problem

Converting callback-based functions to async/await is common but error-prone:
- Must wrap promises correctly
- Must handle error cases
- Must update all callers
- Easy to introduce bugs

**Example**:
```javascript
// Current:
function fetchData(callback) {
  database.query(sql, (err, rows) => {
    if (err) return callback(err);
    callback(null, rows);
  });
}

// Target:
async function fetchData() {
  const rows = await database.query(sql);
  return rows;
}
```

### Solution: Async Converter Helper

**New tool**: `js-async-convert`

```bash
# Analyze function for conversion readiness
node tools/dev/js-async-convert.js --file src/db.js --function fetchData --analyze

# Output:
# ┌ CONVERSION ANALYSIS ──────────────────
# Function: fetchData
# Pattern: Callback-based (Node.js style)
# Complexity: LOW
# 
# Changes required:
#   1. Remove callback parameter
#   2. Wrap database.query in await
#   3. Return result directly
#   4. Convert error handling to try/catch
#
# Callers to update: 5 files, 12 call sites
# Risk: LOW

# Perform conversion
node js-async-convert.js --file src/db.js --function fetchData --convert

# Dry-run first
node js-async-convert.js --file src/db.js --function fetchData --convert --dry-run
```

**Conversion patterns supported**:
- ✓ Node.js callback pattern `(err, result) => {}`
- ✓ Promise-based `return promise.then().catch()`
- ✓ Mixed (promises with callbacks)
- ✓ Generator functions → async functions

**Implementation strategy**:
1. Detect callback pattern (inspect function signature)
2. Build conversion template
3. Update return statements
4. Convert error handling
5. Update all call sites
6. Generate migration guide

**Agent benefit**: Async conversion becomes reliable and atomic

**Tests needed**:
```javascript
it('converts callback pattern to async/await', () => {
  const converted = convertAsync(callbackFunction);
  expect(converted).toContain('async function');
  expect(converted).toContain('await');
  expect(converted).not.toContain('callback');
});

it('identifies all call sites that need updating', () => {
  const analysis = analyzeAsync(callbackFunction);
  expect(analysis.callSites.length).toBeGreaterThan(0);
  expect(analysis.callSites[0]).toHaveProperty('file');
  expect(analysis.callSites[0]).toHaveProperty('line');
});

it('updates all call sites in batch', () => {
  const result = convertAsync(callbackFunction, { updateCallSites: true });
  expect(result.filesModified).toBeGreaterThan(1);
  // Verify updated calls use await
});
```

**Workflow improvement**: Function signature migration from 15-25 min → 3-5 min

---

## Helper 3: Export/Import Rewirer (1.5 Hours)

### Problem

When moving functions between modules, all imports must be updated:
- Find all import statements
- Rewrite paths
- Consolidate duplicate imports
- Update barrel exports (index.js)
- Verify no broken imports

**Real pain**: 
- Agent moves `src/utils/helpers.js` to `src/lib/helpers.js`
- 20+ files import from old location
- Must rewrite each path (../utils/helpers → ../lib/helpers)
- Easy to miss files or create typos

### Solution: Import Rewirer Tool

**New tool**: `js-rewire`

```bash
# Preview what will change
node tools/dev/js-rewire.js --find "src/utils/helpers" --replace "src/lib/helpers" --dry-run

# Output:
# ┌ REWRITE PLAN ─────────────────────────
# Find: ../utils/helpers
# Replace: ../lib/helpers
# 
# Files affected: 20
#   src/api/routes.js (3 imports)
#   src/services/data.js (1 import)
#   tests/utils.test.js (2 imports)
#   [...]
#
# Consolidate duplicate imports: Yes (2 instances)
# Update barrel exports (index.js): Yes
# ✓ DRY-RUN: All changes valid

# Apply the rewrite
node js-rewire.js --find "src/utils/helpers" --replace "src/lib/helpers" --fix

# Custom patterns with regex
node js-rewire.js --pattern "from '[^']*utils/([^']+)'" \
  --replace "from 'src/lib/$1'" --regex

# Update barrel exports
node js-rewire.js --find "src/services/data" --replace "src/lib/data" \
  --update-barrels
```

**Agent benefit**: Import rewiring becomes error-free and automated

**Tests needed**:
```javascript
it('finds all imports of a module', () => {
  const imports = findImports('src/utils/helpers');
  expect(imports.length).toBeGreaterThan(0);
  imports.forEach(imp => {
    expect(imp).toHaveProperty('file');
    expect(imp).toHaveProperty('specifiers');
  });
});

it('rewrites imports with correct relative paths', () => {
  const result = rewireImports('src/utils/helpers', 'src/lib/helpers');
  expect(result.filesModified).toBeGreaterThan(5);
  // Verify paths are correct relative to new location
});

it('consolidates duplicate imports', () => {
  // Setup: File imports same module twice
  const result = rewireImports(oldPath, newPath, { consolidate: true });
  const duplicates = findDuplicateImports(result.modifiedFile);
  expect(duplicates.length).toBe(0);
});

it('updates barrel exports', () => {
  const result = rewireImports(oldPath, newPath, { updateBarrels: true });
  const barrels = result.barrelUpdates;
  expect(barrels.length).toBeGreaterThan(0);
});
```

**Workflow improvement**: Import rewiring from 10-15 min → <1 min

---

## Helper 4: Object Property Extractor (1 Hour)

### Problem

Common refactoring: Extract repeated object pattern to constant/helper:
```javascript
// Current (repeated 15+ times):
const config = { level: 5, async: true, retries: 3 };
const config = { level: 5, async: true, retries: 3 };

// Target:
const DEFAULT_CONFIG = { level: 5, async: true, retries: 3 };
const config = DEFAULT_CONFIG;
```

### Solution: Object Pattern Extractor

```bash
# Find repeated object patterns
node tools/dev/js-extract-object.js --file src/index.js \
  --pattern "{ level: \*, async: true }" --min-occurrences 5

# Output:
# ┌ PATTERN FOUND ────────────────────────
# Pattern: { level: *, async: true, retries: 3 }
# Occurrences: 12
# Variance: level (5, 7, 9)
# 
# Suggested extraction:
#   const DEFAULT_CONFIG = { level: 5, async: true, retries: 3 };
#   // Parameterized: level varies (5, 7, 9)

# Extract to constant
node js-extract-object.js --file src/index.js --pattern "..." \
  --extract "DEFAULT_CONFIG" --location "top-of-file"

# Extract to factory function
node js-extract-object.js --file src/index.js --pattern "..." \
  --extract "createConfig" --type "factory"
```

**Agent benefit**: Spot repeated patterns and consolidate automatically

**Tests needed**:
```javascript
it('finds repeated object literals', () => {
  const patterns = findRepeatedPatterns(file, { minOccurrences: 5 });
  expect(patterns.length).toBeGreaterThan(0);
});

it('extracts to constant', () => {
  const result = extractToConstant(file, pattern, 'CONFIG');
  expect(result.modifiedCode).toContain('const CONFIG = {');
});
```

**Workflow improvement**: Pattern consolidation from manual task → automated discovery

---

## Helper 5: Error Handler Standardizer (1 Hour)

### Problem

Error handling is scattered across the codebase:
- Some functions throw, others use callbacks
- Some log errors, others don't
- No consistent pattern
- Hard for agents to add/fix error handling consistently

**Current state**:
```javascript
// Pattern 1:
function fetchData(callback) {
  try {
    const data = database.query();
    callback(null, data);
  } catch (err) {
    callback(err);  // No logging
  }
}

// Pattern 2:
async function fetchMoreData() {
  try {
    return await db.query();
  } catch (err) {
    console.error(err);  // Direct console.error
    throw err;
  }
}

// Pattern 3:
function fetchSomeData() {
  return database.query()
    .catch(err => {
      // No error handling at all
      throw err;
    });
}
```

### Solution: Error Handler Standardizer

```bash
# Audit error handling patterns
node tools/dev/js-standardize-errors.js --file src/services/ --analyze

# Output:
# ┌ ERROR HANDLING AUDIT ─────────────────
# Total functions: 42
# With error handling: 28 (67%)
# Without error handling: 14 (33%)
#
# Patterns detected:
#   Callback-based catch: 12
#   try/catch: 10
#   .catch() promises: 8
#   No handling: 12
#
# Inconsistencies:
#   Logging: 5 different patterns
#   Error types: Mixed (Error, string, object)
#   Rethrow: Inconsistent

# Apply standard pattern
node js-standardize-errors.js --file src/services/ \
  --pattern "standard" \
  --logging "via-logger-module" \
  --dry-run

# Standardize to consistent pattern:
#   1. All use try/catch (for async/sync consistency)
#   2. Log via src/utils/logger
#   3. Wrap in AppError class
#   4. Include context
```

**Implementation**:
1. Scan functions for error handling
2. Detect current pattern
3. Generate standardized version
4. Apply across module
5. Update call sites if needed

**Agent benefit**: Error handling becomes consistent and compliant

**Tests needed**:
```javascript
it('detects error handling patterns', () => {
  const audit = auditErrorHandling(file);
  expect(audit.patterns).toContain('try-catch');
  expect(audit.patterns).toContain('callback');
});

it('standardizes to consistent pattern', () => {
  const result = standardizeErrors(file, { pattern: 'try-catch' });
  // Verify all functions use try/catch
});
```

**Workflow improvement**: Error handling audit + standardization from manual → automated

---

## Helper 6: Test Mock Extractor (1.5 Hours)

### Problem

Test files often contain repeated mock objects:
```javascript
// test file 1:
const mockDb = {
  query: jest.fn().mockResolvedValue([]),
  close: jest.fn()
};

// test file 2:
const mockDb = {
  query: jest.fn().mockResolvedValue([]),
  close: jest.fn()
};

// test file 3:
const mockDb = {
  query: jest.fn().mockResolvedValue([]),
  close: jest.fn()
};
```

### Solution: Mock Extractor

```bash
# Find repeated mocks
node tools/dev/js-extract-mocks.js --dir tests/ --find-duplicates

# Output:
# ┌ DUPLICATE MOCKS FOUND ────────────────
# mockDb: Found in 8 test files
#   tests/a.test.js (line 15)
#   tests/b.test.js (line 20)
#   tests/c.test.js (line 18)
#   [...]
#
# Suggestion: Extract to tests/fixtures/mocks.js

# Extract to shared file
node js-extract-mocks.js --dir tests/ --extract "tests/fixtures/mocks.js"

# Generate mock factory
node js-extract-mocks.js --dir tests/ --extract "tests/fixtures/mocks.js" \
  --type "factory" --include-resetters
```

**Agent benefit**: Test infrastructure consolidation becomes automated

**Tests needed**:
```javascript
it('finds duplicate mock definitions', () => {
  const duplicates = findDuplicateMocks('tests/');
  expect(duplicates.mockDb).toBeDefined();
  expect(duplicates.mockDb.files.length).toBeGreaterThan(1);
});

it('extracts to shared fixture file', () => {
  const result = extractMocksToFile('tests/', 'tests/fixtures/mocks.js');
  expect(result.filesModified).toBeGreaterThan(1);
  expect(fileExists('tests/fixtures/mocks.js')).toBe(true);
});
```

**Workflow improvement**: Test infrastructure consolidation from manual → automated

---

## Helper 7: Dead Code Detector (1 Hour)

### Problem

Agents need to identify code that can be safely deleted:
- Unused functions
- Unused imports
- Unreachable code
- Dead branches

### Solution: Dead Code Detector

```bash
# Scan for dead code
node tools/dev/js-find-dead.js --file src/index.js --types "unused-functions,unused-imports,unreachable"

# Output:
# ┌ DEAD CODE ANALYSIS ───────────────────
# File: src/index.js
#
# Unused functions (10):
#   oldProcessData() - line 125 (no callers)
#   legacyFetch() - line 234 (no callers)
#
# Unused imports (5):
#   lodash (imported but never used)
#   moment (imported but never used)
#
# Unreachable code (2):
#   if (false) { ... } - line 450
#   return; ... <-- dead code after - line 890

# Remove safely
node js-find-dead.js --file src/index.js --remove --types "unused-imports,unreachable"
```

**Agent benefit**: Cleanup becomes safe and systematic

---

## Helper 8: API Contract Validator (1.5 Hours)

### Problem

When refactoring functions, it's easy to accidentally break the API contract:
- Parameter types changed
- Return type changed
- Behavior changed for edge cases

### Solution: API Contract Validator

```bash
# Extract current API contract
node tools/dev/js-validate-api.js --file src/services/data.js \
  --function processData --capture-contract

# Output:
# ┌ API CONTRACT CAPTURED ────────────────
# Function: processData
# Signature: (input: string | Buffer) => Promise<Object>
# Throws: InvalidInputError, DatabaseError
# Side effects: Logs to logger.debug
#
# Parameter constraints:
#   input: Non-empty, < 1MB
#   
# Return structure:
#   { data: Array, count: number, timestamp: Date }
#
# Test coverage: 12 tests validate this contract

# Validate against contract after refactor
node js-validate-api.js --file src/services/data.js \
  --function processData --validate-against-contract

# Output:
# ✓ Signature matches
# ✓ Return structure unchanged
# ⚠ New side effect detected: writes to cache
# ⚠ Parameter constraint changed: now accepts null
```

**Agent benefit**: API changes caught before deployment

---

## Priority & Implementation Roadmap

### Priority Matrix

| Helper | Effort | Impact | Priority |
|--------|--------|--------|----------|
| **Module Dependency Mapper** | 1 hr | VERY HIGH | ★★★★★ |
| **Import Rewirer** | 1.5 hrs | VERY HIGH | ★★★★★ |
| **Async Function Converter** | 1 hr | HIGH | ★★★★☆ |
| **Error Handler Standardizer** | 1 hr | MEDIUM | ★★★☆☆ |
| **Object Property Extractor** | 1 hr | MEDIUM | ★★★☆☆ |
| **Test Mock Extractor** | 1.5 hrs | MEDIUM | ★★★☆☆ |
| **Dead Code Detector** | 1 hr | MEDIUM | ★★★☆☆ |
| **API Contract Validator** | 1.5 hrs | HIGH | ★★★★☆ |

### Implementation Timeline

**Phase A (Quick wins, 2-3 days)**:
- Module Dependency Mapper (1 hr)
- Import Rewirer (1.5 hrs)
- Total: 2.5 hours

**Phase B (Core helpers, 2-3 days)**:
- Async Function Converter (1 hr)
- API Contract Validator (1.5 hrs)
- Object Property Extractor (1 hr)
- Total: 3.5 hours

**Phase C (Maintenance helpers, 1-2 days)**:
- Error Handler Standardizer (1 hr)
- Test Mock Extractor (1.5 hrs)
- Dead Code Detector (1 hr)
- Total: 3.5 hours

**Total effort**: 9-10 hours (3-4 days)

**Cumulative ROI with these helpers**:
- Module move: 15-30 min → 3-5 min (75-85% faster)
- Function conversion: 10-20 min → 2-3 min (80-85% faster)
- Import rewiring: 10-15 min → <1 min (95%+ faster)
- Error handling: 15-25 min → 3-5 min (80%+ faster)
- Test infrastructure: 20-30 min → 5 min (75-85% faster)

---

## Integration with Core Tooling

### How These Helpers Complement js-scan/js-edit

| Helper | Uses js-scan | Uses js-edit | New Capability |
|--------|-------------|------------|---|
| Mapper | Ripple analysis | — | Dependency prediction |
| Rewirer | Search imports | Replace imports | Multi-file atomic |
| Async Converter | Find callbacks | Replace functions | Pattern recognition |
| Object Extractor | Find patterns | Extract to constant | Repetition detection |
| Error Standardizer | Find catch blocks | Replace error handling | Domain-specific standardization |
| Mock Extractor | Find duplicates | Extract to file | Test infrastructure |
| Dead Code | Ripple analysis | Remove code | Safety validation |
| API Validator | JSDoc analysis | Validate changes | Contract checking |

### CLI Conventions

All helpers follow js-scan/js-edit patterns:
- `--dry-run` for preview
- `--json` for machine output
- `--quiet` for minimal output
- `--help` for documentation
- File input validation + error reporting

---

## Success Metrics

After **Phase A complete**:
- Module moves: 30% faster
- Import updates: 95% less manual work
- Agent confidence in refactoring: High

After **Phase B complete**:
- Function conversions: Reliable (95%+ success rate)
- API safety: Errors caught pre-deployment
- Code quality: More consistent patterns

After **Phase C complete**:
- Error handling: Standardized across codebase
- Test infrastructure: Consolidated, DRY
- Dead code: Systematically removed

---

## Next Steps

1. **Prioritize** Phase A (Mapper + Rewirer)
2. **Build** minimum viable versions
3. **Test** with real agent workflows
4. **Gather feedback** (what works? what's missing?)
5. **Iterate** on Phase B/C based on impact

---

## Related Documents

- `/docs/IMPLEMENTATION_ROADMAP.md` - Core tooling improvements
- `/docs/AGENT_REFACTORING_PLAYBOOK.md` - Agent workflows
- `/docs/TOOLING_GAPS_2_3_PLAN.md` - Technical specs

