"use strict";

const jsgui = require("../jsgui");
const { CanvasControl } = require("./CanvasControl");
const { ToolbarControl } = require("./ToolbarControl");
const { ToolPanelControl } = require("./ToolPanelControl");
const { PropertiesPanelControl } = require("./PropertiesPanelControl");
const { StatusBarControl } = require("./StatusBarControl");
const { CommandStack } = require('../../../../../shared/utils/commandStack");

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

    this._commandStack = new CommandStack();

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
    
    // Find child controls from DOM when activating existing DOM
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
      this._toolbar.on("add-component", (type) => {
        this._doCommandAddComponent(type);
      });
      this._toolbar.on("delete", () => {
        this._doCommandDeleteSelected();
      });

      this._toolbar.on("undo", () => {
        this._doUndo();
      });
      this._toolbar.on("redo", () => {
        this._doRedo();
      });
      this._toolbar.on("export", () => {
        const svg = this._canvas?.exportSvg?.() || "";
        if (!svg) return;
        this._downloadTextFile("art-playground.svg", svg, "image/svg+xml");
      });
    }
    
    // Tool Panel → Canvas
    if (this._toolPanel && this._canvas) {
      this._toolPanel.on("tool-select", (tool) => {
        this._canvas.setTool(tool);
      });
      this._toolPanel.on("add-shape", (shapeType) => {
        this._doCommandAddComponent(shapeType);
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
        this._canvas.selectComponent?.(id);
        this._updatePanels();
      });

      this._propertiesPanel.on("property-change", ({ id, prop, value }) => {
        if (!prop) return;
        this._doCommandUpdateProperties(id, { [prop]: value });
      });
    }
    
    // Initial panel update
    this._updatePanels();
  }

  _updateUndoRedoUi() {
    if (!this._toolbar?.setUndoRedoState) return;
    this._toolbar.setUndoRedoState({
      canUndo: this._commandStack.canUndo(),
      canRedo: this._commandStack.canRedo()
    });
  }

  _doCommandAddComponent(type) {
    if (!this._canvas?.createComponent) return;
    if (!type) return;

    const cmd = {
      _snapshot: null,
      do: () => {
        if (!cmd._snapshot) {
          const id = this._canvas.createComponent({ type });
          cmd._snapshot = this._canvas.getComponentSnapshot(id);
        } else {
          this._canvas.createComponent(cmd._snapshot);
        }
      },
      undo: () => {
        if (!cmd._snapshot?.id) return;
        this._canvas.removeComponent(cmd._snapshot.id);
      }
    };

    this._commandStack.do(cmd);
    this._updatePanels();
    this._updateUndoRedoUi();
  }

  _doCommandDeleteSelected() {
    if (!this._canvas?.removeComponent) return;
    const sel = this._canvas.getSelectionData?.();
    const id = sel?.id;
    if (!id) return;

    const cmd = {
      _snapshot: null,
      do: () => {
        cmd._snapshot = this._canvas.removeComponent(id);
      },
      undo: () => {
        if (!cmd._snapshot) return;
        this._canvas.createComponent(cmd._snapshot);
      }
    };

    this._commandStack.do(cmd);
    this._updatePanels();
    this._updateUndoRedoUi();
  }

  _doCommandUpdateProperties(id, patch) {
    if (!this._canvas?.updateComponent) return;
    if (!id) return;

    // Prevent duplicate commands when the UI emits the same value twice
    // (e.g. change + blur). If the patch is a no-op, skip pushing a command.
    const current = this._canvas.getComponentSnapshot?.(id);
    if (current && patch && typeof patch === "object") {
      const keys = Object.keys(patch);
      const isNoOp = keys.length > 0 && keys.every((k) => {
        const nextVal = patch[k];
        if (nextVal === undefined) return true;

        if (k === "x" || k === "y" || k === "width" || k === "height") {
          const n = typeof nextVal === "number" ? nextVal : parseFloat(String(nextVal).trim());
          if (!Number.isFinite(n)) return true;
          return typeof current[k] === "number" && current[k] === n;
        }

        if (k === "fill" || k === "stroke") {
          if (typeof nextVal !== "string") return true;
          return String(current[k] ?? "") === nextVal;
        }

        return String(current[k] ?? "") === String(nextVal);
      });
      if (isNoOp) return;
    }

    const prev = this._canvas.getComponentSnapshot?.(id);
    if (!prev) return;

    const cmd = {
      _prev: prev,
      _next: null,
      do: () => {
        if (cmd._next) {
          this._canvas.updateComponent(id, cmd._next);
          return;
        }
        this._canvas.updateComponent(id, patch);
        cmd._next = this._canvas.getComponentSnapshot?.(id);
      },
      undo: () => {
        if (!cmd._prev) return;
        this._canvas.updateComponent(id, cmd._prev);
      }
    };

    this._commandStack.do(cmd);
    this._updatePanels();
    this._updateUndoRedoUi();
  }

  _doCommandUpdateSelectedProperties(patch) {
    const sel = this._canvas?.getSelectionData?.();
    const id = sel?.id;
    if (!id) return;
    this._doCommandUpdateProperties(id, patch);
  }

  _doUndo() {
    if (this._commandStack.undo()) {
      this._updatePanels();
      this._updateUndoRedoUi();
    }
  }

  _doRedo() {
    if (this._commandStack.redo()) {
      this._updatePanels();
      this._updateUndoRedoUi();
    }
  }

  _downloadTextFile(filename, text, mimeType) {
    if (typeof document === "undefined") return;
    try {
      const blob = new Blob([text], { type: mimeType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      // noop
    }
  }
  
  _updatePanels() {
    const selection = this._canvas?.getSelectionData?.() || this._getSelectionFromCanvas();
    const layers = this._canvas?.getLayers?.() || this._getLayersFromCanvas();
    
    // Update status bar
    if (this._statusBar) {
      this._statusBar.updateSelection(selection);
    }
    
    // Update properties panel
    if (this._propertiesPanel) {
      this._propertiesPanel.updateSelection(selection);
      this._propertiesPanel.updateLayers(layers);
    }

    this._updateUndoRedoUi();
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
