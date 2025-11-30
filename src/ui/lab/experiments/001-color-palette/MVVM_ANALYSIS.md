# MVVM Analysis for Color Palette Controls

## Research Summary

**Date**: 2025-11-30  
**Researcher**: 🧠 jsgui3 Research Singularity 🧠  
**Status**: Research Complete, Ready for Experiment 002

---

## What is MVVM?

**Model-View-ViewModel** is a pattern that separates:

| Layer | Responsibility | jsgui3 Implementation |
|-------|---------------|----------------------|
| **Model** | Application data (business logic) | `this.data.model` (Data_Object) |
| **View** | UI representation (DOM) | Control's `compose()` / `all_html_render()` |
| **ViewModel** | View state, transformations, validation | `this.view.data.model` (Data_Object) |

```
┌──────────────────────────────────────────────────────────────────┐
│                        MVVM Data Flow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐     ┌──────────────┐     ┌─────────────────┐      │
│   │  MODEL  │ ──▶ │  VIEW MODEL  │ ──▶ │     VIEW        │      │
│   │ (data)  │     │ (transforms) │     │ (DOM/controls)  │      │
│   └────▲────┘     └──────────────┘     └────────┬────────┘      │
│        │                                         │               │
│        └─────────────────────────────────────────┘               │
│                    User Interaction                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## jsgui3's MVVM Implementation

### Key Classes

1. **`Data_Model_View_Model_Control`** (`html-core/Data_Model_View_Model_Control.js`)
   - Base class extending `Ctrl_Enh`
   - Sets up `this.data.model` and `this.view.data.model`
   - Includes `BindingManager` for automatic sync
   - Provides `bind()`, `computed()`, `watch()` methods

2. **`ModelBinder`** (`html-core/ModelBinder.js`)
   - Two-way data binding between models
   - Supports transformations (forward/reverse)
   - Loop prevention with locks
   - Debug mode for tracing

3. **`ComputedProperty`** (`html-core/ModelBinder.js`)
   - Auto-updates when dependencies change
   - Similar to Vue's computed properties

4. **`PropertyWatcher`** (`html-core/ModelBinder.js`)
   - Watch for changes to specific properties
   - Similar to Vue's watch

5. **`Transformations`** (`html-core/Transformations.js`)
   - Built-in transformers: date, number, string, boolean, array, object
   - Composable: `compose(...fns)`
   - Bidirectional: `bidirectional(forward, reverse)`

---

## Example: ComplexForm from jsgui3 Tests

```javascript
class ComplexForm extends Data_Model_View_Model_Control {
    constructor(spec) {
        super(spec);
        
        // DATA MODEL - The actual form data
        this.data.model = new Data_Object({
            username: '',
            email: '',
            password: '',
            confirmPassword: ''
        });
        
        // VIEW MODEL - Derived view state
        this.view.data.model = new Data_Object({
            errors: {},
            isValid: false
        });
        
        this.setupValidation();
    }
    
    setupValidation() {
        // Computed property: derive validation state from form data
        this.computed(
            [this.data.model, this.view.data.model],
            ['username', 'email', 'password', 'confirmPassword'],
            (username, email, password, confirmPassword) => {
                const errors = {};
                
                if (!username || username.length < 3) {
                    errors.username = 'Username must be at least 3 characters';
                }
                // ... more validation
                
                this.view.data.model.errors = errors;
                this.view.data.model.isValid = Object.keys(errors).length === 0;
                
                return errors;
            },
            { propertyName: 'validationErrors', target: this.view.data.model }
        );
    }
}
```

---

## How MVVM Could Improve ColorPaletteControl

### Current State (001-color-palette)

```javascript
class ColorPaletteControl extends Control {
    constructor(spec) {
        // ❌ Data stored as instance properties
        this._fg = spec.foreground || "#000000";
        this._bg = spec.background || "#FFFFFF";
        
        // ❌ Palette stored via obext prop() 
        prop(this, "palette", palette || PALETTES.crayola);
        prop(this, "grid_size", spec.grid_size || [12, 12]);
    }
}
```

**Problems with current approach:**
1. **No separation of concerns** - Color data mixed with control logic
2. **Manual change propagation** - Have to manually update child controls
3. **No derived state** - No computed properties for things like "is selection valid?"
4. **No undo/redo support** - Changes are direct mutations

### Proposed MVVM Structure

```javascript
class ColorPaletteControl extends Data_Model_View_Model_Control {
    constructor(spec) {
        super(spec);
        
        // DATA MODEL - The palette's actual data
        this.data.model = new Data_Object({
            palette: spec.palette || PALETTES.crayola,
            foreground: spec.foreground || "#000000",
            background: spec.background || "#FFFFFF",
            selectedIndex: null
        });
        
        // VIEW MODEL - View-specific derived state
        this.view.data.model = new Data_Object({
            gridSize: spec.grid_size || [12, 12],
            hoveredIndex: null,
            selectedColor: null,
            displayForeground: "",  // Could be formatted differently
            displayBackground: ""
        });
        
        this.setupBindings();
    }
    
    setupBindings() {
        // Bind foreground with display formatting
        this.bind({
            'foreground': {
                to: 'displayForeground',
                transform: (color) => color.toUpperCase()  // Display as #FFFFFF
            }
        });
        
        // Computed: selected color from palette + index
        this.computed(
            this.data.model,
            ['palette', 'selectedIndex'],
            (palette, index) => {
                if (index === null || !palette[index]) return null;
                return palette[index];
            },
            { propertyName: 'selectedColor', target: this.view.data.model }
        );
        
        // Watch for selection changes
        this.watch(this.view.data.model, 'selectedColor', (color) => {
            if (color) {
                this.raise('choose-color', { value: color });
            }
        });
    }
}
```

---

## Benefits of MVVM Refactor

### 1. **Clear Data Separation**

| Before | After |
|--------|-------|
| `this._fg` | `this.data.model.foreground` |
| `this._bg` | `this.data.model.background` |
| `this.palette` | `this.data.model.palette` |
| `this.grid_size` | `this.view.data.model.gridSize` |

### 2. **Automatic Change Propagation**

```javascript
// Before: Manual propagation
setForeground(color) {
    this._fg = color;
    if (this._ctrl_fields?.fg_bg_color_grid) {
        // Manually refresh display...
    }
}

// After: Automatic via binding
// Just set the data model, view updates automatically
this.data.model.foreground = color;
```

### 3. **Computed Properties for Derived State**

```javascript
// Example: Is current selection valid for CSS?
this.computed(
    this.data.model,
    ['selectedIndex', 'palette'],
    (index, palette) => {
        if (index === null) return { valid: false, reason: 'Nothing selected' };
        const color = palette[index];
        if (!color) return { valid: false, reason: 'Invalid index' };
        return { valid: true, color };
    },
    { propertyName: 'selectionStatus', target: this.view.data.model }
);
```

### 4. **Easy Debugging**

```javascript
// Inspect all bindings
console.log(control.inspectBindings());
// {
//   binders: [...],
//   computed: [{ propertyName: 'selectedColor', dependencies: [...], value: '#FF0000' }],
//   watchers: [...]
// }
```

### 5. **Testability**

```javascript
// Can test data model independently of view
const model = new Data_Object({
    palette: ['#FF0000', '#00FF00'],
    selectedIndex: 0
});
// Test logic without needing DOM
```

---

## Implementation Plan for Experiment 002

### Step 1: Create 002-color-palette-mvvm/

Copy all files from 001 to 002 **before making any changes**.

```
src/ui/lab/experiments/
├── 001-color-palette/          ← Working baseline (DO NOT TOUCH)
└── 002-color-palette-mvvm/     ← MVVM refactor
    ├── CellControl.js          ← MVVM version
    ├── GridControl.js          ← MVVM version  
    ├── ColorGridControl.js     ← MVVM version
    ├── ColorPaletteControl.js  ← MVVM version
    ├── palettes.js             ← Same (data only)
    ├── check.js                ← Updated tests
    └── index.js                ← Updated exports
```

### Step 2: Refactor Bottom-Up

1. **CellControl** → Add `data.model.color`, `view.data.model.isSelected`
2. **GridControl** → Add `data.model.items`, `view.data.model.selection`
3. **ColorGridControl** → Inherit from GridControl MVVM
4. **ColorPaletteControl** → Full MVVM with bindings

### Step 3: Validate

- All 30 existing tests must pass
- Add new tests for:
  - Data model changes propagate to view
  - View state changes propagate via events
  - Computed properties update correctly
  - Memory cleanup on destroy()

---

## When to Use MVVM vs Simple Controls

| Scenario | Recommendation |
|----------|----------------|
| Simple display-only control | Regular Control |
| Control with 1-2 properties | `prop()` from obext is fine |
| Complex form with validation | **MVVM** |
| Master-detail patterns | **MVVM** |
| Controls that need undo/redo | **MVVM** |
| Deeply nested state | **MVVM** |
| High-frequency updates | Profile first, MVVM may add overhead |

---

## References

- `node_modules/jsgui3-html/html-core/Data_Model_View_Model_Control.js`
- `node_modules/jsgui3-html/html-core/ModelBinder.js`
- `node_modules/jsgui3-html/html-core/Transformations.js`
- `node_modules/jsgui3-html/test/integration/complex-scenarios.test.js`

---

## Next Steps

**Pending User Decision**: Should we proceed with creating experiment 002-color-palette-mvvm?

The refactor would:
1. ✅ Keep 001 as working baseline
2. ✅ Create full MVVM version in 002
3. ✅ Demonstrate jsgui3 MVVM patterns
4. ✅ Provide cleaner, more maintainable code
5. ✅ Enable future features (undo/redo, serialization)
