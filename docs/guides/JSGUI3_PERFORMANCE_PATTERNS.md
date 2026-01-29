# jsgui3 Performance Patterns

_Last Verified: 2026-01-17_

**Authority Level**: This is the **definitive reference** for jsgui3 performance optimization. When working on performance-related tasks, this file takes precedence over general guidance.

**When to Read**: 
- Before optimizing ANY jsgui3 code
- When render times exceed 500ms
- When HTML output exceeds 500KB
- When control count exceeds 100

---

## 🔴 CRITICAL: The jsgui3 Performance Equation

**Control count is THE dominant performance factor.**

Every jsgui3 Control creates:
- A JavaScript object with prototype chain
- A `dom` descriptor object
- Attribute storage
- Internal state (`__ctrl_chain`, `_id`, etc.)
- String concatenation during `all_html_render()`

**The compounding problem:**
```
850 files × ~10 controls each = 8,500 control objects
  → 883ms control tree build time
  → 1.5MB HTML output
  → Slow initial paint
```

---

## Pattern 1: Lazy Rendering (Validated 2025-12-19)

**Only instantiate controls for visible/expanded content.**

```javascript
// ❌ ANTI-PATTERN: Render everything upfront
compose() {
  this.items.forEach(item => {
    const ctrl = new ItemControl({ context: this.context, item });
    this.add(ctrl);  // 850 items = 850+ controls!
  });
}

// ✅ PATTERN: Lazy render with placeholders
compose() {
  this.items.forEach(item => {
    if (this._shouldRenderNow(item)) {
      const ctrl = new ItemControl({ context: this.context, item });
      this.add(ctrl);
    } else {
      // Placeholder with data attribute for lazy loading
      const placeholder = new jsgui.Control({ context: this.context, tagName: 'div' });
      placeholder.dom.attributes['data-lazy-id'] = item.id;
      placeholder.dom.attributes['data-lazy-children'] = 'true';
      this.add(placeholder);
    }
  });
}
```

**Server + Client implementation:**

```javascript
// Server: Render only what's needed initially
// src/ui/server/myServer.js
app.get('/api/lazy/:id', (req, res) => {
  const node = findNodeById(req.params.id);
  const ctrl = new ItemControl({ context, item: node });
  res.send(ctrl.all_html_render());
});

// Client: Load on demand
// public/app.js
async function loadLazyContent(placeholder) {
  placeholder.innerHTML = '<div class="loading">Loading...</div>';
  const html = await fetch(`/api/lazy/${placeholder.dataset.lazyId}`).then(r => r.text());
  placeholder.outerHTML = html;
}
```

**Measured Results (Docs Viewer, 850 files):**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total render | 1256ms | 565ms | **55% faster** |
| HTML size | 1489KB | 382KB | **74% smaller** |
| Control tree | 883ms | 286ms | **68% faster** |
| Controls created | ~8500 | ~100 | **99% fewer** |

---

## Pattern 2: Performance Diagnostics

**Before optimizing, MEASURE. Create a diagnostic script:**

```javascript
// tmp/perf-diagnostic.js
const { performance } = require('perf_hooks');

async function diagnose() {
  const start = performance.now();
  
  // 1. Measure control tree building
  const treeStart = performance.now();
  const page = buildPage(testData);
  const treeBuild = performance.now() - treeStart;
  
  // 2. Measure HTML rendering
  const renderStart = performance.now();
  const html = page.all_html_render();
  const renderTime = performance.now() - renderStart;
  
  // 3. Count controls (walk __ctrl_chain)
  const controlCount = countControls(page);
  
  console.log('=== PERFORMANCE DIAGNOSTIC ===');
  console.log(`Control tree build: ${treeBuild.toFixed(0)}ms`);
  console.log(`HTML render: ${renderTime.toFixed(0)}ms`);
  console.log(`Total: ${(performance.now() - start).toFixed(0)}ms`);
  console.log(`HTML size: ${(html.length / 1024).toFixed(0)}KB`);
  console.log(`Control count: ${controlCount}`);
  console.log('==============================');
}

function countControls(ctrl, count = { total: 0 }) {
  count.total++;
  (ctrl.__ctrl_chain || []).forEach(child => {
    if (child.constructor && child.constructor.name !== 'String_Control') {
      countControls(child, count);
    }
  });
  return count.total;
}
```

### Edge Cases & Guardrails

- **String nodes can skew counts**: Track totals with and without `String_Control` to understand impact on render time.
- **Lazy placeholders must stay neutral**: Avoid creating child controls inside placeholders; keep them as lightweight DOM shells.
- **Client-side replacement needs re-activation**: If `outerHTML` injects jsgui3 markup, re-run activation for the inserted subtree.

---

## Pattern 3: Conditional Complexity

**Simpler controls for less important items:**

```javascript
compose() {
  this.items.forEach((item, i) => {
    // First 20 items get full controls
    if (i < 20) {
      this.add(new RichItemControl({ context: this.context, item }));
    } else {
      // Rest get simple controls
      this.add(new SimpleItemControl({ context: this.context, item }));
    }
  });
}
```

---

## Pattern 4: Virtual Scrolling (For Large Lists)

**Only render items in viewport + buffer:**

```javascript
class VirtualListControl extends jsgui.Control {
  compose() {
    const viewport = 20;  // Visible items
    const buffer = 5;     // Above/below buffer
    
    const start = Math.max(0, this.scrollIndex - buffer);
    const end = Math.min(this.items.length, this.scrollIndex + viewport + buffer);
    
    for (let i = start; i < end; i++) {
      this.add(new ItemControl({ context: this.context, item: this.items[i] }));
    }
  }
}
```

---

## Performance Decision Matrix

| Dataset Size | Pattern | Expected Improvement |
|--------------|---------|---------------------|
| <50 items | Render all | N/A (fast enough) |
| 50-200 items | Conditional complexity | 30-50% |
| 200-1000 items | Lazy rendering | 50-80% |
| 1000+ items | Virtual scrolling | 90%+ |

---

## Key Insight: Profile First

> **Never optimize without measuring.**
>
> Create a diagnostic script BEFORE changing code.
> The bottleneck is often not where you expect.
>
> In docs viewer: Expected bottleneck = file I/O. Actual bottleneck = control tree (70%!)

---

## Verification Notes (2026-01-17)

- Performance lab check: `node src/ui/lab/experiments/041-jsgui3-live-graph-perf/check.js --nodes 250 --ms 800 --tick 20 --mode batch`

---

_Last updated: 2025-12-01_
_Source: Docs viewer optimization session_
