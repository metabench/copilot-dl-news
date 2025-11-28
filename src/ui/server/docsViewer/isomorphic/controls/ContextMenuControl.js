"use strict";

/**
 * ContextMenuControl - Reusable context menu control for jsgui3
 * 
 * This is a client-side control that handles:
 * - Positioning relative to trigger point
 * - Viewport boundary detection
 * - Click-outside-to-close
 * - Escape key to close
 * - Keyboard navigation (arrow keys)
 * 
 * @example
 * const menu = new ContextMenuControl({
 *   context,
 *   el: document.querySelector("[data-context-menu]"),
 *   onClose: () => console.log("Menu closed")
 * });
 * menu.activate();
 * menu.show(100, 200);
 */

const jsgui = require("../jsgui");

class ContextMenuControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {HTMLElement} [spec.el] - Existing DOM element to activate
   * @param {Function} [spec.onClose] - Callback when menu closes
   * @param {Function} [spec.onSelect] - Callback when item is selected
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "context_menu" });
    
    this.onClose = spec.onClose || (() => {});
    this.onSelect = spec.onSelect || (() => {});
    
    this._boundCloseOnClickOutside = this._closeOnClickOutside.bind(this);
    this._boundCloseOnEscape = this._closeOnEscape.bind(this);
    this._isVisible = false;
  }
  
  /**
   * Activate the control - bind event listeners
   */
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    // Bind keyboard navigation within menu
    el.addEventListener("keydown", this._handleKeyNav.bind(this));
  }
  
  /**
   * Show the context menu at the specified position
   * @param {number} x - X coordinate (pixels from viewport left)
   * @param {number} y - Y coordinate (pixels from viewport top)
   */
  show(x, y) {
    const el = this.dom?.el;
    if (!el) return;
    
    // Store original parent for restoration
    if (!this._originalParent) {
      this._originalParent = el.parentNode;
    }
    
    // Move to body for proper z-index stacking above all content
    // This prevents the menu from being obscured by adjacent columns
    if (el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
    
    // Use fixed positioning relative to viewport
    el.style.position = "fixed";
    el.style.display = "block";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.zIndex = "10000"; // Ensure above all other content
    
    // Ensure menu stays within viewport
    this._adjustForViewport();
    
    this._isVisible = true;
    
    // Add global listeners (with delay to prevent immediate close)
    setTimeout(() => {
      document.addEventListener("click", this._boundCloseOnClickOutside);
      document.addEventListener("keydown", this._boundCloseOnEscape);
    }, 10);
    
    // Focus first focusable element
    const firstFocusable = el.querySelector("input, button, [tabindex]");
    if (firstFocusable) {
      firstFocusable.focus();
    }
  }
  
  /**
   * Hide the context menu
   */
  hide() {
    const el = this.dom?.el;
    if (!el) return;
    
    el.style.display = "none";
    this._isVisible = false;
    
    // Restore to original parent to maintain DOM structure
    if (this._originalParent && el.parentNode === document.body) {
      this._originalParent.appendChild(el);
    }
    
    // Remove global listeners
    document.removeEventListener("click", this._boundCloseOnClickOutside);
    document.removeEventListener("keydown", this._boundCloseOnEscape);
    
    this.onClose();
  }
  
  /**
   * Toggle menu visibility
   * @param {number} x - X coordinate for show
   * @param {number} y - Y coordinate for show
   */
  toggle(x, y) {
    if (this._isVisible) {
      this.hide();
    } else {
      this.show(x, y);
    }
  }
  
  /**
   * Check if menu is currently visible
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  }
  
  /**
   * Adjust menu position to stay within viewport
   * @private
   */
  _adjustForViewport() {
    const el = this.dom?.el;
    if (!el) return;
    
    const rect = el.getBoundingClientRect();
    const currentLeft = parseFloat(el.style.left) || 0;
    const currentTop = parseFloat(el.style.top) || 0;
    
    // Adjust horizontal position
    if (rect.right > window.innerWidth) {
      el.style.left = (currentLeft - (rect.right - window.innerWidth) - 8) + "px";
    }
    if (rect.left < 0) {
      el.style.left = "8px";
    }
    
    // Adjust vertical position
    if (rect.bottom > window.innerHeight) {
      el.style.top = (currentTop - (rect.bottom - window.innerHeight) - 8) + "px";
    }
    if (rect.top < 0) {
      el.style.top = "8px";
    }
  }
  
  /**
   * Handle click outside to close
   * @private
   */
  _closeOnClickOutside(e) {
    const el = this.dom?.el;
    if (!el) return;
    
    if (!el.contains(e.target)) {
      this.hide();
    }
  }
  
  /**
   * Handle escape key to close
   * @private
   */
  _closeOnEscape(e) {
    if (e.key === "Escape") {
      this.hide();
    }
  }
  
  /**
   * Handle keyboard navigation within menu
   * @private
   */
  _handleKeyNav(e) {
    const el = this.dom?.el;
    if (!el) return;
    
    const focusables = Array.from(el.querySelectorAll("input, button, [tabindex]:not([tabindex='-1'])"));
    if (focusables.length === 0) return;
    
    const currentIndex = focusables.indexOf(document.activeElement);
    
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % focusables.length;
      focusables[nextIndex].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + focusables.length) % focusables.length;
      focusables[prevIndex].focus();
    }
  }
}

module.exports = { ContextMenuControl };
