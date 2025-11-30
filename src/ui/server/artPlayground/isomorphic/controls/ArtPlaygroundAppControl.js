"use strict";

const jsgui = require("../jsgui");
const { CanvasControl } = require("./CanvasControl");
const { ToolbarControl } = require("./ToolbarControl");
const { PropertiesPanelControl } = require("./PropertiesPanelControl");

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

    // Stage contains canvas + property panel
    this._stage = new jsgui.Control({ context: this.context, tagName: "div" });
    this._stage.add_class("art-stage");

    this._canvas = new CanvasControl({ context: this.context });
    this._stage.add(this._canvas);

    this._properties = new PropertiesPanelControl({ context: this.context });
    this._stage.add(this._properties);

    this.add(this._stage);
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
    if (el && !this._properties) {
      const propsEl = el.querySelector("[data-jsgui-control='art_properties']");
      if (propsEl && propsEl.__jsgui_control) {
        this._properties = propsEl.__jsgui_control;
      }
    }
    
    // Activate nested controls (toolbar + canvas already handle their own activate flow)
    if (this._properties && typeof this._properties.activate === "function") {
      this._properties.activate();
    }

    // Wire up components
    this._setupToolbarHandlers();
    this._setupPropertyPanelHandlers();
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
  }

  _setupPropertyPanelHandlers() {
    if (!this._properties || !this._canvas) return;

    // Panel listens for property-change events and pushes them to canvas
    this._properties.on("property-change", (patch) => {
      this._canvas.updateSelectedProperties?.(patch);
    });

    // Canvas emits selection-change so panel can refresh summary
    this._canvas.on?.("selection-change", (payload) => {
      this._properties.setSelection?.(payload);
    });
  }
}

module.exports = { ArtPlaygroundAppControl };
