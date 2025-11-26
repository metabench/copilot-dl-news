"use strict";

/**
 * ExplorerPaginationControl - Pagination for the Data Explorer
 * 
 * Displays pagination controls with:
 * - Previous button
 * - Page info (current/total)
 * - Next button
 */

const jsgui = require("jsgui3-html");
const { PagerButtonControl } = require("../../../controls/PagerButton");

const StringControl = jsgui.String_Control;

/**
 * Pagination control for list views
 * 
 * @example
 * const pager = new ExplorerPaginationControl({
 *   context,
 *   currentPage: 3,
 *   totalPages: 10,
 *   basePath: "/urls"
 * });
 */
class ExplorerPaginationControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {number} spec.currentPage - Current page number (1-indexed)
   * @param {number} spec.totalPages - Total number of pages
   * @param {string} [spec.basePath] - Base path for page links
   * @param {string} [spec.prevLabel] - Label for previous button (default: "← Previous")
   * @param {string} [spec.nextLabel] - Label for next button (default: "Next →")
   * @param {string} [spec.pageParam] - Query param name for page (default: "page")
   */
  constructor(spec = {}) {
    super({
      ...spec,
      tagName: "div",
      __type_name: "explorer_pagination"
    });
    
    this.add_class("data-explorer__pagination");
    
    this.currentPage = spec.currentPage || 1;
    this.totalPages = spec.totalPages || 1;
    this.basePath = spec.basePath || "";
    this.prevLabel = spec.prevLabel || "← Previous";
    this.nextLabel = spec.nextLabel || "Next →";
    this.pageParam = spec.pageParam || "page";
    
    if (!spec.el) {
      this.compose();
    }
  }

  /**
   * Compose the pagination controls
   */
  compose() {
    // Previous button (if not on first page)
    if (this.currentPage > 1) {
      const prevBtn = new PagerButtonControl({
        context: this.context,
        label: this.prevLabel,
        href: this._buildPageUrl(this.currentPage - 1),
        disabled: false
      });
      this.add(prevBtn);
    }
    
    // Page info
    const pageInfo = new jsgui.Control({ context: this.context, tagName: "span" });
    pageInfo.add_class("data-explorer__page-info");
    pageInfo.add(new StringControl({ 
      context: this.context, 
      text: `Page ${this.currentPage} of ${this.totalPages}` 
    }));
    this.add(pageInfo);
    
    // Next button (if not on last page)
    if (this.currentPage < this.totalPages) {
      const nextBtn = new PagerButtonControl({
        context: this.context,
        label: this.nextLabel,
        href: this._buildPageUrl(this.currentPage + 1),
        disabled: false
      });
      this.add(nextBtn);
    }
  }

  /**
   * Build a URL for a specific page
   * @private
   */
  _buildPageUrl(page) {
    const separator = this.basePath.includes("?") ? "&" : "?";
    return `${this.basePath}${separator}${this.pageParam}=${page}`;
  }
}

module.exports = { ExplorerPaginationControl };
