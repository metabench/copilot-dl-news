"use strict";

/**
 * ColumnHeaderControl - Client-side control for sortable column headers
 * 
 * Handles:
 * - Click to sort (toggle asc/desc) - INSTANT client-side sorting
 * - Right-click to show context menu
 * - Options button click to show context menu
 * 
 * @example
 * const header = new ColumnHeaderControl({
 *   context,
 *   el: document.querySelector("[data-column-header]"),
 *   contextMenuSelector: "[data-context-menu='columns']"
 * });
 * header.activate();
 */

const jsgui = require("../jsgui");

class ColumnHeaderControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {HTMLElement} [spec.el] - Existing DOM element to activate
   * @param {string} [spec.contextMenuSelector] - Selector for context menu element
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "column_header" });
    
    this.contextMenuSelector = spec.contextMenuSelector || "[data-context-menu='columns']";
    this._contextMenuControl = null;
    
    // Current sort state
    this._sortBy = "name";
    this._sortOrder = "asc";
  }
  
  /**
   * Get the context menu control (lazy lookup)
   * @returns {Object|null}
   */
  getContextMenuControl() {
    if (this._contextMenuControl) return this._contextMenuControl;
    
    const menuEl = document.querySelector(this.contextMenuSelector);
    if (menuEl && menuEl.__jsgui_control) {
      this._contextMenuControl = menuEl.__jsgui_control;
    }
    return this._contextMenuControl;
  }
  
  /**
   * Activate the control - bind event listeners
   */
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Read initial sort state from URL
    const urlParams = new URLSearchParams(window.location.search);
    this._sortBy = urlParams.get("sort_by") || "name";
    this._sortOrder = urlParams.get("sort_order") || "asc";
    
    // Click on sortable headers to sort
    el.addEventListener("click", this._handleClick.bind(this));
    
    // Right-click on column header to show context menu
    el.addEventListener("contextmenu", this._handleContextMenu.bind(this));
    
    // Find and bind the options button
    const optionsBtn = el.querySelector(".doc-nav__col-options-btn, [data-action='show-column-menu']");
    if (optionsBtn) {
      optionsBtn.addEventListener("click", this._handleOptionsClick.bind(this));
    }
    
    console.log("[ColumnHeaderControl] Activated, sort:", this._sortBy, this._sortOrder);
  }
  
  /**
   * Handle click on sortable headers - INSTANT client-side sort
   * @private
   */
  _handleClick(e) {
    // Don't handle if clicking on options button
    if (e.target.closest(".doc-nav__col-options-btn, [data-action='show-column-menu']")) {
      return;
    }
    
    const header = e.target.closest(".doc-nav__col-header--sortable");
    if (!header) return;
    
    const sortBy = header.getAttribute("data-sort-by");
    const currentOrder = header.getAttribute("data-sort-order") || "asc";
    
    // Toggle order if clicking same column, else use default
    let newOrder;
    if (header.classList.contains("doc-nav__col-header--active")) {
      newOrder = currentOrder === "asc" ? "desc" : "asc";
    } else {
      // Default: desc for date, asc for name
      newOrder = sortBy === "mtime" ? "desc" : "asc";
    }
    
    console.log("[ColumnHeaderControl] Sorting by", sortBy, newOrder);
    
    // Perform instant client-side sort
    this._sortClientSide(sortBy, newOrder);
    
    // Update URL without page reload (for bookmarking/sharing)
    this._updateUrlSilently(sortBy, newOrder);
  }
  
  /**
   * Sort the navigation tree client-side without page reload
   * @private
   */
  _sortClientSide(sortBy, sortOrder) {
    const tree = document.querySelector(".doc-nav__tree");
    if (!tree) return;
    
    // Sort all ul.doc-nav__list elements recursively
    this._sortList(tree, sortBy, sortOrder);
    
    // Update header UI
    this._updateHeaderUI(sortBy, sortOrder);
    
    // Save state
    this._sortBy = sortBy;
    this._sortOrder = sortOrder;
  }
  
  /**
   * Recursively sort a list element
   * @private
   */
  _sortList(container, sortBy, sortOrder) {
    const lists = container.querySelectorAll("ul.doc-nav__list");
    
    lists.forEach(list => {
      const items = Array.from(list.children).filter(el => el.tagName === "LI");
      if (items.length <= 1) return;
      
      // Sort items
      items.sort((a, b) => {
        // Folders first, then files
        const aIsFolder = a.classList.contains("doc-nav__item--folder");
        const bIsFolder = b.classList.contains("doc-nav__item--folder");
        
        if (aIsFolder !== bIsFolder) {
          return aIsFolder ? -1 : 1; // Folders first
        }
        
        // Get values to compare
        let aVal, bVal;
        
        if (sortBy === "mtime") {
          // Get mtime from data attribute or cell text
          const aMtimeCell = a.querySelector(".doc-nav__cell--mtime");
          const bMtimeCell = b.querySelector(".doc-nav__cell--mtime");
          aVal = aMtimeCell?.textContent?.trim() || "";
          bVal = bMtimeCell?.textContent?.trim() || "";
          
          // Parse dates (format: MM-DD-YY)
          aVal = this._parseDateString(aVal);
          bVal = this._parseDateString(bVal);
        } else {
          // Sort by name
          const aLabel = a.querySelector(".doc-nav__label");
          const bLabel = b.querySelector(".doc-nav__label");
          aVal = (aLabel?.textContent || "").toLowerCase();
          bVal = (bLabel?.textContent || "").toLowerCase();
        }
        
        // Compare
        let result;
        if (sortBy === "mtime") {
          result = aVal - bVal; // Numeric comparison for dates
        } else {
          result = aVal.localeCompare(bVal);
        }
        
        return sortOrder === "desc" ? -result : result;
      });
      
      // Reorder DOM
      items.forEach(item => list.appendChild(item));
    });
  }
  
  /**
   * Parse MM-DD-YY date string to timestamp
   * @private
   */
  _parseDateString(str) {
    if (!str) return 0;
    const parts = str.split("-");
    if (parts.length !== 3) return 0;
    const [month, day, year] = parts;
    // Assume 20xx for 2-digit years
    const fullYear = parseInt(year, 10) + 2000;
    return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10)).getTime();
  }
  
  /**
   * Update header UI to reflect current sort state
   * @private
   */
  _updateHeaderUI(sortBy, sortOrder) {
    const el = this.dom?.el;
    if (!el) return;
    
    // Remove active state from all headers
    el.querySelectorAll(".doc-nav__col-header--sortable").forEach(header => {
      header.classList.remove("doc-nav__col-header--active");
      
      // Remove old sort icon
      const oldIcon = header.querySelector(".doc-nav__sort-icon");
      if (oldIcon) oldIcon.remove();
    });
    
    // Add active state to current sort column
    const activeHeader = el.querySelector(`[data-sort-by="${sortBy}"]`);
    if (activeHeader) {
      activeHeader.classList.add("doc-nav__col-header--active");
      activeHeader.setAttribute("data-sort-order", sortOrder);
      
      // Add sort icon
      const icon = document.createElement("span");
      icon.className = "doc-nav__sort-icon";
      icon.textContent = sortOrder === "asc" ? " ▲" : " ▼";
      activeHeader.appendChild(icon);
    }
  }
  
  /**
   * Update URL without triggering page reload
   * @private
   */
  _updateUrlSilently(sortBy, sortOrder) {
    const url = new URL(window.location.href);
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_order", sortOrder);
    window.history.replaceState({}, "", url.toString());
  }
  
  /**
   * Handle right-click to show context menu
   * @private
   */
  _handleContextMenu(e) {
    e.preventDefault();
    this._showContextMenu(e.clientX, e.clientY);
  }
  
  /**
   * Handle options button click
   * @private
   */
  _handleOptionsClick(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    this._showContextMenu(rect.left, rect.bottom + 4);
  }
  
  /**
   * Show the context menu at position
   * @private
   */
  _showContextMenu(x, y) {
    const control = this.getContextMenuControl();
    if (control && typeof control.show === "function") {
      console.log("[ColumnHeaderControl] Showing context menu via control at", x, y);
      control.show(x, y);
    } else {
      // Fallback: manipulate DOM directly
      console.log("[ColumnHeaderControl] Showing context menu via fallback at", x, y);
      this._showContextMenuFallback(x, y);
    }
  }
  
  /**
   * Fallback: show context menu by direct DOM manipulation
   * @private
   */
  _showContextMenuFallback(x, y) {
    const menu = document.querySelector(this.contextMenuSelector);
    if (!menu) {
      console.warn("[ColumnHeaderControl] Context menu not found:", this.contextMenuSelector);
      return;
    }
    
    // Position and display
    menu.style.display = "block";
    menu.style.position = "fixed";
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    
    // Ensure menu stays within viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = (x - rect.width) + "px";
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = (y - rect.height) + "px";
      }
    });
    
    // Close handlers
    const closeMenu = () => {
      menu.style.display = "none";
      document.removeEventListener("click", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
    
    const onClickOutside = (e) => {
      if (!menu.contains(e.target)) {
        closeMenu();
      }
    };
    
    const onEscape = (e) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };
    
    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener("click", onClickOutside);
      document.addEventListener("keydown", onEscape);
    }, 10);
  }
}

module.exports = { ColumnHeaderControl };
