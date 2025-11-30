# Art Playground Integration Guide: Color Palette

**Purpose**: Step-by-step instructions for integrating color selection into the Art Playground system.

---

## Overview

The Art Playground system needs color selection for:
1. **Stroke color** - For rectangles, ellipses, text outlines
2. **Fill color** - For shape interiors
3. **Text color** - For text components

This guide shows how to add a color picker to the toolbar using jsgui3's built-in controls.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   ArtPlaygroundAppControl                          │
│  src/ui/server/artPlayground/isomorphic/controls/                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────┐                         │
│  │          ToolbarControl               │  ← ADD COLOR SECTION    │
│  │  • Tools: Select, Pan                 │                         │
│  │  • Add: Rectangle, Ellipse, Text      │                         │
│  │  • Actions: Delete                    │                         │
│  │  • [NEW] Colors: FG/BG picker         │                         │
│  └───────────────────────────────────────┘                         │
│                                                                     │
│  ┌───────────────────────────────────────┐                         │
│  │          CanvasControl                │  ← RECEIVES COLOR       │
│  │  • Renders shapes                     │                         │
│  │  • Handles selection                  │                         │
│  └───────────────────────────────────────┘                         │
│                                                                     │
│  Events:                                                            │
│  • 'tool-change' (tool) - From toolbar                             │
│  • 'add-component' (type) - From toolbar                           │
│  • 'delete' - From toolbar                                         │
│  • [NEW] 'color-change' ({ fg, bg }) - From toolbar                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create ColorSelectorControl

Create a dedicated color selector control at:
`src/ui/server/artPlayground/isomorphic/controls/ColorSelectorControl.js`

```javascript
"use strict";

const jsgui = require("../jsgui");
const { prop } = require("obext");

// Import color grid from jsgui3-html
const Color_Grid = require("jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid");

/**
 * Color Selector Control
 * 
 * Provides FG/BG color selection for the Art Playground toolbar.
 * 
 * Events:
 *   'color-change' { fg: string, bg: string, target: 'foreground'|'background' }
 * 
 * Properties (observable):
 *   foreground_color: string (hex)
 *   background_color: string (hex)
 *   active_target: 'foreground' | 'background'
 */
class ColorSelectorControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("color-selector");
    this.dom.attributes["data-jsgui-control"] = "color_selector";
    
    // Observable properties
    prop(this, 'foreground_color', spec.foreground || '#000000');
    prop(this, 'background_color', spec.background || '#FFFFFF');
    prop(this, 'active_target', 'foreground');
    
    if (!spec.el) {
      this._build();
    }
  }
  
  _build() {
    // Preview section - shows current FG/BG
    this._previewSection = this._buildPreviewSection();
    this.add(this._previewSection);
    
    // Color grid section
    this._gridSection = this._buildGridSection();
    this.add(this._gridSection);
  }
  
  _buildPreviewSection() {
    const section = new jsgui.Control({ context: this.context, tagName: "div" });
    section.add_class("color-selector__preview");
    
    // FG box (stacked on top-left)
    this._fgBox = new jsgui.Control({ context: this.context, tagName: "div" });
    this._fgBox.add_class("color-selector__fg");
    this._fgBox.dom.attributes["data-target"] = "foreground";
    this._fgBox.dom.attributes["style"] = `background-color: ${this.foreground_color};`;
    this._fgBox.dom.attributes["title"] = "Foreground color (click to select)";
    section.add(this._fgBox);
    
    // BG box (offset behind)
    this._bgBox = new jsgui.Control({ context: this.context, tagName: "div" });
    this._bgBox.add_class("color-selector__bg");
    this._bgBox.dom.attributes["data-target"] = "background";
    this._bgBox.dom.attributes["style"] = `background-color: ${this.background_color};`;
    this._bgBox.dom.attributes["title"] = "Background color (click to select)";
    section.add(this._bgBox);
    
    // Swap button
    this._swapBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    this._swapBtn.add_class("color-selector__swap");
    this._swapBtn.dom.attributes["title"] = "Swap colors";
    this._swapBtn.add(new jsgui.String_Control({ context: this.context, text: "⇄" }));
    section.add(this._swapBtn);
    
    // Reset button (default B/W)
    this._resetBtn = new jsgui.Control({ context: this.context, tagName: "button" });
    this._resetBtn.add_class("color-selector__reset");
    this._resetBtn.dom.attributes["title"] = "Reset to default";
    this._resetBtn.add(new jsgui.String_Control({ context: this.context, text: "⟲" }));
    section.add(this._resetBtn);
    
    return section;
  }
  
  _buildGridSection() {
    const section = new jsgui.Control({ context: this.context, tagName: "div" });
    section.add_class("color-selector__grid-wrapper");
    
    // Mini palette - essential colors for art
    const palette = [
      // Row 1: Basics + Primary
      '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
      // Row 2: Secondary + Grays  
      '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#C0C0C0',
      // Row 3: Warm colors
      '#FF6B6B', '#FF8C42', '#FFD93D', '#FFF89A', '#F5E6CA',
      // Row 4: Cool colors
      '#6BCB77', '#4D96FF', '#845EC2', '#D65DB1', '#2C3E50'
    ];
    
    this._colorGrid = new Color_Grid({
      context: this.context,
      grid_size: [5, 4],
      palette: palette,
      size: [100, 80],
      cell_selection: 'single'
    });
    section.add(this._colorGrid);
    
    return section;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Wire preview box clicks to change active target
    this._wirePreviewClicks();
    
    // Wire swap/reset buttons
    this._wireActionButtons();
    
    // Wire color grid selection
    this._wireColorGrid();
    
    // Listen to own property changes
    this._wirePropertyChanges();
    
    // Set initial active state
    this._updateActiveState();
  }
  
  _wirePreviewClicks() {
    const fgEl = this._fgBox?.dom?.el;
    const bgEl = this._bgBox?.dom?.el;
    
    if (fgEl?.addEventListener) {
      fgEl.addEventListener('click', () => {
        this.active_target = 'foreground';
      });
    }
    
    if (bgEl?.addEventListener) {
      bgEl.addEventListener('click', () => {
        this.active_target = 'background';
      });
    }
  }
  
  _wireActionButtons() {
    const swapEl = this._swapBtn?.dom?.el;
    const resetEl = this._resetBtn?.dom?.el;
    
    if (swapEl?.addEventListener) {
      swapEl.addEventListener('click', () => this.swapColors());
    }
    
    if (resetEl?.addEventListener) {
      resetEl.addEventListener('click', () => this.resetColors());
    }
  }
  
  _wireColorGrid() {
    this._colorGrid.on('choose-color', (e) => {
      this.setActiveColor(e.value);
    });
  }
  
  _wirePropertyChanges() {
    this.on('change', (e) => {
      switch (e.name) {
        case 'foreground_color':
          this._updatePreviewColor(this._fgBox, e.value);
          this._emitColorChange();
          break;
        case 'background_color':
          this._updatePreviewColor(this._bgBox, e.value);
          this._emitColorChange();
          break;
        case 'active_target':
          this._updateActiveState();
          break;
      }
    });
  }
  
  _updatePreviewColor(box, color) {
    const el = box?.dom?.el;
    if (el) {
      el.style.backgroundColor = color;
    }
  }
  
  _updateActiveState() {
    const fgEl = this._fgBox?.dom?.el;
    const bgEl = this._bgBox?.dom?.el;
    
    if (fgEl?.classList) {
      fgEl.classList.toggle('color-selector__fg--active', this.active_target === 'foreground');
    }
    if (bgEl?.classList) {
      bgEl.classList.toggle('color-selector__bg--active', this.active_target === 'background');
    }
  }
  
  _emitColorChange() {
    this.raise('color-change', {
      fg: this.foreground_color,
      bg: this.background_color,
      target: this.active_target
    });
  }
  
  // === Public API ===
  
  setActiveColor(color) {
    if (this.active_target === 'foreground') {
      this.foreground_color = color;
    } else {
      this.background_color = color;
    }
  }
  
  swapColors() {
    const temp = this.foreground_color;
    this.foreground_color = this.background_color;
    this.background_color = temp;
  }
  
  resetColors() {
    this.foreground_color = '#000000';
    this.background_color = '#FFFFFF';
  }
  
  getColors() {
    return {
      foreground: this.foreground_color,
      background: this.background_color
    };
  }
}

module.exports = { ColorSelectorControl };
```

### Step 2: Add CSS Styles

Add to `src/ui/server/artPlayground/public/css/main.css`:

```css
/* Color Selector */
.color-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
}

.color-selector__preview {
  position: relative;
  width: 48px;
  height: 48px;
}

.color-selector__fg,
.color-selector__bg {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 2px solid #444;
  border-radius: 2px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.color-selector__fg {
  top: 0;
  left: 0;
  z-index: 2;
}

.color-selector__bg {
  bottom: 0;
  right: 0;
  z-index: 1;
}

.color-selector__fg:hover,
.color-selector__bg:hover {
  transform: scale(1.1);
}

.color-selector__fg--active {
  box-shadow: 0 0 0 2px #4a9eff;
}

.color-selector__bg--active {
  box-shadow: 0 0 0 2px #4a9eff;
}

.color-selector__swap,
.color-selector__reset {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #444;
  border-radius: 4px;
  background: #2a2a2a;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-selector__swap:hover,
.color-selector__reset:hover {
  background: #3a3a3a;
  border-color: #666;
}

.color-selector__grid-wrapper {
  padding: 4px;
  background: #1a1a1a;
  border-radius: 4px;
}

/* Override grid cell styles for color picker */
.color-selector .grid .cell {
  border: 1px solid #333;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.color-selector .grid .cell:hover {
  transform: scale(1.15);
  z-index: 10;
  border-color: #fff;
}

.color-selector .grid .cell.selected {
  outline: 2px solid #4a9eff;
  outline-offset: -1px;
}
```

### Step 3: Modify ToolbarControl

Update `ToolbarControl.js` to include the color selector:

```javascript
// Add at top of file
const { ColorSelectorControl } = require("./ColorSelectorControl");

// In _build(), after the Actions section:

// Divider before colors
const divider3 = new jsgui.Control({ context: this.context, tagName: "span" });
divider3.add_class("art-toolbar__divider");
this.add(divider3);

// Colors section
const colorSection = new jsgui.Control({ context: this.context, tagName: "div" });
colorSection.add_class("art-toolbar__section");

const colorLabel = new jsgui.Control({ context: this.context, tagName: "span" });
colorLabel.add_class("art-toolbar__label");
colorLabel.add(new jsgui.String_Control({ context: this.context, text: "Colors:" }));
colorSection.add(colorLabel);

this._colorSelector = new ColorSelectorControl({
  context: this.context,
  foreground: '#000000',
  background: '#FFFFFF'
});
colorSection.add(this._colorSelector);

this.add(colorSection);
```

In `activate()`:

```javascript
// Wire color changes
this._colorSelector.on('color-change', (colorData) => {
  this.raise('color-change', colorData);
});
```

### Step 4: Wire to ArtPlaygroundAppControl

In `ArtPlaygroundAppControl.js`:

```javascript
// In _setupToolbarHandlers() or activate()
this._toolbar.on('color-change', (colorData) => {
  // Update canvas state
  this._canvas.setStrokeColor(colorData.fg);
  this._canvas.setFillColor(colorData.bg);
  
  // Or store for next shape:
  this._currentColors = {
    stroke: colorData.fg,
    fill: colorData.bg
  };
});
```

### Step 5: Update Client Bundle

Ensure the ColorSelectorControl is included in the client bundle. In `src/ui/esbuild/bundle-art-playground.js` (or equivalent):

```javascript
// Ensure Color_Grid is bundled
require('jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid');
```

Then rebuild:
```bash
npm run ui:client-build
```

---

## Event Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Color Selection Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User clicks color in grid                                          │
│         │                                                           │
│         ▼                                                           │
│  Color_Grid fires 'choose-color' { value: '#FF0000' }               │
│         │                                                           │
│         ▼                                                           │
│  ColorSelectorControl._wireColorGrid() catches event                │
│         │                                                           │
│         ▼                                                           │
│  Sets this.foreground_color = '#FF0000' (or background)             │
│         │                                                           │
│         ▼                                                           │
│  obext triggers 'change' event on control                           │
│         │                                                           │
│         ▼                                                           │
│  _wirePropertyChanges() catches change                              │
│         │                                                           │
│         ├─────────────────────┐                                     │
│         │                     │                                     │
│         ▼                     ▼                                     │
│  Update preview box    Emit 'color-change' event                    │
│  style.backgroundColor        │                                     │
│                               ▼                                     │
│                    ToolbarControl catches event                     │
│                               │                                     │
│                               ▼                                     │
│                    Re-raises to ArtPlaygroundAppControl             │
│                               │                                     │
│                               ▼                                     │
│                    Canvas updates stroke/fill colors                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Testing

### Quick Server-Side Check

```javascript
// test-color-selector.js
const { ColorSelectorControl } = require('./src/ui/server/artPlayground/isomorphic/controls/ColorSelectorControl');
const jsgui = require('jsgui3-html');

const context = new jsgui.Page_Context();
const selector = new ColorSelectorControl({ context });

const html = selector.all_html_render();
console.log('Rendered:', html.length, 'chars');
console.log('Has preview:', html.includes('color-selector__fg'));
console.log('Has grid:', html.includes('grid'));
```

### Observable Property Test

```javascript
const events = [];
selector.on('change', e => events.push(e.name));

selector.foreground_color = '#FF0000';
selector.swapColors();

console.log('Events:', events);
// Expected: ['foreground_color', 'foreground_color', 'background_color']
```

---

## Troubleshooting

### Color Grid Not Rendering

**Symptom**: Empty space where grid should be
**Cause**: Color_Grid import path incorrect
**Fix**: Verify path:
```javascript
const Color_Grid = require("jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid");
```

### Click Events Not Working

**Symptom**: Clicking color cells doesn't update
**Cause**: Missing activation or DOM linking
**Fix**: Ensure `activate()` is called after DOM linking:
```javascript
ctrl.dom.el = document.querySelector('[data-jsgui-id="..."]');
jsgui.rec_desc_ensure_ctrl_el_refs(rootEl);
ctrl.activate();
```

### Observable Properties Not Firing

**Symptom**: Setting `foreground_color` doesn't trigger change event
**Cause**: Missing `obext` import or prop() setup
**Fix**: Ensure prop() is called in constructor:
```javascript
const { prop } = require('obext');
prop(this, 'foreground_color', '#000000');  // Before any access
```

---

## See Also

- [README.md](./README.md) - Lab experiment overview
- [MVVM_ANALYSIS.md](./MVVM_ANALYSIS.md) - MVVM patterns comparison
- [ToolbarControl.js](../../../controls/ToolbarControl.js) - Current toolbar implementation
- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](../../../../docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - Full architecture
