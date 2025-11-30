"use strict";

const jsgui = require("../jsgui");
const { ColorSelectorControl } = require("./ColorSelectorControl");

/**
 * Toolbar Control
 * 
 * Contains:
 * - Tool selection (Select, Pan)
 * - Add component buttons (Rectangle, Ellipse, Text)
 * - Delete button
 */
class ToolbarControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-toolbar");
    this.dom.attributes["data-jsgui-control"] = "art_toolbar";
    
    this._currentTool = "select";
    this._buttons = {};
    this._colorSelector = null;
    
    if (!spec.el) {
      this._build();
    }
  }
  
  _build() {
    // Tool section
    const toolSection = new jsgui.Control({ context: this.context, tagName: "div" });
    toolSection.add_class("art-toolbar__section");
    
    const toolLabel = new jsgui.Control({ context: this.context, tagName: "span" });
    toolLabel.add_class("art-toolbar__label");
    toolLabel.add(new jsgui.String_Control({ context: this.context, text: "Tools:" }));
    toolSection.add(toolLabel);
    
    // Select tool
    this._buttons.select = this._createButton("select", "⎋ Select", true);
    toolSection.add(this._buttons.select);
    
    // Pan tool (for future)
    this._buttons.pan = this._createButton("pan", "✋ Pan", false);
    toolSection.add(this._buttons.pan);
    
    this.add(toolSection);
    
    // Divider
    const divider1 = new jsgui.Control({ context: this.context, tagName: "span" });
    divider1.add_class("art-toolbar__divider");
    this.add(divider1);
    
    // Add component section
    const addSection = new jsgui.Control({ context: this.context, tagName: "div" });
    addSection.add_class("art-toolbar__section");
    
    const addLabel = new jsgui.Control({ context: this.context, tagName: "span" });
    addLabel.add_class("art-toolbar__label");
    addLabel.add(new jsgui.String_Control({ context: this.context, text: "Add:" }));
    addSection.add(addLabel);
    
    this._buttons.addRect = this._createButton("add-rect", "▭ Rectangle");
    addSection.add(this._buttons.addRect);
    
    this._buttons.addEllipse = this._createButton("add-ellipse", "◯ Ellipse");
    addSection.add(this._buttons.addEllipse);
    
    this._buttons.addText = this._createButton("add-text", "T Text");
    addSection.add(this._buttons.addText);
    
    this.add(addSection);
    
    // Divider
    const divider2 = new jsgui.Control({ context: this.context, tagName: "span" });
    divider2.add_class("art-toolbar__divider");
    this.add(divider2);
    
    // Actions section
    const actionsSection = new jsgui.Control({ context: this.context, tagName: "div" });
    actionsSection.add_class("art-toolbar__section");
    
    this._buttons.delete = this._createButton("delete", "🗑️ Delete");
    this._buttons.delete.add_class("art-toolbar__btn--danger");
    actionsSection.add(this._buttons.delete);
    
    this.add(actionsSection);

    // Color selector dock
    const colorDock = new jsgui.Control({ context: this.context, tagName: "div" });
    colorDock.add_class("art-toolbar__color-selector");
    this._colorSelector = new ColorSelectorControl({ context: this.context });
    colorDock.add(this._colorSelector);
    this.add(colorDock);
  }
  
  _createButton(action, label, active = false) {
    const btn = new jsgui.Control({ context: this.context, tagName: "button" });
    btn.add_class("art-toolbar__btn");
    btn.dom.attributes["data-action"] = action;
    if (active) {
      btn.add_class("art-toolbar__btn--active");
    }
    btn.add(new jsgui.String_Control({ context: this.context, text: label }));
    return btn;
  }
  
  activate() {
    super.activate();
    
    // Get DOM element reference
    const el = this.dom.el || this.dom;
    this._hydrateColorSelector(el);
    
    // Bind button clicks
    Object.entries(this._buttons).forEach(([key, btn]) => {
      const btnEl = btn.dom.el || btn.dom;
      if (!btnEl || typeof btnEl.addEventListener !== 'function') return;
      
      const action = btnEl.getAttribute("data-action");
      
      btnEl.addEventListener("click", () => {
        this._handleAction(action);
      });
    });

    if (this._colorSelector && typeof this._colorSelector.activate === 'function') {
      this._colorSelector.activate();
      this._bridgeColorSelector();
    }
  }
  
  _handleAction(action) {
    switch (action) {
      case "select":
      case "pan":
        this._setTool(action);
        break;
      case "add-rect":
        this.raise("add-component", "rect");
        break;
      case "add-ellipse":
        this.raise("add-component", "ellipse");
        break;
      case "add-text":
        this.raise("add-component", "text");
        break;
      case "delete":
        this.raise("delete");
        break;
    }
  }
  
  _setTool(toolName) {
    // Update active state
    const selectEl = this._buttons.select.dom.el || this._buttons.select.dom;
    const panEl = this._buttons.pan.dom.el || this._buttons.pan.dom;
    
    if (selectEl && selectEl.classList) {
      selectEl.classList.toggle("art-toolbar__btn--active", toolName === "select");
    }
    if (panEl && panEl.classList) {
      panEl.classList.toggle("art-toolbar__btn--active", toolName === "pan");
    }
    
    this._currentTool = toolName;
    this.raise("tool-change", toolName);
  }

  _hydrateColorSelector(rootEl) {
    if (this._colorSelector) return;
    const host = rootEl || this.dom.el || this.dom;
    if (!host) return;
    const selectorEl = host.querySelector("[data-jsgui-control='art_color_selector']");
    if (selectorEl && selectorEl.__jsgui_control) {
      this._colorSelector = selectorEl.__jsgui_control;
    }
  }

  _bridgeColorSelector() {
    if (!this._colorSelector) return;
    this._colorSelector.on("color-change", (payload) => {
      const color = typeof payload === "string" ? payload : payload?.color;
      if (color) {
        this.raise("color-change", color);
      }
    });
  }

  getCurrentColor() {
    if (this._colorSelector && typeof this._colorSelector.getSelectedColor === "function") {
      return this._colorSelector.getSelectedColor();
    }
    return "#4A90D9";
  }
}

module.exports = { ToolbarControl };
