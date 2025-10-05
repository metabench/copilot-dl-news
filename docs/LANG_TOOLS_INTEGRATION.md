# Lang-Tools Integration Guide

_Last updated: 2025-10-05_

This document describes how lang-tools is integrated into the copilot-dl-news codebase and when to use its patterns.

## Overview

[lang-tools](https://github.com/metabench/lang-tools) provides utility functions, reactive data models, and functional programming patterns used by jsgui3. We integrate it to:

1. **Improve code readability** with compact utility functions
2. **Enable reactive patterns** with Data_Value and Data_Object
3. **Support functional programming** with polymorphic utilities
4. **Align with jsgui3 patterns** for future Control-based architecture

## Core Utilities

### Type Checking: `tof()`

**Use instead of `typeof`** for more comprehensive type detection.

```javascript
const { tof } = require('lang-tools');

// Instead of:
if (typeof x === 'string') { }
if (typeof x === 'object' && x !== null && Array.isArray(x)) { }

// Use:
if (tof(x) === 'string') { }
if (tof(x) === 'array') { }
```

**Supported types:** `'string'`, `'number'`, `'boolean'`, `'array'`, `'object'`, `'function'`, `'undefined'`, `'null'`, `'data_object'`, `'data_value'`, `'collection'`, `'control'`

### Iteration: `each()`

**Use instead of `forEach`** for cleaner syntax and consistent behavior.

```javascript
const { each } = require('lang-tools');

// Instead of:
arr.forEach((item, idx) => { });
Object.keys(obj).forEach(key => { const value = obj[key]; });

// Use:
each(arr, (item, idx) => { });
each(obj, (value, key) => { });
```

**Benefits:**
- Works on arrays and objects with same API
- Callback signature: `(value, index/key)` (consistent order)
- Cleaner, more readable code

### Defined Check: `is_defined()`

**Use instead of null/undefined checks** for clarity.

```javascript
const { is_defined } = require('lang-tools');

// Instead of:
if (x !== undefined && x !== null) { }
if (typeof x !== 'undefined' && x != null) { }

// Use:
if (is_defined(x)) { }
```

**Returns:** `true` if value is neither `undefined` nor `null`

### String Conversion: `stringify()`

**Use instead of `JSON.stringify`** for enhanced debugging.

```javascript
const { stringify } = require('lang-tools');

// Handles circular references, functions, and complex objects
console.log(stringify(complexObject));
```

## Functional Programming Utilities

### Functional Polymorphism: `fp()`

Create functions that behave differently based on argument signatures.

```javascript
const { fp, get_a_sig } = require('lang-tools');

const myFunc = fp(function(a, sig) {
  if (sig === '[s]') {
    // Single string argument
    return processString(a[0]);
  }
  if (sig === '[n,n]') {
    // Two number arguments
    return a[0] + a[1];
  }
  if (sig === '[o]') {
    // Single object argument
    return processObject(a[0]);
  }
});

myFunc('hello');      // Calls processString
myFunc(5, 10);        // Returns 15
myFunc({ key: 'val' }); // Calls processObject
```

**Signature format:** `[type,type,...]` where types are:
- `s` = string
- `n` = number
- `b` = boolean
- `a` = array
- `o` = object
- `f` = function

### Array/Object Mapping: `arrayify()` and `mapify()`

Make functions work on arrays or objects automatically.

```javascript
const { arrayify, mapify } = require('lang-tools');

const double = arrayify((x) => x * 2);
double(5);           // 10
double([1, 2, 3]);   // [2, 4, 6]

const upperCase = mapify((x) => x.toUpperCase());
upperCase('hello');  // 'HELLO'
upperCase({ a: 'foo', b: 'bar' }); // { a: 'FOO', b: 'BAR' }
```

## Reactive Data Models

### Data_Value: Reactive Single Values

Use for values that need change tracking and event emission.

```javascript
const { Data_Value } = require('lang-tools');

const counter = new Data_Value({ value: 0 });

// Listen to changes
counter.on('change', (event) => {
  console.log('Changed to:', event.value);
});

// Get/set values
console.log(counter.value); // 0
counter.value = 5;           // Emits 'change' event
```

**Use cases:**
- Crawl metrics (visited count, queue size)
- UI state (current tab, theme)
- Configuration flags

### Data_Object: Reactive Objects

Use for structured data with nested properties and change tracking.

```javascript
const { Data_Object } = require('lang-tools');

const state = new Data_Object({});

// Set properties
state.set('crawlType', 'intelligent');
state.set('metrics.visited', 1000);

// Get properties
console.log(state.get('crawlType')); // 'intelligent'
console.log(state.get('metrics.visited')); // 1000

// Listen to changes
state.on('change', (event) => {
  console.log('Property changed:', event.name, '=', event.value);
});
```

**Use cases:**
- Complex application state
- Nested configuration objects
- Model objects with validation

### Collection: Reactive Arrays

Use for arrays with indexing and change tracking.

```javascript
const { Collection } = require('lang-tools');

const jobs = new Collection();

// Listen to changes
jobs.on('add', (event) => {
  console.log('Item added:', event.item);
});

// Add items
jobs.push({ id: 1, status: 'running' });
jobs.push({ id: 2, status: 'queued' });

// Iterate
jobs.each((job, idx) => {
  console.log(`Job ${idx}:`, job);
});

// Find items
const found = jobs.find({ status: 'running' });
```

**Use cases:**
- Job lists
- Milestone tracking
- Dynamic UI lists

## When to Use Lang-Tools

### ✅ Use Lang-Tools When:

1. **Type checking** - `tof()` is clearer than `typeof`
2. **Iteration** - `each()` works on arrays and objects consistently
3. **Defined checks** - `is_defined()` is more explicit than manual checks
4. **Reactive state** - Data_Value/Data_Object provide built-in change tracking
5. **Polymorphic functions** - `fp()` enables cleaner signature-based dispatch
6. **Debugging** - `stringify()` handles complex objects better than JSON.stringify

### ❌ Don't Use Lang-Tools When:

1. **Simple one-off operations** - Native JavaScript is fine for trivial cases
2. **Performance-critical loops** - Native `for` loops may be faster
3. **Existing patterns work** - Don't refactor working code just to use lang-tools
4. **Team unfamiliarity** - Introduce gradually with documentation
5. **External API constraints** - Stick to native types at boundaries

## Integration Examples

### Example 1: Rendering Helper with lang-tools

```javascript
const { tof, each, is_defined } = require('lang-tools');

function renderList(items) {
  if (!is_defined(items) || tof(items) !== 'array') {
    return '<p class="empty">No items</p>';
  }
  
  const rows = [];
  each(items, (item, idx) => {
    rows.push(`<li data-index="${idx}">${item.name}</li>`);
  });
  
  return `<ul>${rows.join('')}</ul>`;
}
```

### Example 2: Factory with Reactive State

```javascript
const { Data_Value } = require('lang-tools');

function createJobsManager({ elements, apis }) {
  const state = new Data_Value({ value: { jobs: [], loading: false } });
  
  // React to state changes
  state.on('change', (e) => {
    renderJobs(e.value.jobs);
  });
  
  function fetchJobs() {
    state.value = { ...state.value, loading: true };
    apis.fetch('/api/crawls')
      .then(data => {
        state.value = { jobs: data, loading: false };
      });
  }
  
  return { fetchJobs, state };
}
```

### Example 3: Polymorphic Helper

```javascript
const { fp } = require('lang-tools');

const format = fp(function(a, sig) {
  if (sig === '[n]') {
    // Format number
    return a[0].toLocaleString();
  }
  if (sig === '[s]') {
    // Format string
    return a[0].trim();
  }
  if (sig === '[a]') {
    // Format array
    return a[0].map(format).join(', ');
  }
});
```

## Migration Strategy

1. **Phase 1: Utilities** - Start with `tof()`, `each()`, `is_defined()` in new modules
2. **Phase 2: Rendering** - Use utilities in extracted rendering helpers
3. **Phase 3: Factories** - Apply patterns in factory functions
4. **Phase 4: Reactive** - Introduce Data_Value/Data_Object for state management
5. **Phase 5: Incremental** - Update existing code gradually as it's modified

## Testing with Lang-Tools

```javascript
const { Data_Value, tof, each } = require('lang-tools');

describe('renderingHelpers with lang-tools', () => {
  test('formatList uses tof for type checking', () => {
    expect(tof([])).toBe('array');
    expect(tof({})).toBe('object');
  });
  
  test('Data_Value emits change events', () => {
    const counter = new Data_Value({ value: 0 });
    const callback = jest.fn();
    
    counter.on('change', callback);
    counter.value = 5;
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ value: 5 })
    );
  });
});
```

## References

- **Lang-tools repo**: https://github.com/metabench/lang-tools
- **Lang-mini (base utilities)**: https://github.com/metabench/lang-mini
- **Jsgui3-html (Control patterns)**: https://github.com/metabench/jsgui3-html
- **Client modularization plan**: `docs/CLIENT_MODULARIZATION_PLAN.md`

## Support

For questions about lang-tools patterns, reference the examples in:
- `src/ui/public/index/renderingHelpers.js` (utilities usage)
- Factory modules under `src/ui/public/index/` (reactive patterns)
- Test files showing usage examples
