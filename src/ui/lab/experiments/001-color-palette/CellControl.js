"use strict";

/**
 * CellControl - Grid cell with selection support
 * 
 * COPIED FROM: jsgui3-html/controls/organised/0-core/0-basic/1-compositional/Cell.js
 * MODIFIED: 2025-11-30
 * 
 * Changes from original:
 * - Renamed Cell → CellControl
 * - Updated require paths for lab context
 * - Added JSDoc comments
 */

const jsgui = require("jsgui3-html");
const { field } = require("obext");

const Control = jsgui.Control;

// Import selectable mixin from jsgui3-html
const mx_selectable = require("jsgui3-html/control_mixins/selectable");

/**
 * A cell control for use in grids
 * Supports selection and can display data/colors
 */
class CellControl extends Control {
  /**
   * @param {Object} spec - Configuration
   * @param {Object} spec.context - jsgui3 context
   * @param {number} [spec.x] - X position in grid
   * @param {number} [spec.y] - Y position in grid
   * @param {*} [spec.data] - Cell data
   */
  constructor(spec) {
    spec = spec || {};
    spec.__type_name = spec.__type_name || "cell";
    super(spec);
    
    this.add_class("cell");
    
    field(this, "x", spec.x);
    field(this, "y", spec.y);
    field(this, "data", spec.data);
    
    if (!spec.el) {
      this.compose_grid_cell();
    }
    
    mx_selectable(this);
  }

  /**
   * Build the cell's internal structure
   */
  compose_grid_cell() {
    const o = { context: this.context };
    if (this.data) o.text = this.data;
    
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

  /**
   * Set the cell's background color
   * @param {string} color - CSS color value
   */
  set color(value) {
    this._color = value;
    this.style("background-color", value);
  }

  get color() {
    return this._color;
  }
}

module.exports = { CellControl };
