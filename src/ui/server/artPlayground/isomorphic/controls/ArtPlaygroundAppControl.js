"use strict";

const jsgui = require("../jsgui");
const { CanvasControl } = require("./CanvasControl");
const { ToolbarControl } = require("./ToolbarControl");
const { ToolPanelControl } = require("./ToolPanelControl");
const { PropertiesPanelControl } = require("./PropertiesPanelControl");
const { StatusBarControl } = require("./StatusBarControl");

const { Control } = jsgui;

/**
 * Main App Control for Art Playground.
 * 
 * Layout (using layout primitives):
 * ┌─────────────────────────────────────────┐
 * │              Toolbar                    │
 * ├──────┬────────────────────────┬─────────┤
 * │ Tool │                        │ Props   │
 * │ 60px │      Canvas (flex)     │  160px  │
 * │      │                        │         │
 * ├──────┴────────────────────────┴─────────┤
 * │           Status Bar  24px              │
 * └─────────────────────────────────────────┘
 */
class ArtPlaygroundAppControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-app");
    this.add_class("ap-cover");
    this.dom.attributes["data-jsgui-control"] = "art_app";
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Top: Toolbar
    this.add(this._toolbar = new ToolbarControl({ context: ctx }));
    
    // Middle: Workspace (sidebar layout)
    const workspace = new Control({ context: ctx, tagName: "main" });
    workspace.add_class("ap-workspace");
    workspace.dom.attributes["data-jsgui-control"] = "ap_workspace";
    
    // Left: Tool Panel (60px)
    workspace.add(this._toolPanel = new ToolPanelControl({ context: ctx }));
    
    // Center: Canvas (flex-grow)
    const canvasWrapper = new Control({ context: ctx, tagName: "div" });
    canvasWrapper.add_class("ap-canvas-wrapper");
    canvasWrapper.add(this._canvas = new CanvasControl({ context: ctx }));
    workspace.add(canvasWrapper);
    
    // Right: Properties Panel (160px)
    workspace.add(this._propertiesPanel = new PropertiesPanelControl({ context: ctx }));
    
    this.add(workspace);
    
    // Bottom: Status Bar
    this.add(this._statusBar = new StatusBarControl({ context: ctx }));
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom.el;
    
    // Find child controls from DOM if hydrating
    if (el) {
      const toolbarEl = el.querySelector("[data-jsgui-control='art_toolbar']");
      const canvasEl = el.querySelector("[data-jsgui-control='art_canvas']");
      const toolPanelEl = el.querySelector("[data-jsgui-control='ap_tool_panel']");
      const propsPanelEl = el.querySelector("[data-jsgui-control='ap_properties_panel']");
      const statusBarEl = el.querySelector("[data-jsgui-control='ap_status_bar']");
      
      this._toolbar ??= toolbarEl?.__jsgui_control;
      this._canvas ??= canvasEl?.__jsgui_control;
      this._toolPanel ??= toolPanelEl?.__jsgui_control;
      this._propertiesPanel ??= propsPanelEl?.__jsgui_control;
      this._statusBar ??= statusBarEl?.__jsgui_control;
    }
    
    // Wire up events
    this._wireEvents();
  }
  
  _wireEvents() {
    // Toolbar → Canvas (legacy, keep for compatibility)
    if (this._toolbar && this._canvas) {
      this._toolbar.on("tool-change", (tool) => this._canvas.setTool(tool));
      this._toolbar.on("add-component", (type) => {
        this._canvas.addComponent(type);
        this._updatePanels();
      });
      this._toolbar.on("delete", () => {
        this._canvas.deleteSelected();
        this._updatePanels();
      });
    }
    
    // Tool Panel → Canvas
    if (this._toolPanel && this._canvas) {
      this._toolPanel.on("tool-select", (tool) => {
        this._canvas.setTool(tool);
      });
      this._toolPanel.on("add-shape", (shapeType) => {
        this._canvas.addComponent(shapeType);
        this._updatePanels();
      });
    }
    
    // Canvas → Properties Panel & Status Bar
    if (this._canvas) {
      this._canvas.on("selection-change", (selection) => {
        this._updatePanels();
      });
    }
    
    // Properties Panel → Canvas
    if (this._propertiesPanel && this._canvas) {
      this._propertiesPanel.on("layer-select", (id) => {
        this._canvas._select(id);
        this._updatePanels();
      });
    }
    
    // Initial panel update
    this._updatePanels();
  }
  
  _updatePanels() {
    const selection = this._canvas?._getSelectionData?.() || this._getSelectionFromCanvas();
    const layers = this._getLayersFromCanvas();
    
    // Update status bar
    if (this._statusBar) {
      this._statusBar.updateSelection(selection);
    }
    
    // Update properties panel
    if (this._propertiesPanel) {
      this._propertiesPanel.updateSelection(selection);
      this._propertiesPanel.updateLayers(layers);
    }
  }
  
  _getSelectionFromCanvas() {
    if (!this._canvas?._selectedId) return null;
    const c = this._canvas._components?.get(this._canvas._selectedId);
    if (!c) return null;
    return {
      id: this._canvas._selectedId,
      type: c.type,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      fill: c.fill,
      stroke: c.stroke
    };
  }
  
  _getLayersFromCanvas() {
    if (!this._canvas?._components) return [];
    const layers = [];
    this._canvas._components.forEach((comp, id) => {
      layers.push({
        id,
        type: comp.type,
        name: `${comp.type} ${id}`,
        selected: id === this._canvas._selectedId
      });
    });
    return layers.reverse(); // Top layer first
  }
}

module.exports = { ArtPlaygroundAppControl };
