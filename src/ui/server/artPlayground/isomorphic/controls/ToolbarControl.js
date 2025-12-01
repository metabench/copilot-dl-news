"use strict";

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Toolbar Control - App header with title, quick actions, and export.
 * 
 * Simplified: Tool selection moved to ToolPanelControl.
 * Kept: Delete action and future actions like undo/redo, export.
 * 
 * @fires add-component {string} - Component type (rect/ellipse/text)
 * @fires delete
 * @fires undo
 * @fires redo
 * @fires export
 */
class ToolbarControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "header" });
    this.add_class("art-toolbar");
    this.dom.attributes["data-jsgui-control"] = "art_toolbar";
    this._buttons = {};
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    const btns = this._buttons;
    
    // === App Title ===
    const title = this._section();
    const titleText = new Control({ context: ctx, tagName: "span" });
    titleText.dom.attributes.style = "font-weight: 600; color: var(--ap-cream); font-size: 14px;";
    titleText.add(new String_Control({ context: ctx, text: "🎨 Art Playground" }));
    title.add(titleText);
    this.add(title);
    this.add(this._divider());
    
    // === Quick Add Section ===
    const add = this._section("Add:");
    add.add(btns.addRect = this._btn("add-rect", "▭ Rect"));
    add.add(btns.addEllipse = this._btn("add-ellipse", "○ Ellipse"));
    add.add(btns.addText = this._btn("add-text", "T Text"));
    this.add(add);
    this.add(this._divider());
    
    // === Edit Actions ===
    const edit = this._section();
    edit.add(btns.undo = this._btn("undo", "↺"));
    edit.add(btns.redo = this._btn("redo", "↻"));
    this.add(edit);
    this.add(this._divider());
    
    // === Delete ===
    const actions = this._section();
    const del = btns.delete = this._btn("delete", "🗑️");
    del.add_class("art-toolbar__btn--danger");
    del.dom.attributes.title = "Delete selected";
    actions.add(del);
    this.add(actions);
    
    // === Spacer ===
    const spacer = new Control({ context: ctx, tagName: "div" });
    spacer.dom.attributes.style = "flex: 1;";
    this.add(spacer);
    
    // === Export Button ===
    const exportSection = this._section();
    const exportBtn = btns.export = this._btn("export", "Export SVG");
    exportBtn.dom.attributes.style = "background: var(--ap-gold); color: var(--ap-obsidian); border-color: var(--ap-gold-light);";
    exportSection.add(exportBtn);
    this.add(exportSection);
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
  
  _btn(action, label) {
    const btn = new Control({ context: this.context, tagName: "button" });
    btn.add_class("art-toolbar__btn");
    btn.dom.attributes["data-action"] = action;
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
      "add-rect": () => this.raise("add-component", "rect"),
      "add-ellipse": () => this.raise("add-component", "ellipse"),
      "add-text": () => this.raise("add-component", "text"),
      delete: () => this.raise("delete"),
      undo: () => this.raise("undo"),
      redo: () => this.raise("redo"),
      export: () => this.raise("export")
    };
    actions[action]?.();
  }
}

module.exports = { ToolbarControl };
