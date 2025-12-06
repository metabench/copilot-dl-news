"use strict";

/**
 * ConnectionPointControl - Explicit anchor points for node connections
 * 
 * Each connection point is a small, visible element with:
 * - Unique data attributes for identification
 * - Known position relative to its parent node
 * - Type indicator (input/output, yes/no)
 * 
 * This creates an explicit, queryable DOM structure that makes
 * connection drawing reliable and verifiable.
 */

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;

/**
 * Types of connection points
 */
const ConnectionPointType = {
  INPUT_TOP: "input-top",       // Top center - receives connection from parent
  OUTPUT_YES: "output-yes",     // Yes branch output (left side of branch node)
  OUTPUT_NO: "output-no",       // No branch output (right side of branch node)
  OUTPUT_BOTTOM: "output-bottom" // Generic bottom output
};

/**
 * ConnectionPointControl - A single anchor point for connections
 * 
 * Renders as a small circle that:
 * 1. Is visible in the UI (as subtle dots)
 * 2. Has data attributes for querying
 * 3. Has a predictable center point for connection calculations
 */
class ConnectionPointControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-connection-point");
    this.dom.attributes["data-jsgui-control"] = "dt_connection_point";
    
    this._nodeId = spec.nodeId || null;
    this._pointType = spec.pointType || ConnectionPointType.INPUT_TOP;
    this._branch = spec.branch || null; // "yes" or "no" for output points
    
    // Set data attributes for reliable querying
    if (this._nodeId) {
      this.dom.attributes["data-node-id"] = this._nodeId;
    }
    this.dom.attributes["data-point-type"] = this._pointType;
    if (this._branch) {
      this.dom.attributes["data-branch"] = this._branch;
    }
    
    // Add type-specific class
    this.add_class(`dt-connection-point--${this._pointType}`);
    
    if (!spec.el) this.compose();
  }
  
  get nodeId() { return this._nodeId; }
  get pointType() { return this._pointType; }
  get branch() { return this._branch; }
  
  compose() {
    // Inner dot for visual indicator
    const dot = new Control({ context: this.context, tagName: "div" });
    dot.add_class("dt-connection-point__dot");
    this.add(dot);
  }
  
  /**
   * Get the center position of this connection point (relative to viewport)
   */
  getCenter() {
    const el = this.dom?.el;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }
  
  /**
   * Get the center position relative to a container element
   */
  getCenterRelativeTo(containerEl) {
    const el = this.dom?.el;
    if (!el || !containerEl) return null;
    
    const pointRect = el.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    
    return {
      x: (pointRect.left + pointRect.width / 2) - containerRect.left,
      y: (pointRect.top + pointRect.height / 2) - containerRect.top
    };
  }
}

/**
 * Create a set of connection points for a branch node
 */
function createBranchNodeConnectors(context, nodeId) {
  return {
    input: new ConnectionPointControl({
      context,
      nodeId,
      pointType: ConnectionPointType.INPUT_TOP
    }),
    outputYes: new ConnectionPointControl({
      context,
      nodeId,
      pointType: ConnectionPointType.OUTPUT_YES,
      branch: "yes"
    }),
    outputNo: new ConnectionPointControl({
      context,
      nodeId,
      pointType: ConnectionPointType.OUTPUT_NO,
      branch: "no"
    })
  };
}

/**
 * Create connection point for a result node (input only)
 */
function createResultNodeConnector(context, nodeId) {
  return {
    input: new ConnectionPointControl({
      context,
      nodeId,
      pointType: ConnectionPointType.INPUT_TOP
    })
  };
}

module.exports = {
  ConnectionPointControl,
  ConnectionPointType,
  createBranchNodeConnectors,
  createResultNodeConnector
};
