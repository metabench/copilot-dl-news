# Obstacles & Knowledge Gaps

**Lab**: jsgui3-idiomatic-progress  
**Purpose**: Document obstacles encountered, whether knowledge gaps or framework limitations

---

## Knowledge Gaps (Things to Learn)

### 1. ❓ CSS Injection in SSR Context

**Observation**: Controls have static `Control.CSS` properties but there's no standardized way to:
- Collect all CSS from composed controls
- Deduplicate CSS when multiple instances exist
- Inject CSS only once during SSR

**Current Workaround**: Manually include CSS in a `<style>` tag in the server response.

**Ideal Solution**: A `collectAllCSS()` utility that walks the control tree and returns deduplicated CSS.

**Status**: ⚠️ Needs investigation - may exist in jsgui3 and be undocumented.

---

### 2. ❓ Control Text Updates Without String_Control

**Observation**: When a control contains text that needs updating:
```javascript
// Option A: String_Control reference
this._label = new jsgui.String_Control({ context, text: 'Initial' });
this.add(this._label);
// How to update? No clear API.

// Option B: Control with innerHTML-like update
this._label = new jsgui.Control({ context, tagName: 'span' });
this._label.add('Initial');
// How to update text later? Clear and re-add?
```

**Current Workaround**: Use `textContent` directly on DOM element after activate():
```javascript
if (this._label.dom?.el) {
  this._label.dom.el.textContent = 'Updated';
}
```

**Status**: ⚠️ This feels non-idiomatic - need to find better pattern.

---

### 3. ❓ Attribute Updates Post-Render

**Observation**: Setting `this.dom.attributes.style = '...'` works before render, but how do we update attributes after the control is in the DOM?

**Current Workaround**: Direct DOM access:
```javascript
if (this.dom.el) {
  this.dom.el.style.width = '50%';
}
```

**Status**: ⚠️ Seems to be intentional - jsgui3 tracks attributes for SSR but expects direct DOM access client-side.

---

## Framework Limitations (Confirmed Constraints)

### 1. ✅ No Built-in CSS Transitions

**Limitation**: jsgui3 doesn't have built-in transition support. You must use CSS.

**Solution**: Define transitions in CSS, use add_class/remove_class to trigger them.
```css
.my-control {
  transition: opacity 0.2s ease-out;
}
.my-control.hidden {
  opacity: 0;
}
```

**Impact**: None - this is the correct approach for smooth animations.

---

### 2. ✅ No Reactive State Binding (Without ModelBinder)

**Limitation**: Basic controls don't auto-sync state to DOM. You must either:
1. Use manual `_syncView()` patterns
2. Use ModelBinder for MVVM pattern

**Solution**: For simple progress displays, manual state sync is appropriate.
```javascript
setState(partial) {
  Object.assign(this._state, partial);
  this._syncView();
}
```

**Impact**: Medium - requires discipline to always call `_syncView()` or use `setState()`.

---

### 3. ✅ No Virtual DOM / Diff-Patch

**Limitation**: jsgui3 doesn't diff/patch - it either renders HTML once (SSR) or manipulates existing DOM (client).

**Implications**:
- Can't re-render a control and expect minimal DOM changes
- Must use targeted updates (textContent, classList, style)
- innerHTML replacement destroys event listeners

**Solution**: Design controls with specific update methods, not full re-renders.

**Impact**: Low if controls are designed correctly from the start.

---

### 4. ✅ CSS-in-JS is Static Only

**Limitation**: `Control.CSS` is a static string - can't have dynamic CSS per instance.

**Solution**: Use CSS custom properties (variables) for dynamic values:
```javascript
compose() {
  // Set CSS variable for this instance
  this.dom.attributes.style = `--progress-color: ${this.color};`;
}
```

```css
.progress-bar__fill {
  background: var(--progress-color, #00d4ff);
}
```

**Impact**: Low - CSS custom properties solve most use cases.

---

### 5. ✅ Method Name Collisions with jsgui3 Base Class

**Limitation**: The jsgui3 `Control` base class calls `this.on('change', ...)` during construction (in `Control_Core`). If your subclass defines its own `on()` method for custom events, it will be called before your constructor initializes `this._listeners`, causing a crash:

```javascript
// ❌ BROKEN: Defines on() which conflicts with jsgui3's internal on()
class MyControl extends jsgui.Control {
  constructor(spec) {
    super(spec);  // jsgui3 calls this.on('change', ...) BEFORE we reach this line!
    this._listeners = { progress: [], error: [] };  // Too late - crash already happened
  }
  
  on(event, cb) {
    this._listeners[event].push(cb);  // TypeError: Cannot read 'push' of undefined
  }
}
```

**Solution**: Name custom event methods differently (e.g., `addListener`, `subscribe`, `onEvent`):
```javascript
// ✅ FIXED: Use different method name
addListener(event, callback) {
  if (this._listeners[event]) {
    this._listeners[event].push(callback);
  }
}
```

**Impact**: Medium - requires awareness when designing controls with custom event systems.

---

## Unresolved Questions

1. **Is there a jsgui3 utility for CSS collection?** - Need to search jsgui3-html source
2. **Can String_Control be updated after construction?** - May need to check if it has a `set()` method
3. **Best practice for animated number changes?** - e.g., "100 → 200" with smooth counting animation

---

## Next Steps

- [ ] Search jsgui3-html source for CSS utilities
- [ ] Test String_Control update patterns
- [ ] Create utility function for CSS collection if none exists
- [ ] Document findings in main jsgui3 guide
