# Lang-Mini Pattern Audit Report

_Generated: 2025-01-05_
_Purpose: Document current state and opportunities for applying lang-mini patterns across the codebase_

## Executive Summary

**Current State:**
- **lang-tools v0.0.36** installed as npm dependency
- **Only 1 file** currently imports lang-tools: `src/ui/public/index/sseHandlers.js`
- **Only 3 functions** currently used: `each()`, `is_defined()`, `tof()`
- **20+ powerful utilities** available but unused

**Opportunity Scale:**
- **500+ typeof checks** → candidates for `tof()` / `tf()`
- **300+ Array.isArray** → candidates for `tof()`
- **100+ array.includes()** → candidates for `get_truth_map_from_arr()`
- **Unknown count** of deep copy patterns → candidates for `clone()`

**Impact Assessment:**
- **HIGH**: Type checking improvements (consistency, edge case handling)
- **HIGH**: Truth maps (O(n)→O(1) performance for membership tests)
- **MEDIUM**: Deep cloning (correctness, clarity)
- **LOW**: Functional polymorphism (nice-to-have, refactoring intensive)

---

## Current Lang-Tools Usage

### Single Import Location

**File:** `src/ui/public/index/sseHandlers.js`
```javascript
import { each, is_defined, tof } from 'lang-tools';
```

**Functions Used:**
1. **each()** - Used throughout modularized client code for iteration
2. **is_defined()** - Used for safe undefined checks
3. **tof()** - Type detection (minimal usage found in single file)

**Pattern:** Modularization work (Phases 1-5) introduced lang-tools usage but didn't systematically apply patterns across codebase.

---

## Opportunity Analysis

### 1. Type Checking — MASSIVE OPPORTUNITY (500+ instances)

**Current Pattern (pervasive):**
```javascript
typeof value === 'string'
typeof value === 'function' 
typeof value === 'object'
typeof value !== 'undefined'
Array.isArray(value)
```

**Replacement Pattern:**
```javascript
import { tof, tf } from 'lang-tools';

// Full type name
tof(value) === 'string'      // returns 'string', 'array', 'null', 'arguments', etc.

// Abbreviated
tf(value) === 's'            // returns 's', 'a', 'o', 'n', 'f', etc.

// Array check
tof(value) === 'array'       // instead of Array.isArray(value)
```

**Benefits:**
- **Consistency:** One API for all type checks
- **Edge Cases:** Correctly handles `null`, `Arguments`, typed arrays
- **Readability:** Clear intent, especially with abbreviated forms
- **Defensive:** No false positives from truthy checks

**High-Priority Target Files (50+ typeof each):**
- `src/crawler/CrawlerEvents.js` (50+ typeof checks)
- `src/crawler/PageExecutionService.js` (67+ typeof checks)
- `src/crawler/IntelligentPlanRunner.js` (38+ typeof checks)
- `src/crawl.js` (37+ typeof checks)
- `src/config/ConfigManager.js` (23+ typeof checks)
- `src/ui/express/routes/api.crawl.js` (24+ typeof checks)
- `src/ui/express/routes/api.resume-all.js` (17+ typeof checks)
- `src/ui/public/index/analysisHandlers.js` (22+ typeof checks)
- `src/ui/shared/theme/themeController.js` (13+ typeof checks)

**Pattern Breakdown:**
- `typeof x === 'function'`: **~350 instances** (most common)
- `typeof x === 'object'`: **~150 instances** (second most common)
- `typeof x === 'string'`: **~100 instances**
- `typeof x === 'number'`: **~50 instances**
- `typeof x !== 'undefined'`: **~30 instances**
- `Array.isArray()`: **300+ instances** (should use `tof(x) === 'array'`)

---

### 2. Array Membership Testing — HIGH IMPACT (100+ instances)

**Current Pattern (O(n) lookups):**
```javascript
['idle', 'running', 'pending'].includes(status)
args.includes('--flag')
cols.includes('column_name')
reasons.includes('domain-conflict')
```

**Replacement Pattern (O(1) lookups):**
```javascript
import { get_truth_map_from_arr } from 'lang-tools';

const VALID_STATES = get_truth_map_from_arr(['idle', 'running', 'pending']);
// Returns: { idle: true, running: true, pending: true }

if (VALID_STATES[status]) { ... }  // O(1) lookup
```

**Benefits:**
- **Performance:** O(n) → O(1) for membership tests
- **Clarity:** Named constant expresses intent
- **Reusability:** Create once, use many times
- **Type Safety:** Works better with TypeScript (object key type checking)

**High-Priority Candidates:**
1. **Status/state validation arrays** (used in hot paths)
   - `src/ui/public/index/state/reducers.js`: `['idle', 'running', 'pending', 'ready', 'applied', 'blocked', 'error', 'failed'].includes(key)`
   - `src/analysis/page-analyzer.js`: `['article', 'nav'].includes(fetchRow.classification)`
   
2. **CLI argument parsing** (repeated checks)
   - `src/crawl.js`: Multiple `args.includes('--flag')` checks
   - `src/tools/capture-ui-screenshots.js`: `['1', 'true', 'yes', 'on'].includes(normalised)`
   - `src/ui/express/services/runnerFactory.js`: `['1', 'true', 'yes', 'on'].includes(v)`

3. **Column existence checks** (database migrations)
   - `src/db/sqlite/SQLiteNewsDatabase.js`: Multiple `cols.includes('column_name')` checks
   - `src/ui/express/db/writableDb.js`: Multiple `crawlCols.includes('column_name')` checks

4. **URL path filtering** (navigation discovery)
   - `src/crawler/planner/navigation/NavigationDiscoveryRunner.js`: Multiple path includes checks

**Pattern Locations (by file):**
- `src/db/sqlite/SQLiteNewsDatabase.js`: **25+ .includes() calls** (column checks)
- `src/ui/express/db/writableDb.js`: **18+ .includes() calls** (column checks)
- `src/crawl.js`: **10+ .includes() calls** (CLI args)
- `src/tools/capture-ui-screenshots.js`: **6+ .includes() calls** (CLI args, booleans)
- `src/ui/express/services/benchmarkManager.js`: **12+ .includes() calls** (string matching)

---

### 3. Deep Cloning — MEDIUM IMPACT (unknown count)

**Current Patterns (needs search):**
```javascript
JSON.parse(JSON.stringify(obj))      // breaks with functions, Date, etc.
Object.assign({}, obj)                // shallow copy only
{ ...obj }                            // shallow copy only
```

**Replacement Pattern:**
```javascript
import { clone } from 'lang-tools';

const copy = clone(obj);  // Deep copy that handles functions, Date, circular refs
```

**Benefits:**
- **Correctness:** Handles functions, Date objects, circular references
- **Simplicity:** One line, clear intent
- **Performance:** More efficient than JSON round-trip
- **Safety:** Avoids silent bugs from shallow copies

**Search Required:**
```bash
grep -r "JSON.parse(JSON.stringify" src/
grep -r "Object.assign" src/
```

---

### 4. Function Polymorphism — LOW PRIORITY (case-by-case)

**Current Pattern:**
```javascript
function process(value) {
  if (typeof value === 'string') {
    return handleString(value);
  } else if (Array.isArray(value)) {
    return handleArray(value);
  } else if (typeof value === 'object') {
    return handleObject(value);
  }
}
```

**Replacement Pattern:**
```javascript
import { fp } from 'lang-tools';

const process = fp({
  's': handleString,
  'a': handleArray,
  'o': handleObject
});
```

**Benefits:**
- **Declarative:** Clear signature mapping
- **Extensible:** Easy to add new types
- **Testable:** Each handler is isolated

**Note:** Only apply where it significantly improves clarity. Manual type switching is often clearer for simple cases.

---

### 5. Array-to-Index Mapping — LOW PRIORITY (uncommon pattern)

**Current Pattern:**
```javascript
const map = {};
arr.forEach((item, i) => {
  map[item] = i;
});
```

**Replacement Pattern:**
```javascript
import { get_map_from_arr } from 'lang-tools';

const map = get_map_from_arr(arr);
// Returns: { item1: 0, item2: 1, ... }
```

**Search Required:**
```bash
grep -r "forEach.*=>.*map\[" src/
```

---

### 6. Array-Like Conversions — VERY LOW PRIORITY (rare)

**Current Pattern:**
```javascript
Array.from(arrayLike)
Array.prototype.slice.call(arguments)
[...arrayLike]
```

**Replacement Pattern:**
```javascript
import { arr_like_to_arr } from 'lang-tools';

const arr = arr_like_to_arr(arrayLike);  // Works with arguments, NodeList, etc.
```

**Note:** These conversions are infrequent in the codebase (server-side Node.js, no DOM manipulation in most code).

---

## Implementation Strategy

### Phase 1: High-Impact, Low-Risk (Week 1)

**Focus:** Type checking improvements in isolated modules

**Target Files (pick 5-10):**
1. `src/config/ConfigManager.js` — Pure utility, well-tested
2. `src/utils/domainUtils.js` — Pure utility
3. `src/ui/public/index/formatters.js` — Pure functions
4. `src/ui/public/index/renderingHelpers.js` — Pure functions
5. `src/crawler/CrawlerState.js` — Isolated state management

**Actions:**
- Add `import { tof, tf, is_defined } from 'lang-tools';` at top
- Replace `typeof x === 'type'` with `tof(x) === 'type'`
- Replace `typeof x !== 'undefined'` with `is_defined(x)`
- Replace `Array.isArray(x)` with `tof(x) === 'array'`
- Run tests after each file
- Commit per file with clear message

**Success Criteria:**
- All tests passing
- No regressions
- Code reads clearer
- Pattern established for Phase 2

---

### Phase 2: Truth Maps for Hot Paths (Week 2)

**Focus:** O(n)→O(1) performance wins in frequently-executed code

**Target Areas:**
1. **State validation** (`src/ui/public/index/state/reducers.js`)
2. **CLI parsing** (`src/crawl.js`, `src/tools/*.js`)
3. **Column checks** (`src/db/sqlite/*.js`)

**Pattern:**
```javascript
// BEFORE (repeated O(n) lookups)
if (['idle', 'running', 'pending'].includes(status)) { ... }

// AFTER (one-time setup, O(1) lookups)
const VALID_STATES = get_truth_map_from_arr(['idle', 'running', 'pending', 'ready', 'applied', 'blocked', 'error', 'failed']);

if (VALID_STATES[status]) { ... }
```

**Success Criteria:**
- Measurable performance improvement (benchmark hot paths)
- No behavior changes
- Constants clearly named and documented

---

### Phase 3: Deep Cloning Audit (Week 3)

**Focus:** Find and fix deep copy patterns

**Actions:**
1. Search for `JSON.parse(JSON.stringify`
2. Audit `Object.assign` usage
3. Check spread operator usage for deep copy intent
4. Replace with `clone()` where appropriate
5. Test edge cases (functions, Date objects, circular refs)

**Success Criteria:**
- All deep copies use `clone()`
- No silent bugs from shallow copies
- Code clearer and more maintainable

---

### Phase 4: Apply Across Remaining Files (Ongoing)

**Focus:** Systematic application as files are touched

**Policy:**
- When editing any file, apply lang-mini patterns opportunistically
- Don't refactor for its own sake (wait until file needs changes)
- Maintain pattern consistency across similar code

---

## Testing Strategy

### Unit Test Coverage
- Verify type checking with edge cases (null, undefined, Arguments)
- Test truth map lookups with valid/invalid keys
- Test deep cloning with complex objects

### Integration Tests
- Ensure no behavior changes in end-to-end flows
- Verify performance improvements in benchmarks

### Regression Testing
- Run full test suite after each phase
- Monitor for subtle type coercion bugs

---

## Metrics & Success Criteria

### Code Quality Metrics
- **Lines Reduced:** Target 5-10% reduction via pattern consolidation
- **Type Check Consistency:** 100% using lang-mini API
- **Performance:** Measurable improvements in hot paths

### Before/After Comparisons
- Document specific examples showing clarity improvements
- Benchmark membership tests (O(n) vs O(1))
- Track developer feedback on readability

---

## Open Questions

1. **Should we use `tf()` (abbreviated) or `tof()` (full names)?**
   - Recommendation: Use `tof()` for clarity unless in hot paths
   - Abbreviated forms are cryptic for new developers

2. **How aggressive should we be with `fp()` adoption?**
   - Recommendation: Conservative — only when it significantly improves clarity
   - Manual type switching is often clearer for 2-3 branches

3. **Should we add TypeScript type definitions?**
   - lang-tools is JavaScript-first
   - Could add .d.ts files if team adopts TypeScript

---

## Related Resources

- **lang-mini GitHub:** https://github.com/metabench/lang-mini
- **lang-tools npm:** https://www.npmjs.com/package/lang-tools
- **Phase 6 Assessment:** `PHASE_6_ASSESSMENT.md` (modularization baseline)
- **AGENTS.md:** Current baseline and refactoring guidelines

---

## Appendices

### Appendix A: Type Abbreviation Reference

From lang-mini documentation:

| Full Name | Abbreviation | Example |
|-----------|--------------|---------|
| object | o | `{}` |
| array | a | `[]` |
| string | s | `'text'` |
| number | n | `42` |
| function | f | `() => {}` |
| boolean | b | `true` |
| undefined | u | `undefined` |
| null | N | `null` |
| Arguments | A | `arguments` |
| date | d | `new Date()` |
| regex | r | `/pattern/` |
| error | e | `new Error()` |
| buffer | B | `Buffer.from()` |
| promise | p | `Promise.resolve()` |
| observable | O | RxJS Observable |

**Recommendation:** Use full names (`tof()`) for clarity, abbreviations (`tf()`) only in hot paths.

### Appendix B: Lang-Mini Function Reference

**Type Detection:**
- `tof(obj)` - Full type name (e.g., 'array', 'null')
- `tf(obj)` - Abbreviated type (e.g., 'a', 'N')
- `atof(arr)` - Array of type names
- `deep_sig(obj)` - Structural signature (e.g., `{"a":n,"b":[s,s]}`)
- `get_item_sig(obj)` - Item signature for collections

**Collections:**
- `each(collection, fn, context)` - Iteration with `stop()` support
- `combinations(arrays)` - Cartesian product
- `get_truth_map_from_arr(arr)` - Returns `{item: true}` map for O(1) lookups
- `get_arr_from_truth_map(map)` - Reverse operation
- `get_map_from_arr(arr)` - Returns `{item: index}` map
- `arr_like_to_arr(arrayLike)` - Convert array-like to array

**Functional Programming:**
- `fp(fn)` - Functional polymorphism (signature dispatch)
- `mfp(options, sigFns)` - Multi-function polymorphism with grammar
- `vectorify(numFn)` - Apply operation to vectors
- `arrayify(fn)` - Transform function to work on arrays
- `mapify(fn)` - Transform function to work on objects

**Utilities:**
- `clone(obj)` - Deep copy (handles functions, Date, circular refs)
- `is_defined(val)` - Safe undefined check
- `is_array(val)` - Array.isArray wrapper
- `stringify(obj)` - JSON.stringify alias

**Classes:**
- `Evented_Class` - Event system (on/off/raise)
- `Grammar` - Type grammar parsing
- `Functional_Data_Type` - Type validation

### Appendix C: High-Value Files for Phase 1

Ranked by impact and ease of refactoring:

1. **src/config/ConfigManager.js** — 23 typeof checks, pure utility, well-tested
2. **src/utils/domainUtils.js** — Type checking, pure functions
3. **src/ui/public/index/formatters.js** — Pure formatting functions
4. **src/ui/public/index/renderingHelpers.js** — Pure rendering helpers
5. **src/crawler/CrawlerState.js** — Isolated state management
6. **src/ui/public/index/state/reducers.js** — State reducers, truth map opportunity
7. **src/analysis/place-extraction.js** — Analysis utilities
8. **src/crawler/planner/HubSeeder.js** — Planner logic
9. **src/ui/express/services/navigation.js** — Navigation utilities
10. **src/tools/placeHubDetector.js** — Detection utilities

---

_End of Audit Report_
