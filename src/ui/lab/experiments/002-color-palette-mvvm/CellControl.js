"use strict";

/**
 * CellControl (MVVM) - Grid cell with selection support using MVVM pattern
 * 
 * EXPERIMENT: 002-color-palette-mvvm
 * BASED ON: 001-color-palette/CellControl.js
 * REFACTORED: 2025-11-30 to use Data_Model_View_Model_Control
 * 
 * MVVM Structure:
 * - data.model: { x, y, data, color }
 * - view.data.model: { isSelected, isHovered, displayColor }
 */

const jsgui = require("jsgui3-html");
const Data_Model_View_Model_Control = require("jsgui3-html/html-core/Data_Model_View_Model_Control");

// Import selectable mixin from jsgui3-html
const mx_selectable = require("jsgui3-html/control_mixins/selectable");

/**
 * A cell control for use in grids, using MVVM pattern
 * Supports selection and can display data/colors
 */
class CellControl extends Data_Model_View_Model_Control {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {number} [spec.x] - X position in grid
   * @param {number} [spec.y] - Y position in grid
   * @param {*} [spec.data] - Cell data
   * @param {string} [spec.color] - Cell background color
   */
  constructor(spec) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "cell";
    super(spec);
    
    this.add_class("cell");
    
    // DATA MODEL - The cell's actual data
    // Note: We modify the existing model created by ensure_control_models
    // rather than replacing it, to preserve jsgui3 internals
    const dm = this.data.model;
    dm.x = spec.x ?? null;
    dm.y = spec.y ?? null;
    dm.cellData = spec.data ?? null;
    dm.color = spec.color ?? null;
    
    // VIEW MODEL - UI-specific state
    // Note: We extend the existing view.data.model to preserve mixins collection
    const vdm = this.view.data.model;
    vdm.isSelected = false;
    vdm.isHovered = false;
    vdm.displayColor = spec.color ?? null;
    
    this._setupBindings();
    
    if (!spec.el) {
      this.compose_grid_cell();
    }
    
    mx_selectable(this);
  }

  /**
   * Setup MVVM bindings
   * @private
   */
  _setupBindings() {
    // Bind color from data model to view model (with potential transform)
    this.bind({
      'color': {
        to: 'displayColor',
        transform: (color) => color ? color.toUpperCase() : null
      }
    });
    
    // Watch for color changes to update DOM
    this.watch(this.view.data.model, 'displayColor', (color) => {
      if (color && this.dom) {
        this.style("background-color", color);
      }
    });
    
    // Watch for selection changes
    this.watch(this.view.data.model, 'isSelected', (isSelected) => {
      if (isSelected) {
        this.add_class('selected');
      } else {
        this.remove_class('selected');
      }
    });
  }

  /**
   * Build the cell's internal structure
   */
  compose_grid_cell() {
    const o = { context: this.context };
    const cellData = this.data.model.cellData;
    if (cellData) o.text = cellData;
    
    this.span = new jsgui.span(o);
    this.add(this.span);
    
    this._ctrl_fields = this._ctrl_fields || {};
    this._ctrl_fields.span = this.span;
  }

  /**
   * Activate the cell (client-side event binding)
   */
  activate() {
    if (!this.__active) {
      super.activate();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MVVM Property Accessors (for backward compatibility)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the cell's background color
   * @param {string} color - CSS color value
   */
  set color(value) {
    this.data.model.color = value;
  }

  get color() {
    return this.data.model.color;
  }

  // Legacy accessors from obext field()
  get x() { return this.data.model.x; }
  set x(v) { this.data.model.x = v; }
  
  get y() { return this.data.model.y; }
  set y(v) { this.data.model.y = v; }

  // Expose internal color for selection events (backward compat)
  get _color() {
    return this.data.model.color;
  }
}

module.exports = { CellControl };
