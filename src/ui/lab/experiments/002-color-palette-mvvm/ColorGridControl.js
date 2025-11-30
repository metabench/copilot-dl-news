"use strict";

/**
 * ColorGridControl (MVVM) - Grid specialized for color display using MVVM
 * 
 * EXPERIMENT: 002-color-palette-mvvm
 * BASED ON: 001-color-palette/ColorGridControl.js
 * REFACTORED: 2025-11-30 to use Data_Model_View_Model_Control pattern
 * 
 * MVVM Structure:
 * - data.model: { palette, gridSize }
 * - view.data.model: { selectedColor, colorCount }
 */

const jsgui = require("jsgui3-html");
const { each, tof } = jsgui;
const Control = jsgui.Control;
const v_subtract = jsgui.util?.v_subtract || jsgui.v_subtract;

const { GridControl, CellControl } = require("./GridControl");

/**
 * A grid control specialized for displaying color palettes, using MVVM
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

    // Extend data model with palette
    this.data.model.palette = spec.palette || [];

    // Extend view model with color-specific state
    this.view.data.model.selectedColor = null;
    this.view.data.model.colorCount = spec.palette?.length || 0;

    this._setupColorBindings();

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
   * Setup color-specific MVVM bindings
   * @private
   */
  _setupColorBindings() {
    // Compute color count from palette
    this.computed(
      this.data.model,
      ['palette'],
      (palette) => palette?.length || 0,
      { propertyName: 'colorCount', target: this.view.data.model }
    );

    // Watch for selected color changes
    this.watch(this.view.data.model, 'selectedColor', (color) => {
      if (color) {
        this.raise('choose-color', { value: color });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Property Accessors (backward compatibility)
  // ═══════════════════════════════════════════════════════════════

  get palette() { return this.data.model.palette; }
  set palette(v) { this.data.model.palette = v; }

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
              this.view.data.model.selectedColor = color;
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
    const palette = this.data.model.palette;
    if (palette) {
      let c = 0;
      this.grid.each_cell((cell) => {
        const item = palette[c++];
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
      grid_size: this.data.model.gridSize,
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
