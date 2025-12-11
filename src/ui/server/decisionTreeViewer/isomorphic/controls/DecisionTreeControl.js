"use strict";

/**
 * DecisionTreeControl - Renders an entire decision tree
 * 
 * Features:
 * - Automatic tree layout (horizontal levels)
 * - Robust SVG connections via ConnectionRenderer
 * - Node selection
 * - Path highlighting with animated connections
 * - Lazy rendering for large trees
 * - Responsive to container resizing
 * 
 * Layout:
 * ```
 *           [Root]
 *          /      \
 *      [Yes]      [No]
 *      /   \      /   \
 *    ...   ...  ...   ...
 * ```
 */

const jsgui = require("../jsgui");
const { Control, String_Control } = jsgui;
const { BranchNodeControl, ResultNodeControl } = require("./DecisionNodeControl");
const { DecisionTree, BranchNode, ResultNode } = require("../model/DecisionTree");

// ConnectionRenderer is client-side only (uses DOM APIs)
let ConnectionRenderer = null;
if (typeof window !== "undefined") {
  ConnectionRenderer = require("./ConnectionRenderer").ConnectionRenderer;
}

/**
 * Main control for rendering a decision tree.
 * 
 * @fires node-select - A node was selected
 * @fires node-hover - Mouse entered a node
 * @fires node-leave - Mouse left a node
 */
class DecisionTreeControl extends Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div" });
    this.add_class("dt-tree");
    this.dom.attributes["data-jsgui-control"] = "dt_tree";
    
    this._tree = spec.tree || null;
    this._nodeControls = new Map(); // node.id -> control
    this._connectionMap = new Map(); // "parentId-childId" -> connection data
    this._connectionRenderer = null;
    this._selectedNodeId = null;
    this._highlightedPath = [];
    this._resizeObserver = null;
    
    if (this._tree) {
      this.dom.attributes["data-tree-id"] = this._tree.id;
    }
    
    if (!spec.el) this.compose();
  }
  
  get tree() {
    return this._tree;
  }
  
  set tree(value) {
    this._tree = value;
    this._nodeControls.clear();
    this._selectedNodeId = null;
    this._highlightedPath = [];

    if (this._tree) {
      this.dom.attributes["data-tree-id"] = this._tree.id;
    } else {
      delete this.dom.attributes["data-tree-id"];
    }

    // Dispose existing rendering artifacts
    this._teardownRender();

    // Re-compose with the new tree and re-activate if already active
    this.compose();
    if (this.__active) {
      this.activate();
      this._initConnections();
    }
  }

  /**
   * Clear rendered children/observers/renderers before re-composing.
   */
  _teardownRender() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }
    if (this._connectionRenderer) {
      this._connectionRenderer.dispose();
      this._connectionRenderer = null;
    }
    this._connectionMap.clear();

    // Remove existing child controls / DOM
    if (this.remove_all) {
      this.remove_all();
    } else if (this.dom?.el) {
      this.dom.el.innerHTML = "";
    }
  }
  
  compose() {
    if (!this._tree?.root) return;
    
    const ctx = this.context;
    
    // SVG layer for connections (rendered after nodes for positioning)
    this._connectionsContainer = new Control({ context: ctx, tagName: "div" });
    this._connectionsContainer.add_class("dt-connections");
    this._connectionsContainer.dom.attributes.style = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;";
    
    // Build tree levels
    const levels = this._buildLevels(this._tree.root);
    
    // Render each level
    levels.forEach((levelNodes, levelIndex) => {
      const levelContainer = new Control({ context: ctx, tagName: "div" });
      levelContainer.add_class("dt-level");
      levelContainer.dom.attributes["data-level"] = String(levelIndex);
      
      levelNodes.forEach(({ node, parentId, branch }) => {
        const nodeControl = this._createNodeControl(node, levelIndex, parentId, branch);
        this._nodeControls.set(node.id, nodeControl);
        levelContainer.add(nodeControl);
      });
      
      this.add(levelContainer);
    });
    
    // Add connections container last (will be populated client-side)
    this.add(this._connectionsContainer);
  }
  
  /**
   * Build levels array from tree (BFS).
   * Each level is an array of { node, parentId, branch } objects.
   */
  _buildLevels(root) {
    const levels = [];
    const queue = [{ node: root, parentId: null, branch: null, level: 0 }];
    
    while (queue.length > 0) {
      const { node, parentId, branch, level } = queue.shift();
      
      // Ensure level array exists
      while (levels.length <= level) {
        levels.push([]);
      }
      
      levels[level].push({ node, parentId, branch });
      
      // Queue children if branch node
      if (node instanceof BranchNode || node.type === "branch") {
        if (node.yes) {
          queue.push({ node: node.yes, parentId: node.id, branch: "yes", level: level + 1 });
        }
        if (node.no) {
          queue.push({ node: node.no, parentId: node.id, branch: "no", level: level + 1 });
        }
      }
    }
    
    return levels;
  }
  
  /**
   * Create the appropriate control for a node.
   */
  _createNodeControl(node, depth, parentId, branch) {
    const spec = {
      context: this.context,
      node: node,
      depth: depth
    };
    
    let control;
    if (node instanceof BranchNode || node.type === "branch") {
      control = new BranchNodeControl(spec);
    } else {
      control = new ResultNodeControl(spec);
    }
    
    // Store connection info for SVG drawing
    control.dom.attributes["data-parent-id"] = parentId || "";
    control.dom.attributes["data-branch"] = branch || "";
    
    return control;
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    
    // Activate all node controls and wire events
    this._nodeControls.forEach((control, nodeId) => {
      control.activate?.();
      
      control.on("select", ({ node }) => {
        this._selectNode(nodeId);
        this.raise("node-select", { node, nodeId });
      });
      
      control.on("hover", ({ node }) => {
        this.raise("node-hover", { node, nodeId });
      });
      
      control.on("leave", ({ node }) => {
        this.raise("node-leave", { node, nodeId });
      });
    });
    
    // Draw connections after layout is complete
    requestAnimationFrame(() => this._initConnections());
    
    // Set up resize observer for responsive redrawing
    this._setupResizeObserver();
  }
  
  /**
   * Initialize the connection renderer and draw all connections.
   */
  _initConnections() {
    const container = this._connectionsContainer?.dom?.el;
    if (!container) {
      // Fallback to legacy drawing if container not available
      this._drawConnectionsLegacy();
      return;
    }
    
    // Use robust ConnectionRenderer if available (client-side)
    if (ConnectionRenderer) {
      this._connectionRenderer = new ConnectionRenderer(container, {
        animateOnDraw: true,
        showArrows: true,
        showLabels: true
      });
      
      this._drawConnectionsWithRenderer();
    } else {
      // Server-side or fallback
      this._drawConnectionsLegacy();
    }
  }
  
  /**
   * Draw connections using the robust ConnectionRenderer.
   */
  _drawConnectionsWithRenderer() {
    if (!this._connectionRenderer) return;
    
    this._connectionRenderer.clear();
    this._connectionMap.clear();
    
    // Draw connection for each non-root node
    this._nodeControls.forEach((control, nodeId) => {
      const parentId = control.dom.el?.getAttribute("data-parent-id");
      const branch = control.dom.el?.getAttribute("data-branch");
      
      if (!parentId || !branch) return; // Root node
      
      const parentControl = this._nodeControls.get(parentId);
      if (!parentControl?.dom?.el) return;
      
      const connectionId = `${parentId}-${nodeId}`;
      
      const connection = this._connectionRenderer.addConnection(
        connectionId,
        parentControl.dom.el,
        control.dom.el,
        branch
      );
      
      if (connection) {
        this._connectionMap.set(connectionId, {
          parentId,
          childId: nodeId,
          branch,
          connection
        });
      }
    });
  }
  
  /**
   * Set up resize observer for responsive connection redrawing.
   */
  _setupResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    
    const el = this.dom?.el;
    if (!el) return;
    
    this._resizeObserver = new ResizeObserver(() => {
      // Debounce redraw
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => {
        this._redrawConnections();
      }, 100);
    });
    
    this._resizeObserver.observe(el);
  }
  
  /**
   * Redraw all connections (e.g., after resize).
   */
  _redrawConnections() {
    if (this._connectionRenderer) {
      this._connectionRenderer.redrawAll();
    } else {
      this._drawConnectionsLegacy();
    }
  }
  
  /**
   * Select a node by ID.
   */
  _selectNode(nodeId) {
    // Deselect previous
    if (this._selectedNodeId) {
      const prev = this._nodeControls.get(this._selectedNodeId);
      if (prev) prev.selected = false;
    }
    
    // Select new
    this._selectedNodeId = nodeId;
    const control = this._nodeControls.get(nodeId);
    if (control) control.selected = true;
  }
  
  /**
   * Highlight a path through the tree.
   * @param {string[]} nodeIds - Array of node IDs in path order
   */
  highlightPath(nodeIds) {
    // Clear previous node highlights
    this._highlightedPath.forEach(id => {
      const control = this._nodeControls.get(id);
      control?.highlight(false);
    });
    
    // Clear connection highlights
    if (this._connectionRenderer) {
      this._connectionRenderer.clearHighlights();
    }
    
    // Set new node highlights
    this._highlightedPath = nodeIds;
    nodeIds.forEach(id => {
      const control = this._nodeControls.get(id);
      control?.highlight(true);
    });
    
    // Highlight connections between consecutive nodes in path
    if (this._connectionRenderer && nodeIds.length > 1) {
      const connectionIds = [];
      for (let i = 0; i < nodeIds.length - 1; i++) {
        const connectionId = `${nodeIds[i]}-${nodeIds[i + 1]}`;
        if (this._connectionMap.has(connectionId)) {
          connectionIds.push(connectionId);
        }
      }
      this._connectionRenderer.highlightPath(connectionIds);
    }
  }
  
  /**
   * Get a node control by ID.
   */
  getNodeControl(nodeId) {
    return this._nodeControls.get(nodeId);
  }
  
  /**
   * Get the connection renderer instance.
   */
  getConnectionRenderer() {
    return this._connectionRenderer;
  }
  
  /**
   * Dispose of resources when control is removed.
   */
  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }
    
    if (this._connectionRenderer) {
      this._connectionRenderer.dispose();
      this._connectionRenderer = null;
    }
    
    this._nodeControls.clear();
    this._connectionMap.clear();
  }
  
  /**
   * Legacy SVG connection drawing (fallback for SSR or older browsers).
   * Called after layout is complete.
   */
  _drawConnectionsLegacy() {
    const container = this._connectionsContainer?.dom?.el;
    if (!container) return;
    
    // Create SVG element
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.overflow = "visible";
    svg.style.zIndex = "1";
    
    const treeRect = this.dom.el.getBoundingClientRect();
    const getPointRect = (nodeEl, pointType, branch) => {
      if (!nodeEl?.querySelector) return null;
      let selector = `[data-jsgui-control="dt_connection_point"][data-point-type="${pointType}"]`;
      if (branch) selector += `[data-branch="${branch}"]`;
      return nodeEl.querySelector(selector)?.getBoundingClientRect?.() || null;
    };
    
    // Draw connection for each non-root node
    this._nodeControls.forEach((control, nodeId) => {
      const parentId = control.dom.el?.getAttribute("data-parent-id");
      const branch = control.dom.el?.getAttribute("data-branch");
      
      if (!parentId || !branch) return; // Root node
      
      const parentControl = this._nodeControls.get(parentId);
      if (!parentControl) return;
      
      // Get positions relative to tree container
      const parentRect = parentControl.dom.el.getBoundingClientRect();
      const childRect = control.dom.el.getBoundingClientRect();
      const startRect = getPointRect(parentControl.dom.el, branch === "yes" ? "output-yes" : "output-no", branch) || parentRect;
      const endRect = getPointRect(control.dom.el, "input-top") || childRect;
      
      // Calculate start and end points
      let startX, startY, endX, endY;
      
      // Use connector centers when available for precise geometry
      startX = startRect.left + startRect.width / 2 - treeRect.left;
      startY = startRect.top + startRect.height / 2 - treeRect.top;
      
      // End at input connector or top center of child
      endX = endRect.left + endRect.width / 2 - treeRect.left;
      endY = endRect.top + endRect.height / 2 - treeRect.top;
      
      // Calculate bezier control points for smooth S-curve
      const dx = endX - startX;
      const dy = endY - startY;
      const tension = 0.5;
      const verticalOffset = Math.max(30, Math.abs(dy) * tension);
      const horizontalBias = dx * 0.2;
      
      const cp1x = startX + horizontalBias;
      const cp1y = startY + verticalOffset;
      const cp2x = endX - horizontalBias;
      const cp2y = endY - verticalOffset;
      
      // Draw bezier curve
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.classList.add("dt-connection");
      path.classList.add(branch === "yes" ? "dt-connection--yes" : "dt-connection--no");
      svg.appendChild(path);
      
      // Add YES/NO label
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", startX + dx * 0.15);
      text.setAttribute("y", startY + 20);
      text.classList.add("dt-connection__label");
      text.classList.add(branch === "yes" ? "dt-connection__label--yes" : "dt-connection__label--no");
      text.textContent = branch.toUpperCase();
      svg.appendChild(text);
      
      // Store connection data for highlighting
      const connectionId = `${parentId}-${nodeId}`;
      this._connectionMap.set(connectionId, {
        parentId,
        childId: nodeId,
        branch,
        path,
        label: text
      });
    });
    
    container.innerHTML = "";
    container.appendChild(svg);
  }
}


module.exports = { DecisionTreeControl };
