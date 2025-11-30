# 🧪 jsgui3 Control Lab

**Purpose**: Experimental controls extending `jsgui3-html` for testing, refinement, and potential upstream contribution.

---

## Lab Philosophy

1. **Copy before experimenting** — Make a working copy, then modify
2. **Extend, don't fork** — Lab controls inherit from jsgui3-html base classes
3. **Validate thoroughly** — Each experiment has a check script
4. **Document discoveries** — Findings flow to `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md`
5. **Graduate or deprecate** — Experiments either move to production or get archived

---

## Key Discovery: jsgui3 has MVVM!

jsgui3 includes a full MVVM system most developers don't know about:

- `Data_Model_View_Model_Control` — Base class for stateful controls
- `ModelBinder` — Two-way binding with transforms
- `ComputedProperty` — Derived values
- `PropertyWatcher` — Change observers
- `Transformations` — Built-in formatters (date, number, string, etc.)

**Full analysis**: See `experiments/001-color-palette/MVVM_ANALYSIS.md`

---

## Directory Structure

```
src/ui/lab/
├── README.md                    # This file
├── experiments/                 # Numbered experiment folders
│   ├── 001-color-palette/       # Copied from jsgui3, working baseline
│   │   ├── CellControl.js       # Basic cell with color
│   │   ├── GridControl.js       # Generic grid layout
│   │   ├── ColorGridControl.js  # Color-specific grid
│   │   ├── ColorPaletteControl.js # Complete palette
│   │   ├── palettes.js          # Color palette definitions
│   │   ├── check.js             # 30 verification tests
│   │   ├── MVVM_ANALYSIS.md     # MVVM research for refactor
│   │   └── README.md
│   ├── 002-xxx/
│   └── ...
├── mixins/                      # Experimental mixins
└── utilities/                   # Shared lab utilities
```

---

## Experiment Status

| # | Name | Status | Notes |
|---|------|--------|-------|
| 001 | Color Palette | ✅ Validated | Copied from jsgui3, all 30 checks pass. MVVM research complete. |
| 002 | Color Palette MVVM | 📋 Planned | Refactor 001 using Data_Model_View_Model_Control |

### Status Legend

- 📋 **Planned** — Next up for implementation
- 🔬 **Active** — Currently being developed/tested
- ✅ **Validated** — Works, ready to graduate
- 🚀 **Graduated** — Moved to production code
- ⚠️ **Experimental** — Works but needs more testing
- ❌ **Deprecated** — Did not work out, archived for learning

---

## Creating a New Experiment

### ⚠️ CRITICAL: Copy Working Code First!

**Never experiment on your only working copy.** Always:

1. Copy existing working experiment to new numbered folder
2. Verify copy works (run check.js)
3. THEN make changes

### Steps

1. Create numbered folder: `experiments/XXX-experiment-name/`
2. Copy controls from previous working experiment (if applicable)
3. Implement changes extending jsgui3-html base class
4. Create/update `check.js` verification script
5. Add README.md with hypothesis and findings
6. Update this file's status table

### Experiment Template

```javascript
// experiments/XXX-experiment-name/MyExperimentControl.js
"use strict";

const jsgui = require("jsgui3-html");

/**
 * Experiment: [Name]
 * 
 * HYPOTHESIS: [What you're testing]
 * STATUS: experimental | validated | deprecated
 * 
 * EXTENDS: jsgui.Control (or specific control class)
 * 
 * FINDINGS:
 * - [Discovery 1]
 * - [Discovery 2]
 * 
 * UPSTREAM POTENTIAL: [Could this be merged to jsgui3 core?]
 */
class MyExperimentControl extends jsgui.Control {
  constructor(spec = {}) {
    spec.__type_name = spec.__type_name || "my_experiment";
    super(spec);
    // ... implementation
  }
}

module.exports = { MyExperimentControl };
```

### MVVM Experiment Template

```javascript
const Data_Model_View_Model_Control = require('jsgui3-html/html-core/Data_Model_View_Model_Control');
const { Data_Object } = require('lang-tools');

class MyMVVMControl extends Data_Model_View_Model_Control {
    constructor(spec) {
        super(spec);
        
        // Data model: actual business data
        this.data.model = new Data_Object({
            items: spec.items || [],
            selectedId: null
        });
        
        // View model: derived UI state
        this.view.data.model = new Data_Object({
            selectedItem: null,
            isValid: false
        });
        
        this.setupBindings();
    }
    
    setupBindings() {
        // Computed property example
        this.computed(
            this.data.model,
            ['items', 'selectedId'],
            (items, id) => items.find(i => i.id === id) || null,
            { propertyName: 'selectedItem', target: this.view.data.model }
        );
    }
}
```

---

## Upstream Contribution Path

When an experiment is ready for jsgui3 core:

1. ✅ Check script passes
2. ✅ Works in both server and client contexts
3. ✅ No breaking changes to existing API
4. ✅ Documented with examples
5. ✅ Performance acceptable
6. → Create PR to jsgui3 repo
7. → Track status in this README

---

## Lab Utilities

### Running All Checks

```bash
# Run specific experiment check
node src/ui/lab/experiments/001-color-palette/check.js

# Run all lab experiment checks (if available)
node src/ui/lab/run-all-checks.js
```

### Creating New Experiment

```bash
# Manual copy approach (recommended)
cp -r src/ui/lab/experiments/001-color-palette src/ui/lab/experiments/002-color-palette-mvvm
# Then modify as needed
```
