"use strict";

const jsgui = require("../jsgui");
const { CanvasControl } = require("./CanvasControl");
const { ToolbarControl } = require("./ToolbarControl");

/**
 * Main App Control for Art Playground
 * 
 * Layout:
 * - Toolbar at top
 * - Canvas area filling the rest
 */
class ArtPlaygroundAppControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-app");
    this.dom.attributes["data-jsgui-control"] = "art_app";
    
    if (!spec.el) {
      this._compose();
    }
  }
  
  _compose() {
    // Create toolbar
    this._toolbar = new ToolbarControl({ context: this.context });
    this.add(this._toolbar);
    
    // Create canvas area
    this._canvas = new CanvasControl({ context: this.context });
    this.add(this._canvas);
  }
  
  /**
   * Activate client-side behavior
   */
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Find child controls from DOM if not already set
    const el = this.dom.el;
    if (el && !this._toolbar) {
      const toolbarEl = el.querySelector("[data-jsgui-control='art_toolbar']");
      if (toolbarEl && toolbarEl.__jsgui_control) {
        this._toolbar = toolbarEl.__jsgui_control;
      }
    }
    if (el && !this._canvas) {
      const canvasEl = el.querySelector("[data-jsgui-control='art_canvas']");
      if (canvasEl && canvasEl.__jsgui_control) {
        this._canvas = canvasEl.__jsgui_control;
      }
    }
    
    // Wire up toolbar to canvas
    this._setupToolbarHandlers();
  }
  
  /**
   * Connect toolbar actions to canvas
   */
  _setupToolbarHandlers() {
    if (!this._toolbar || !this._canvas) return;
    
    // Listen for tool selection changes
    this._toolbar.on("tool-change", (toolName) => {
      this._canvas.setTool(toolName);
    });
    
    // Listen for add component requests
    this._toolbar.on("add-component", (componentType) => {
      this._canvas.addComponent(componentType);
    });
    
    // Listen for delete request
    this._toolbar.on("delete", () => {
      this._canvas.deleteSelected();
    });

    this._toolbar.on("color-change", (color) => {
      this._canvas.setActiveColor(color, { applyToSelection: true });
    });

    if (typeof this._toolbar.getCurrentColor === 'function') {
      const seedColor = this._toolbar.getCurrentColor();
      if (seedColor) {
        this._canvas.setActiveColor(seedColor, { applyToSelection: false });
      }
    }
  }
}

module.exports = { ArtPlaygroundAppControl };
