"use strict";

/**
 * ColorPaletteControl (MVVM) - Complete color palette with FG/BG selection using MVVM
 * 
 * EXPERIMENT: 002-color-palette-mvvm
 * BASED ON: 001-color-palette/ColorPaletteControl.js
 * REFACTORED: 2025-11-30 to use Data_Model_View_Model_Control
 * 
 * MVVM Structure:
 * - data.model: { palette, foreground, background, selectedIndex }
 * - view.data.model: { selectedColor, displayForeground, displayBackground, colorCount }
 */

const jsgui = require("jsgui3-html");
const Control = jsgui.Control;
const v_subtract = jsgui.util?.v_subtract || jsgui.v_subtract;
const Data_Model_View_Model_Control = require("jsgui3-html/html-core/Data_Model_View_Model_Control");

const { ColorGridControl } = require("./ColorGridControl");
const { PALETTES } = require("./palettes");

/**
 * A complete color palette control with foreground/background selection
 * and a main color grid, using MVVM pattern
 */
class ColorPaletteControl extends Data_Model_View_Model_Control {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {Array|string} [spec.palette='crayola'] - Palette array or name
   * @param {[number, number]} [spec.grid_size=[12,12]] - Grid dimensions
   * @param {[number, number]} [spec.size] - Control size in pixels
   * @param {string} [spec.foreground='#000000'] - Initial foreground color
   * @param {string} [spec.background='#FFFFFF'] - Initial background color
   */
  constructor(spec) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "color_palette";
    super(spec);

    this.add_class("color-palette");

    // Resolve palette - can be array or named palette
    let paletteData = spec.palette;
    if (typeof paletteData === "string") {
      paletteData = PALETTES[paletteData] || PALETTES.crayola;
    }
    paletteData = paletteData || PALETTES.crayola;

    // DATA MODEL - The palette's actual data
    // Note: Extend existing model to preserve jsgui3 internals
    const dm = this.data.model;
    dm.palette = paletteData;
    dm.gridSize = spec.grid_size || [12, 12];
    dm.foreground = spec.foreground || "#000000";
    dm.background = spec.background || "#FFFFFF";
    dm.selectedIndex = null;

    // VIEW MODEL - UI-specific state
    // Note: Extend existing view.data.model to preserve mixins collection
    const vdm = this.view.data.model;
    vdm.selectedColor = null;
    vdm.displayForeground = spec.foreground || "#000000";
    vdm.displayBackground = spec.background || "#FFFFFF";
    vdm.colorCount = paletteData.length;
    vdm.isSelectionActive = false;

    this._setupBindings();

    if (!spec.abstract && !spec.el) {
      this.compose_color_grid();
    }

    this.on("resize", (e_resize) => {
      // Handle resize if needed
    });
  }

  /**
   * Setup MVVM bindings
   * @private
   */
  _setupBindings() {
    const dm = this.data.model;
    const vdm = this.view.data.model;

    // Set initial computed values directly
    // (Reactive binding requires obext fields which fire change events)
    vdm.displayForeground = dm.foreground?.toUpperCase() || '#000000';
    vdm.displayBackground = dm.background?.toUpperCase() || '#FFFFFF';
    vdm.colorCount = dm.palette?.length || 0;
    vdm.selectedColor = dm.selectedIndex !== null && dm.palette?.[dm.selectedIndex]
      ? (dm.palette[dm.selectedIndex].hex || dm.palette[dm.selectedIndex])
      : null;

    // Watch for foreground changes
    this.watch(this.data.model, 'foreground', (color) => {
      this.view.data.model.displayForeground = color?.toUpperCase() || '#000000';
    });

    // Watch for background changes
    this.watch(this.data.model, 'background', (color) => {
      this.view.data.model.displayBackground = color?.toUpperCase() || '#FFFFFF';
    });

    // Watch for palette changes
    this.watch(this.data.model, 'palette', (palette) => {
      this.view.data.model.colorCount = palette?.length || 0;
    });

    // Watch for selectedIndex changes
    this.watch(this.data.model, 'selectedIndex', (index) => {
      const palette = this.data.model.palette;
      if (index !== null && palette?.[index]) {
        const item = palette[index];
        this.view.data.model.selectedColor = item.hex || item;
      } else {
        this.view.data.model.selectedColor = null;
      }
    });

    // Watch for selected color changes and emit events
    this.watch(this.view.data.model, 'selectedColor', (color, oldColor) => {
      if (color) {
        this.raise('choose-color', { value: color, previous: oldColor });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Property Accessors (backward compatibility)
  // ═══════════════════════════════════════════════════════════════

  get palette() { return this.data.model.palette; }
  set palette(v) { this.data.model.palette = v; }

  get grid_size() { return this.data.model.gridSize; }
  set grid_size(v) { this.data.model.gridSize = v; }

  // Legacy _fg/_bg renamed to use data model
  get _fg() { return this.data.model.foreground; }
  set _fg(v) { this.data.model.foreground = v; }

  get _bg() { return this.data.model.background; }
  set _bg(v) { this.data.model.background = v; }

  /**
   * Activate the palette (client-side event binding)
   */
  activate() {
    if (!this.__active) {
      super.activate();

      // Listen for grid selection changes
      if (this._ctrl_fields?.color_grid) {
        this._ctrl_fields.color_grid.on('choose-color', (e) => {
          this.view.data.model.selectedColor = e.value;
        });
      }
    }
  }

  /**
   * Build the color palette structure
   */
  compose_color_grid() {
    const padding = 6;

    // Foreground/Background selector (2x1 grid)
    const fg_bg_color_grid = new ColorGridControl({
      context: this.context,
      grid_size: [2, 1],
      size: [80, 40],
      palette: [this.data.model.foreground, this.data.model.background]
    });
    this.add(fg_bg_color_grid);

    // Main color grid
    const color_grid_pxsize = this.size ? v_subtract(this.size, [0, 46]) : [240, 240];

    const color_grid = (this.grid = new ColorGridControl({
      context: this.context,
      grid_size: this.data.model.gridSize,
      palette: this.data.model.palette,
      size: color_grid_pxsize,
      cell_selection: "single"
    }));
    this.add(color_grid);

    this._ctrl_fields = this._ctrl_fields || {};
    this._ctrl_fields.color_grid = color_grid;
    this._ctrl_fields.fg_bg_color_grid = fg_bg_color_grid;
  }

  // ═══════════════════════════════════════════════════════════════
  // Public API Methods (MVVM-aware)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the currently selected color
   * @returns {string|null} Hex color or null
   */
  get selectedColor() {
    return this.view.data.model.selectedColor;
  }

  /**
   * Set the foreground color
   * @param {string} color - Hex color
   */
  setForeground(color) {
    this.data.model.foreground = color;
    // FG/BG display will auto-update via binding
  }

  /**
   * Get the foreground color
   */
  get foregroundColor() {
    return this.data.model.foreground;
  }

  /**
   * Set the background color
   * @param {string} color - Hex color
   */
  setBackgroundColor(color) {
    this.data.model.background = color;
  }

  /**
   * Get the background color
   */
  get backgroundColor() {
    return this.data.model.background;
  }

  /**
   * Select a color by index in the palette
   * @param {number} index - Color index
   */
  selectByIndex(index) {
    this.data.model.selectedIndex = index;
  }

  /**
   * Inspect the MVVM state (for debugging)
   */
  inspect() {
    return {
      dataModel: {
        foreground: this.data.model.foreground,
        background: this.data.model.background,
        selectedIndex: this.data.model.selectedIndex,
        paletteSize: this.data.model.palette?.length
      },
      viewModel: {
        selectedColor: this.view.data.model.selectedColor,
        displayForeground: this.view.data.model.displayForeground,
        displayBackground: this.view.data.model.displayBackground,
        colorCount: this.view.data.model.colorCount
      },
      bindings: this.inspectBindings?.() || null
    };
  }
}

// Static CSS for the color palette
ColorPaletteControl.css = `
.color-palette {
  display: inline-block;
  padding: 8px;
  background: #1a1a1a;
  border-radius: 4px;
}

.color-palette .color-grid {
  margin-top: 8px;
}

.color-palette .color-grid .cell {
  cursor: pointer;
  transition: transform 0.1s ease;
}

.color-palette .color-grid .cell:hover {
  transform: scale(1.1);
  z-index: 1;
  position: relative;
}

.color-palette .color-grid .cell.selected {
  border: 2px solid #fff !important;
  box-shadow: 0 0 4px rgba(255,255,255,0.5);
}
`;

module.exports = { ColorPaletteControl };
