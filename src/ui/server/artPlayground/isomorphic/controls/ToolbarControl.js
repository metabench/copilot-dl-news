"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Toolbar Control - Tools, shape creation, and actions.
 * @fires tool-change {string} - Tool name
 * @fires add-component {string} - Component type (rect/ellipse/text)
 * @fires delete
 */
class ToolbarControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("art-toolbar");
    this.dom.attributes["data-jsgui-control"] = "art_toolbar";
    this._currentTool = "select";
    this._buttons = {};
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    const btns = this._buttons;
    
    // === Tools Section ===
    const tools = this._section("Tools:");
    tools.add(btns.select = this._btn("select", "⎋ Select", true));
    tools.add(btns.pan = this._btn("pan", "✋ Pan"));
    this.add(tools);
    this.add(this._divider());
    
    // === Add Section ===
    const add = this._section("Add:");
    add.add(btns.addRect = this._btn("add-rect", "▭ Rectangle"));
    add.add(btns.addEllipse = this._btn("add-ellipse", "◯ Ellipse"));
    add.add(btns.addText = this._btn("add-text", "T Text"));
    this.add(add);
    this.add(this._divider());
    
    // === Actions Section ===
    const actions = this._section();
    const del = btns.delete = this._btn("delete", "🗑️ Delete");
    del.add_class("art-toolbar__btn--danger");
    actions.add(del);
    this.add(actions);
  }
  
  _section(label) {
    const ctx = this.context;
    const section = new Control({ context: ctx, tagName: "div" });
    section.add_class("art-toolbar__section");
    if (label) {
      const lbl = new Control({ context: ctx, tagName: "span" });
      lbl.add_class("art-toolbar__label");
      lbl.add(new String_Control({ context: ctx, text: label }));
      section.add(lbl);
    }
    return section;
  }
  
  _divider() {
    const div = new Control({ context: this.context, tagName: "span" });
    div.add_class("art-toolbar__divider");
    return div;
  }
  
  _btn(action, label, active = false) {
    const btn = new Control({ context: this.context, tagName: "button" });
    btn.add_class("art-toolbar__btn");
    btn.dom.attributes["data-action"] = action;
    if (active) btn.add_class("art-toolbar__btn--active");
    btn.add(new String_Control({ context: this.context, text: label }));
    return btn;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    Object.values(this._buttons).forEach(btn => {
      const el = btn.dom?.el;
      el?.addEventListener?.("click", () => {
        this._handleAction(el.getAttribute("data-action"));
      });
    });
  }
  
  _handleAction(action) {
    const actions = {
      select: () => this._setTool("select"),
      pan: () => this._setTool("pan"),
      "add-rect": () => this.raise("add-component", "rect"),
      "add-ellipse": () => this.raise("add-component", "ellipse"),
      "add-text": () => this.raise("add-component", "text"),
      delete: () => this.raise("delete")
    };
    actions[action]?.();
  }
  
  _setTool(tool) {
    const { select, pan } = this._buttons;
    select.dom?.el?.classList?.toggle("art-toolbar__btn--active", tool === "select");
    pan.dom?.el?.classList?.toggle("art-toolbar__btn--active", tool === "pan");
    this._currentTool = tool;
    this.raise("tool-change", tool);
  }
}

module.exports = { ToolbarControl };
