"use strict";

/**
 * ColumnHeaderControl - Client-side control for sortable column headers
 * 
 * Handles:
 * - Click to sort (toggle asc/desc)
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

    // Click on sortable headers to sort
    el.addEventListener("click", this._handleClick.bind(this));

    // Right-click on column header to show context menu
    el.addEventListener("contextmenu", this._handleContextMenu.bind(this));

    // Find and bind the options button
    const optionsBtn = el.querySelector(".doc-nav__col-options-btn, [data-action='show-column-menu']");
    if (optionsBtn) {
      optionsBtn.addEventListener("click", this._handleOptionsClick.bind(this));
    }

    console.log("[ColumnHeaderControl] Activated");
  }

  /**
   * Handle click on sortable headers
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

    // Perform client-side sort
    this._performClientSideSort(sortBy, newOrder);

    // Update active state in headers
    const allHeaders = document.querySelectorAll(".doc-nav__col-header--sortable");
    allHeaders.forEach(h => {
      h.classList.remove("doc-nav__col-header--active");
      // Remove sort icons from others
      const icon = h.querySelector(".doc-nav__sort-icon");
      if (icon) icon.remove();
    });

    header.classList.add("doc-nav__col-header--active");
    header.setAttribute("data-sort-order", newOrder);

    // Add new sort icon
    const icon = document.createElement("span");
    icon.className = "doc-nav__sort-icon";
    icon.innerText = newOrder === 'asc' ? ' ▲' : ' ▼';
    icon.style.marginLeft = "4px";
    header.appendChild(icon);

    // Update URL silently
    const url = new URL(window.location.href);
    url.searchParams.set("sort_by", sortBy);
    url.searchParams.set("sort_order", newOrder);
    window.history.replaceState({}, "", url.toString());

    console.log("[ColumnHeaderControl] Sorted client-side by", sortBy, newOrder);
  }

  /**
   * Sort the DOM elements client-side
   * @private
   */
  _performClientSideSort(sortBy, sortOrder) {
    // We need to sort every nested list in the tree
    const lists = document.querySelectorAll(".doc-nav__tree, .doc-nav__folder ul, .doc-nav__folder > div");

    lists.forEach(list => {
      // Get all direct children that are nav items
      const items = Array.from(list.children).filter(el =>
        el.classList.contains("doc-nav__item") ||
        el.tagName === "LI" ||
        el.tagName === "DETAILS"
      );

      if (items.length < 2) return;

      items.sort((a, b) => {
        let valA, valB;

        if (sortBy === 'mtime') {
          // Parse as numbers (timestamps) - default to 0
          valA = parseInt(a.getAttribute("data-mtime") || "0", 10);
          valB = parseInt(b.getAttribute("data-mtime") || "0", 10);
        } else {
          // Parse as strings (names)
          valA = a.getAttribute("data-name") || "";
          valB = b.getAttribute("data-name") || "";
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      // Re-append in new order (moves them in DOM)
      items.forEach(item => list.appendChild(item));
    });
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
