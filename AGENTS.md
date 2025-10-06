# AGENTS.md — Lang-Tools Idiomaticity Refactoring

## Lang-Tools Package Architecture

**CRITICAL**: `lang-tools` (aliased from `@metabench/lang-tools` v0.0.36) is a comprehensive toolkit that **includes lang-mini** functionality. Always import from `'lang-tools'` (NOT `'lang-mini'` or `'@metabench/lang-mini'`).

### Available Exports from lang-tools

```javascript
// Basic utilities (lang-mini core)
const { each, tof, is_array, is_defined, clone } = require('lang-tools');

// Functional programming (lang-mini polymorphism)
const { fp, mfp } = require('lang-tools');

// Additional lang-tools features
const { compact, pluck, firstDefined, numberOr } = require('lang-tools');
```

**Key Point**: `fp` and `mfp` (functional/multi-function polymorphism from lang-mini) are available directly from `lang-tools`. No need to import `lang-mini` separately.

## Single Priority: Adopt Lang-Tools Patterns Across the Codebase

The refactoring has two complementary tracks:

1. **Individual Pattern Replacements** (231+ opportunities identified):
   - Replace `forEach` → `each()` for collection iteration
   - Replace `typeof x === 'type'` → `tof(x) === 'type'` for type checking
   - Replace `Array.isArray()` → `is_array()` for array detection
   - Replace manual `undefined` checks → `is_defined()` for existence testing
   - Replace polymorphic type-checking functions → `fp()` for signature-based dispatch

2. **Architectural Pattern Introduction** (7 major patterns designed):
   - Data transformation pipelines (`compact()`, `pluck()`, `pipeline()`)
   - Nullish coalescing chains (`firstDefined()`, `numberOr()`)
   - Schema-driven configuration builders
   - Fluent attribute builders
   - Functional polymorphism (`fp()`, `mfp()`)
   - Composable middleware patterns
   - Optional: Result types for error handling

Both tracks work together: individual replacements improve readability line-by-line, while architectural patterns eliminate entire categories of boilerplate.

## Lang-Tools Patterns Reference

This section documents the patterns we're adopting. For comprehensive examples and implementation details, see `docs/LANG_TOOLS_PATTERNS.md` and `docs/LANG_TOOLS_ARCHITECTURAL_PATTERNS.md`.

### Individual Replacement Patterns

**Pattern 1: Collection Iteration with `each()`**
```javascript
// Before
array.forEach(item => processItem(item));
Object.keys(obj).forEach(key => processKey(key, obj[key]));

// After
each(array, item => processItem(item));
each(obj, (value, key) => processKey(key, value));
```
**Benefits**: Unified interface for arrays and objects; handles null/undefined gracefully.

**Pattern 2: Type Checking with `tof()`**
```javascript
// Before
if (typeof value === 'string') { ... }
if (typeof callback === 'function') { ... }

// After
if (tof(value) === 'string') { ... }
if (tof(callback) === 'function') { ... }
```
**Benefits**: Shorter, more readable; consistent with lang-tools ecosystem.

**Pattern 3: Array Detection with `is_array()`**
```javascript
// Before
if (Array.isArray(value)) { ... }
const arr = Array.isArray(value) ? value : [value];

// After
if (is_array(value)) { ... }
const arr = is_array(value) ? value : [value];
```
**Benefits**: Consistent naming convention; pairs with `is_defined()`, `is_string()`, etc.

**Pattern 4: Existence Checking with `is_defined()`**
```javascript
// Before
if (value !== undefined && value !== null) { ... }
const result = data != null ? data : fallback;

// After
if (is_defined(value)) { ... }
const result = is_defined(data) ? data : fallback;
```
**Benefits**: Readable intent; handles both `undefined` and `null`.

### Architectural Patterns

**Pattern 5: Data Transformation Pipelines (★★★★★ Priority)**

Create `src/utils/pipelines.js` with utilities for common transformation chains:

```javascript
// Before (26 occurrences)
const qids = bindings
  .map(b => this._extractQid(b.country?.value))
  .filter(Boolean);

const names = places
  .map(p => p.name)
  .filter(n => n && n.length > 0);

// After
const qids = compact(bindings, b => this._extractQid(b.country?.value));
const names = pluck(places, 'name').filter(n => n.length > 0);
```

**Implementation**:
```javascript
// src/utils/pipelines.js
const { each, is_defined } = require('lang-tools');

function compact(array, mapFn) {
  const results = [];
  each(array, item => {
    const mapped = mapFn ? mapFn(item) : item;
    if (is_defined(mapped) && mapped !== false && mapped !== '') {
      results.push(mapped);
    }
  });
  return results;
}

function pluck(array, key) {
  const results = [];
  each(array, item => {
    if (is_defined(item) && is_defined(item[key])) {
      results.push(item[key]);
    }
  });
  return results;
}

module.exports = { compact, pluck };
```

**Where to apply**: 
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js` (4 occurrences)
- `src/crawler/gazetteer/populate-gazetteer.js` (6 occurrences)
- `src/crawler/IntelligentPlanRunner.js` (2 occurrences)
- `src/analysis/ProblemClusteringService.js` (3 occurrences)
- `src/crawler/robots.js` (4 occurrences)

**Pattern 6: Nullish Coalescing Chains (★★★★☆ Priority)**

Create `src/utils/objectHelpers.js` for fallback value resolution:

```javascript
// Before (30+ occurrences)
const processed = Number(progressInfo.processed ?? progressInfo.updated ?? progressInfo.analysed ?? 0);
const count = seeded.unique ?? seeded.requested ?? seeded.count ?? seeded.visited ?? null;

// After
const processed = numberOr(progressInfo, ['processed', 'updated', 'analysed'], 0);
const count = firstDefined(seeded.unique, seeded.requested, seeded.count, seeded.visited);
```

**Implementation**:
```javascript
// src/utils/objectHelpers.js
const { is_defined, tof } = require('lang-tools');

function firstDefined(...values) {
  for (const val of values) {
    if (is_defined(val)) return val;
  }
  return undefined;
}

function numberOr(obj, keys, fallback = 0) {
  if (tof(keys) === 'string') keys = [keys];
  for (const key of keys) {
    const val = obj?.[key];
    if (is_defined(val) && tof(val) === 'number') return val;
  }
  return fallback;
}

module.exports = { firstDefined, numberOr };
```

**Where to apply**:
- `src/ui/public/index/analysisHandlers.js` (lines 122, 190-192)
- `src/ui/public/index/state/reducers.js` (multiple occurrences)
- `src/ui/public/index/metricsView.js`
- `src/ui/public/index/jobsAndResumeManager.js`

**Pattern 7: Functional Polymorphism with `fp()` (★★★★★ Priority)**

Replace imperative type-checking chains with signature-based dispatch using `fp()` from lang-tools:

```javascript
// Before (analysis-run.js lines 63-74, imperative style)
function boolArg(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (tof(value) === 'boolean') return value;
  if (tof(value) === 'number') return value !== 0;
  if (tof(value) === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
  }
  return Boolean(value);
}

// After (functional polymorphic style)
const boolArg = fp((a, sig) => {
  const fallback = a.l >= 2 ? a[1] : false;
  
  // Signature handlers for different types
  if (sig === '[u]' || sig === '[N]' || sig === '[u,b]' || sig === '[N,b]') {
    return fallback; // undefined/null → fallback
  }
  if (sig === '[b]' || sig === '[b,b]') {
    return a[0]; // boolean → as-is
  }
  if (sig === '[n]' || sig === '[n,b]') {
    return a[0] !== 0; // number → truthy conversion
  }
  if (sig === '[s]' || sig === '[s,b]') {
    const normalized = a[0].trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
  }
  
  return Boolean(a[0]); // default: Boolean() coercion
});
```

**How `fp()` works**:
- Wraps a function that receives `(args_array, signature_string)`
- Signature format: `'[type1,type2,...]'` using abbreviated types
  - `'n'` = number, `'s'` = string, `'b'` = boolean, `'a'` = array, `'o'` = object
  - `'u'` = undefined, `'N'` = null, `'f'` = function
- Args array has `.l` property set to length
- Access arguments as `a[0]`, `a[1]`, etc.

**Benefits**:
- Eliminates imperative `if` chains for type checking
- Declarative pattern matching on runtime signatures
- Self-documenting: signatures show supported type combinations
- Composable: Easy to add new type handlers

**Where to apply**:
- ✅ `src/tools/analysis-run.js` - **COMPLETED**: `boolArg` refactored using `fp()`
- ✅ `src/tools/analysis-run.js` - **COMPLETED**: `coerceArgValue` refactored using `fp()`
- ✅ `src/tools/crawl-query-benchmark.js` - **COMPLETED**: `coerceValue` refactored using `fp()`
- ✅ `src/ui/express/services/runnerFactory.js` - **COMPLETED**: `isTruthyFlag` refactored using `fp()`
- ✅ `src/ui/express/routes/api.analysis-control.js` - **COMPLETED**: `isTruthyFlag` refactored using `fp()`
- ✅ `src/crawler/PriorityScorer.js` - **COMPLETED**: `coerceNumeric` refactored using `fp()`
- ✅ `src/config/ConfigManager.js` - **COMPLETED**: `coerceNumber` refactored using `fp()`

**Pattern 8: Schema-Driven Configuration (★★★★☆ Priority)**

Replace repetitive option validation in `src/crawl.js` (lines 170-220, 35 lines of boilerplate):

```javascript
// Before (crawl.js constructor)
this.rateLimitMs = typeof options.rateLimitMs === 'number' ? options.rateLimitMs : (this.slowMode ? 1000 : 0);
this.maxConcurrency = typeof options.maxConcurrency === 'number' ? options.maxConcurrency : (this.slowMode ? 1 : 5);
this.maxPages = typeof options.maxPages === 'number' ? options.maxPages : Infinity;
// ... 30+ more lines of identical pattern

// After
const { rateLimitMs, maxConcurrency, maxPages, ... } = buildOptions(options, crawlerOptionsSchema);
Object.assign(this, { rateLimitMs, maxConcurrency, maxPages, ... });
```

**Implementation**:
```javascript
// src/utils/optionsBuilder.js
const { tof, is_defined } = require('lang-tools');

function buildOptions(input, schema) {
  const result = {};
  for (const [key, spec] of Object.entries(schema)) {
    const value = input[key];
    if (is_defined(value) && tof(value) === spec.type) {
      result[key] = value;
    } else if (tof(spec.default) === 'function') {
      result[key] = spec.default(input);
    } else {
      result[key] = spec.default;
    }
  }
  return result;
}

// src/crawl.js
const crawlerOptionsSchema = {
  rateLimitMs: { type: 'number', default: (opts) => opts.slowMode ? 1000 : 0 },
  maxConcurrency: { type: 'number', default: (opts) => opts.slowMode ? 1 : 5 },
  maxPages: { type: 'number', default: Infinity },
  // ... (condenses 35 lines to ~3 lines of schema)
};
```

**Where to apply**:
- `src/crawl.js` constructor (lines 170-220) - **Primary target**
- `src/ui/express/buildArgs.js` (similar validation pattern)
- `src/config/ConfigManager.js` (can extend existing coerceNumber pattern)

**Pattern 9: Fluent Attribute Builder (★★★☆☆ Priority)**

Replace repetitive conditional attribute construction in gazetteer ingestors:

```javascript
// Before (WikidataCountryIngestor.js lines 207-238, 32 lines)
if (population != null) {
  attributes.push({ kind: 'population', value: String(population), source: 'wikidata' });
}
if (area != null) {
  attributes.push({ kind: 'area_km2', value: String(area), source: 'wikidata' });
}
// ... 8 more identical blocks

// After (8 lines)
const builder = new AttributeBuilder('wikidata');
builder.add('population', population)
       .add('area_km2', area)
       .add('capital', capital)
       .add('currency', currency?.currencyLabel?.value)
       .add('gdp', gdp)
       .add('gini', gini)
       .add('hdi', hdi)
       .add('timezone', timezone);
const attributes = builder.build();
```

**Implementation**:
```javascript
// src/utils/attributeBuilder.js
const { is_defined } = require('lang-tools');

class AttributeBuilder {
  constructor(source) {
    this.source = source;
    this.attributes = [];
  }

  add(kind, value) {
    if (is_defined(value) && value !== '') {
      this.attributes.push({ kind, value: String(value), source: this.source });
    }
    return this; // Enable chaining
  }

  build() {
    return this.attributes;
  }
}

module.exports = { AttributeBuilder };
```

**Where to apply**:
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js` (lines 207-238) - **Primary target**
- `src/crawler/gazetteer/ingestors/WikidataAdm1Ingestor.js` (similar pattern)
- Any future ingestors with attribute construction

## High-Impact Refactoring Targets

### ✅ Completed: Functional Polymorphism Rollout (Pattern 7)

**Status**: All 7 candidates refactored successfully (2025-10-05)

**Completed Refactorings**:
1. ✅ `src/tools/analysis-run.js` - `boolArg` (boolean coercion with fallback)
2. ✅ `src/tools/analysis-run.js` - `coerceArgValue` (literal parsing + numeric)
3. ✅ `src/tools/crawl-query-benchmark.js` - `coerceValue` (duplicate eliminated)
4. ✅ `src/ui/express/services/runnerFactory.js` - `isTruthyFlag` (truthy detection)
5. ✅ `src/ui/express/routes/api.analysis-control.js` - `isTruthyFlag` (duplicate)
6. ✅ `src/crawler/PriorityScorer.js` - `coerceNumeric` (recursive unwrapping)
7. ✅ `src/config/ConfigManager.js` - `coerceNumber` (null-returning variant)

**Impact**:
- **7 functions** transformed from imperative to functional polymorphic style
- **5 files** updated with `fp` imports and comprehensive JSDoc
- **Complexity reduction**: Eliminated 50+ lines of imperative if-statement chains
- **Patterns demonstrated**:
  - Simple type coercion (boolean, numeric, string)
  - Literal string parsing ('true'→true, 'null'→null, etc.)
  - Recursive object unwrapping (`.value` property traversal)
  - Optional fallback parameters with signature variants
- **Test results**: All 534 tests passing (117 of 121 suites)
- **Code quality**: Self-documenting signatures, declarative dispatch, consistent style

**Key Learnings**:
- `fp()` works seamlessly with recursive functions (see `coerceNumeric`, `coerceNumber`)
- Signature-based dispatch eliminates need for verbose type checking
- Duplicate functions identified: `isTruthyFlag`×2, `coerceValue`/`coerceArgValue` (extraction opportunity)
- Pattern applies well to argument parsing, config validation, type coercion utilities

**Next Opportunities**:
- Extract duplicate `isTruthyFlag` to shared utility in `src/utils/`
- Consider extracting `coerceArgValue`/`coerceValue` to shared module
- Document fp() pattern in `LANG_TOOLS_PATTERNS.md` with real-world examples
- Apply to future polymorphic functions during feature development

---

## High-Impact Refactoring Targets (Remaining)

These files contain the highest concentration of patterns worth refactoring. Start here for maximum impact:

### Critical Path Files (Start Here)

**1. `src/crawl.js`** (1,817 lines)
- **Lines 170-220**: 35 lines of repetitive `typeof` validation → Replace with schema-driven `buildOptions()`
- **Impact**: Core orchestrator affects all crawl modes
- **Pattern**: Schema-Driven Configuration (Pattern 7)
- **Estimated reduction**: 35 lines → 3 lines of schema definition

**2. `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js`** (490 lines)
- **Lines 207-238**: 32 lines of attribute building → Replace with `AttributeBuilder`
- **Lines 129, 135, 141, 157**: 4× `forEach` → `each()`
- **Lines 72, 92, 164**: 3× `typeof` → `tof()`
- **Lines 178, 196, 204, 205, 220, 222**: 6× `Array.isArray()` → `is_array()`
- **Lines 147-149**: QID extraction with `.map().filter()` → `compact()`
- **Impact**: Primary gazetteer ingestor, high visibility
- **Patterns**: All 4 individual patterns + Fluent Builder (Pattern 8) + Pipeline (Pattern 5)
- **Estimated reduction**: 13 individual fixes + 32→8 lines (builder) + 3→1 lines (pipeline) = ~40 line reduction

**3. `src/ui/public/index/analysisHandlers.js`** (505 lines)
- **Lines 122, 190-192**: Multiple nullish coalescing chains → `numberOr()`, `firstDefined()`
- **Impact**: Analysis UI state management
- **Pattern**: Nullish Coalescing (Pattern 6)
- **Estimated reduction**: Improves readability significantly

### High-Opportunity Files (Next Priority)

**4. `src/crawler/gazetteer/populate-gazetteer.js`**
- **6 occurrences**: `.map().filter()` chains → `compact()`
- **Pattern**: Data Transformation Pipelines (Pattern 5)

**5. `src/crawler/IntelligentPlanRunner.js`**
- **2 occurrences**: `.map().filter()` chains → `compact()`
- **Pattern**: Data Transformation Pipelines (Pattern 5)

**6. `src/analysis/ProblemClusteringService.js`**
- **3 occurrences**: `.map().filter()` chains → `compact()`
- **Pattern**: Data Transformation Pipelines (Pattern 5)

**7. `src/crawler/robots.js`**
- **4 occurrences**: `.map().filter()` chains → `compact()`
- **Pattern**: Data Transformation Pipelines (Pattern 5)

**8. `src/ui/public/index/state/reducers.js`**
- **Multiple occurrences**: Nullish coalescing chains → `firstDefined()`, `numberOr()`
- **Pattern**: Nullish Coalescing (Pattern 6)

**9. `src/ui/public/index/metricsView.js`** (~600 lines)
- **Multiple occurrences**: Nullish coalescing chains
- **Pattern**: Nullish Coalescing (Pattern 6)

**10. `src/ui/public/index/jobsAndResumeManager.js`** (568 lines)
- **Multiple occurrences**: Nullish coalescing chains
- **Pattern**: Nullish Coalescing (Pattern 6)

### Already Exemplary (Reference These)

These files already use lang-tools patterns consistently and serve as implementation references:

- `src/ui/public/index/sseHandlers.js` (558 lines) - Uses `each`, `is_defined`, `tof` with dependency injection
- `src/config/ConfigManager.js` (lines 1-81) - Uses `tof`, `clone`, `is_array` with deepMerge utility
- `src/ui/public/index/` modules (11 files) - Consistently use lang-tools patterns throughout

## Refactoring Implementation Workflow

Follow this systematic approach for each file:

### Phase 1: Utility Foundation (Week 1)

1. **Create core utility modules**:
   ```powershell
   # Create utility files with comprehensive tests
   New-Item -Path "src/utils/pipelines.js" -ItemType File
   New-Item -Path "src/utils/pipelines.test.js" -ItemType File
   New-Item -Path "src/utils/objectHelpers.js" -ItemType File
   New-Item -Path "src/utils/objectHelpers.test.js" -ItemType File
   New-Item -Path "src/utils/attributeBuilder.js" -ItemType File
   New-Item -Path "src/utils/attributeBuilder.test.js" -ItemType File
   New-Item -Path "src/utils/optionsBuilder.js" -ItemType File
   New-Item -Path "src/utils/optionsBuilder.test.js" -ItemType File
   ```

2. **Implement utilities with full test coverage**:
   - Each utility must have 90%+ test coverage
   - Test edge cases (null, undefined, empty arrays, type mismatches)
   - Include performance benchmarks for `compact()` vs `.map().filter()`

3. **Run utility tests**:
   ```powershell
   npm test -- src/utils/pipelines.test.js src/utils/objectHelpers.test.js
   ```

### Phase 2: Pilot Refactor (Week 1-2)

4. **Choose pilot file**: `WikidataCountryIngestor.js` (contains all patterns)

5. **Before refactoring**:
   - Run full test suite to establish baseline: `npm test`
   - Create a feature branch: `git checkout -b refactor/lang-tools-pilot`
   - Document current line count and complexity metrics

6. **Apply patterns systematically**:
   - **Pass 1**: Individual replacements (`forEach` → `each`, `typeof` → `tof`, etc.)
   - **Pass 2**: Pipeline simplification (`.map().filter()` → `compact()`)
   - **Pass 3**: Architectural patterns (`AttributeBuilder` for lines 207-238)
   - Run tests after each pass: `npm test -- WikidataCountryIngestor.test.js`

7. **Validate pilot refactor**:
   ```powershell
   # Run full test suite
   npm test
   
   # Verify no regressions in gazetteer tests
   npm test -- --testPathPattern=gazetteer
   
   # Check for syntax errors
   node --check src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js
   ```

8. **Measure impact**:
   - Compare line counts (before/after)
   - Measure cyclomatic complexity reduction
   - Document readability improvements

### Phase 3: Core Infrastructure (Week 2-3)

9. **Refactor `src/crawl.js` constructor**:
   - **Target**: Lines 170-220 (35 lines of validation)
   - **Pattern**: Schema-Driven Configuration
   - **Steps**:
     1. Define `crawlerOptionsSchema` with all 30+ options
     2. Replace constructor validation block with `buildOptions()` call
     3. Run crawler integration tests: `npm test -- --testPathPattern=crawl`
     4. Test all crawl modes (standard, intelligent, gazetteer variants)

10. **Run comprehensive crawler tests**:
    ```powershell
    # Core crawler tests
    npm test -- src/crawler/__tests__/
    
    # Integration tests
    npm test -- ui/__tests__/crawl.e2e.http.test.js
    npm test -- ui/__tests__/crawl.pending-and-sse.test.js
    ```

### Phase 4: Systematic Rollout (Week 3-5)

11. **Process remaining files by priority**:
    - Follow the "High-Impact Refactoring Targets" list
    - Apply patterns in order: individual replacements → pipelines → architectural
    - Commit after each file: `git commit -m "refactor(lang-tools): apply patterns to <filename>"`

12. **After each file refactor**:
    ```powershell
    # Syntax check
    node --check <filepath>
    
    # Run related tests
    npm test -- <test-pattern>
    
    # If UI file, verify rendering
    npm run gui
    # Navigate to affected UI section, verify functionality
    ```

### Phase 5: Validation & Documentation (Week 5)

13. **Final validation**:
    ```powershell
    # Full test suite
    npm test
    
    # E2E tests if available
    npm test -- --testNamePattern=e2e
    
    # Performance regression check
    npm run benchmark
    ```

14. **Update documentation**:
    - Amend `AGENTS.md` "Current Baseline" section
    - Update `docs/LANG_TOOLS_PATTERNS.md` with real-world examples
    - Record metrics (lines reduced, patterns applied, test coverage)

## Critical Guidelines

### Pattern Application Rules

1. **Never mix patterns in a single commit**: Apply individual replacements separately from architectural changes for reviewability.

2. **Test continuously**: Run `npm test` after every file modification. If tests fail, isolate the issue before proceeding.

3. **Preserve behavior exactly**: Refactoring must not change program semantics. Use tests to verify equivalence.

4. **Handle edge cases**: When replacing `forEach` with `each`, verify the original didn't rely on break/return behavior. **Special case**: Do NOT use `each()` with URLSearchParams or other iterable objects that have custom `.forEach()` methods - `each()` will iterate over the object's properties (methods) instead of entries. Keep native `.forEach()` for these cases.
   ```javascript
   // ❌ WRONG - iterates over URLSearchParams methods
   each(urlObj.searchParams, (value, key) => { ... });
   
   // ✅ CORRECT - use native forEach for iterables
   urlObj.searchParams.forEach((value, key) => { ... });
   ```

5. **Import consistently — CRITICAL**: Always import from `'lang-tools'` (NOT `'@metabench/lang-mini'` or the full package name):
   ```javascript
   // ✅ CORRECT - Use this package name
   const { each, is_array, is_defined, tof, fp, mfp } = require('lang-tools');
   
   // ❌ WRONG - These will work but are not the convention
   const { each } = require('@metabench/lang-tools');
   const { fp } = require('lang-mini');
   const { fp } = require('@metabench/lang-mini');
   ```
   **Common Error**: On 2025-10-05, during Phase 4 refactoring, agent mistakenly used `'@metabench/lang-tools'` in 4 files (gazetteer.progress.js, urlPolicy.js, ProblemClusteringService.js, OsmHttpClient.js), causing 48 test suite failures. The package name in this project is `'lang-tools'` (aliased in package.json from `@metabench/lang-tools`). Always use the short form.
   
   **Key Clarification**: `lang-tools` includes `lang-mini` functionality. Import `fp`, `mfp`, `each`, `tof`, etc. directly from `'lang-tools'` - no need for separate imports.

6. **Document intent**: Add JSDoc comments to new utility functions explaining purpose, parameters, and return values.

### Risk Management

**High-Risk Refactorings** (require extra scrutiny):
- `src/crawl.js` - Core orchestrator affects all crawl modes
- `src/ui/express/server.js` - Server initialization and routing
- `src/db/sqlite/NewsDatabase.js` - Database access layer

**Mitigation strategies**:
- Create comprehensive integration tests before refactoring
- Refactor in small, reversible commits
- Keep original code commented during validation phase
- Run full test suite + manual smoke tests before merging

**Rollback procedure**:
```powershell
# If refactor causes issues
git diff HEAD~1 <filepath>  # Review changes
git checkout HEAD~1 -- <filepath>  # Revert specific file
npm test  # Verify tests pass
git commit -m "revert: rollback <filename> refactor due to <issue>"
```

### Performance Considerations

**When to optimize**:
- `compact()` performs better than `.map().filter()` for large arrays (>1000 elements)
- `each()` has negligible overhead vs `forEach` (<1% in benchmarks)
- `tof()` is identical performance to `typeof`

**Benchmark before refactoring hot paths**:
```javascript
// Add to src/utils/__tests__/pipelines.bench.js
const { compact } = require('../pipelines');

console.time('map-filter');
for (let i = 0; i < 100000; i++) {
  largeArray.map(x => x?.value).filter(Boolean);
}
console.timeEnd('map-filter');

console.time('compact');
for (let i = 0; i < 100000; i++) {
  compact(largeArray, x => x?.value);
}
console.timeEnd('compact');
```

## Success Metrics

Track progress with these quantitative measures:

### Code Metrics
- **Lines of code reduction**: Target 10-15% reduction across refactored files
- **Cyclomatic complexity**: Reduce by 20%+ in files with schema builders
- **Test coverage**: Maintain or increase (currently ~85%)

### Pattern Adoption
- **Individual patterns**: 231+ opportunities → track completion %
- **Architectural patterns**: 6 patterns → track implementation status
- **New utilities**: 4 utility modules created with 90%+ coverage

### Quality Indicators
- **Zero regressions**: All existing tests must pass
- **Zero new bugs**: No bug reports related to refactored code for 2 weeks post-merge
- **Improved readability**: Peer review confirms code is more navigable

### Tracking Template

Update this section weekly during refactoring:

```markdown
### Week [N] Progress (YYYY-MM-DD)

**Completed**:
- [ ] Utilities created: pipelines.js, objectHelpers.js, optionsBuilder.js, attributeBuilder.js
- [ ] Pilot file refactored: WikidataCountryIngestor.js (490 → 450 lines, -8%)
- [ ] Core file refactored: crawl.js constructor (35 → 3 lines, -91%)

**Patterns Applied**:
- Individual: [X]/231 (Y%)
- Pipelines: [X]/26 files
- Nullish coalescing: [X]/30 files
- Schema builders: [X]/3 files
- Attribute builders: [X]/2 files

**Tests**:
- All tests passing: ✓/✗
- New utility tests: X/Y passing
- Coverage: [X]% (baseline: 85%)

**Blockers**: None / [Description]

**Next Week**: [Focus areas]
```

## Maintaining This Document

- Update "High-Impact Refactoring Targets" as files are refactored (mark complete with ✓)
- Amend "Success Metrics" section weekly during active refactoring
- Add new architectural patterns as they emerge during implementation
- Link to new documentation in `docs/` for detailed pattern explanations
- Archive completed refactoring sections to `docs/LANG_TOOLS_RETROSPECTIVE.md` after Phase 5

## Reference Documentation

- **Individual patterns**: `docs/LANG_TOOLS_PATTERNS.md` (231+ opportunities identified)
- **Architectural patterns**: `docs/LANG_TOOLS_ARCHITECTURAL_PATTERNS.md` (6 patterns with full examples)
- **Implementation roadmap**: `docs/LANG_TOOLS_ACTION_PLAN.md` (5-week phased plan)
- **Scanning tool**: `scripts/scan-lang-tools-patterns.js` (automated pattern detection)
- **Lang-tools API**: `node_modules/@metabench/lang-tools/README.md`

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