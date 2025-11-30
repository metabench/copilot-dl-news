"use strict";

/**
 * ColorPaletteControl - Complete color palette with FG/BG selection
 * 
 * COPIED FROM: jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-palette.js
 * MODIFIED: 2025-11-30
 * 
 * Changes from original:
 * - Renamed Color_Palette → ColorPaletteControl
 * - Updated require paths for lab context
 * - Added JSDoc comments
 * - Cleaned up formatting
 * - Made palette more configurable
 */

const jsgui = require("jsgui3-html");
const Control = jsgui.Control;
const v_subtract = jsgui.util?.v_subtract || jsgui.v_subtract;
const { prop, field } = require("obext");

const { ColorGridControl } = require("./ColorGridControl");
const { PALETTES } = require("./palettes");

/**
 * A complete color palette control with foreground/background selection
 * and a main color grid
 */
class ColorPaletteControl extends Control {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {Array|string} [spec.palette='crayola'] - Palette array or name ('crayola', 'luxuryObsidian')
   * @param {[number, number]} [spec.grid_size=[12,12]] - Grid dimensions
   * @param {[number, number]} [spec.size] - Control size in pixels
   */
  constructor(spec) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "color_palette";
    super(spec);

    this.add_class("color-palette");

    // Resolve palette - can be array or named palette
    let palette = spec.palette;
    if (typeof palette === "string") {
      palette = PALETTES[palette] || PALETTES.crayola;
    }
    prop(this, "palette", palette || PALETTES.crayola);

    prop(this, "grid_size", spec.grid_size || [12, 12]);

    // Current foreground/background colors
    // Note: Using _fg/_bg to avoid conflict with jsgui3's .background property
    this._fg = spec.foreground || "#000000";
    this._bg = spec.background || "#FFFFFF";

    if (!spec.abstract && !spec.el) {
      this.compose_color_grid();
    }

    this.on("resize", (e_resize) => {
      // Handle resize if needed
    });
  }

  /**
   * Activate the palette (client-side event binding)
   */
  activate() {
    if (!this.__active) {
      super.activate();

      // Helper for named property change handlers
      const attach_on_change_named_property_handler = (obj, property_name, fn_handler) => {
        obj.on("change", (e) => {
          if (property_name === e.name) {
            fn_handler(e);
          }
        });
      };

      // When selection changes, raise choose-color event
      attach_on_change_named_property_handler(this, "selected", (e) => {
        const selected_ctrl = e.value;
        if (selected_ctrl) {
          const color = selected_ctrl._color;
          this.raise("choose-color", { value: color });
        }
      });
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
      palette: [this._fg, this._bg]
    });
    this.add(fg_bg_color_grid);

    // Main color grid
    const color_grid_pxsize = this.size ? v_subtract(this.size, [0, 46]) : [240, 240];

    const color_grid = (this.grid = new ColorGridControl({
      context: this.context,
      grid_size: this.grid_size,
      palette: this.palette,
      size: color_grid_pxsize,
      cell_selection: "single"
    }));
    this.add(color_grid);

    this._ctrl_fields = this._ctrl_fields || {};
    this._ctrl_fields.color_grid = color_grid;
    this._ctrl_fields.fg_bg_color_grid = fg_bg_color_grid;
  }

  /**
   * Get the currently selected color
   * @returns {string|null} Hex color or null
   */
  get selectedColor() {
    return this._selectedColor || null;
  }

  /**
   * Set the foreground color
   * @param {string} color - Hex color
   */
  setForeground(color) {
    this._fg = color;
    // Update the FG/BG display if it exists
    if (this._ctrl_fields?.fg_bg_color_grid) {
      // Would need to refresh the display
    }
  }

  /**
   * Get the foreground color
   */
  get foregroundColor() {
    return this._fg;
  }

  /**
   * Set the background color
   * @param {string} color - Hex color
   */
  setBackgroundColor(color) {
    this._bg = color;
  }

  /**
   * Get the background color
   */
  get backgroundColor() {
    return this._bg;
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
