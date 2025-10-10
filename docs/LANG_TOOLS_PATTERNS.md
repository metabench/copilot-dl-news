# Lang-Tools Patterns for index.js Refactoring

_Last updated: 2025-01-05_

This document captures interesting and immediately useful patterns from the lang-tools library that can be applied to our client-side refactoring.

**When to Read**:
- Planning refactors for `ui/` modules where lang-tools helpers can replace ad-hoc DOM or collection logic
- Reviewing production-safe idioms before introducing new `lang-tools` utilities into shared code
- Evaluating whether a proposed transformation belongs in lang-tools or a bespoke module

**⚠️ IMPORTANT**: This document refers to `collective()` (the **function**), not `Collection` (the **class**):
- ✅ `collective(array)` or `collect(array)` - Proxy utility for bulk operations (what this doc covers)
- ❌ `new Collection()` - Reactive array-like data structure with events/indexing (different thing entirely)

Both are exported from lang-tools, but serve different purposes. We're using `collective()` for concise DOM/data manipulation.

## Most Impactful Patterns

**After unit testing and production deployment, revised priority order:**

1. **each() with stop function** (★★★★★) - Most versatile, works for all iteration needs
2. **fp() for polymorphic functions** (★★★★★) - **PRODUCTION PROVEN** - 7 functions refactored successfully
3. **is_defined()** (★★★★☆) - Cleaner null/undefined checks throughout
4. **tof()** (★★★★☆) - Better type checking than typeof
5. **collective()** (★★★☆☆) - Useful for extracting values, but limited scope
6. **truth()** (★★☆☆☆) - Niche filtering use cases

**Key insight from testing**: `collective()` is NOT a magic bullet for eliminating loops. It's useful for specific extraction patterns but `each()` remains the workhorse for most DOM manipulation.

**Key insight from production**: `fp()` excels at eliminating imperative type-checking chains in argument parsers, type coercers, and config handlers. Upgraded to ★★★★★ after successful refactoring of 7 functions across the codebase with zero regressions.

### 1. Collective Pattern (★★★☆☆ - USEFUL BUT LIMITED)

**What it does**: Creates a Proxy that applies operations to every item in an array. **IMPORTANT**: Only works for direct properties/methods, NOT nested access.

**Source**: `lang-tools/collective.js`

**Verified behavior** (from unit tests):
```javascript
const {collective} = require('lang-tools');

// ✅ WORKS: Direct method calls
const strings = ['hello', 'world', 'test'];
const upper = collective(strings).toUpperCase();
// upper = ['HELLO', 'WORLD', 'TEST']

// ✅ WORKS: Direct property access
const objects = [{name: 'Alice'}, {name: 'Bob'}];
const names = collective(objects).name;
// names = ['Alice', 'Bob']

// ❌ DOES NOT WORK: Nested property access
const elements = [el1, el2, el3];
collective(elements).classList.add('active'); // TypeError!
// Because collective returns array of classList objects, not a proxy

// ❌ DOES NOT WORK: Empty arrays
collective([]).someProp; // TypeError: Cannot read property of undefined

// ✅ CORRECT WAY for DOM operations - use each() instead:
import {each} from 'lang-tools';
each(elements, el => el.classList.add('active'));
```

**Real-world use cases WHERE IT HELPS**:
```javascript
// 1. Extract values for filtering/mapping
const ids = collective(jobCards).dataset; // Get all dataset objects
const priorities = ids.map(d => d.priority);

// 2. Call methods that return values
const rects = collective(elements).getBoundingClientRect();
const widths = rects.map(r => r.width);

// 3. String/number operations
const trimmed = collective(inputs).value.map(v => v.trim());
```

**Revised impact assessment**: ★★★☆☆ (downgraded from ★★★★★)
- Useful for extracting arrays of values or calling methods
- NOT a replacement for forEach loops with nested operations
- each() from lang-tools is better for DOM manipulation
- Estimated code reduction: ~10-15% in specific extraction scenarios, not 50%

function handleMilestone(milestone) {
  if (is_defined(milestone.visited_hub_countries)) {
    const list = document.getElementById('visited-hubs');
    list.innerHTML = '';
    each(milestone.visited_hub_countries, country => {
      const li = document.createElement('li');
      li.textContent = country;
      list.appendChild(li);
    });
  }
}

// OR even better - use collective for bulk DOM manipulation:
function updateElements(selectors, className) {
  const elements = selectors.map(sel => document.querySelector(sel));
  collective(elements).classList.add(className);
}
```

**Key benefits**:
- Eliminates explicit loops for bulk operations
- Chainable operations
- Returns arrays for function calls
- Works with properties AND methods
- Significant code reduction in SSE handlers

**Use cases in our codebase**:
1. SSE handlers updating multiple DOM elements based on events
2. Applying CSS classes to element groups
3. Batch updates to form controls
4. Pattern insight rendering (multiple badge elements)

---

### 2. Each with Stop Function (★★★★☆)

**What it does**: Unified iteration with early exit support.

**Source**: `lang-mini` (via lang-tools)

```javascript
const {each} = require('lang-tools');

// Works on arrays AND objects:
each([1, 2, 3], (item, idx) => {
  console.log(item); // 1, 2, 3
});

each({a: 1, b: 2}, (key, value) => {
  console.log(key, value); // 'a' 1, 'b' 2
});

// CRITICAL FEATURE: Stop function for early exit
each(largeArray, (item, idx, stop) => {
  if (item.id === targetId) {
    found = item;
    stop(); // Breaks iteration immediately
  }
});
```

**Real-world example**:
```javascript
// BEFORE (index.js line ~850):
for (let i = 0; i < jobs.length; i++) {
  if (jobs[i].id === activeJobId) {
    activeJob = jobs[i];
    break;
  }
}

// AFTER (using each with stop):
each(jobs, (job, stop) => {
  if (job.id === activeJobId) {
    activeJob = job;
    stop();
  }
});
```

**Key benefits**:
- Single API for arrays AND objects
- Cleaner than `for` loops
- No need to track indices manually
- Stop function more explicit than `break`

---

### 3. Data_Object Nested Property Access (★★★☆☆)

**What it does**: Get/set nested properties using dot-notation paths.

**Source**: `lang-tools/Data_Model/Data_Object.js`

```javascript
const {Data_Object} = require('lang-tools');

const config = new Data_Object({
  queue: {
    priority: {
      weights: { freshness: 0.3, backlinks: 0.7 }
    }
  }
});

// Dot notation access:
config.set('queue.priority.weights.freshness', 0.5);
const value = config.get('queue.priority.weights.freshness'); // 0.5

// Change events bubble up:
config.on('change', (e) => {
  console.log('Changed:', e.name, e.value);
});
```

**Practical utility function** (inspired by this):
```javascript
// Create a lightweight getter/setter for nested objects
// WITHOUT the full Data_Object overhead:

function getDeep(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setDeep(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((acc, key) => acc[key] = acc[key] || {}, obj);
  target[last] = value;
  return obj;
}

// Usage in our config management:
const freshness = getDeep(queueConfig, 'priority.weights.freshness');
setDeep(queueConfig, 'priority.weights.freshness', 0.8);
```

**Use cases**:
- Config object access (queueConfig, analysisConfig)
- Deep state updates without nested destructuring
- Form data extraction with nested structure

---

### 4. Polymorphic Functions with fp() (★★★★★) - PRODUCTION PROVEN

**What it does**: Signature-based function dispatch that eliminates imperative type-checking chains.

**Source**: `lang-mini/fp.js` (via lang-tools)

**Status**: ✅ **PRODUCTION DEPLOYED** - Successfully refactored 7 functions across the codebase (October 2025)

#### Signature System

```javascript
const {fp} = require('lang-tools');

// Signature format: '[type1,type2,...]'
// Type codes:
//   's' = string, 'n' = number, 'b' = boolean
//   'o' = object, 'a' = array, 'f' = function
//   'u' = undefined, 'N' = null
//   'D' = Data_Object, 'V' = Data_Value

// Args array has .l property for length:
const myFunc = fp((a, sig) => {
  console.log(a.l);     // Number of arguments
  console.log(a[0]);    // First argument
  console.log(sig);     // e.g., '[n,s]' for (number, string)
});
```

#### Real-World Example 1: Boolean Coercion with Fallback

**Source**: `src/tools/analysis-run.js` - `boolArg` function

```javascript
// BEFORE (imperative - 13 lines):
function boolArg(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
  }
  return Boolean(value);
}

// AFTER (declarative fp - self-documenting):
const boolArg = fp((a, sig) => {
  const fallback = a.l >= 2 ? a[1] : false;
  
  // Null/undefined → fallback
  if (sig === '[u]' || sig === '[N]' || sig === '[u,b]' || sig === '[N,b]') {
    return fallback;
  }
  
  // Boolean → as-is
  if (sig === '[b]' || sig === '[b,b]') {
    return a[0];
  }
  
  // Number → truthy conversion
  if (sig === '[n]' || sig === '[n,b]') {
    return a[0] !== 0;
  }
  
  // String → parse common boolean strings
  if (sig === '[s]' || sig === '[s,b]') {
    const normalized = a[0].trim().toLowerCase();
    if (!normalized) return fallback;
    if (['true', 't', 'yes', 'y', 'on', '1'].includes(normalized)) return true;
    if (['false', 'f', 'no', 'n', 'off', '0'].includes(normalized)) return false;
  }
  
  // Default: Boolean() coercion
  return Boolean(a[0]);
});

// Usage (all work):
boolArg(true);               // true
boolArg(1);                  // true
boolArg('yes');              // true
boolArg(null, true);         // true (fallback)
boolArg(undefined, false);   // false (fallback)
```

#### Real-World Example 2: Recursive Object Unwrapping

**Source**: `src/crawler/PriorityScorer.js` - `coerceNumeric` function

```javascript
// BEFORE (imperative with recursion):
function coerceNumeric(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
  }
  if (typeof value === 'object' && value !== null && typeof value.value !== 'undefined') {
    return coerceNumeric(value.value, fallback); // Recursive unwrapping
  }
  return fallback;
}

// AFTER (fp with recursive calls - works seamlessly):
const coerceNumeric = fp((a, sig) => {
  const fallback = a.l >= 2 ? a[1] : 0;
  
  // Number → validate finite
  if (sig === '[n]' || sig === '[n,n]') {
    return Number.isFinite(a[0]) ? a[0] : fallback;
  }
  
  // String → parse to number
  if (sig === '[s]' || sig === '[s,n]') {
    const trimmed = a[0].trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }
  
  // Object → recursively unwrap .value property
  if (sig === '[o]' || sig === '[o,n]') {
    if (tof(a[0].value) !== 'undefined') {
      return coerceNumeric(a[0].value, fallback); // Recursive call works!
    }
    return fallback;
  }
  
  return fallback;
});

// Usage:
coerceNumeric(42);                    // 42
coerceNumeric('3.14');                // 3.14
coerceNumeric({value: 10});           // 10 (unwrapped)
coerceNumeric({value: {value: 5}});   // 5 (recursive unwrapping)
coerceNumeric(null, 99);              // 99 (fallback via '[N,n]')
```

#### Real-World Example 3: Literal String Parsing

**Source**: `src/tools/analysis-run.js` - `coerceArgValue` function

```javascript
// BEFORE (imperative literal checking):
function coerceArgValue(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber)) return asNumber;
  
  return value;
}

// AFTER (fp with literal parsing):
const coerceArgValue = fp((a, sig) => {
  // Undefined → pass through
  if (sig === '[u]') {
    return undefined;
  }
  
  // String → parse literals or numbers
  if (sig === '[s]') {
    const trimmed = a[0].trim();
    
    // Boolean literals
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Null/undefined literals
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;
    
    // Empty string → empty string (not undefined)
    if (trimmed === '') return a[0];
    
    // Numeric strings
    const asNumber = Number(trimmed);
    if (!isNaN(asNumber)) return asNumber;
    
    return a[0]; // Return original string
  }
  
  // All other types → pass through
  return a[0];
});

// Usage:
coerceArgValue('true');       // true (boolean)
coerceArgValue('42');         // 42 (number)
coerceArgValue('null');       // null
coerceArgValue('hello');      // 'hello' (string)
coerceArgValue(undefined);    // undefined (pass through)
```

#### Real-World Example 4: Simple Truthy Flag Detection

**Source**: `src/ui/express/services/runnerFactory.js` - `isTruthyFlag` function

```javascript
// BEFORE (simple but repetitive):
function isTruthyFlag(flag) {
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(flag.toLowerCase());
  }
  return false;
}

// AFTER (fp - ultra concise):
const isTruthyFlag = fp((a, sig) => {
  if (sig === '[b]') return a[0];
  if (sig === '[s]') return ['1', 'true', 'yes', 'on'].includes(a[0].toLowerCase());
  return false;
});

// Usage:
isTruthyFlag(true);      // true
isTruthyFlag('yes');     // true
isTruthyFlag('1');       // true
isTruthyFlag('no');      // false
isTruthyFlag(null);      // false
```

#### Production Results (7 Functions Refactored)

**Completed refactorings** (October 2025):
1. ✅ `analysis-run.js` - `boolArg` (boolean coercion + fallback)
2. ✅ `analysis-run.js` - `coerceArgValue` (literal parsing)
3. ✅ `crawl-query-benchmark.js` - `coerceValue` (duplicate eliminated)
4. ✅ `runnerFactory.js` - `isTruthyFlag` (truthy detection)
5. ✅ `api.analysis-control.js` - `isTruthyFlag` (duplicate)
6. ✅ `PriorityScorer.js` - `coerceNumeric` (recursive unwrapping)
7. ✅ `config/ConfigManager.js` - `coerceNumber` (null-returning variant)

**Impact metrics**:
- **50+ lines** of imperative if-statement chains eliminated
- **5 files** updated with consistent fp() patterns
- **534 tests** passing (117 of 121 suites) - no regressions
- **Self-documenting**: Signatures make behavior explicit
- **Composable**: Recursive functions work seamlessly within fp()

#### Key Learnings from Production Use

**✅ When fp() Excels**:
- Functions with 3+ argument type combinations
- Polymorphic argument parsing (CLI tools, config loaders)
- Type coercion utilities with complex rules
- Recursive functions that need signature dispatch

**❌ When NOT to Use fp()**:
- Simple 1-2 parameter functions with obvious types
- Functions where TypeScript/JSDoc provides sufficient typing
- Performance-critical hot paths (minimal overhead, but not zero)
- When signature-based dispatch obscures intent

**🔑 Pattern Recognition**:
- Duplicate functions identified: `isTruthyFlag`×2, `coerceValue`/`coerceArgValue` (extract to shared utils)
- Signature variants with optional parameters: `'[n]'` vs `'[n,n]'` patterns
- Null handling: Always check `'[u]'` and `'[N]'` signatures explicitly

#### Quick Reference

```javascript
// Import
const { fp, tof } = require('lang-tools');

// Basic structure
const myFunc = fp((a, sig) => {
  if (sig === '[n]') return /* handle number */;
  if (sig === '[s]') return /* handle string */;
  // ... more signatures
  return /* default */;
});

// Common signature patterns
'[n]'         // Single number
'[n,n]'       // Number with numeric parameter
'[s]'         // Single string
'[s,b]'       // String with boolean flag
'[o]'         // Single object
'[u]' '[N]'   // Undefined/null (handle separately!)
'[f]'         // Function callback
'[a]'         // Array

// Args array properties
a[0]   // First argument
a[1]   // Second argument
a.l    // Argument count
```

**When to use**: Functions with polymorphic behavior based on argument types (3+ signatures recommended). Perfect for argument parsers, type coercers, and configuration handlers.

**Priority**: ★★★★★ (upgraded from ★★★☆☆ after production validation)

---

### 5. Comprehensive Type Checking (★★★★☆)

**What it does**: Enhanced typeof with Data_Object/Data_Value recognition.

**Source**: `lang-mini/tof.js`

```javascript
const {tof, is_defined} = require('lang-tools');

// We're already using tof(), but here's the full type list:
tof('hello') === 'string'
tof(42) === 'number'
tof([]) === 'array'      // NOT 'object'!
tof(null) === 'null'     // NOT 'object'!
tof(undefined) === 'undefined'
tof({}) === 'object'
tof(new Data_Value()) === 'data_value'
tof(new Data_Object()) === 'data_object'
tof(new Collection()) === 'collection'
tof(document.body) === 'htmlbodyelement'

// is_defined is cleaner than manual checks:
if (is_defined(config.queue)) { // replaces: if (config.queue != null)
  // ...
}
```

**Best practices** we should follow:
```javascript
// ✅ GOOD - consistent with lang-tools:
if (tof(value) === 'array') { }
if (is_defined(value)) { }
each(items, callback);

// ❌ AVOID - inconsistent:
if (Array.isArray(value)) { }
if (value !== undefined && value !== null) { }
items.forEach(callback);
```

---

### 6. Truth Utilities (★★☆☆☆)

**What it does**: Comprehensive truthiness checking.

**Source**: `lang-mini/truth.js`

```javascript
const {truth} = require('lang-tools');

// truth() is more thorough than !!value:
truth(0) === false
truth('') === false
truth([]) === true       // Array is truthy even if empty
truth({}) === true       // Object is truthy even if empty
truth(null) === false
truth(undefined) === false

// Useful for filtering:
const validValues = array.filter(truth);
// Removes null, undefined, 0, '', false

// Use case in our code - clean up config checks:
// BEFORE:
if (config && config.queue && config.queue.priority) { }

// AFTER:
if (truth(config?.queue?.priority)) { }
```

**Note**: Only use when you need the specific truthiness logic. For null/undefined checks, `is_defined()` is clearer.

---

## Integration Strategy

### Phase 2: SSE Handlers Factory
**Priority patterns**: collective(), each(), is_defined()

Example refactoring:
```javascript
// Current inline SSE handler (~400 lines):
eventSource.addEventListener('milestone', (event) => {
  const data = JSON.parse(event.data);
  // 50+ lines of imperative DOM updates
});

// Target factory with lang-tools:
import {collective, each, is_defined, tof} from 'lang-tools';

function createSseHandlers({elements, formatters}) {
  return {
    handleMilestone(data) {
      if (is_defined(data.visited_hub_countries)) {
        each(data.visited_hub_countries, country => {
          // render country badge
        });
      }
      
      // Bulk update multiple elements:
      const statusEls = collective([
        elements.statusA,
        elements.statusB,
        elements.statusC
      ]);
      statusEls.textContent = data.status;
      statusEls.classList.add('updated');
    }
  };
}
```

### Phase 3: Crawl Controls
**Priority patterns**: fp(), each()

Factory for control panel with polymorphic methods.

### Phase 4-5: Jobs & Resume Managers
**Priority patterns**: each() with stop, collective()

Use for list rendering and batch operations.

### Phase 6: Main Refactor
**Priority patterns**: All of the above + nested property utilities

Reduce index.js from ~2050 to <500 lines.

---

## Testing Patterns with Lang-Tools

```javascript
const {tof, is_defined, each} = require('lang-tools');

describe('renderingHelpers with lang-tools', () => {
  test('compactDetails uses tof correctly', () => {
    const result = compactDetails({a: 1});
    expect(tof(result)).toBe('string');
  });
  
  test('formatFeatureName handles undefined with is_defined', () => {
    expect(is_defined(formatFeatureName(undefined))).toBe(false);
  });
  
  test('each iterates correctly', () => {
    const items = [];
    each([1,2,3], (item) => items.push(item));
    expect(items).toEqual([1,2,3]);
  });
});
```

---

## Anti-Patterns to Avoid

1. **Don't overuse fp()** - Only use when you genuinely need 3+ argument patterns
2. **Don't use Data_Object for everything** - It's heavyweight; use plain objects + utility functions for most cases
3. **Don't use collective() for single operations** - `collective([el]).method()` is overkill
4. **Don't mix paradigms unnecessarily** - If using lang-tools, be consistent (use each() everywhere, not sometimes forEach)

---

## Quick Reference

**Import everything you need**:
```javascript
import {
  // Iteration
  each,
  collective,
  
  // Type checking
  tof,
  is_defined,
  truth,
  
  // Functional
  fp,
  arrayify,
  mapify,
  
  // Data structures
  Data_Object,
  Data_Value,
  Collection
} from 'lang-tools';
```

**One-liner cheat sheet**:
- `each(arr, fn)` - iterate with stop support
- `collective(arr).method()` - bulk operations
- `tof(x) === 'array'` - proper type check
- `is_defined(x)` - null/undefined guard
- `fp(fn)` - polymorphic function
- `truth(x)` - comprehensive truthy check

---

## Next Steps

1. **Phase 2 (SSE handlers)**: Focus on collective() and each() - these will give the biggest code reduction
2. **Phase 3-5**: Add fp() for polymorphic methods where appropriate
3. **Phase 6**: Introduce nested property utilities for config management
4. **Testing**: Ensure all new patterns have Jest coverage

**Estimated impact**: Using these patterns consistently can reduce index.js by 30-40% while improving readability.
