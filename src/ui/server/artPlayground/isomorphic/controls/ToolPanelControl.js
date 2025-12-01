"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Tool definitions for the tool panel.
 */
const TOOLS = [
  { id: "select", icon: "↖", label: "Select", group: "tools" },
  { id: "rect", icon: "▢", label: "Rectangle", group: "shapes" },
  { id: "ellipse", icon: "○", label: "Ellipse", group: "shapes" },
  { id: "text", icon: "T", label: "Text", group: "shapes" },
  { id: "line", icon: "⟋", label: "Line", group: "shapes" },
  { id: "---", group: "divider" },
  { id: "pan", icon: "✋", label: "Pan", group: "nav" },
  { id: "zoom-in", icon: "🔍+", label: "Zoom In", group: "nav" },
  { id: "zoom-out", icon: "🔍−", label: "Zoom Out", group: "nav" },
];

/**
 * Tool Panel Control - Left vertical tool palette (60px).
 * 
 * @fires tool-select {string} - Tool ID when tool is selected
 * @fires add-shape {string} - Shape type when shape tool is clicked
 */
class ToolPanelControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "aside" });
    this.add_class("ap-tool-panel");
    this.add_class("ap-panel-narrow");
    this.dom.attributes["data-jsgui-control"] = "ap_tool_panel";
    
    this._currentTool = "select";
    this._buttons = {};
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    TOOLS.forEach(tool => {
      if (tool.id === "---") {
        // Divider
        const div = new Control({ context: ctx, tagName: "div" });
        div.add_class("ap-tool-panel__divider");
        this.add(div);
      } else {
        const btn = this._createButton(tool);
        this._buttons[tool.id] = btn;
        this.add(btn);
      }
    });
  }
  
  _createButton(tool) {
    const ctx = this.context;
    const btn = new Control({ context: ctx, tagName: "button" });
    btn.add_class("ap-tool-panel__btn");
    btn.dom.attributes["data-tool"] = tool.id;
    btn.dom.attributes["title"] = tool.label;
    
    if (tool.id === this._currentTool) {
      btn.add_class("ap-tool-panel__btn--active");
    }
    
    btn.add(new String_Control({ context: ctx, text: tool.icon }));
    return btn;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Bind click events
    Object.entries(this._buttons).forEach(([id, btn]) => {
      const el = btn.dom?.el;
      el?.addEventListener?.("click", () => this._handleClick(id));
    });
  }
  
  _handleClick(toolId) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return;
    
    // Shape tools trigger add-shape and stay on select
    if (tool.group === "shapes") {
      this.raise("add-shape", toolId);
      return;
    }
    
    // Navigation tools (select, pan)
    if (tool.group === "tools" || tool.group === "nav") {
      this._setActiveTool(toolId);
      this.raise("tool-select", toolId);
    }
  }
  
  _setActiveTool(toolId) {
    // Remove active from all
    Object.values(this._buttons).forEach(btn => {
      btn.dom?.el?.classList?.remove("ap-tool-panel__btn--active");
    });
    
    // Add active to selected
    const btn = this._buttons[toolId];
    btn?.dom?.el?.classList?.add("ap-tool-panel__btn--active");
    
    this._currentTool = toolId;
  }
  
  /**
   * Get current tool ID.
   */
  getCurrentTool() {
    return this._currentTool;
  }
  
  /**
   * Set tool programmatically.
   */
  setTool(toolId) {
    this._setActiveTool(toolId);
  }
}

module.exports = { ToolPanelControl };
