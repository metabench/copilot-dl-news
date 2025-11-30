"use strict";

const jsgui = require("../jsgui");
const { CanvasControl } = require("./CanvasControl");
const { ToolbarControl } = require("./ToolbarControl");

const { Control } = jsgui;

/**
 * Main App Control for Art Playground.
 * Layout: Toolbar at top, Canvas fills rest.
 */
class ArtPlaygroundAppControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-app");
    this.dom.attributes["data-jsgui-control"] = "art_app";
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    this.add(this._toolbar = new ToolbarControl({ context: ctx }));
    this.add(this._canvas = new CanvasControl({ context: ctx }));
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom.el;
    
    // Find child controls from DOM if hydrating
    if (el) {
      const toolbarEl = el.querySelector("[data-jsgui-control='art_toolbar']");
      const canvasEl = el.querySelector("[data-jsgui-control='art_canvas']");
      this._toolbar ??= toolbarEl?.__jsgui_control;
      this._canvas ??= canvasEl?.__jsgui_control;
    }
    
    // Wire toolbar → canvas
    if (this._toolbar && this._canvas) {
      this._toolbar.on("tool-change", (tool) => this._canvas.setTool(tool));
      this._toolbar.on("add-component", (type) => this._canvas.addComponent(type));
      this._toolbar.on("delete", () => this._canvas.deleteSelected());
    }
  }
}

module.exports = { ArtPlaygroundAppControl };
