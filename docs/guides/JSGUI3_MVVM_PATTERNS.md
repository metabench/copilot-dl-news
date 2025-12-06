# jsgui3 MVVM Patterns

_Last Verified: 2025-01-09_

**Authority Level**: This is the **definitive reference** for jsgui3's MVVM system. When working with data binding, computed properties, or complex state management, this file takes precedence.

**When to Read**:
- Building forms with validation
- Implementing two-way data binding
- Creating master-detail views
- Managing complex component state

---

## Overview

jsgui3 has a full MVVM implementation that most developers don't know about!

### The MVVM Classes

| Class | Purpose | Location |
|-------|---------|----------|
| `Data_Model_View_Model_Control` | Base class for MVVM controls | `html-core/Data_Model_View_Model_Control.js` |
| `ModelBinder` | Two-way binding between models | `html-core/ModelBinder.js` |
| `ComputedProperty` | Derived/computed values | `html-core/ModelBinder.js` |
| `PropertyWatcher` | Watch for property changes | `html-core/ModelBinder.js` |
| `Transformations` | Data formatters/parsers | `html-core/Transformations.js` |
| `Validators` | Validation functions | `html-core/Transformations.js` |

---

## Basic MVVM Control Structure

```javascript
const Data_Model_View_Model_Control = require('jsgui3-html/html-core/Data_Model_View_Model_Control');
const { Data_Object } = require('lang-tools');

class MyControl extends Data_Model_View_Model_Control {
    constructor(spec) {
        super(spec);
        
        // DATA MODEL - The actual data (business logic)
        this.data.model = new Data_Object({
            items: [],
            selectedId: null
        });
        
        // VIEW MODEL - Derived state for the UI
        this.view.data.model = new Data_Object({
            selectedItem: null,
            itemCount: 0,
            isValid: false
        });
        
        this.setupBindings();
    }
    
    setupBindings() {
        // 1. Simple binding with transform
        this.bind({
            'items': {
                to: 'itemCount',
                transform: (items) => items.length
            }
        });
        
        // 2. Computed property from multiple inputs
        this.computed(
            this.data.model,
            ['items', 'selectedId'],
            (items, id) => items.find(i => i.id === id) || null,
            { propertyName: 'selectedItem', target: this.view.data.model }
        );
        
        // 3. Watch for changes
        this.watch(this.view.data.model, 'selectedItem', (item, oldItem) => {
            console.log('Selection changed:', oldItem, '→', item);
            this.raise('selection-changed', { item });
        });
    }
}
```

---

## Two-Way Binding with Transforms

```javascript
// Bind date with formatting/parsing
this.bind({
    'date': {
        to: 'displayDate',
        transform: (date) => this.transforms.date.format(date, 'YYYY-MM-DD'),
        reverse: (str) => this.transforms.date.parseFormat(str, 'YYYY-MM-DD')
    }
});

// Bind number with currency formatting
this.bind({
    'price': {
        to: 'displayPrice',
        transform: (num) => this.transforms.number.toCurrency(num, 'USD'),
        reverse: (str) => this.transforms.number.parse(str)
    }
});
```

---

## Built-in Transformations

```javascript
// Available via this.transforms
Transformations.date.toISO(date)
Transformations.date.toLocale(date, locale)
Transformations.date.format(date, 'YYYY-MM-DD')

Transformations.number.toFixed(num, 2)
Transformations.number.toCurrency(num, 'USD')
Transformations.number.toPercent(num)
Transformations.number.clamp(0, 100)(num)

Transformations.string.toUpper(str)
Transformations.string.capitalize(str)
Transformations.string.truncate(50)(str)

Transformations.boolean.toBool(value)
Transformations.boolean.toYesNo(value)

Transformations.array.join(', ')(arr)
Transformations.array.filter(predicate)(arr)

Transformations.compose(fn1, fn2, fn3)(value)  // Chain transforms
```

---

## Built-in Validators

```javascript
// Available via this.validators
Validators.required(value)
Validators.email(value)
Validators.url(value)
Validators.range(0, 100)(value)
Validators.length(3, 50)(value)
Validators.pattern(/^[A-Z]/)(value)
```

---

## MVVM Form Example with Validation

```javascript
class FormControl extends Data_Model_View_Model_Control {
    constructor(spec) {
        super(spec);
        
        this.data.model = new Data_Object({
            username: '',
            email: '',
            age: null
        });
        
        this.view.data.model = new Data_Object({
            errors: {},
            isValid: false
        });
        
        // Validate on any data change
        this.computed(
            this.data.model,
            ['username', 'email', 'age'],
            (username, email, age) => {
                const errors = {};
                
                if (!Validators.required(username)) {
                    errors.username = 'Required';
                } else if (!Validators.length(3, 20)(username)) {
                    errors.username = 'Must be 3-20 characters';
                }
                
                if (!Validators.email(email)) {
                    errors.email = 'Invalid email';
                }
                
                if (age !== null && !Validators.range(0, 120)(age)) {
                    errors.age = 'Must be 0-120';
                }
                
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

## When to Use MVVM vs Simple Controls

| Scenario | Recommendation |
|----------|----------------|
| Simple display-only control | Regular `Control` |
| 1-2 observable properties | `prop()` from obext |
| Complex form with validation | **MVVM** ✓ |
| Master-detail patterns | **MVVM** ✓ |
| Controls needing undo/redo | **MVVM** ✓ |
| Deeply nested state | **MVVM** ✓ |
| High-frequency updates | Profile first |

---

## Debugging MVVM Controls

```javascript
// Inspect all bindings on a control
console.log(control.inspectBindings());
// Returns:
// {
//   binders: [{ sourceValue, targetValue, hasTransform, ... }],
//   computed: [{ propertyName, dependencies, value }],
//   watchers: [{ property, active }]
// }
```

---

## Related Files

- `src/ui/lab/experiments/001-color-palette/MVVM_ANALYSIS.md` - Full research notes
- `node_modules/jsgui3-html/html-core/Data_Model_View_Model_Control.js` - Source
- `node_modules/jsgui3-html/html-core/ModelBinder.js` - Binding implementation

---

_Last updated: 2025-12-01_
_Source: Lab experiment 001-color-palette_
