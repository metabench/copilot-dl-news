"use strict";

/**
 * ColorGridControl - Grid specialized for color display
 * 
 * COPIED FROM: jsgui3-html/controls/organised/0-core/0-basic/1-compositional/color-grid.js
 * MODIFIED: 2025-11-30
 * 
 * Changes from original:
 * - Renamed Color_Grid → ColorGridControl
 * - Updated require paths for lab context
 * - Added JSDoc comments
 * - Cleaned up formatting
 */

const jsgui = require("jsgui3-html");
const { each, tof } = jsgui;
const Control = jsgui.Control;
const v_subtract = jsgui.util?.v_subtract || jsgui.v_subtract;
const { prop, field } = require("obext");

const { GridControl, CellControl } = require("./GridControl");

/**
 * A grid control specialized for displaying color palettes
 */
class ColorGridControl extends GridControl {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {Array} [spec.palette] - Array of colors (hex strings or {hex, name} objects)
   * @param {[number, number]} [spec.grid_size=[12,12]] - [columns, rows]
   * @param {[number, number]} [spec.size] - Pixel size [width, height]
   * @param {string} [spec.cell_selection] - Selection mode: 'single' | 'multi'
   */
  constructor(spec) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "color_grid";
    super(spec);

    this.add_class("color-grid");
    this.internal_relative_div = true;

    // Palette can be array of hex strings or {hex, name, rgb} objects
    prop(this, "palette", spec.palette);

    if (!spec.abstract && !spec.el) {
      this.compose_color_palette_grid();
    }

    this.on("resize", (e_resize) => {
      if (this.grid) {
        const _2_padding = 12;
        const new_grid_size = v_subtract(e_resize.value, [_2_padding, _2_padding]);
        this.grid.size = new_grid_size;
      }
    });
  }

  /**
   * Activate the color grid (client-side)
   */
  activate() {
    if (!this.__active) {
      super.activate();

      // Listen for selection changes
      if (this.grid && this.grid.selection_scope) {
        this.grid.selection_scope.on("change", (e) => {
          const { name, value } = e;
          if (name === "selected") {
            const selected_ctrl = value;
            if (selected_ctrl) {
              const color = selected_ctrl._color;
              this.raise("choose-color", { value: color });
            }
          }
        });
      }
    }
  }

  /**
   * Iterate over all cells
   * @param {Function} cb - Callback(cell, [x, y])
   */
  each_cell(cb) {
    return this.grid ? this.grid.each_cell(cb) : null;
  }

  /**
   * Populate grid cells with palette colors
   */
  add_grid_cells() {
    if (this.palette) {
      let c = 0;
      this.grid.each_cell((cell) => {
        const item = this.palette[c++];
        if (item) {
          if (item.hex) {
            cell.color = item.hex;
          } else if (typeof item === "string") {
            cell.color = item;
          }
        }
      });
    }
  }

  /**
   * Build the color grid structure
   */
  compose_color_palette_grid() {
    const padding = 6;

    const grid = (this.grid = new GridControl({
      context: this.context,
      grid_size: this.grid_size,
      size: this.size,
      cell_selection: "single"
    }));

    grid.each_cell((cell, [x, y]) => {
      // Cells are ready for color assignment
    });

    this.add(grid);
    this.add_grid_cells();

    this._ctrl_fields = this._ctrl_fields || {};
    this._ctrl_fields.grid = grid;
  }
}

module.exports = { ColorGridControl };
