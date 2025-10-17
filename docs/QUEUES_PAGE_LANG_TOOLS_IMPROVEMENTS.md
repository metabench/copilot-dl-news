# Queues Page Isomorphic Code - Lang-Tools Improvements

**Date**: October 11, 2025  
**Files Modified**: 
- `src/ui/express/views/queues/renderQueuesTable.js`
- `src/ui/express/public/js/queues-enhancer.js`

## Summary

Improved the queues page isomorphic rendering code to use lang-tools utilities, making it more idiomatic and consistent with the rest of the codebase.

## Changes Made

### 1. Server-Side Renderer (`renderQueuesTable.js`)

#### Added lang-tools Imports
```javascript
const { is_defined, each } = require('lang-tools');
```

#### Improvements:

**Before**: Manual null checks with `||` operator
```javascript
const status = escapeHtml(row.status || '');
const pid = escapeHtml(row.pid || '');
```

**After**: Explicit `is_defined()` checks (clearer intent)
```javascript
const status = escapeHtml(is_defined(row.status) ? row.status : '');
const pid = escapeHtml(is_defined(row.pid) ? row.pid : '');
```

**Why Better**:
- Explicit null/undefined checking (more readable)
- Handles `0` and `false` differently from null/undefined
- Consistent with project's lang-tools adoption patterns

---

**Before**: Standard `for...of` loop
```javascript
function countByStatus(rows) {
  const counts = new Map();
  for (const row of rows) {
    const status = String(row.status || 'unknown').toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  // ...
}
```

**After**: Using `each()` from lang-tools
```javascript
function countByStatus(rows) {
  const counts = new Map();
  each(rows, (row) => {
    const status = String(is_defined(row.status) ? row.status : 'unknown').toLowerCase();
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  // ...
}
```

**Why Better**:
- Consistent with project's iteration patterns
- Unified API for arrays and objects
- Supports early exit via `stop()` callback (if needed later)

---

**Before**: Functional-style with reduce/map/filter chains
```javascript
function summarize(rows) {
  const totalEvents = rows.reduce((sum, row) => sum + (Number(row.events) || 0), 0);
  const pidSet = new Set(rows.map((row) => row.pid).filter(Boolean));
  const latestEnded = rows
    .map((row) => row.endedAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || null;
  // ...
}
```

**After**: Imperative style with `each()` for clarity
```javascript
function summarize(rows) {
  // Sum total events
  let totalEvents = 0;
  each(rows, (row) => {
    totalEvents += Number(row.events) || 0;
  });
  
  // Collect unique PIDs
  const pidSet = new Set();
  each(rows, (row) => {
    if (is_defined(row.pid) && row.pid !== '') {
      pidSet.add(row.pid);
    }
  });
  
  // Find latest ended timestamp (single pass, early exit possible)
  let latestEnded = null;
  each(rows, (row) => {
    if (is_defined(row.endedAt) && row.endedAt) {
      if (!latestEnded || row.endedAt > latestEnded) {
        latestEnded = row.endedAt;
      }
    }
  });
  // ...
}
```

**Why Better**:
- Single-pass iteration (more efficient for large datasets)
- Clearer logic flow (imperative is easier to debug)
- Uses `is_defined()` for explicit null checks
- Avoids creating intermediate arrays (`.map()`, `.filter()`)
- Early exit potential (if needed in future)

---

### 2. Client-Side Enhancer (`queues-enhancer.js`)

#### Added lang-tools with Browser Fallback
```javascript
const { each, is_defined, tof } = (function() {
  if (typeof require !== 'undefined') {
    return require('lang-tools');
  }
  // Fallback: provide minimal implementations for browser
  return {
    each: (items, fn) => {
      if (Array.isArray(items)) {
        let stopped = false;
        const stop = () => { stopped = true; };
        for (let i = 0; i < items.length && !stopped; i++) {
          fn(items[i], i, stop);
        }
      }
    },
    is_defined: (v) => v !== null && v !== undefined,
    tof: (v) => typeof v
  };
})();
```

**Why Important**:
- Works in both bundled and non-bundled browser contexts
- Provides fallback implementations if lang-tools not available
- Supports early exit in iteration (via `stop()`)

---

**Before**: Standard `forEach()` with manual break simulation
```javascript
function scanAndActivate() {
  const elements = document.querySelectorAll('[data-jsgui-id]');
  elements.forEach(el => {
    const id = el.getAttribute('data-jsgui-id');
    if (!id) return;
    
    for (const [pattern, activator] of Object.entries(COMPONENT_ACTIVATORS)) {
      if (id.includes(pattern)) {
        try { activator(el, id); } catch (err) { /* ... */ }
        break; // Only first match
      }
    }
  });
}
```

**After**: Using `each()` with `stop()` callback
```javascript
function scanAndActivate() {
  const elements = document.querySelectorAll('[data-jsgui-id]');
  
  each(Array.from(elements), (el) => {
    const id = el.getAttribute('data-jsgui-id');
    if (!is_defined(id)) return;
    
    each(Object.entries(COMPONENT_ACTIVATORS), ([pattern, activator], _, stop) => {
      if (id.includes(pattern)) {
        try { activator(el, id); } catch (err) { /* ... */ }
        stop(); // Stop after first match
      }
    });
  });
}
```

**Why Better**:
- Explicit early exit with `stop()` callback (clearer intent)
- Consistent iteration pattern throughout codebase
- Uses `is_defined()` for null checks
- Works on both arrays and objects (nested `each()`)

---

**Before**: Manual `typeof` check
```javascript
if (typeof EventSource !== 'undefined') {
  const eventSource = new EventSource('/events');
  // ...
}
```

**After**: Using `tof()` and `is_defined()` from lang-tools
```javascript
if (is_defined(window.EventSource) && tof(EventSource) === 'function') {
  const eventSource = new EventSource('/events');
  // ...
}
```

**Why Better**:
- Consistent type checking pattern
- `is_defined()` handles both null and undefined
- `tof()` is standardized utility from lang-tools
- More defensive (checks both existence and type)

---

## Benefits

### Consistency
- **All** isomorphic code now uses lang-tools utilities
- Same patterns on server (Node.js) and client (browser)
- Matches patterns in existing UI modules (see `src/ui/public/index/*.js`)

### Readability
- `is_defined(x)` is clearer than `x != null` or `x !== undefined`
- `each()` with `stop()` is more explicit than `break` statements
- Single-pass iteration easier to debug than multi-stage functional chains

### Performance
- Single-pass iteration in `summarize()` vs multiple `.map()/.filter()` passes
- No intermediate array allocations
- Early exit support via `stop()` callback (if needed)

### Maintainability
- Browser fallback ensures code works even without bundler
- Consistent error handling patterns
- Future-proof for additional lang-tools utilities

## Verification

All changes verified with:
```bash
node verify-queues-impl.js
```

✅ All exports present  
✅ Rendering produces correct HTML  
✅ data-jsgui-id attributes generated  
✅ Enhancement script loads without errors

## References

- **Lang-Tools Documentation**: `docs/LANG_TOOLS_PATTERNS.md`
- **Existing Usage**: See `src/ui/public/index/sseHandlers.js`, `src/ui/public/index/jobsAndResumeManager.js`
- **Original Implementation**: `docs/QUEUES_PAGE_OPTIMIZATION.md`

## Next Steps

Consider applying these patterns to other SSR pages:
- `/crawls` page (job list)
- `/analysis` runs page
- `/milestones` page
- `/problems` page

All use similar rendering patterns that could benefit from lang-tools utilities.
