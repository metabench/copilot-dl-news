# jsgui3 Progress UI Patterns & Anti-Patterns

**Lab**: jsgui3-idiomatic-progress  
**Purpose**: Catalog patterns discovered during this lab investigation

---

## ✅ GOOD PATTERNS

### Pattern 1: State Object with Centralized Sync

**When to use**: Any control with multiple pieces of mutable state.

```javascript
class ProgressDisplayControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // Single state object - all mutable state lives here
    this._state = {
      phase: 'idle',       // 'idle' | 'running' | 'complete' | 'error'
      current: 0,
      total: 0,
      message: '',
      warnings: [],
      stats: null
    };
    
    if (!spec.el) this.compose();
  }
  
  // Single entry point for all state changes
  setState(partial) {
    this._state = { ...this._state, ...partial };
    this._syncView();
  }
  
  // Single method syncs all DOM to current state
  _syncView() {
    // All DOM updates happen here - easy to reason about
  }
}
```

**Benefits**:
- State changes are predictable
- Easy to debug (log `_state` at any point)
- Single `_syncView()` prevents update ordering bugs
- Works naturally with SSR → activation flow

---

### Pattern 2: CSS Transitions for Visibility

**When to use**: Any element that shows/hides dynamically.

```javascript
// In compose()
this._warningsEl = new jsgui.Control({ context, tagName: 'div' });
this._warningsEl.add_class('progress__warnings');
this._warningsEl.add_class('progress__warnings--hidden');  // Start hidden
this.add(this._warningsEl);

// In _syncView()
if (this._state.warnings.length > 0) {
  this._warningsEl.remove_class('progress__warnings--hidden');
} else {
  this._warningsEl.add_class('progress__warnings--hidden');
}
```

```css
.progress__warnings {
  transition: opacity 0.2s ease-out, max-height 0.2s ease-out;
  max-height: 200px;
  opacity: 1;
}

.progress__warnings--hidden {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
```

**Benefits**:
- Smooth transitions, no flashing
- CSS handles animation timing
- Works with SSR (initial class is correct)
- No JavaScript animation loops needed

---

### Pattern 3: RAF-Based Update Debouncing

**When to use**: Frequent updates (>5/second) from SSE/polling.

```javascript
_scheduleUpdate() {
  if (this._pendingFrame) return;  // Already scheduled
  
  this._pendingFrame = requestAnimationFrame(() => {
    this._pendingFrame = null;
    this._syncView();
  });
}

// Called from SSE/polling handler
handleProgress(state) {
  this._state = { ...this._state, ...state };
  this._scheduleUpdate();  // Coalesces rapid updates
}

// Cleanup
destroy() {
  if (this._pendingFrame) {
    cancelAnimationFrame(this._pendingFrame);
  }
}
```

**Benefits**:
- Max one DOM update per frame (~60fps)
- Prevents jitter from rapid state changes
- Low overhead (RAF is efficient)
- Easy to understand and implement

---

### Pattern 4: Control References During Compose

**When to use**: Always - never query DOM to find child controls.

```javascript
compose() {
  const ctx = this.context;
  
  // Store references to controls we'll need to update
  this._titleEl = new jsgui.Control({ context: ctx, tagName: 'h3' });
  this._titleEl.add_class('progress__title');
  this._titleEl.add(this._state.title || 'Progress');
  this.add(this._titleEl);
  
  this._barEl = new ProgressBarEl({ context: ctx });
  this.add(this._barEl);
  
  this._messageEl = new jsgui.Control({ context: ctx, tagName: 'div' });
  this._messageEl.add_class('progress__message');
  this.add(this._messageEl);
}

// In _syncView() - use stored references
_syncView() {
  // Update bar through its API
  this._barEl.setProgress(this._state.current, this._state.total);
  
  // Update message text
  if (this._messageEl.dom?.el) {
    this._messageEl.dom.el.textContent = this._state.message;
  }
}
```

**Benefits**:
- No DOM queries needed
- Works with SSR (compose creates structure)
- Type-safe control references
- Clear which controls are updateable

---

### Pattern 5: Explicit Activation Guard

**When to use**: Always - prevents double-activation.

```javascript
activate() {
  if (this.__active) return;
  this.__active = true;
  
  const el = this.dom?.el;
  if (!el) return;
  
  // Activate child controls
  if (this._barEl?.activate) {
    this._barEl.activate();
  }
  
  // Bind any client-only event listeners
  el.addEventListener('click', this._handleClick.bind(this));
}
```

**Benefits**:
- Prevents memory leaks from duplicate listeners
- Clear single activation path
- Child activation in predictable order

---

## ❌ ANTI-PATTERNS

### Anti-Pattern 1: Direct Style.display Manipulation

**Problem**: Causes layout thrashing and visual flashing.

```javascript
// ❌ BAD
_handleWarnings(warnings) {
  if (warnings.length > 0) {
    this._warningEl.style.display = 'block';
    this._warningEl.textContent = warnings[0];
  } else {
    this._warningEl.style.display = 'none';
  }
}
```

**Why it's bad**:
- No transition - instant show/hide causes flashing
- Layout recalculation on every change
- Rapid show/hide creates jittery experience

**Fix**: Use CSS classes with transitions (see Pattern 2).

---

### Anti-Pattern 2: DOM Queries Instead of Control References

**Problem**: Fragile, slow, and breaks SSR.

```javascript
// ❌ BAD
activate() {
  this._bar = this.dom.el.querySelector('.progress-bar');
  this._message = this.dom.el.querySelector('[data-message]');
  this._warnings = this.dom.el.querySelector('.warnings');
}
```

**Why it's bad**:
- Requires matching CSS selectors (fragile)
- Loses jsgui3 control API (can't call `this._bar.setProgress()`)
- Returns DOM elements, not controls
- Breaks if HTML structure changes

**Fix**: Store control references during compose() (see Pattern 4).

---

### Anti-Pattern 3: Scatter-Update Pattern

**Problem**: Hard to reason about, causes race conditions.

```javascript
// ❌ BAD - state updates scattered everywhere
setCurrent(value) {
  this.current = value;
  this._updateBar();
}

setTotal(value) {
  this.total = value;
  this._updateBar();
}

setPhase(phase) {
  this.phase = phase;
  this._updateStatus();
}

showWarning(msg) {
  this.warning = msg;
  this._updateWarning();
}
```

**Why it's bad**:
- Multiple update methods = multiple code paths
- Order of calls matters (bug-prone)
- Hard to batch updates efficiently
- No single source of truth for "current state"

**Fix**: Single state object with `setState()` (see Pattern 1).

---

### Anti-Pattern 4: Immediate Sync on Every Update

**Problem**: UI jitter from too-frequent updates.

```javascript
// ❌ BAD
onSSEMessage(event) {
  const state = JSON.parse(event.data);
  this.current = state.current;
  this._barEl.setProgress(state.current, state.total);  // Called 20x/sec
  this._messageEl.textContent = state.message;          // Jitter!
}
```

**Why it's bad**:
- SSE can fire faster than refresh rate
- Every update triggers layout/paint
- Creates visual "vibration" effect

**Fix**: Debounce with RAF (see Pattern 3).

---

### Anti-Pattern 5: HTML Strings in JavaScript

**Problem**: Breaks jsgui3 abstraction, security risk.

```javascript
// ❌ BAD
_updateWarnings(warnings) {
  this._warningsEl.dom.el.innerHTML = `
    <ul>
      ${warnings.map(w => `<li>${w.message}</li>`).join('')}
    </ul>
  `;
}
```

**Why it's bad**:
- XSS vulnerability (user data in innerHTML)
- Destroys event listeners on child elements
- Bypasses jsgui3 control model
- Can't be tracked for updates

**Fix**: Compose child controls dynamically:
```javascript
// ✅ GOOD
_updateWarnings(warnings) {
  // Clear existing
  this._warningsEl.clear();  // or track and remove children
  
  const list = new jsgui.Control({ context: this.context, tagName: 'ul' });
  for (const w of warnings) {
    const item = new jsgui.Control({ context: this.context, tagName: 'li' });
    item.add(w.message);  // Automatically escaped
    list.add(item);
  }
  this._warningsEl.add(list);
  
  // Re-render if already in DOM
  if (this._warningsEl.dom?.el) {
    this._warningsEl.dom.el.innerHTML = list.all_html_render();
  }
}
```

---

### Anti-Pattern 6: Overriding Reserved Method Names

**Problem**: jsgui3's `Control_Core` calls internal methods like `on()` during construction.

```javascript
// ❌ BAD - Defining on() overrides jsgui3's internal event system
class MyControl extends jsgui.Control {
  constructor(spec) {
    super(spec);  // CRASH! jsgui3 calls this.on('change', ...) here
    this._listeners = { progress: [] };  // Never reached
  }
  
  on(event, cb) {
    this._listeners[event].push(cb);  // Crashes during super()
  }
}
```

**Why it's bad**:
- jsgui3 expects `on()` to work during `super()` call
- `this._listeners` doesn't exist yet
- Results in cryptic "Cannot read properties of undefined" errors
- Error message doesn't clearly point to the naming conflict

**Fix**: Use different method names for custom event systems:
```javascript
// ✅ GOOD
addListener(event, cb) {
  this._listeners[event]?.push(cb);
}

// Or more explicit:
subscribe(event, cb) { ... }
onProgressEvent(cb) { ... }
```

**Reserved names to avoid overriding**: `on`, `off`, `emit`, `trigger`, `set`, `get`

---

## Pattern Decision Tree

```
Need to show/hide element?
├─ Yes → Pattern 2 (CSS Transitions)
└─ No
   │
   Getting rapid updates (>5/sec)?
   ├─ Yes → Pattern 3 (RAF Debounce)
   └─ No
      │
      Multiple state properties?
      ├─ Yes → Pattern 1 (State Object)
      └─ No → Simple property + direct update OK
```

---

## Summary Table

| Pattern | When | Key Technique |
|---------|------|---------------|
| State Object | Multiple mutable props | Single `_state`, single `_syncView()` |
| CSS Transitions | Show/hide elements | `add_class`/`remove_class` + CSS |
| RAF Debounce | Rapid updates | `requestAnimationFrame` |
| Control References | Child updates | Store refs in `compose()` |
| Activation Guard | Prevent double-bind | `if (this.__active) return` |
