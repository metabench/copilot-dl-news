"use strict";

/**
 * ResizableSplitLayoutControl - An isomorphic resizable 2-column split layout (Shared)
 * 
 * This control works identically on server and client:
 * 
 * SERVER (Node.js with jsgui3-html):
 *   - constructor() initializes properties
 *   - compose() builds the control tree
 *   - all_html_render() serializes to HTML string for SSR
 * 
 * CLIENT (Browser with jsgui3-client):
 *   - constructor({ el }) wraps existing DOM element (hydration)
 *   - activate() binds event handlers for interactivity
 *   - OR compose() creates new controls dynamically
 * 
 * Features:
 * - Mouse drag to resize panels
 * - Touch support for mobile devices
 * - Double-click divider to reset to default width
 * - Keyboard accessibility (Arrow keys, Home/End)
 * - Min/max width constraints
 * - Persistence via localStorage
 * 
 * Originally extracted from docsViewer/isomorphic/controls/ResizableSplitLayoutControl.js
 */

const jsgui = require("../jsgui");

class ResizableSplitLayoutControl extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.context - jsgui context
   * @param {HTMLElement} [spec.el] - Existing DOM element for hydration (client-side)
   * @param {Control} [spec.leftPanel] - Control for left panel (server-side compose)
   * @param {Control} [spec.rightPanel] - Control for right panel (server-side compose)
   * @param {number} [spec.initialLeftWidth=280] - Initial width of left panel in pixels
   * @param {number} [spec.minLeftWidth=150] - Minimum width of left panel
   * @param {number} [spec.maxLeftWidth=600] - Maximum width of left panel
   * @param {string} [spec.storageKey] - localStorage key for persisting width
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "resizable_split_layout" });
    
    // Configuration (used by both server and client)
    this.leftPanel = spec.leftPanel || null;
    this.rightPanel = spec.rightPanel || null;
    this.initialLeftWidth = spec.initialLeftWidth || 280;
    this.minLeftWidth = spec.minLeftWidth || 150;
    this.maxLeftWidth = spec.maxLeftWidth || 600;
    this.storageKey = spec.storageKey || null;
    
    // Runtime state (client-side only, set during activate)
    this._isDragging = false;
    this._startX = 0;
    this._startWidth = 0;
    this._leftPanelEl = null;
    this._dividerEl = null;
    this._rightPanelEl = null;
    
    // Set up DOM attributes and classes
    this.add_class("split-layout");
    this.add_class("split-layout--horizontal");
    this.dom.attributes["data-jsgui-control"] = "resizable_split_layout";
    
    // Store config as data attributes for client-side hydration
    this.dom.attributes["data-initial-width"] = String(this.initialLeftWidth);
    this.dom.attributes["data-min-width"] = String(this.minLeftWidth);
    this.dom.attributes["data-max-width"] = String(this.maxLeftWidth);
    if (this.storageKey) {
      this.dom.attributes["data-storage-key"] = this.storageKey;
    }
    
    // Only compose if not hydrating from existing element
    if (!spec.el) {
      this.compose();
    }
  }
  
  /**
   * Compose the control's DOM structure
   * Called on server for SSR, or on client for dynamic creation
   */
  compose() {
    // Left panel container
    const leftContainer = new jsgui.Control({ context: this.context, tagName: "div" });
    leftContainer.add_class("split-layout__panel");
    leftContainer.add_class("split-layout__panel--left");
    leftContainer.dom.attributes["data-panel"] = "left";
    leftContainer.dom.attributes.style = `width: ${this.initialLeftWidth}px; min-width: ${this.minLeftWidth}px; max-width: ${this.maxLeftWidth}px;`;
    
    if (this.leftPanel) {
      leftContainer.add(this.leftPanel);
    }
    
    this.add(leftContainer);
    
    // Resize divider
    const divider = new jsgui.Control({ context: this.context, tagName: "div" });
    divider.add_class("split-layout__divider");
    divider.dom.attributes["data-divider"] = "true";
    divider.dom.attributes.role = "separator";
    divider.dom.attributes["aria-orientation"] = "vertical";
    divider.dom.attributes["aria-valuenow"] = String(this.initialLeftWidth);
    divider.dom.attributes["aria-valuemin"] = String(this.minLeftWidth);
    divider.dom.attributes["aria-valuemax"] = String(this.maxLeftWidth);
    divider.dom.attributes.tabindex = "0";
    divider.dom.attributes.title = "Drag to resize. Double-click to reset.";
    
    // Visual handle inside divider
    const handle = new jsgui.Control({ context: this.context, tagName: "div" });
    handle.add_class("split-layout__handle");
    divider.add(handle);
    
    this.add(divider);
    
    // Right panel container
    const rightContainer = new jsgui.Control({ context: this.context, tagName: "div" });
    rightContainer.add_class("split-layout__panel");
    rightContainer.add_class("split-layout__panel--right");
    rightContainer.dom.attributes["data-panel"] = "right";
    
    if (this.rightPanel) {
      rightContainer.add(this.rightPanel);
    }
    
    this.add(rightContainer);
  }
  
  /**
   * Activate the control for client-side interactivity
   */
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) {
      console.warn("[ResizableSplitLayoutControl] No element to activate");
      return;
    }
    
    // Read config from data attributes (for hydration from server-rendered HTML)
    this.initialLeftWidth = parseInt(el.dataset.initialWidth, 10) || this.initialLeftWidth;
    this.minLeftWidth = parseInt(el.dataset.minWidth, 10) || this.minLeftWidth;
    this.maxLeftWidth = parseInt(el.dataset.maxWidth, 10) || this.maxLeftWidth;
    this.storageKey = el.dataset.storageKey || this.storageKey;
    
    // Find child elements
    this._leftPanelEl = el.querySelector("[data-panel='left']");
    this._dividerEl = el.querySelector("[data-divider]");
    this._rightPanelEl = el.querySelector("[data-panel='right']");
    
    if (!this._leftPanelEl || !this._dividerEl) {
      console.warn("[ResizableSplitLayoutControl] Missing required child elements");
      return;
    }
    
    // Restore saved width from localStorage
    this._restoreSavedWidth();
    
    // Bind event handlers
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onDblClick = this._handleDoubleClick.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    
    // Attach event listeners to divider
    this._dividerEl.addEventListener("mousedown", this._onMouseDown);
    this._dividerEl.addEventListener("touchstart", this._onTouchStart, { passive: false });
    this._dividerEl.addEventListener("dblclick", this._onDblClick);
    this._dividerEl.addEventListener("keydown", this._onKeyDown);
    
    console.log("[ResizableSplitLayoutControl] Activated with width:", this._getLeftWidth());
  }
  
  // ==================== Width Management ====================
  
  _restoreSavedWidth() {
    if (!this.storageKey || typeof localStorage === "undefined") return;
    
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const width = parseInt(saved, 10);
        if (width >= this.minLeftWidth && width <= this.maxLeftWidth) {
          this._setLeftWidth(width);
        }
      }
    } catch (e) {
      // localStorage may be disabled or full
    }
  }
  
  _saveWidth(width) {
    if (!this.storageKey || typeof localStorage === "undefined") return;
    
    try {
      localStorage.setItem(this.storageKey, String(width));
    } catch (e) {
      // localStorage may be disabled or full
    }
  }
  
  _setLeftWidth(width) {
    if (!this._leftPanelEl) return;
    
    width = Math.max(this.minLeftWidth, Math.min(this.maxLeftWidth, width));
    this._leftPanelEl.style.width = width + "px";
    
    if (this._dividerEl) {
      this._dividerEl.setAttribute("aria-valuenow", String(width));
    }
  }
  
  _getLeftWidth() {
    return this._leftPanelEl ? this._leftPanelEl.offsetWidth : this.initialLeftWidth;
  }
  
  // ==================== Mouse Events ====================
  
  _handleMouseDown(e) {
    e.preventDefault();
    this._startDrag(e.clientX);
    
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }
  
  _handleMouseMove(e) {
    if (!this._isDragging) return;
    this._doDrag(e.clientX);
  }
  
  _handleMouseUp(e) {
    this._endDrag();
    
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
  }
  
  // ==================== Touch Events ====================
  
  _handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    
    this._startDrag(e.touches[0].clientX);
    
    document.addEventListener("touchmove", this._onTouchMove, { passive: false });
    document.addEventListener("touchend", this._onTouchEnd);
    document.addEventListener("touchcancel", this._onTouchEnd);
  }
  
  _handleTouchMove(e) {
    if (!this._isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    this._doDrag(e.touches[0].clientX);
  }
  
  _handleTouchEnd(e) {
    this._endDrag();
    
    document.removeEventListener("touchmove", this._onTouchMove);
    document.removeEventListener("touchend", this._onTouchEnd);
    document.removeEventListener("touchcancel", this._onTouchEnd);
  }
  
  // ==================== Drag Logic ====================
  
  _startDrag(clientX) {
    this._isDragging = true;
    this._startX = clientX;
    this._startWidth = this._getLeftWidth();
    
    const el = this.dom?.el;
    if (el) {
      el.classList.add("split-layout--dragging");
    }
    
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  }
  
  _doDrag(clientX) {
    const delta = clientX - this._startX;
    const newWidth = this._startWidth + delta;
    this._setLeftWidth(newWidth);
  }
  
  _endDrag() {
    if (!this._isDragging) return;
    
    this._isDragging = false;
    
    const el = this.dom?.el;
    if (el) {
      el.classList.remove("split-layout--dragging");
    }
    
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    
    this._saveWidth(this._getLeftWidth());
  }
  
  // ==================== Keyboard & Other Events ====================
  
  _handleDoubleClick(e) {
    this._setLeftWidth(this.initialLeftWidth);
    this._saveWidth(this.initialLeftWidth);
  }
  
  _handleKeyDown(e) {
    const step = e.shiftKey ? 50 : 10;
    let width = this._getLeftWidth();
    
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        width -= step;
        break;
      case "ArrowRight":
        e.preventDefault();
        width += step;
        break;
      case "Home":
        e.preventDefault();
        width = this.minLeftWidth;
        break;
      case "End":
        e.preventDefault();
        width = this.maxLeftWidth;
        break;
      default:
        return;
    }
    
    this._setLeftWidth(width);
    this._saveWidth(width);
  }
}

module.exports = { ResizableSplitLayoutControl };
