# Lab Experiment 001: Color Palette & Selection System

**Status**: `validated`  
**Created**: November 2025  
**Purpose**: Understand jsgui3's Color_Palette and Color_Grid controls for use in Art Playground

---

## Overview

jsgui3 provides a built-in color selection system consisting of:

| Control | Purpose | Location |
|---------|---------|----------|
| `Color_Palette` | Full color picker with FG/BG colors | `jsgui3-html/controls/.../color-palette.js` |
| `Color_Grid` | Grid of selectable color cells | `jsgui3-html/controls/.../color-grid.js` |
| `Grid` | Base grid with selectable cells | `jsgui3-html/controls/.../grid.js` |
| `Cell` | Individual grid cell (colorable) | `jsgui3-html/controls/.../Cell.js` |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Color_Palette                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────┐                         │
│  │         FG/BG Color Grid (2x1)        │  ← Shows current colors │
│  │  ┌─────────────┬─────────────┐        │                         │
│  │  │ Foreground  │ Background  │        │                         │
│  │  └─────────────┴─────────────┘        │                         │
│  └───────────────────────────────────────┘                         │
│                                                                     │
│  ┌───────────────────────────────────────┐                         │
│  │           Color_Grid (12x12)          │  ← Selectable palette   │
│  │  ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐│                         │
│  │  │  │  │  │  │  │  │  │  │  │  │  │  ││                         │
│  │  ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤│                         │
│  │  │  │  │  │  │  │  │  │  │  │  │  │  ││  ... (12 rows)          │
│  │  └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘│                         │
│  └───────────────────────────────────────┘                         │
│                                                                     │
│  Events: 'choose-color' { value: color }                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Observable Properties with `obext`

jsgui3 uses the `obext` library for observable properties:

```javascript
const { prop, field } = require('obext');

// prop() creates observable property with change events
prop(this, 'selected_color', '#FF0000');

// Listen for changes
this.on('change', (e) => {
  if (e.name === 'selected_color') {
    console.log('Color changed:', e.value);
  }
});

// Setting triggers event
this.selected_color = '#00FF00';  // Fires 'change' event
```

**Difference between `prop` and `field`**:
- `prop()` - Observable, fires change events
- `field()` - Non-observable, just a stored value

### 2. Grid Cell Selection

The Grid control supports single or multi-select via `cell_selection`:

```javascript
const grid = new Grid({
  context: this.context,
  grid_size: [12, 12],
  cell_selection: 'single'  // 'single' | 'multi' | undefined
});

// Selection changes via selection_scope
grid.selection_scope.on('change', (e) => {
  if (e.name === 'selected') {
    const cell = e.value;
    console.log('Selected cell color:', cell._color);
  }
});
```

### 3. Color Grid Palette

Color_Grid populates cells from a palette array:

```javascript
const pal_crayola = require('jsgui3-html/html-core/arr_colors');

// Palette format: Array of color objects or strings
// [{ hex: '#FF0000', name: 'Red' }, '#00FF00', ...]

const colorGrid = new Color_Grid({
  context: this.context,
  grid_size: [12, 12],
  palette: pal_crayola,  // Default: Crayola colors
  size: [300, 300]
});

// Listen for color selection
colorGrid.on('choose-color', (e) => {
  console.log('Selected:', e.value);  // Hex color string
});
```

---

## Usage Patterns

### Pattern 1: Basic Color Picker

```javascript
const jsgui = require('jsgui3-html');
const Color_Palette = require('jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-palette');

class MyControl extends jsgui.Control {
  compose() {
    const palette = new Color_Palette({
      context: this.context,
      grid_size: [8, 8],  // Smaller grid
      size: [200, 250]
    });
    
    palette.on('choose-color', (e) => {
      this.handleColorSelect(e.value);
    });
    
    this.add(palette);
  }
  
  handleColorSelect(hexColor) {
    console.log('Color selected:', hexColor);
  }
}
```

### Pattern 2: Custom Palette

```javascript
const customPalette = [
  '#1a1a1a', '#2d2d2d', '#404040',  // Grays
  '#FF6B6B', '#4ECDC4', '#45B7D1',  // Accent colors
  '#96CEB4', '#FFEAA7', '#DDA0DD',  // Pastels
];

const colorGrid = new Color_Grid({
  context: this.context,
  grid_size: [3, 3],
  palette: customPalette,
  cell_selection: 'single'
});
```

### Pattern 3: Foreground/Background Color Selection

```javascript
const { prop } = require('obext');

class FgBgColorControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    
    // Observable color properties
    prop(this, 'foreground_color', spec.foreground || '#000000');
    prop(this, 'background_color', spec.background || '#FFFFFF');
    prop(this, 'active_target', 'foreground');  // Which one to update
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    // FG/BG preview
    this._fgPreview = this._createColorBox(this.foreground_color);
    this._bgPreview = this._createColorBox(this.background_color);
    this.add(this._fgPreview);
    this.add(this._bgPreview);
    
    // Color grid
    this._colorGrid = new Color_Grid({
      context: this.context,
      grid_size: [12, 12],
      cell_selection: 'single'
    });
    this.add(this._colorGrid);
  }
  
  activate() {
    super.activate();
    
    this._colorGrid.on('choose-color', (e) => {
      if (this.active_target === 'foreground') {
        this.foreground_color = e.value;
      } else {
        this.background_color = e.value;
      }
    });
  }
}
```

---

## Integration with Art Playground

### Adding Color Palette to Toolbar

```javascript
// In ToolbarControl.js
const Color_Palette = require('jsgui3-html/controls/.../color-palette');

class ToolbarControl extends jsgui.Control {
  _build() {
    // ... existing toolbar sections ...
    
    // Color section
    const colorSection = new jsgui.Control({ context: this.context, tagName: 'div' });
    colorSection.add_class('art-toolbar__section');
    
    this._colorPalette = new Color_Palette({
      context: this.context,
      grid_size: [8, 4],
      size: [160, 100]
    });
    colorSection.add(this._colorPalette);
    
    this.add(colorSection);
  }
  
  activate() {
    super.activate();
    
    this._colorPalette.on('choose-color', (e) => {
      this.raise('color-change', e.value);
    });
  }
}
```

### Wiring to Canvas

```javascript
// In ArtPlaygroundAppControl.js
_setupToolbarHandlers() {
  // ... existing handlers ...
  
  this._toolbar.on('color-change', (color) => {
    this._canvas.setStrokeColor(color);
  });
}
```

---

## CSS Styling

The color controls need appropriate styling. Add to your CSS:

```css
.color-palette {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface-secondary);
  border-radius: 4px;
}

.color-grid {
  display: flex;
  flex-direction: column;
}

.grid .row {
  display: flex;
}

.grid .cell {
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: transform 0.1s ease;
}

.grid .cell:hover {
  transform: scale(1.1);
  z-index: 1;
}

.grid .cell.selected {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
```

---

## MVVM Considerations

The Color_Palette controls use `obext`'s `prop()` for observability, which is simpler than the full MVVM system but provides:

- ✅ Observable properties with change events
- ✅ Automatic event wiring
- ❌ No two-way binding (manual sync required)
- ❌ No computed properties
- ❌ No transforms/validators

For complex color editing (HSL sliders, history, etc.), consider upgrading to full MVVM with `Data_Model_View_Model_Control`.

---

## Files in This Experiment

| File | Purpose |
|------|---------|
| `README.md` | This documentation |
| `ColorPaletteControl.js` | Custom wrapper control |
| `check.js` | Verification script |
| `MVVM_ANALYSIS.md` | Deep analysis of MVVM patterns |

---

## See Also

- [JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md](../../../../docs/guides/JSGUI3_EFFECTIVE_PATTERNS_QUICK_REFERENCE.md) - MVC/MVVM patterns
- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](../../../../docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Full architecture
- `node_modules/jsgui3-html/html-core/arr_colors.js` - Default Crayola palette
