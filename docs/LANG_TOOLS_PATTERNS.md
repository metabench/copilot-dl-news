# Lang-Tools Patterns for index.js Refactoring

_Last updated: 2025-01-05_

This document captures interesting and immediately useful patterns from the lang-tools library that can be applied to our client-side refactoring.

**⚠️ IMPORTANT**: This document refers to `collective()` (the **function**), not `Collection` (the **class**):
- ✅ `collective(array)` or `collect(array)` - Proxy utility for bulk operations (what this doc covers)
- ❌ `new Collection()` - Reactive array-like data structure with events/indexing (different thing entirely)

Both are exported from lang-tools, but serve different purposes. We're using `collective()` for concise DOM/data manipulation.

## Most Impactful Patterns

**After unit testing, revised priority order:**

1. **each() with stop function** (★★★★★) - Most versatile, works for all iteration needs
2. **is_defined()** (★★★★☆) - Cleaner null/undefined checks throughout
3. **tof()** (★★★★☆) - Better type checking than typeof
4. **collective()** (★★★☆☆) - Useful for extracting values, but limited scope
5. **fp()** (★★★☆☆) - Good for polymorphic functions with 3+ signatures
6. **truth()** (★★☆☆☆) - Niche filtering use cases

**Key insight from testing**: `collective()` is NOT a magic bullet for eliminating loops. It's useful for specific extraction patterns but `each()` remains the workhorse for most DOM manipulation.

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

### 4. Polymorphic Functions with fp() (★★★☆☆)

**What it does**: Signature-based function dispatch (multiple argument patterns).

**Source**: `lang-mini/fp.js` (via lang-tools)

```javascript
const {fp, get_a_sig} = require('lang-tools');

const render = fp(function(a, sig) {
  // sig format: '[type]' where type is s=string, n=number, o=object, a=array, f=function
  
  if (sig === '[s]') {
    // render(selector) - find and render single element
    return document.querySelector(a[0]);
  } else if (sig === '[a]') {
    // render(elements) - render multiple elements
    return a[0].map(el => /* render */);
  } else if (sig === '[s,o]') {
    // render(selector, data) - find element and render with data
    const el = document.querySelector(a[0]);
    return populateElement(el, a[1]);
  } else if (sig === '[a,o]') {
    // render(elements, data) - render multiple with shared data
    return a[0].map(el => populateElement(el, a[1]));
  }
});

// All of these work:
render('#status');
render([el1, el2, el3]);
render('#status', {text: 'Ready'});
render(nodeList, {className: 'active'});
```

**Signature codes**:
- `s` = string
- `n` = number
- `o` = object
- `a` = array
- `f` = function
- `D` = Data_Object
- `V` = Data_Value

**Practical example** for our rendering helpers:
```javascript
import {fp, get_a_sig, tof} from 'lang-tools';

// Make renderFeatureFlags accept multiple calling patterns:
const renderFeatureFlags = fp(function(a, sig) {
  if (sig === '[o]') {
    // renderFeatureFlags(features) - use default container
    return renderToContainer(a[0], featureFlagsList);
  } else if (sig === '[o,e]') { // e = DOM element (custom check)
    // renderFeatureFlags(features, customContainer)
    return renderToContainer(a[0], a[1]);
  } else if (sig === '[o,s]') {
    // renderFeatureFlags(features, '#custom-selector')
    const container = document.querySelector(a[1]);
    return renderToContainer(a[0], container);
  }
});
```

**Key benefits**:
- Cleaner than multiple named functions
- TypeScript-style overloading in JavaScript
- Self-documenting via signatures
- No manual argument checking

**When to use**: When a function legitimately needs 3+ argument patterns. DON'T overuse for simple functions.

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
