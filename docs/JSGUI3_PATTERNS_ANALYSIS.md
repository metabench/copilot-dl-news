# jsgui3 Patterns Analysis and Application

**Date**: October 11, 2025  
**Purpose**: Document how jsgui3-html and jsgui3-server patterns inform this codebase's activation architecture

## Executive Summary

After reviewing jsgui3 repositories, we conclude that:
1. ✅ **Core concepts align** - Two-phase lifecycle (render → activate) matches our current approach
2. ✅ **Terminology validated** - "Activation" is correct terminology (not "hydration")
3. ❌ **Architecture differs** - jsgui3 uses class inheritance; we use factory functions + modules
4. ✅ **Current approach is sound** - Our enhancer pattern achieves same goals with simpler code

**Recommendation**: Continue with current factory/enhancer pattern. Add optional lightweight ControlBase ONLY for complex components that need lifecycle management.

---

## jsgui3 Core Patterns

### 1. Control Class Base Pattern

**jsgui3 approach:**
```javascript
class MyControl extends Control {
  constructor(spec = {}) {
    super(spec);
    const { context } = this;
    
    // THIS RUNS ON BOTH SERVER AND CLIENT
    // Build UI structure
    this.button = new Control({ context, tagName: 'button' });
    this.button.add('Click me');
    this.add(this.button);
  }
  
  activate() {
    // THIS RUNS ONLY ON CLIENT
    if (!this.__active) {
      super.activate();
      
      // Attach event handlers
      this.button.on('click', () => {
        console.log('Clicked!');
      });
    }
  }
}
```

**Key features:**
- Base `Control` class provides common functionality
- Constructor builds structure (server + client)
- `activate()` attaches events (client only)
- `__active` flag prevents double-activation
- `context` object for shared state
- `data-jsgui-id` attributes map controls to DOM

### 2. Context-Based Architecture

**jsgui3 approach:**
```javascript
// context = { map_controls: {}, map_els: {}, ... }

// Register control
context.map_controls[ctrl._id()] = ctrl;

// Lookup control by ID
const ctrl = context.map_controls['control-123'];

// Activate all controls
recursive_dom_iterate(document, (el) => {
  const jsgui_id = el.getAttribute('data-jsgui-id');
  if (jsgui_id) {
    const ctrl = context.map_controls[jsgui_id];
    ctrl.activate(el);
  }
});
```

**Benefits:**
- Central registry for control lookup
- Parent-child relationships
- Shared resources (event bus, services)
- Recursive activation

### 3. Server-Side Rendering + Client Activation

**jsgui3 SSR flow:**
```javascript
// SERVER: Render to HTML
const ui = new Demo_UI({ context: serverContext });
const html = ui.all_html_render();
res.send(`<!DOCTYPE html>${html}`);

// CLIENT: Activate from HTML
const context = createClientContext();
jsgui.pre_activate(context);  // Map controls to DOM
jsgui.activate(context);       // Run activate() on all controls
```

**This is identical to our SSR → activation pattern!**

---

## Current Codebase Patterns (Already Aligned!)

### 1. Factory Functions + Enhancers

**Our approach:**
```javascript
// SERVER: Render via factory function
function renderCrawlsListPage(crawls) {
  return `
    <table data-jsgui-id="crawls-table">
      ${crawls.map(c => `
        <tr data-jsgui-id="crawl-row-${c.id}">
          <td>${c.host}</td>
          <td>${c.status}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

// CLIENT: Activate via enhancer script
function activateCrawlsTable(container) {
  const rows = container.querySelectorAll('[data-jsgui-id^="crawl-row-"]');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.jsguiId.replace('crawl-row-', '');
      window.location.href = `/crawls/${id}`;
    });
  });
}

function scanAndActivate() {
  const table = document.querySelector('[data-jsgui-id="crawls-table"]');
  if (table) activateCrawlsTable(table);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanAndActivate);
} else {
  scanAndActivate();
}
```

**Comparison:**
| Feature | jsgui3 | Our Codebase |
|---------|--------|--------------|
| Two-phase lifecycle | ✅ Constructor + activate() | ✅ Render + enhancer |
| Server rendering | ✅ all_html_render() | ✅ renderPage() |
| Client activation | ✅ activate() method | ✅ scanAndActivate() |
| ID-based mapping | ✅ data-jsgui-id | ✅ data-jsgui-id |
| Control registry | ✅ context.map_controls | ❌ Not needed (simpler) |
| Base class | ✅ Control | ❌ Factory functions |
| Event system | ✅ on/off/emit | ✅ Native addEventListener |

**Our pattern achieves same results with:**
- ✅ Less boilerplate (no class hierarchy)
- ✅ Simpler code (function composition)
- ✅ Better tree-shaking (ES modules)
- ✅ Easier testing (pure functions)

### 2. EventSource for Real-Time Updates

**jsgui3 approach:**
```javascript
activate() {
  this.eventSource = new EventSource('/events');
  this.eventSource.addEventListener('progress', (e) => {
    this.updateProgress(JSON.parse(e.data));
  });
}
```

**Our approach (IDENTICAL):**
```javascript
function activateCrawlsTable(container) {
  const eventSource = new EventSource('/events');
  eventSource.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    updateRow(data);
  });
}
```

---

## When to Use Each Pattern

### Use Simple Enhancer (Default - 95% of cases)

**When:**
- List pages (crawls, queues, analysis)
- Simple forms (start, stop, pause buttons)
- Static content with minimal interaction
- No child component coordination needed

**Example:**
```javascript
function activateSimpleComponent(container) {
  const buttons = container.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', handleClick);
  });
}
```

**Benefits:**
- Minimal code
- Easy to understand
- No framework overhead
- Fast execution

### Use ControlBase Class (Optional - 5% of cases)

**When:**
- Complex components with internal state
- Multiple child components needing coordination
- Lifecycle hooks required (mount/unmount)
- Extensive cleanup needed

**Example: AnalysisProgressBar:**
```javascript
class AnalysisProgressControl extends ControlBase {
  constructor(element, { runId, onCancel }) {
    super(element, { runId, onCancel });
    
    // Find child elements (already rendered by server)
    this.bar = this.$('.progress-bar');
    this.label = this.$('.progress-label');
    this.cancelBtn = this.$('.cancel-button');
  }
  
  activate() {
    if (this.__active) return;
    super.activate();
    
    // Attach handlers
    this.cancelBtn.addEventListener('click', () => {
      this.options.onCancel?.(this.options.runId);
    });
    
    // Start updates
    this._eventSource = new EventSource(`/events?runId=${this.options.runId}`);
    this._eventSource.addEventListener('analysis-progress', (e) => {
      this.updateProgress(JSON.parse(e.data));
    });
    
    // Register cleanup
    this.onCleanup(() => {
      this._eventSource.close();
    });
  }
  
  updateProgress(data) {
    this.bar.style.width = `${data.percentage}%`;
    this.label.textContent = `${data.processed}/${data.total}`;
  }
}

// Usage in enhancer
function activateAnalysisPage() {
  document.querySelectorAll('[data-component="analysis-progress"]').forEach(el => {
    const control = new AnalysisProgressControl(el, {
      runId: el.dataset.runId,
      onCancel: (id) => fetch(`/api/analysis/${id}/cancel`, { method: 'POST' })
    });
    control.activate();
  });
}
```

**Benefits:**
- Structured lifecycle
- Automatic cleanup
- Child coordination
- Event system

---

## Recommended Adaptations (If Needed)

### 1. Optional ControlBase Class (For Complex Components Only)

**Create:** `src/ui/express/public/js/shared/ControlBase.js`

```javascript
/**
 * Lightweight control base (jsgui3-inspired)
 * Use ONLY for complex components needing lifecycle management.
 * Most components should use simple enhancer pattern!
 */

class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, handler) { ... }
  off(event, handler) { ... }
  emit(event, data) { ... }
}

class ControlBase extends EventEmitter {
  constructor(element, options = {}) {
    super();
    this.element = element;
    this.options = options;
    this.__active = false;
    this._children = [];
    this._cleanupFns = [];
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    this.emit('activate');
    this._children.forEach(c => c.activate());
  }
  
  deactivate() {
    this._children.forEach(c => c.deactivate());
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this.__active = false;
  }
  
  onCleanup(fn) {
    this._cleanupFns.push(fn);
  }
  
  $(selector) { return this.element.querySelector(selector); }
  $$(selector) { return Array.from(this.element.querySelectorAll(selector)); }
}
```

### 2. Component Registry (Optional, for debugging)

```javascript
class ComponentRegistry {
  constructor() { this._components = new Map(); }
  register(id, component) { this._components.set(id, component); }
  get(id) { return this._components.get(id); }
  activateAll() { this._components.forEach(c => c.activate()); }
}

// Global registry for dev tools
window.__components = new ComponentRegistry();
```

---

## Migration Path (If Adopting ControlBase)

### Phase 1: Add Optional ControlBase (1-2 hours)

1. Create `src/ui/express/public/js/shared/ControlBase.js`
2. Write tests for ControlBase
3. Update build system to include in bundle

### Phase 2: Convert Complex Components (Case-by-case)

**Candidates:**
- `AnalysisProgressBar` - multiple children, cleanup needed
- Any future drag-and-drop components
- Complex forms with validation

**DON'T convert:**
- Simple list activators (crawls, queues)
- Single-purpose buttons
- Static content enhancers

### Phase 3: Document Patterns (30 minutes)

Update `docs/HTML_COMPOSITION_ARCHITECTURE.md` with:
- When to use enhancer vs ControlBase
- Examples of each pattern
- Decision flowchart

---

## Conclusion

**Current Status: ✅ Aligned with jsgui3 Best Practices**

Our codebase already follows jsgui3's core principles:
1. ✅ Two-phase lifecycle (render → activate)
2. ✅ Server-side rendering with `data-jsgui-id` attributes
3. ✅ Client-side activation via dedicated scripts
4. ✅ EventSource for real-time updates
5. ✅ Separation of concerns (view model → renderer → enhancer)

**Differences are intentional and beneficial:**
- Factory functions > Class hierarchy (simpler, composable)
- Direct DOM manipulation > Framework abstraction (faster, smaller)
- Module system > Context object (ES modules, tree-shaking)

**Optional Enhancement:**
- Add lightweight ControlBase for 5% of components that need lifecycle
- Keep simple enhancer pattern for 95% of components
- Document when to use each approach

**No Breaking Changes Required** - Current architecture is sound and productive!

---

## Cross-References

- **Current Architecture**: `docs/HTML_COMPOSITION_ARCHITECTURE.md`
- **Activation Pattern**: `docs/QUEUES_PAGE_OPTIMIZATION.md` (Section: Progressive Enhancement)
- **Example Implementations**: 
  - `src/ui/express/public/js/crawls-enhancer.js` (simple enhancer)
  - `src/ui/express/public/js/queues-enhancer.js` (simple enhancer)
  - `src/ui/express/public/components/AnalysisProgressBar.js` (complex component - could benefit from ControlBase)
