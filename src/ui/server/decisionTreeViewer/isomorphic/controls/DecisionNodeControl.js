"use strict";

/**
 * DecisionNodeControl - Base control for decision tree nodes
 * 
 * Provides common functionality for both branch and result nodes:
 * - Selection state
 * - Hover effects
 * - Click handling
 * - Tooltip display
 * - Explicit connection points for robust line drawing
 * 
 * Subclasses: BranchNodeControl, ResultNodeControl
 */

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;
const { 
  ConnectionPointControl, 
  ConnectionPointType,
  createBranchNodeConnectors,
  createResultNodeConnector 
} = require("./ConnectionPointControl");

/**
 * Base class for all decision node controls.
 * 
 * @fires select - Node was selected
 * @fires hover - Mouse entered node
 * @fires leave - Mouse left node
 */
class DecisionNodeControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-node");
    this.dom.attributes["data-jsgui-control"] = "dt_node";
    
    this._node = spec.node || null;
    this._selected = false;
    this._depth = spec.depth || 0;
    
    if (this._node) {
      this.dom.attributes["data-node-id"] = this._node.id;
      this.dom.attributes["data-node-type"] = this._node.type;
    }
    
    if (!spec.el) this.compose();
  }
  
  get node() {
    return this._node;
  }
  
  get selected() {
    return this._selected;
  }
  
  set selected(value) {
    this._selected = value;
    if (value) {
      this.add_class("dt-node--selected");
    } else {
      this.remove_class("dt-node--selected");
    }
  }
  
  compose() {
    // Subclasses implement this
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    const el = this.dom?.el;
    if (!el) return;
    
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.raise("select", { node: this._node, control: this });
    });
    
    el.addEventListener("mouseenter", () => {
      this.raise("hover", { node: this._node, control: this });
    });
    
    el.addEventListener("mouseleave", () => {
      this.raise("leave", { node: this._node, control: this });
    });
  }
  
  /**
   * Highlight this node (for path visualization).
   */
  highlight(enabled = true) {
    if (enabled) {
      this.add_class("dt-node--highlight");
    } else {
      this.remove_class("dt-node--highlight");
    }
  }
}


/**
 * BranchNodeControl - Diamond-shaped condition node
 * 
 * Displays:
 * - Question/condition label
 * - Node ID
 * - YES/NO output connectors (explicit ConnectionPointControls)
 */
class BranchNodeControl extends DecisionNodeControl {
  constructor(spec = {}) {
    super(spec);
    this.add_class("dt-node--branch");
    this.dom.attributes["data-jsgui-control"] = "dt_branch_node";
    
    // Connection points (populated in compose)
    this._connectors = null;
  }
  
  compose() {
    const ctx = this.context;
    const node = this._node;
    
    // Diamond content container
    const content = this._content = new Control({ context: ctx, tagName: "div" });
    content.add_class("dt-node__content");
    
    // Inner content (rotated back to readable)
    const inner = new Control({ context: ctx, tagName: "div" });
    inner.add_class("dt-node__inner");
    
    // Label (the question)
    if (node?.label) {
      const label = new Control({ context: ctx, tagName: "div" });
      label.add_class("dt-node__label");
      label.add(new String_Control({ context: ctx, text: node.label }));
      inner.add(label);
    }
    
    // Node ID (small, for debugging/reference)
    if (node?.id) {
      const id = new Control({ context: ctx, tagName: "div" });
      id.add_class("dt-node__id");
      id.add(new String_Control({ context: ctx, text: node.id }));
      inner.add(id);
    }
    
    content.add(inner);
    this.add(content);
    
    // Create explicit connection points
    this._addConnectionPoints();
  }
  
  _addConnectionPoints() {
    const ctx = this.context;
    const nodeId = this._node?.id;
    
    // Create and store connection points
    this._connectors = createBranchNodeConnectors(ctx, nodeId);
    
    // Add them to the control
    this.add(this._connectors.input);
    this.add(this._connectors.outputYes);
    this.add(this._connectors.outputNo);
  }
  
  /**
   * Get connection points for this node
   */
  get connectors() {
    return this._connectors;
  }
  
  /**
   * Get the center point of this node (for connection drawing).
   */
  getCenter() {
    const el = this.dom?.el;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }
}


/**
 * ResultNodeControl - Rounded rectangle result node
 * 
 * Displays:
 * - Result icon (✓ or ✗)
 * - Result label
 * - Reason code
 * - Input connection point
 * 
 * Color-coded: green for true, red for false
 */
class ResultNodeControl extends DecisionNodeControl {
  constructor(spec = {}) {
    super(spec);
    this.add_class("dt-node--result");
    
    const node = this._node;
    if (node) {
      if (node.result === true || node.isMatch) {
        this.add_class("dt-node--result-true");
      } else {
        this.add_class("dt-node--result-false");
      }
    }
    
    this.dom.attributes["data-jsgui-control"] = "dt_result_node";
    
    // Connection points (populated in compose)
    this._connectors = null;
  }
  
  compose() {
    const ctx = this.context;
    const node = this._node;
    
    // Content container
    const content = this._content = new Control({ context: ctx, tagName: "div" });
    content.add_class("dt-node__content");
    
    // Result icon
    const icon = new Control({ context: ctx, tagName: "div" });
    icon.add_class("dt-node__icon");
    const iconChar = (node?.result === true || node?.isMatch) ? "✓" : "✗";
    icon.add(new String_Control({ context: ctx, text: iconChar }));
    content.add(icon);
    
    // Label
    if (node?.label) {
      const label = new Control({ context: ctx, tagName: "div" });
      label.add_class("dt-node__label");
      label.add(new String_Control({ context: ctx, text: node.label }));
      content.add(label);
    }
    
    // Reason code
    if (node?.reason) {
      const reason = new Control({ context: ctx, tagName: "div" });
      reason.add_class("dt-node__reason");
      reason.add(new String_Control({ context: ctx, text: node.reason }));
      content.add(reason);
    }
    
    this.add(content);
    
    // Create explicit connection point (input only for result nodes)
    this._addConnectionPoints();
  }
  
  _addConnectionPoints() {
    const ctx = this.context;
    const nodeId = this._node?.id;
    
    // Create and store connection point
    this._connectors = createResultNodeConnector(ctx, nodeId);
    
    // Add input connector
    this.add(this._connectors.input);
  }
  
  /**
   * Get connection points for this node
   */
  get connectors() {
    return this._connectors;
  }
  
  /**
   * Get the center point of this node.
   */
  getCenter() {
    const el = this.dom?.el;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }
}


module.exports = {
  DecisionNodeControl,
  BranchNodeControl,
  ResultNodeControl
};
