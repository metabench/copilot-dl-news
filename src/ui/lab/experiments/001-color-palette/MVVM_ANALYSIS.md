# MVVM Analysis: Color Selection in jsgui3

**Purpose**: Deep-dive analysis of MVVM patterns applicable to color selection controls.

---

## Executive Summary

jsgui3 has **two levels** of reactivity:

| Level | Mechanism | Best For | Complexity |
|-------|-----------|----------|------------|
| **Simple** | `obext` `prop()` + `on('change')` | Most controls | Low |
| **Full MVVM** | `Data_Model_View_Model_Control` | Complex forms, two-way binding | High |

**Recommendation**: Start with `obext` `prop()`. Only upgrade to full MVVM if you need computed properties, two-way binding with transforms, or validation.

---

## Level 1: Simple Reactive Properties with `obext`

### How It Works

```javascript
const { prop, field } = require('obext');
const jsgui = require('jsgui3-html');

class MyColorControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // Observable properties - changes fire events
    prop(this, 'foreground_color', spec.foreground || '#000000');
    prop(this, 'background_color', spec.background || '#FFFFFF');
    prop(this, 'active_target', 'foreground');  // 'foreground' | 'background'
    
    // Non-observable field - just storage
    field(this, 'color_history', []);
    
    if (!spec.el) this.compose();
  }
}
```

### Event Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│                        obext prop() Event Flow                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User clicks color cell                                              │
│         │                                                            │
│         ▼                                                            │
│  Color_Grid 'choose-color' event fires                               │
│         │                                                            │
│         ▼                                                            │
│  Handler: this.foreground_color = e.value                            │
│         │                                                            │
│         ▼                                                            │
│  obext detects property assignment                                   │
│         │                                                            │
│         ▼                                                            │
│  Control emits: { name: 'foreground_color', value: '#FF0000' }       │
│         │                                                            │
│         ▼                                                            │
│  Any listener on('change') receives event                            │
│         │                                                            │
│         ▼                                                            │
│  Update UI: preview boxes, canvas state, etc.                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Implementation Pattern

```javascript
class ColorSelectorControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // Define observable properties
    prop(this, 'foreground_color', '#000000');
    prop(this, 'background_color', '#FFFFFF');
    prop(this, 'active_target', 'foreground');
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    this.dom.attributes.class = 'color-selector';
    
    // FG/BG toggle boxes
    this._fgBox = this._createPreviewBox('foreground');
    this._bgBox = this._createPreviewBox('background');
    this.add(this._fgBox);
    this.add(this._bgBox);
    
    // Color grid
    this._colorGrid = new Color_Grid({
      context: this.context,
      grid_size: [12, 8],
      cell_selection: 'single'
    });
    this.add(this._colorGrid);
  }
  
  _createPreviewBox(target) {
    const box = new jsgui.Control({ context: this.context, tagName: 'div' });
    box.dom.attributes.class = `color-preview color-preview--${target}`;
    box.dom.attributes['data-target'] = target;
    return box;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Grid color selection
    this._colorGrid.on('choose-color', (e) => {
      if (this.active_target === 'foreground') {
        this.foreground_color = e.value;
      } else {
        this.background_color = e.value;
      }
    });
    
    // Preview box clicks toggle target
    [this._fgBox, this._bgBox].forEach((box) => {
      const el = box.dom?.el;
      if (el?.addEventListener) {
        el.addEventListener('click', () => {
          this.active_target = box.dom.attributes['data-target'];
          this._updatePreviewSelection();
        });
      }
    });
    
    // Listen to own changes for UI updates
    this.on('change', (e) => {
      switch (e.name) {
        case 'foreground_color':
          this._updatePreviewColor(this._fgBox, e.value);
          break;
        case 'background_color':
          this._updatePreviewColor(this._bgBox, e.value);
          break;
        case 'active_target':
          this._updatePreviewSelection();
          break;
      }
    });
    
    // Initial UI state
    this._updatePreviewColor(this._fgBox, this.foreground_color);
    this._updatePreviewColor(this._bgBox, this.background_color);
    this._updatePreviewSelection();
  }
  
  _updatePreviewColor(box, color) {
    const el = box.dom?.el;
    if (el) el.style.backgroundColor = color;
  }
  
  _updatePreviewSelection() {
    const fgEl = this._fgBox.dom?.el;
    const bgEl = this._bgBox.dom?.el;
    if (fgEl && bgEl) {
      fgEl.classList.toggle('selected', this.active_target === 'foreground');
      bgEl.classList.toggle('selected', this.active_target === 'background');
    }
  }
  
  // Public API
  swapColors() {
    const temp = this.foreground_color;
    this.foreground_color = this.background_color;
    this.background_color = temp;
  }
  
  resetColors() {
    this.foreground_color = '#000000';
    this.background_color = '#FFFFFF';
  }
}

module.exports = { ColorSelectorControl };
```

---

## Level 2: Full MVVM with Data_Model_View_Model_Control

### When to Use Full MVVM

| Use Full MVVM When... | Why |
|-----------------------|-----|
| Two-way binding between controls | ModelBinder handles sync |
| Computed properties (derived state) | ComputedProperty class |
| Format transforms (display vs storage) | Transformations library |
| Validation requirements | Validators library |
| Complex undo/redo | Model change tracking |
| Sharing state across controls | Centralized data model |

### MVVM Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MVVM Architecture                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     DATA MODEL                               │   │
│  │  (Business data - persisted, shared across views)           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  this.data.model = new Data_Object({                        │   │
│  │    colors: {                                                │   │
│  │      foreground: '#000000',                                 │   │
│  │      background: '#FFFFFF'                                  │   │
│  │    },                                                       │   │
│  │    history: []                                              │   │
│  │  });                                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              │ ModelBinder                          │
│                              │ (transforms, validation)             │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     VIEW MODEL                               │   │
│  │  (UI state - derived for display)                           │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  this.view.data.model = new Data_Object({                   │   │
│  │    displayForeground: '#000',      // Shortened for display │   │
│  │    displayBackground: '#FFF',                               │   │
│  │    historyCount: 0,                // Computed from history │   │
│  │    canUndo: false,                                          │   │
│  │    activeTarget: 'foreground'      // UI-only state         │   │
│  │  });                                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              │ Control rendering                    │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                        VIEW                                  │   │
│  │  (DOM representation)                                       │   │
│  │  ─────────────────────────────────────────────────────────  │   │
│  │  • Color preview boxes bound to view model                  │   │
│  │  • History indicator bound to historyCount                  │   │
│  │  • Undo button enabled by canUndo                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Full MVVM Implementation

```javascript
const Data_Model_View_Model_Control = require('jsgui3-html/html-core/Data_Model_View_Model_Control');
const { Data_Object } = require('lang-tools');
const { installBindingPlugin } = require('../../../../jsgui/bindingPlugin');

class ColorSelectorMVVMControl extends Data_Model_View_Model_Control {
  constructor(spec) {
    super(spec);
    
    // DATA MODEL - Business/persistence layer
    this.data.model = new Data_Object({
      'foreground': spec.foreground || '#000000',
      'background': spec.background || '#FFFFFF',
      'history': [],
      'maxHistory': 50
    });
    
    // VIEW MODEL - UI display layer
    this.view.data.model = new Data_Object({
      'displayForeground': '',
      'displayBackground': '',
      'historyCount': 0,
      'canUndo': false,
      'activeTarget': 'foreground'
    });
    
    this.setupBindings();
    if (!spec.el) this.compose();
  }
  
  setupBindings() {
    // Install binding plugin for Data_Object compatibility
    installBindingPlugin(this);
    
    // Simple binding: foreground → displayForeground
    this.bind({
      'foreground': {
        to: 'displayForeground',
        transform: (color) => this._formatColorDisplay(color)
      }
    });
    
    // Bind background similarly
    this.bind({
      'background': {
        to: 'displayBackground',
        transform: (color) => this._formatColorDisplay(color)
      }
    });
    
    // Computed: history array → historyCount
    this.computed(
      this.data.model,
      ['history'],
      (history) => history.length,
      { propertyName: 'historyCount', target: this.view.data.model }
    );
    
    // Computed: history array → canUndo
    this.computed(
      this.data.model,
      ['history'],
      (history) => history.length > 0,
      { propertyName: 'canUndo', target: this.view.data.model }
    );
    
    // Watch for color changes to update history
    this.watch(this.data.model, 'foreground', (newVal, oldVal) => {
      if (oldVal !== undefined) {
        this._addToHistory({ type: 'foreground', from: oldVal, to: newVal });
      }
    });
    
    this.watch(this.data.model, 'background', (newVal, oldVal) => {
      if (oldVal !== undefined) {
        this._addToHistory({ type: 'background', from: oldVal, to: newVal });
      }
    });
  }
  
  _formatColorDisplay(hexColor) {
    // Transform: #FF0000 → rgb(255, 0, 0) or short format
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }
  
  _addToHistory(entry) {
    const history = this.data.model.get('history');
    const max = this.data.model.get('maxHistory');
    
    // Add new entry, trim if exceeds max
    history.push({ ...entry, timestamp: Date.now() });
    if (history.length > max) {
      history.shift();
    }
    
    // Trigger update
    this.data.model.set('history', [...history]);
  }
  
  // Public API
  setForeground(color) {
    this.data.model.set('foreground', color);
  }
  
  setBackground(color) {
    this.data.model.set('background', color);
  }
  
  setActiveColor(color) {
    const target = this.view.data.model.get('activeTarget');
    if (target === 'foreground') {
      this.setForeground(color);
    } else {
      this.setBackground(color);
    }
  }
  
  undo() {
    const history = this.data.model.get('history');
    if (history.length === 0) return;
    
    const last = history.pop();
    // Apply reverse
    if (last.type === 'foreground') {
      this.data.model.set('foreground', last.from);
    } else {
      this.data.model.set('background', last.from);
    }
    // Remove the undo itself from history (we just added it)
    history.pop();
    this.data.model.set('history', [...history]);
  }
}

module.exports = { ColorSelectorMVVMControl };
```

---

## Binding Plugin Compatibility

The `bindingPlugin.js` at `src/ui/jsgui/bindingPlugin.js` bridges `Data_Object` (which uses `get()`/`set()`) with jsgui3's MVVM system (which expects direct property access).

### What It Does

```javascript
// Without plugin: ModelBinder does direct property access
binder.bind('sourceProperty', target, 'targetProperty');
// → target.targetProperty = value  // FAILS with Data_Object

// With plugin: Intercepts and uses get()/set()
installBindingPlugin(control);
// → target.set('targetProperty', value)  // WORKS with Data_Object
```

### Usage

```javascript
const { installBindingPlugin } = require('../../jsgui/bindingPlugin');

class MyControl extends Data_Model_View_Model_Control {
  constructor(spec) {
    super(spec);
    
    // Install BEFORE setting up bindings
    installBindingPlugin(this);
    
    this.setupBindings();
  }
}
```

---

## Comparison: obext vs Full MVVM

### obext `prop()` Approach

**Pros**:
- ✅ Simple, minimal boilerplate
- ✅ Direct property assignment: `this.color = '#FF0000'`
- ✅ Native jsgui3 Control `on('change')` integration
- ✅ Works in both server and client contexts

**Cons**:
- ❌ No computed properties
- ❌ No transforms/formatters
- ❌ No validators
- ❌ Manual UI update wiring

### Full MVVM Approach

**Pros**:
- ✅ Computed properties (derived state)
- ✅ Built-in transforms (date, number, string formatters)
- ✅ Built-in validators
- ✅ Two-way binding
- ✅ Separation of data model from view model

**Cons**:
- ❌ Requires binding plugin for Data_Object compatibility
- ❌ More boilerplate
- ❌ Steeper learning curve
- ❌ `Data_Object` uses `get()`/`set()` not direct access

---

## Decision Matrix

| Requirement | Use obext `prop()` | Use Full MVVM |
|-------------|--------------------|---------------|
| Simple state (2-5 properties) | ✅ | ❌ Overkill |
| Computed/derived values | ❌ Manual | ✅ |
| Display transforms | ❌ Manual | ✅ Built-in |
| Form validation | ❌ Manual | ✅ Built-in |
| Two-way binding | ❌ Manual | ✅ |
| Undo/redo | ❌ Complex | ✅ Easier |
| Server-side rendering | ✅ | ✅ |
| Minimal bundle size | ✅ | ❌ Larger |

---

## Recommendation for Art Playground

For the Art Playground color picker:

**Use `obext` `prop()` approach** because:
1. Only 3 observable properties (fg, bg, active)
2. No complex transforms needed
3. No validation requirements
4. Simpler to integrate
5. Already how Color_Palette works internally

Only upgrade to full MVVM if:
- Adding HSL sliders (computed properties for H/S/L ↔ RGB)
- Adding color history with undo (history array with computed canUndo)
- Sharing color state across multiple controls (centralized data model)
