"use strict";

/**
 * DocsFileFilterControl - Client-side file type filter control
 * 
 * A jsgui3 control that provides checkboxes to filter files by extension.
 * Filter state is managed via URL query parameters for proper server-side rendering.
 * 
 * URL params: ?show_md=0 (hide .md), ?show_svg=0 (hide .svg)
 * Default (no param) means show that file type.
 */

const jsgui = require("../jsgui");

class DocsFileFilterControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {HTMLElement} spec.el - Existing DOM element to hydrate
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    
    this.__type_name = "docs_file_filter";
    
    // Get filter state from server-rendered page state or URL
    this.filters = this._getFiltersFromPage();
    
    this.add_class("doc-nav__filters");
    this.dom.attributes["data-jsgui-control"] = "docs_file_filter";
    
    if (!spec.el) {
      this.compose();
    }
  }
  
  /**
   * Get filter state from server-rendered window state or URL params
   */
  _getFiltersFromPage() {
    // First try server-embedded state
    if (typeof window !== "undefined" && window.__DOCS_FILTERS__) {
      return { ...window.__DOCS_FILTERS__ };
    }
    
    // Fall back to URL params
    const params = new URLSearchParams(window.location.search);
    return {
      md: params.get("show_md") !== "0",
      svg: params.get("show_svg") !== "0"
    };
  }
  
  /**
   * Build URL with updated filter state
   */
  _buildFilterUrl(newFilters) {
    const params = new URLSearchParams(window.location.search);
    
    // Update filter params
    if (newFilters.md) {
      params.delete("show_md");
    } else {
      params.set("show_md", "0");
    }
    
    if (newFilters.svg) {
      params.delete("show_svg");
    } else {
      params.set("show_svg", "0");
    }
    
    const queryString = params.toString();
    return queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
  }
  
  compose() {
    // This is only used server-side for initial render
    // The checkboxes are created in the server-side DocNavControl
  }
  
  /**
   * Client-side activation - called when jsgui.activate() runs
   */
  activate() {
    if (this.__active) return;
    
    if (typeof super.activate === "function") {
      super.activate();
    }
    
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) {
      console.warn("[DocsFileFilter] No DOM element for activation");
      return;
    }
    
    // Find checkboxes within this control
    this.mdCheckbox = el.querySelector('input[data-filter-ext="md"]');
    this.svgCheckbox = el.querySelector('input[data-filter-ext="svg"]');
    
    // Checkboxes should already have correct state from server rendering
    // Just attach change handlers for navigation
    if (this.mdCheckbox) {
      this.mdCheckbox.addEventListener("change", (e) => {
        this.filters.md = e.target.checked;
        this._navigateWithFilters();
      });
    }
    
    if (this.svgCheckbox) {
      this.svgCheckbox.addEventListener("change", (e) => {
        this.filters.svg = e.target.checked;
        this._navigateWithFilters();
      });
    }
    
    console.log("[DocsFileFilter] Activated with filters:", this.filters);
  }
  
  /**
   * Navigate to URL with updated filter state
   */
  _navigateWithFilters() {
    const newUrl = this._buildFilterUrl(this.filters);
    window.location.href = newUrl;
  }
}

DocsFileFilterControl.prototype.__type_name = "docs_file_filter";

module.exports = { DocsFileFilterControl };
