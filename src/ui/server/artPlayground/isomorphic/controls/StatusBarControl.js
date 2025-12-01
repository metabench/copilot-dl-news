"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Status Bar Control - Shows selection info and zoom level.
 * 24px fixed height at bottom of app.
 */
class StatusBarControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "footer" });
    this.add_class("ap-status-bar");
    this.dom.attributes["data-jsgui-control"] = "ap_status_bar";
    
    this._selectionText = "No selection";
    this._zoom = 100;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Left section: selection info
    const left = new Control({ context: ctx, tagName: "div" });
    left.add_class("ap-status-bar__left");
    
    this._selectionInfo = new String_Control({ context: ctx, text: this._selectionText });
    left.add(this._selectionInfo);
    
    this.add(left);
    
    // Right section: zoom
    const right = new Control({ context: ctx, tagName: "div" });
    right.add_class("ap-status-bar__right");
    
    this._zoomInfo = new String_Control({ context: ctx, text: `Zoom: ${this._zoom}%` });
    right.add(this._zoomInfo);
    
    this.add(right);
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    // Status bar is mostly display-only, no events needed yet
  }
  
  /**
   * Update selection info display.
   * @param {object|null} selection - { type, x, y, width, height } or null
   */
  updateSelection(selection) {
    if (!selection) {
      this._selectionText = "No selection";
    } else {
      const { type, x, y, width, height } = selection;
      const typeName = type.charAt(0).toUpperCase() + type.slice(1);
      this._selectionText = `${typeName} | ${Math.round(x)}, ${Math.round(y)} | ${Math.round(width)} × ${Math.round(height)}`;
    }
    
    // Update DOM if active
    const el = this._selectionInfo?.dom?.el;
    if (el) {
      el.textContent = this._selectionText;
    }
  }
  
  /**
   * Update zoom level display.
   * @param {number} zoom - Zoom percentage (e.g., 100)
   */
  updateZoom(zoom) {
    this._zoom = zoom;
    const el = this._zoomInfo?.dom?.el;
    if (el) {
      el.textContent = `Zoom: ${zoom}%`;
    }
  }
}

module.exports = { StatusBarControl };
