"use strict";

/**
 * ColumnContextMenuControl - Context menu for column visibility selection
 * 
 * Extends ContextMenuControl with specific behavior for toggling
 * table/list column visibility via URL query parameters.
 * 
 * @example
 * const menu = new ColumnContextMenuControl({
 *   context,
 *   el: document.querySelector("[data-context-menu='columns']")
 * });
 * menu.activate();
 */

const { ContextMenuControl } = require("./ContextMenuControl");

class ColumnContextMenuControl extends ContextMenuControl {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {HTMLElement} [spec.el] - Existing DOM element to activate
   */
  constructor(spec = {}) {
    super({ ...spec });
    // Set __type_name after super() to ensure it's not overwritten
    this.__type_name = "column_context_menu";
  }
  
  /**
   * Activate the control - bind event listeners
   */
  activate() {
    if (this.__active) return;
    super.activate();
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Bind change events on column toggles
    el.addEventListener("change", this._handleColumnToggle.bind(this));
  }
  
  /**
   * Handle checkbox change to toggle column visibility
   * @private
   */
  _handleColumnToggle(e) {
    const toggle = e.target.closest("[data-column-toggle]");
    if (!toggle) return;
    
    const column = toggle.getAttribute("data-column-toggle");
    const isChecked = toggle.checked;
    
    // Build new URL with column visibility
    const url = new URL(window.location.href);
    if (isChecked) {
      url.searchParams.set("col_" + column, "1");
    } else {
      url.searchParams.delete("col_" + column);
    }
    
    // Navigate to update the view
    window.location.href = url.toString();
  }
}

module.exports = { ColumnContextMenuControl };
