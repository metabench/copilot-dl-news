"use strict";

/**
 * DecisionTreeViewerControl - Main viewer page control
 * 
 * Layout:
 * ```
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  🌲 Decision Tree Viewer                              [⚙️]  ║
 * ╠══════════════════════╦═══════════════════════════════════════╣
 * ║  Tree List           ║  Tree Canvas                          ║
 * ║  ┌──────────────────┐║  ┌───────────────────────────────────┐║
 * ║  │ ▶ Article Detect │║  │                                   │║
 * ║  │   URL Parser     │║  │           [Root Node]             │║
 * ║  │   Domain Filter  │║  │            /      \               │║
 * ║  │   Content Type   │║  │        [Yes]      [No]            │║
 * ║  └──────────────────┘║  │                                   │║
 * ╚══════════════════════╩═══════════════════════════════════════╝
 * ```
 */

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;
const { DecisionTreeControl } = require("./DecisionTreeControl");
const { DecisionTree, createExampleTree } = require("../model/DecisionTree");

/**
 * Tree list item control.
 */
class TreeListItemControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-tree-list-item");
    this.dom.attributes["data-jsgui-control"] = "dt_tree_list_item";
    
    this._tree = spec.tree;
    this._selected = false;
    
    if (this._tree) {
      this.dom.attributes["data-tree-id"] = this._tree.id;
    }
    
    if (!spec.el) this.compose();
  }
  
  get selected() {
    return this._selected;
  }
  
  set selected(value) {
    this._selected = value;
    if (value) {
      this.add_class("dt-tree-list-item--selected");
    } else {
      this.remove_class("dt-tree-list-item--selected");
    }
  }
  
  compose() {
    if (!this._tree) return;
    const ctx = this.context;
    
    // Icon
    const icon = new Control({ context: ctx, tagName: "span" });
    icon.add_class("dt-tree-list-item__icon");
    icon.add(new String_Control({ context: ctx, text: "🌲" }));
    this.add(icon);
    
    // Name
    const name = new Control({ context: ctx, tagName: "span" });
    name.add_class("dt-tree-list-item__name");
    name.add(new String_Control({ context: ctx, text: this._tree.name }));
    this.add(name);
    
    // Description (truncated)
    if (this._tree.description) {
      const desc = new Control({ context: ctx, tagName: "span" });
      desc.add_class("dt-tree-list-item__description");
      const truncated = this._tree.description.length > 30 
        ? this._tree.description.slice(0, 30) + "…"
        : this._tree.description;
      desc.add(new String_Control({ context: ctx, text: truncated }));
      this.add(desc);
    }
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    el.addEventListener("click", () => {
      this.raise("select", { tree: this._tree });
    });
  }
}


/**
 * Tree list panel control.
 */
class TreeListControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-panel");
    this.add_class("dt-tree-list");
    this.dom.attributes["data-jsgui-control"] = "dt_tree_list";
    
    this._trees = spec.trees || [];
    this._items = new Map();
    this._selectedTreeId = null;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Panel header
    const header = new Control({ context: ctx, tagName: "div" });
    header.add_class("dt-panel__header");
    header.add_class("dt-header");
    
    // Rivets (left)
    const rivetsLeft = new Control({ context: ctx, tagName: "div" });
    rivetsLeft.add_class("dt-header__rivets");
    for (let i = 0; i < 2; i++) {
      const rivet = new Control({ context: ctx, tagName: "span" });
      rivet.add_class("dt-rivet");
      rivetsLeft.add(rivet);
    }
    header.add(rivetsLeft);
    
    // Title
    const title = new Control({ context: ctx, tagName: "h2" });
    title.add_class("dt-header__title");
    title.add(new String_Control({ context: ctx, text: "Decision Trees" }));
    header.add(title);
    
    // Rivets (right)
    const rivetsRight = new Control({ context: ctx, tagName: "div" });
    rivetsRight.add_class("dt-header__rivets");
    for (let i = 0; i < 2; i++) {
      const rivet = new Control({ context: ctx, tagName: "span" });
      rivet.add_class("dt-rivet");
      rivetsRight.add(rivet);
    }
    header.add(rivetsRight);
    
    this.add(header);
    
    // Content area
    const content = new Control({ context: ctx, tagName: "div" });
    content.add_class("dt-panel__content");
    this._content = content;
    
    // Add tree items
    this._trees.forEach(tree => {
      const item = new TreeListItemControl({ context: ctx, tree });
      this._items.set(tree.id, item);
      content.add(item);
    });
    
    this.add(content);
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Wire up selection events
    this._items.forEach((item, treeId) => {
      item.activate?.();
      item.on("select", ({ tree }) => {
        this.selectTree(treeId);
        this.raise("tree-select", { tree });
      });
    });
    
    // Auto-select first tree if none selected
    if (!this._selectedTreeId && this._items.size > 0) {
      const firstId = this._items.keys().next().value;
      this.selectTree(firstId);
    }
  }
  
  selectTree(treeId) {
    // Deselect previous
    if (this._selectedTreeId) {
      const prev = this._items.get(this._selectedTreeId);
      if (prev) prev.selected = false;
    }
    
    // Select new
    this._selectedTreeId = treeId;
    const item = this._items.get(treeId);
    if (item) item.selected = true;
  }
}


/**
 * Main viewer control.
 */
class DecisionTreeViewerControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-viewer");
    this.dom.attributes["data-jsgui-control"] = "dt_viewer";
    
    this._trees = spec.trees || [createExampleTree()];
    this._currentTree = this._trees[0] || null;
    
    if (!spec.el) this.compose();
  }
  
  compose() {
    const ctx = this.context;
    
    // Main header
    const header = new Control({ context: ctx, tagName: "header" });
    header.add_class("dt-viewer__header");
    header.add_class("dt-header");
    
    // Rivets (left)
    const rivetsLeft = new Control({ context: ctx, tagName: "div" });
    rivetsLeft.add_class("dt-header__rivets");
    for (let i = 0; i < 3; i++) {
      const rivet = new Control({ context: ctx, tagName: "span" });
      rivet.add_class("dt-rivet");
      rivetsLeft.add(rivet);
    }
    header.add(rivetsLeft);
    
    // Title
    const title = new Control({ context: ctx, tagName: "h1" });
    title.add_class("dt-header__title");
    title.add(new String_Control({ context: ctx, text: "🌲 Decision Tree Viewer" }));
    header.add(title);
    
    // Rivets (right)
    const rivetsRight = new Control({ context: ctx, tagName: "div" });
    rivetsRight.add_class("dt-header__rivets");
    for (let i = 0; i < 3; i++) {
      const rivet = new Control({ context: ctx, tagName: "span" });
      rivet.add_class("dt-rivet");
      rivetsRight.add(rivet);
    }
    header.add(rivetsRight);
    
    this.add(header);
    
    // Main content area (sidebar + canvas)
    const main = new Control({ context: ctx, tagName: "main" });
    main.add_class("dt-viewer__main");
    
    // Sidebar with tree list
    const sidebar = new Control({ context: ctx, tagName: "aside" });
    sidebar.add_class("dt-viewer__sidebar");
    
    this._treeList = new TreeListControl({ context: ctx, trees: this._trees });
    sidebar.add(this._treeList);
    
    main.add(sidebar);
    
    // Canvas area
    const canvasContainer = new Control({ context: ctx, tagName: "section" });
    canvasContainer.add_class("dt-viewer__canvas-container");
    
    // Canvas panel
    const canvasPanel = new Control({ context: ctx, tagName: "div" });
    canvasPanel.add_class("dt-panel");
    canvasPanel.add_class("dt-canvas-panel");
    
    // Canvas header with current tree name
    const canvasHeader = new Control({ context: ctx, tagName: "div" });
    canvasHeader.add_class("dt-panel__header");
    canvasHeader.add_class("dt-header");
    
    const canvasTitle = new Control({ context: ctx, tagName: "h2" });
    canvasTitle.add_class("dt-header__title");
    this._canvasTitleText = new String_Control({ 
      context: ctx, 
      text: this._currentTree?.name || "No Tree Selected" 
    });
    canvasTitle.add(this._canvasTitleText);
    canvasHeader.add(canvasTitle);
    
    canvasPanel.add(canvasHeader);
    
    // Canvas content
    const canvas = new Control({ context: ctx, tagName: "div" });
    canvas.add_class("dt-canvas");
    this._canvas = canvas;
    
    // Render current tree
    if (this._currentTree) {
      this._treeControl = new DecisionTreeControl({ 
        context: ctx, 
        tree: this._currentTree 
      });
      canvas.add(this._treeControl);
    }
    
    canvasPanel.add(canvas);
    canvasContainer.add(canvasPanel);
    main.add(canvasContainer);
    
    this.add(main);
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Activate tree list
    this._treeList?.activate?.();
    this._treeList?.on("tree-select", ({ tree }) => {
      this.displayTree(tree);
    });
    
    // Activate current tree control
    this._treeControl?.activate?.();
    this._treeControl?.on("node-select", ({ node, nodeId }) => {
      this.raise("node-select", { node, nodeId, tree: this._currentTree });
    });
    
    // Auto-select first tree
    if (this._trees.length > 0) {
      this._treeList.selectTree(this._trees[0].id);
    }
  }
  
  /**
   * Display a tree in the canvas.
   */
  displayTree(tree) {
    this._currentTree = tree;
    
    // Update title
    const titleEl = this._canvasTitleText?.dom?.el;
    if (titleEl) {
      titleEl.textContent = tree.name;
    }
    
    // Create new tree control (client-side dynamic update)
    const canvasEl = this._canvas?.dom?.el;
    if (canvasEl) {
      // Dispose previous control to avoid stray observers/renderers
      this._treeControl?.dispose?.();

      // Clear canvas children/DOM
      if (this._canvas.remove_all) {
        this._canvas.remove_all();
      } else {
        canvasEl.innerHTML = "";
      }

      // Create, attach, and activate new control so jsgui3 lifecycle runs
      this._treeControl = new DecisionTreeControl({ 
        context: this.context, 
        tree: tree 
      });

      this._canvas.add(this._treeControl);
      this._treeControl.activate?.();
      this._treeControl.on("node-select", ({ node, nodeId }) => {
        this.raise("node-select", { node, nodeId, tree: this._currentTree });
      });
    }
  }
}


module.exports = { 
  DecisionTreeViewerControl, 
  TreeListControl, 
  TreeListItemControl 
};
