# jsgui3 Effective Patterns Quick Reference

**Purpose**: A quick review of effective jsgui3 patterns including MVC, MVVM, and data binding.  
**Audience**: AI agents and developers working with jsgui3 controls  
**Last Updated**: November 2025

---

## Table of Contents

1. [Pattern Overview](#pattern-overview)
2. [Simple Controls (No State Management)](#simple-controls-no-state-management)
3. [MVC Pattern (Manual State)](#mvc-pattern-manual-state)
4. [MVVM Pattern (Data Binding)](#mvvm-pattern-data-binding)
5. [ModelBinder API](#modelbinder-api)
6. [Computed Properties](#computed-properties)
7. [Property Watchers](#property-watchers)
8. [Transformations](#transformations)
9. [Validators](#validators)
10. [When to Use Which Pattern](#when-to-use-which-pattern)
11. [Quick Decision Guide](#quick-decision-guide)

---

## Pattern Overview

jsgui3 supports multiple architectural patterns depending on complexity:

| Pattern | Complexity | State Management | Use Case |
|---------|------------|------------------|----------|
| **Simple Control** | Low | None | Static displays, badges, icons |
| **MVC (Manual)** | Medium | Event-based | Interactive controls with custom logic |
| **MVVM** | High | Two-way binding | Forms, data grids, master-detail |

```
┌─────────────────────────────────────────────────────────────────────┐
│                    jsgui3 ARCHITECTURE LAYERS                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │  Simple Control │   │   MVC Pattern   │   │  MVVM Pattern   │   │
│  │                 │   │                 │   │                 │   │
│  │  • No state     │   │  • Events       │   │  • ModelBinder  │   │
│  │  • Render once  │   │  • Manual sync  │   │  • Auto sync    │   │
│  │  • Static UI    │   │  • raise/on     │   │  • Computed     │   │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘   │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│                        jsgui.Control (base)                        │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Simple Controls (No State Management)

For static, display-only controls:

```javascript
const jsgui = require("jsgui3-html");

class BadgeControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "span", __type_name: "badge" });
    this.text = spec.text || "";
    this.variant = spec.variant || "default";
    
    this.add_class("badge");
    if (this.variant !== "default") {
      this.add_class(`badge--${this.variant}`);
    }
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    this.add(new jsgui.String_Control({ 
      context: this.context, 
      text: this.text 
    }));
  }
}
```

**Characteristics**:
- No state tracking
- Render once, no updates
- Properties set in constructor
- Suitable for: labels, icons, badges, static cards

---

## MVC Pattern (Manual State)

For interactive controls with manual state management:

```javascript
const jsgui = require("jsgui3-html");

class CounterControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "counter" });
    
    // Model (state)
    this._count = spec.initialCount || 0;
    
    // View references
    this._displayEl = null;
    
    if (!spec.el) this.compose();
  }
  
  // View
  compose() {
    const display = new jsgui.Control({ context: this.context, tagName: "span" });
    display.add_class("counter__display");
    display.add(new jsgui.String_Control({ 
      context: this.context, 
      text: String(this._count) 
    }));
    this._displayEl = display;
    this.add(display);
    
    const btn = new jsgui.Control({ context: this.context, tagName: "button" });
    btn.add(new jsgui.String_Control({ context: this.context, text: "+" }));
    btn.dom.attributes["data-action"] = "increment";
    this.add(btn);
  }
  
  // Controller (client-side)
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el?.addEventListener) return;
    
    el.addEventListener("click", (e) => {
      if (e.target.dataset.action === "increment") {
        this.increment();
      }
    });
  }
  
  // Model mutation + View update (manual sync)
  increment() {
    this._count++;
    this._updateDisplay();
    this.raise("count-changed", { count: this._count });
  }
  
  _updateDisplay() {
    const el = this._displayEl?.dom?.el;
    if (el) el.textContent = String(this._count);
  }
}
```

**Characteristics**:
- Manual state tracking (`this._count`)
- Manual view updates (`_updateDisplay()`)
- Event-based communication (`raise()` / `on()`)
- Full control over sync timing

---

## MVVM Pattern (Data Binding)

For complex forms and data-driven controls:

```javascript
const Data_Model_View_Model_Control = require('jsgui3-html/html-core/Data_Model_View_Model_Control');
const { Data_Object } = require('lang-tools');

class UserFormControl extends Data_Model_View_Model_Control {
  constructor(spec = {}) {
    super(spec);
    
    // DATA MODEL - Business data (source of truth)
    this.data.model = new Data_Object({
      firstName: spec.firstName || '',
      lastName: spec.lastName || '',
      birthDate: spec.birthDate || null,
      salary: spec.salary || 0
    });
    
    // VIEW MODEL - UI-specific derived state
    this.view.data.model = new Data_Object({
      fullName: '',
      displayDate: '',
      displaySalary: '',
      isValid: false
    });
    
    this._setupBindings();
    
    if (!spec.el) this.compose();
  }
  
  _setupBindings() {
    // Computed: fullName derived from firstName + lastName
    this.computed(
      this.data.model,
      ['firstName', 'lastName'],
      (first, last) => `${first} ${last}`.trim(),
      { propertyName: 'fullName', target: this.view.data.model }
    );
    
    // Transform: Date → formatted string
    this.bind({
      'birthDate': {
        to: 'displayDate',
        transform: (date) => this.transforms.date.format(date, 'YYYY-MM-DD'),
        reverse: (str) => this.transforms.date.parseFormat(str, 'YYYY-MM-DD')
      }
    });
    
    // Transform: Number → currency string
    this.bind({
      'salary': {
        to: 'displaySalary',
        transform: (num) => this.transforms.number.toCurrency(num, 'USD'),
        reverse: (str) => this.transforms.number.parse(str)
      }
    });
    
    // Watch for validation
    this.watch(this.data.model, ['firstName', 'lastName'], () => {
      const isValid = this.data.model.firstName.length > 0 && 
                      this.data.model.lastName.length > 0;
      this.view.data.model.isValid = isValid;
    });
  }
}
```

**Key Classes**:

| Class | Purpose |
|-------|---------|
| `Data_Model_View_Model_Control` | Base class for MVVM controls |
| `Data_Object` | Observable data container (from `lang-tools`) |
| `ModelBinder` | Two-way binding between models |
| `ComputedProperty` | Derived values from dependencies |
| `PropertyWatcher` | React to property changes |

---

## ModelBinder API

Creates bidirectional bindings between data model and view model:

```javascript
const { ModelBinder } = require('jsgui3-html/html-core/ModelBinder');
const { Data_Object } = require('lang-tools');

const dataModel = new Data_Object({ price: 1999.99 });
const viewModel = new Data_Object({ displayPrice: '' });

// Simple binding
const binder = new ModelBinder(dataModel, viewModel, {
  'price': 'displayPrice'  // Direct mapping
});

// Binding with transform
const binder2 = new ModelBinder(dataModel, viewModel, {
  'price': {
    to: 'displayPrice',
    transform: (num) => `$${num.toFixed(2)}`,   // data → view
    reverse: (str) => parseFloat(str.replace('$', ''))  // view → data
  }
});

// Options
const binder3 = new ModelBinder(dataModel, viewModel, bindings, {
  bidirectional: true,   // Enable two-way binding (default: true)
  immediate: true,       // Sync immediately on creation (default: true)
  debug: false           // Log binding activity (default: false)
});

// Lifecycle
binder.deactivate();     // Stop listening
binder.activate();       // Resume listening
binder.updateBinding('price');  // Force sync specific property
binder.inspect();        // Get binding state for debugging
```

---

## Computed Properties

Auto-updating derived values:

```javascript
const { ComputedProperty } = require('jsgui3-html/html-core/ModelBinder');

const model = new Data_Object({
  items: [],
  selectedId: null
});

// Single dependency
const itemCount = new ComputedProperty(
  model,
  ['items'],
  (items) => items.length,
  { propertyName: 'itemCount' }
);

// Multiple dependencies
const selectedItem = new ComputedProperty(
  model,
  ['items', 'selectedId'],
  (items, id) => items.find(i => i.id === id) || null,
  { 
    propertyName: 'selectedItem',
    target: viewModel,  // Optional: write to different model
    immediate: true,    // Compute immediately (default: true)
    debug: false        // Log updates (default: false)
  }
);

// Access value
console.log(selectedItem.value);

// Lifecycle
selectedItem.deactivate();
selectedItem.destroy();
```

---

## Property Watchers

React to specific property changes:

```javascript
const { PropertyWatcher } = require('jsgui3-html/html-core/ModelBinder');

// Single property
const watcher = new PropertyWatcher(
  model,
  'selectedItem',
  (newVal, oldVal, propName) => {
    console.log(`${propName} changed: ${oldVal} → ${newVal}`);
  }
);

// Multiple properties
const multiWatcher = new PropertyWatcher(
  model,
  ['firstName', 'lastName', 'email'],
  (newVal, oldVal, propName) => {
    console.log(`${propName} updated`);
    this.validate();
  },
  {
    immediate: false,  // Don't call on creation (default: false)
    deep: false,       // Deep watch nested objects (default: false)
    debug: false       // Log changes (default: false)
  }
);

// Cleanup
watcher.unwatch();
watcher.deactivate();
```

---

## Transformations

Built-in formatters and parsers:

```javascript
const { Transformations } = require('jsgui3-html/html-core/Transformations');

// Date transformations
Transformations.date.toISO(date);                    // → "2025-11-30T12:00:00.000Z"
Transformations.date.toLocale(date, 'en-US');        // → "11/30/2025"
Transformations.date.format(date, 'YYYY-MM-DD');     // → "2025-11-30"
Transformations.date.parse('2025-11-30');            // → Date object
Transformations.date.parseFormat('30/11/2025', 'DD/MM/YYYY');

// Number transformations
Transformations.number.toFixed(3.14159, 2);          // → "3.14"
Transformations.number.toLocale(1234567);            // → "1,234,567"
Transformations.number.toCurrency(99.99, 'USD');     // → "$99.99"
Transformations.number.toPercent(0.85, 1);           // → "85.0%"
Transformations.number.parse('$1,234.56');           // → 1234.56
Transformations.number.clamp(0, 100)(150);           // → 100

// String transformations
Transformations.string.toUpper('hello');             // → "HELLO"
Transformations.string.toLower('HELLO');             // → "hello"
Transformations.string.capitalize('hello world');    // → "Hello world"
Transformations.string.trim('  hello  ');            // → "hello"
Transformations.string.truncate(10)('Long text here');  // → "Long text..."

// Boolean transformations
Transformations.boolean.toBool('yes');               // → true
Transformations.boolean.toYesNo(true);               // → "Yes"

// Array transformations
Transformations.array.join(', ')(['a', 'b', 'c']);   // → "a, b, c"
Transformations.array.filter(x => x > 0)([-1, 0, 1, 2]);  // → [1, 2]

// Composition
const formatPrice = Transformations.compose(
  Transformations.number.clamp(0, 10000),
  (n) => Transformations.number.toCurrency(n, 'USD')
);
formatPrice(15000);  // → "$10,000.00"
```

---

## Validators

Built-in validation functions:

```javascript
const { Validators } = require('jsgui3-html/html-core/Transformations');

// Basic validators (return boolean)
Validators.required('hello');        // → true
Validators.required('');             // → false

Validators.email('test@example.com'); // → true
Validators.email('invalid');          // → false

Validators.url('https://example.com'); // → true

// Parameterized validators (curried)
Validators.range(0, 100)(50);        // → true
Validators.range(0, 100)(150);       // → false

Validators.length(3, 20)('hello');   // → true (length 5 is in range)
Validators.length(3, 20)('hi');      // → false (length 2 < 3)

Validators.pattern(/^[A-Z]/)('Hello'); // → true
Validators.pattern(/^[A-Z]/)('hello'); // → false

// Form validation example
class FormControl extends Data_Model_View_Model_Control {
  _setupValidation() {
    this.computed(
      this.data.model,
      ['email', 'password', 'age'],
      (email, password, age) => {
        const errors = {};
        
        if (!Validators.required(email)) {
          errors.email = 'Email is required';
        } else if (!Validators.email(email)) {
          errors.email = 'Invalid email format';
        }
        
        if (!Validators.length(8, 50)(password)) {
          errors.password = 'Password must be 8-50 characters';
        }
        
        if (age && !Validators.range(18, 120)(age)) {
          errors.age = 'Age must be 18-120';
        }
        
        this.view.data.model.errors = errors;
        this.view.data.model.isValid = Object.keys(errors).length === 0;
        
        return errors;
      },
      { propertyName: 'validationResult', target: this.view.data.model }
    );
  }
}
```

---

## When to Use Which Pattern

### Simple Control (No State)
✅ **Use when**:
- Display-only, no user interaction
- Data doesn't change after render
- No need to sync with other components

❌ **Avoid when**:
- Data needs to update
- User can modify values
- Multiple components share state

### MVC (Manual State)
✅ **Use when**:
- Simple interactions (buttons, toggles)
- Need precise control over update timing
- Performance-critical (fewer bindings)
- 1-3 properties to track

❌ **Avoid when**:
- Complex forms with many fields
- Need automatic synchronization
- Multiple computed/derived values

### MVVM (Data Binding)
✅ **Use when**:
- Forms with validation
- Master-detail relationships
- Data grids with editing
- Many derived/computed values
- Need undo/redo capability
- Complex state synchronization

❌ **Avoid when**:
- Simple display-only controls
- High-frequency updates (profile first)
- Minimal state requirements

---

## Quick Decision Guide

```
┌─────────────────────────────────────────────────────────────────────┐
│                 WHICH PATTERN SHOULD I USE?                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ Does the control have state? │
              └───────────────┬───────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │ NO              │                 │ YES
            ▼                 │                 ▼
┌───────────────────────┐     │     ┌───────────────────────┐
│   SIMPLE CONTROL      │     │     │ More than 3 properties│
│   (Static display)    │     │     │ OR needs computed     │
└───────────────────────┘     │     │ values OR two-way     │
                              │     │ binding?              │
                              │     └───────────┬───────────┘
                              │                 │
                              │   ┌─────────────┼─────────────┐
                              │   │ NO          │             │ YES
                              │   ▼             │             ▼
                              │ ┌─────────────┐ │  ┌─────────────────┐
                              │ │ MVC PATTERN │ │  │  MVVM PATTERN   │
                              │ │ (Manual)    │ │  │  (Data Binding) │
                              │ └─────────────┘ │  └─────────────────┘
                              │                 │
                              └─────────────────┘
```

---

## Import Paths Quick Reference

```javascript
// Base control
const jsgui = require("jsgui3-html");

// MVVM base class
const Data_Model_View_Model_Control = require('jsgui3-html/html-core/Data_Model_View_Model_Control');

// Observable data
const { Data_Object } = require('lang-tools');

// Binding utilities
const { 
  ModelBinder, 
  ComputedProperty, 
  PropertyWatcher,
  BindingManager 
} = require('jsgui3-html/html-core/ModelBinder');

// Transforms and validators
const { 
  Transformations, 
  Validators 
} = require('jsgui3-html/html-core/Transformations');
```

---

## Concise Coding Patterns (Art Playground Style)

When building jsgui3 controls, prefer these concise patterns over verbose alternatives:

### Pattern 1: Destructured Imports

```javascript
// ✅ Concise - destructure what you need
const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

// ❌ Verbose - repeating jsgui. everywhere
const jsgui = require("../jsgui");
// then: new jsgui.Control(...), new jsgui.String_Control(...)
```

### Pattern 2: Local Context Variable

```javascript
// ✅ Concise - local ctx variable
compose() {
  const ctx = this.context;
  const btn = new Control({ context: ctx, tagName: "button" });
  const icon = new Control({ context: ctx, tagName: "span" });
  // ...
}

// ❌ Verbose - repeating this.context
compose() {
  const btn = new Control({ context: this.context, tagName: "button" });
  const icon = new Control({ context: this.context, tagName: "span" });
  // ...
}
```

### Pattern 3: Consolidated Attributes

```javascript
// ✅ Concise - Object.assign for multiple attributes
constructor(spec = {}) {
  super({ ...spec, tagName: "div" });
  Object.assign(this.dom.attributes, {
    "data-jsgui-control": "my_ctrl",
    "data-mode": "default",
    "role": "toolbar"
  });
}

// ❌ Verbose - multiple assignment lines
constructor(spec = {}) {
  super({ ...spec, tagName: "div" });
  this.dom.attributes["data-jsgui-control"] = "my_ctrl";
  this.dom.attributes["data-mode"] = "default";
  this.dom.attributes["role"] = "toolbar";
}
```

### Pattern 4: Single compose() Method

```javascript
// ✅ Concise - single compose() with inline building
compose() {
  const ctx = this.context;
  
  // Header
  const header = new Control({ context: ctx, tagName: "header" });
  header.add_class("my-header");
  header.add(new String_Control({ context: ctx, text: "Title" }));
  this.add(header);
  
  // Content
  const content = new Control({ context: ctx, tagName: "main" });
  content.add_class("my-content");
  this.add(content);
}

// ❌ Verbose - multiple _build* methods
compose() {
  this._buildHeader();
  this._buildContent();
}
_buildHeader() {
  const header = new jsgui.Control({ context: this.context, tagName: "header" });
  // ...
}
_buildContent() { /* ... */ }
```

### Pattern 5: Helper Methods for Repetitive Patterns

```javascript
// ✅ Concise - helper for repetitive elements
class ToolbarControl extends Control {
  compose() {
    this.add(this._btn("select", "⎋ Select", true));
    this.add(this._btn("pan", "✋ Pan"));
    this.add(this._btn("delete", "🗑️ Delete"));
  }
  
  _btn(action, label, active = false) {
    const btn = new Control({ context: this.context, tagName: "button" });
    btn.add_class("toolbar__btn");
    btn.dom.attributes["data-action"] = action;
    if (active) btn.add_class("toolbar__btn--active");
    btn.add(new String_Control({ context: this.context, text: label }));
    return btn;
  }
}

// ❌ Verbose - duplicated code for each button
compose() {
  const btn1 = new Control({ context: this.context, tagName: "button" });
  btn1.add_class("toolbar__btn");
  btn1.dom.attributes["data-action"] = "select";
  btn1.add_class("toolbar__btn--active");
  btn1.add(new String_Control({ context: this.context, text: "⎋ Select" }));
  this.add(btn1);
  
  const btn2 = new Control({ context: this.context, tagName: "button" });
  // ...repeat...
}
```

### Pattern 6: Safe DOM Element Access

```javascript
// ✅ Concise - _el() helper for safe access
class MyControl extends Control {
  _el(ctrl = this) {
    return ctrl?.dom?.el;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this._el();
    el?.addEventListener?.("click", this._onClick.bind(this));
  }
}

// ❌ Verbose - repeated optional chaining
activate() {
  if (this.__active) return;
  this.__active = true;
  
  const el = this.dom?.el;
  if (el && el.addEventListener) {
    el.addEventListener("click", this._onClick.bind(this));
  }
}
```

### Pattern 7: add_class() Takes ONE Class

**⚠️ Critical**: `add_class()` only accepts one class at a time:

```javascript
// ✅ Correct - one class per call
handle.add_class("handle");
handle.add_class("handle--nw");

// ❌ Wrong - multiple args don't work as expected
handle.add_class("handle", "handle--nw");  // Only adds "handle"!
```

### Complete Control Template

```javascript
"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * MyControl - Description of purpose
 * @fires event-name {{ property1, property2 }}
 */
class MyControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    Object.assign(this.dom.attributes, {
      "data-jsgui-control": "my_ctrl"
    });
    this._state = null;
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    // Build inline - no separate _build* methods
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    // Bind events
  }
  
  _el(ctrl = this) {
    return ctrl?.dom?.el;
  }
}

module.exports = { MyControl };
```

---

## See Also

- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Full architecture reference
- [🧠 jsgui3 Research Singularity 🧠.agent.md](../../.github/agents/🧠%20jsgui3%20Research%20Singularity%20🧠.agent.md) - Research agent with deep jsgui3 knowledge
- `node_modules/jsgui3-html/test/mvvm/data-binding.test.js` - MVVM test examples
- `node_modules/jsgui3-html/examples/binding_*.js` - Binding examples
