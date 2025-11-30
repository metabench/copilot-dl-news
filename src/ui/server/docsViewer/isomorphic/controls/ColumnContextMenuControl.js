"use strict";

/**
 * ColumnContextMenuControl - Context menu for column visibility selection
 * 
 * Extends ContextMenuControl with specific behavior for toggling
 * table/list column visibility INSTANTLY on the client side.
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
    
    // Track column visibility state
    this._columns = {
      mtime: false
    };
  }
  
  /**
   * Activate the control - bind event listeners
   */
  activate() {
    if (this.__active) return;
    super.activate();
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Read initial column state from URL
    const urlParams = new URLSearchParams(window.location.search);
    this._columns.mtime = urlParams.get("col_mtime") === "1";
    
    // Bind change events on column toggles
    el.addEventListener("change", this._handleColumnToggle.bind(this));
    
    console.log("[ColumnContextMenuControl] Activated, mtime visible:", this._columns.mtime);
  }
  
  /**
   * Handle checkbox change to toggle column visibility - INSTANT client-side
   * @private
   */
  _handleColumnToggle(e) {
    const toggle = e.target.closest("[data-column-toggle]");
    if (!toggle) return;
    
    const column = toggle.getAttribute("data-column-toggle");
    const isChecked = toggle.checked;
    
    console.log("[ColumnContextMenuControl] Toggle column", column, "visible:", isChecked);
    
    // Perform instant client-side toggle
    this._toggleColumnClientSide(column, isChecked);
    
    // Update URL without page reload (for bookmarking/sharing)
    this._updateUrlSilently(column, isChecked);
    
    // Hide the menu after selection
    this.hide();
  }
  
  /**
   * Toggle column visibility client-side without page reload
   * @private
   */
  _toggleColumnClientSide(column, visible) {
    if (column === "mtime") {
      this._toggleMtimeColumn(visible);
    }
    
    // Update state
    this._columns[column] = visible;
  }
  
  /**
   * Toggle the mtime (Last Modified) column
   * @private
   */
  _toggleMtimeColumn(visible) {
    // Toggle column header (already exists, just toggle visibility)
    const mtimeHeader = document.querySelector(".doc-nav__col-header--mtime");
    if (mtimeHeader) {
      mtimeHeader.style.display = visible ? "" : "none";
    }
    
    // Toggle all item rows to show/hide columns class
    const navItems = document.querySelectorAll(".doc-nav__item");
    navItems.forEach(item => {
      if (visible) {
        item.classList.add("doc-nav__item--with-columns");
      } else {
        item.classList.remove("doc-nav__item--with-columns");
      }
    });
    
    // Toggle mtime cells visibility (all cells exist, just toggle display)
    const mtimeCells = document.querySelectorAll(".doc-nav__cell--mtime");
    mtimeCells.forEach(cell => {
      cell.style.display = visible ? "" : "none";
    });
    
    console.log("[ColumnContextMenuControl] Toggled mtime column, visible:", visible, "header:", !!mtimeHeader, "cells:", mtimeCells.length);
  }
  
  /**
   * Update URL without triggering page reload
   * @private
   */
  _updateUrlSilently(column, visible) {
    const url = new URL(window.location.href);
    if (visible) {
      url.searchParams.set("col_" + column, "1");
    } else {
      url.searchParams.delete("col_" + column);
    }
    window.history.replaceState({}, "", url.toString());
  }
}

module.exports = { ColumnContextMenuControl };
