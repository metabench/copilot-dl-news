"use strict";

/**
 * Decision Tree Viewer - Client Entry Point
 * 
 * This script is bundled for the browser and handles:
 * 1. jsgui3 client-side control reconstruction
 * 2. DOM element linking
 * 3. Connection drawing using explicit ConnectionPointControls
 * 
 * Uses jsgui3-client pattern from art playground.
 * 
 * ROBUST CONNECTION SYSTEM:
 * - Uses explicit ConnectionPointControl elements as anchors
 * - Queries by data-point-type and data-branch attributes
 * - Validates all connections before drawing
 * - Reports connection verification results
 */

// jsgui3-client expects a global `page_context` when running under strict mode.
if (typeof window !== "undefined" && typeof window.page_context === "undefined") {
  window.page_context = null;
}

const jsgui = require("jsgui3-client");

// Import controls
const { DecisionTreeViewerControl } = require("./isomorphic/controls");
const { DecisionTreeControl } = require("./isomorphic/controls/DecisionTreeControl");
const { BranchNodeControl, ResultNodeControl } = require("./isomorphic/controls/DecisionNodeControl");
const { TreeListControl, TreeListItemControl } = require("./isomorphic/controls/DecisionTreeViewerControl");
const { ConnectionPointControl, ConnectionPointType } = require("./isomorphic/controls/ConnectionPointControl");
const { createExampleTree, DecisionTree } = require("./isomorphic/model/DecisionTree");

/**
 * Connection verification results
 */
const ConnectionVerification = {
  connections: [],
  errors: [],
  warnings: [],
  
  reset() {
    this.connections = [];
    this.errors = [];
    this.warnings = [];
  },
  
  addConnection(conn) {
    this.connections.push(conn);
  },
  
  addError(msg) {
    this.errors.push(msg);
    console.error("[Connection Error]", msg);
  },
  
  addWarning(msg) {
    this.warnings.push(msg);
    console.warn("[Connection Warning]", msg);
  },
  
  report() {
    console.log("[Connection Verification Report]");
    console.log(`  Total connections: ${this.connections.length}`);
    console.log(`  Errors: ${this.errors.length}`);
    console.log(`  Warnings: ${this.warnings.length}`);
    
    if (this.errors.length > 0) {
      console.log("  ❌ ERRORS:");
      this.errors.forEach(e => console.log(`     - ${e}`));
    }
    
    if (this.warnings.length > 0) {
      console.log("  ⚠️ WARNINGS:");
      this.warnings.forEach(w => console.log(`     - ${w}`));
    }
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log("  ✅ All connections verified successfully");
    }
    
    return {
      success: this.errors.length === 0,
      connections: this.connections.length,
      errors: this.errors.length,
      warnings: this.warnings.length
    };
  }
};

/**
 * Ensure we have a jsgui context for control instantiation.
 */
function ensureContext() {
  if (typeof document === "undefined") return null;
  
  if (jsgui.context) return jsgui.context;
  
  if (typeof jsgui.Client_Page_Context !== "function") {
    console.warn("[Decision Tree Viewer] Missing Client_Page_Context");
    return null;
  }
  
  const context = new jsgui.Client_Page_Context({ document });
  jsgui.context = context;
  window.page_context = context;
  return context;
}

/**
 * Initialize the decision tree viewer.
 */
function init() {
  console.log("[Decision Tree Viewer] Initializing...");
  
  const context = ensureContext();
  if (!context) {
    console.error("[Decision Tree Viewer] Could not create context");
    return;
  }
  
  // Get tree data from embedded script
  const treeData = window.__DECISION_TREE_DATA__ || [createExampleTree().toJSON()];
  const trees = treeData.map(t => DecisionTree.fromJSON(t));
  
  console.log("[Decision Tree Viewer] Trees loaded:", trees.length);
  
  // Find viewer element
  const viewerEl = document.querySelector('[data-jsgui-control="dt_viewer"]');
  if (!viewerEl) {
    console.error("[Decision Tree Viewer] Viewer element not found");
    return;
  }
  
  // Set up tree list interactivity
  setupTreeList(viewerEl, trees);
  
  // Set up node selection
  setupNodeSelection(viewerEl);
  
  // Set up node dragging with connection updates
  setupNodeDragging(viewerEl);
  
  // Draw connections after a frame (layout must be complete)
  requestAnimationFrame(() => {
    drawAllConnections(viewerEl);
  });
  
  // Set up resize observer to redraw connections
  setupResizeObserver(viewerEl);
  
  console.log("[Decision Tree Viewer] Initialization complete");
}

/**
 * Set up tree list interactivity.
 */
function setupTreeList(viewerEl, trees) {
  const treeListItems = viewerEl.querySelectorAll('.dt-tree-list-item');
  
  let selectedTreeId = trees[0]?.id;
  
  // Select first item initially
  if (treeListItems[0]) {
    treeListItems[0].classList.add('dt-tree-list-item--selected');
  }
  
  treeListItems.forEach((item, index) => {
    const tree = trees[index];
    if (!tree) return;
    
    item.addEventListener('click', function() {
      // Update selection styling
      treeListItems.forEach(i => i.classList.remove('dt-tree-list-item--selected'));
      item.classList.add('dt-tree-list-item--selected');
      selectedTreeId = tree.id;
      
      // Update canvas title
      const title = viewerEl.querySelector('.dt-canvas-panel .dt-header__title');
      if (title) title.textContent = tree.name;
      
      console.log('[Decision Tree Viewer] Selected tree:', tree.name);
    });
  });
}

/**
 * Set up node selection interactivity.
 */
function setupNodeSelection(viewerEl) {
  const nodes = viewerEl.querySelectorAll('.dt-node');
  
  nodes.forEach(node => {
    node.addEventListener('click', function(e) {
      e.stopPropagation();
      
      // Update selection styling
      nodes.forEach(n => n.classList.remove('dt-node--selected'));
      node.classList.add('dt-node--selected');
      
      const nodeId = node.getAttribute('data-node-id');
      console.log('[Decision Tree Viewer] Selected node:', nodeId);
    });
  });
}

/**
 * Set up node dragging with automatic connection updates.
 * 
 * When a node is dragged:
 * 1. The node's position is updated via CSS transform
 * 2. All connections are redrawn to follow the new positions
 * 3. Drag events are tracked for testing
 * 
 * Uses jsgui3 pattern: binds mousemove/mouseup to viewer element
 * instead of document for better encapsulation.
 */
function setupNodeDragging(viewerEl) {
  const nodes = viewerEl.querySelectorAll('.dt-node');
  
  // Track drag state for testing
  window.__DRAG_STATE__ = {
    isDragging: false,
    draggedNode: null,
    dragCount: 0,
    lastDragDelta: null,
    connectionUpdates: 0
  };
  
  // Track which node is being dragged (shared across all node handlers)
  let activeNodeEl = null;
  let startX = 0, startY = 0;
  let startTransformX = 0, startTransformY = 0;
  
  // Set up each node for dragging
  nodes.forEach(nodeEl => {
    // Parse existing transform if any
    let currentTransform = { x: 0, y: 0 };
    const existingTransform = nodeEl.style.transform;
    if (existingTransform) {
      const match = existingTransform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
      if (match) {
        currentTransform.x = parseFloat(match[1]);
        currentTransform.y = parseFloat(match[2]);
      }
    }
    
    // Store transform on element for access during drag
    nodeEl._dragTransform = currentTransform;
    
    // Make node position relative for dragging
    if (getComputedStyle(nodeEl).position === 'static') {
      nodeEl.style.position = 'relative';
    }
    
    nodeEl.addEventListener('mousedown', function(e) {
      // Only drag on left click, not on connection points
      if (e.button !== 0) return;
      if (e.target.closest('.dt-connection-point')) return;
      
      activeNodeEl = nodeEl;
      startX = e.clientX;
      startY = e.clientY;
      startTransformX = nodeEl._dragTransform.x;
      startTransformY = nodeEl._dragTransform.y;
      
      nodeEl.classList.add('dt-node--dragging');
      
      window.__DRAG_STATE__.isDragging = true;
      window.__DRAG_STATE__.draggedNode = nodeEl.getAttribute('data-node-id');
      
      console.log('[Decision Tree Viewer] Drag start:', nodeEl.getAttribute('data-node-id'));
      
      e.preventDefault();
      e.stopPropagation();
    });
  });
  
  // Bind mousemove to the viewer element (jsgui3 pattern - scope to control)
  viewerEl.addEventListener('mousemove', function(e) {
    if (!activeNodeEl) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    activeNodeEl._dragTransform.x = startTransformX + deltaX;
    activeNodeEl._dragTransform.y = startTransformY + deltaY;
    
    activeNodeEl.style.transform = `translate(${activeNodeEl._dragTransform.x}px, ${activeNodeEl._dragTransform.y}px)`;
    
    window.__DRAG_STATE__.lastDragDelta = { x: deltaX, y: deltaY };
    
    // Redraw connections during drag (throttled via RAF)
    requestAnimationFrame(() => {
      if (activeNodeEl) {
        drawAllConnections(viewerEl);
        window.__DRAG_STATE__.connectionUpdates++;
      }
    });
  });
  
  // Bind mouseup to viewer (jsgui3 pattern)
  viewerEl.addEventListener('mouseup', endDrag);
  
  // Also bind to document as fallback if mouse leaves viewer during drag
  document.addEventListener('mouseup', endDrag);
  
  function endDrag(e) {
    if (!activeNodeEl) return;
    
    activeNodeEl.classList.remove('dt-node--dragging');
    
    window.__DRAG_STATE__.isDragging = false;
    window.__DRAG_STATE__.dragCount++;
    
    console.log('[Decision Tree Viewer] Drag end:', activeNodeEl.getAttribute('data-node-id'), 
                'delta:', window.__DRAG_STATE__.lastDragDelta);
    
    activeNodeEl = null;
    
    // Final connection redraw
    drawAllConnections(viewerEl);
  }
  
  console.log('[Decision Tree Viewer] Node dragging enabled for', nodes.length, 'nodes');
}

/**
 * Programmatically drag a node for testing.
 * Returns a promise that resolves when the drag is complete.
 */
function simulateDrag(nodeEl, deltaX, deltaY) {
  return new Promise((resolve) => {
    const viewerEl = document.querySelector('[data-jsgui-control="dt_viewer"]');
    const rect = nodeEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    
    // Record initial positions of all connection points
    const initialPositions = recordConnectionPointPositions(viewerEl);
    
    // Simulate mousedown
    nodeEl.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      clientX: startX,
      clientY: startY,
      button: 0
    }));
    
    // Simulate mousemove
    setTimeout(() => {
      document.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: startX + deltaX,
        clientY: startY + deltaY
      }));
      
      // Simulate mouseup
      setTimeout(() => {
        document.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          clientX: startX + deltaX,
          clientY: startY + deltaY
        }));
        
        // Wait for connection redraw
        requestAnimationFrame(() => {
          const finalPositions = recordConnectionPointPositions(viewerEl);
          
          resolve({
            nodeId: nodeEl.getAttribute('data-node-id'),
            delta: { x: deltaX, y: deltaY },
            initialPositions,
            finalPositions,
            dragState: { ...window.__DRAG_STATE__ }
          });
        });
      }, 50);
    }, 50);
  });
}

/**
 * Record positions of all connection points for comparison.
 */
function recordConnectionPointPositions(viewerEl) {
  const positions = {};
  const points = viewerEl.querySelectorAll('[data-jsgui-control="dt_connection_point"]');
  
  points.forEach(point => {
    const nodeId = point.getAttribute('data-node-id');
    const pointType = point.getAttribute('data-point-type');
    const key = `${nodeId}:${pointType}`;
    const rect = point.getBoundingClientRect();
    
    positions[key] = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  });
  
  return positions;
}

/**
 * Set up resize observer to redraw connections on layout changes.
 */
function setupResizeObserver(viewerEl) {
  if (typeof ResizeObserver === 'undefined') return;
  
  let resizeTimeout;
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      drawAllConnections(viewerEl);
    }, 100);
  });
  
  observer.observe(viewerEl);
}

/**
 * Draw connections for all trees in the viewer.
 */
function drawAllConnections(viewerEl) {
  console.log("[Decision Tree Viewer] Drawing connections...");
  ConnectionVerification.reset();
  
  const treeEls = viewerEl.querySelectorAll('[data-jsgui-control="dt_tree"]');
  
  treeEls.forEach(treeEl => {
    drawTreeConnections(treeEl);
  });
  
  const report = ConnectionVerification.report();
  console.log("[Decision Tree Viewer] Connections drawn for", treeEls.length, "trees");
  
  // Expose verification results for testing
  window.__CONNECTION_VERIFICATION__ = report;
}

/**
 * Find a connection point element by node ID and type
 */
function findConnectionPoint(treeEl, nodeId, pointType, branch = null) {
  let selector = `[data-jsgui-control="dt_connection_point"][data-node-id="${nodeId}"][data-point-type="${pointType}"]`;
  if (branch) {
    selector += `[data-branch="${branch}"]`;
  }
  return treeEl.querySelector(selector);
}

/**
 * Get center position of an element relative to container
 */
function getElementCenter(el, containerRect) {
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) - containerRect.left,
    y: (rect.top + rect.height / 2) - containerRect.top
  };
}

/**
 * Draw connections for a single tree using explicit ConnectionPointControls.
 */
function drawTreeConnections(treeEl) {
  // Find the connections container
  const container = treeEl.querySelector('.dt-connections');
  if (!container) {
    ConnectionVerification.addError("No connections container found in tree");
    return;
  }
  
  // Create SVG element
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "dt-connections-svg");
  svg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
  `;
  
  // Add arrow markers
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="arrow-yes" viewBox="0 0 10 10" refX="9" refY="5" 
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--dt-success, #22c55e)"/>
    </marker>
    <marker id="arrow-no" viewBox="0 0 10 10" refX="9" refY="5" 
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--dt-error, #ef4444)"/>
    </marker>
  `;
  svg.appendChild(defs);
  
  const treeRect = treeEl.getBoundingClientRect();
  
  // Find all nodes with parent connections (child nodes)
  const childNodes = treeEl.querySelectorAll('[data-parent-id][data-branch]');
  
  childNodes.forEach(childNodeEl => {
    const parentId = childNodeEl.getAttribute("data-parent-id");
    const branch = childNodeEl.getAttribute("data-branch");
    const childId = childNodeEl.getAttribute("data-node-id");
    
    if (!parentId || !branch || !childId) {
      ConnectionVerification.addWarning(`Node missing required attributes: parentId=${parentId}, branch=${branch}, childId=${childId}`);
      return;
    }
    
    // Find the OUTPUT connection point on the PARENT node
    const outputPointType = branch === "yes" ? "output-yes" : "output-no";
    const outputPoint = findConnectionPoint(treeEl, parentId, outputPointType, branch);
    
    // Find the INPUT connection point on the CHILD node
    const inputPoint = findConnectionPoint(treeEl, childId, "input-top");
    
    // Validate connection points exist
    if (!outputPoint) {
      // Fallback: try to find parent element directly
      const parentEl = treeEl.querySelector(`[data-node-id="${parentId}"]`);
      if (!parentEl) {
        ConnectionVerification.addError(`Parent node not found: ${parentId}`);
        return;
      }
      ConnectionVerification.addWarning(`Output connection point not found for node ${parentId}, branch ${branch}. Using fallback.`);
      // Draw using fallback method
      drawConnectionFallback(svg, treeEl, parentEl, childNodeEl, branch, treeRect);
      return;
    }
    
    if (!inputPoint) {
      ConnectionVerification.addWarning(`Input connection point not found for node ${childId}. Using fallback.`);
      const parentEl = treeEl.querySelector(`[data-node-id="${parentId}"]`);
      if (parentEl) {
        drawConnectionFallback(svg, treeEl, parentEl, childNodeEl, branch, treeRect);
      }
      return;
    }
    
    // Get positions from connection points
    const startPos = getElementCenter(outputPoint, treeRect);
    const endPos = getElementCenter(inputPoint, treeRect);
    
    // Draw the connection
    drawConnection(svg, startPos, endPos, branch);
    
    ConnectionVerification.addConnection({
      parentId,
      childId,
      branch,
      start: startPos,
      end: endPos,
      method: "connection-points"
    });
  });
  
  // Replace container contents
  container.innerHTML = "";
  container.appendChild(svg);
}

/**
 * Draw a connection path between two points.
 */
function drawConnection(svg, startPos, endPos, branch) {
  const startX = startPos.x;
  const startY = startPos.y;
  const endX = endPos.x;
  const endY = endPos.y;
  
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
  
  // Create path
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", branch === "yes" ? "var(--dt-success, #22c55e)" : "var(--dt-error, #ef4444)");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("marker-end", `url(#arrow-${branch})`);
  path.classList.add("dt-connection", `dt-connection--${branch}`);
  svg.appendChild(path);
  
  // Add label
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", startX + dx * 0.15);
  text.setAttribute("y", startY + 18);
  text.setAttribute("fill", branch === "yes" ? "var(--dt-success, #22c55e)" : "var(--dt-error, #ef4444)");
  text.setAttribute("font-family", "var(--dt-font-mono, monospace)");
  text.setAttribute("font-size", "10");
  text.setAttribute("font-weight", "bold");
  text.setAttribute("text-anchor", "middle");
  text.textContent = branch.toUpperCase();
  svg.appendChild(text);
}

/**
 * Fallback connection drawing when explicit connection points aren't found.
 * Uses element bounds instead of dedicated anchors.
 */
function drawConnectionFallback(svg, treeEl, parentEl, childEl, branch, treeRect) {
  const parentRect = parentEl.getBoundingClientRect();
  const childRect = childEl.getBoundingClientRect();
  
  // Calculate start point (from parent)
  let startX, startY;
  if (branch === "yes") {
    startX = parentRect.left + parentRect.width * 0.25 - treeRect.left;
  } else {
    startX = parentRect.left + parentRect.width * 0.75 - treeRect.left;
  }
  startY = parentRect.bottom - treeRect.top;
  
  // Calculate end point (top center of child)
  const endX = childRect.left + childRect.width / 2 - treeRect.left;
  const endY = childRect.top - treeRect.top;
  
  drawConnection(svg, { x: startX, y: startY }, { x: endX, y: endY }, branch);
  
  ConnectionVerification.addConnection({
    parentId: parentEl.getAttribute("data-node-id"),
    childId: childEl.getAttribute("data-node-id"),
    branch,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    method: "fallback"
  });
}

/**
 * Verify all connections are correctly positioned.
 * Returns verification results for testing.
 */
function verifyConnections(viewerEl) {
  const results = {
    valid: true,
    connections: [],
    errors: []
  };
  
  const treeEls = viewerEl.querySelectorAll('[data-jsgui-control="dt_tree"]');
  
  treeEls.forEach(treeEl => {
    const treeRect = treeEl.getBoundingClientRect();
    const childNodes = treeEl.querySelectorAll('[data-parent-id][data-branch]');
    
    childNodes.forEach(childNodeEl => {
      const parentId = childNodeEl.getAttribute("data-parent-id");
      const branch = childNodeEl.getAttribute("data-branch");
      const childId = childNodeEl.getAttribute("data-node-id");
      
      // Verify parent exists
      const parentEl = treeEl.querySelector(`[data-node-id="${parentId}"]`);
      if (!parentEl) {
        results.valid = false;
        results.errors.push(`Parent node ${parentId} not found for child ${childId}`);
        return;
      }
      
      // Verify connection point exists on parent
      const outputType = branch === "yes" ? "output-yes" : "output-no";
      const outputPoint = findConnectionPoint(treeEl, parentId, outputType, branch);
      const inputPoint = findConnectionPoint(treeEl, childId, "input-top");
      
      const connResult = {
        parentId,
        childId,
        branch,
        hasOutputPoint: !!outputPoint,
        hasInputPoint: !!inputPoint,
        valid: !!outputPoint && !!inputPoint
      };
      
      if (outputPoint && inputPoint) {
        // Get actual positions and verify they make sense
        const outputPos = getElementCenter(outputPoint, treeRect);
        const inputPos = getElementCenter(inputPoint, treeRect);
        
        connResult.outputPos = outputPos;
        connResult.inputPos = inputPos;
        
        // Verify output is above input (y increases downward)
        if (outputPos.y >= inputPos.y) {
          connResult.valid = false;
          results.errors.push(`Connection ${parentId}->${childId}: output below input`);
        }
        
        // Verify horizontal alignment makes sense
        if (branch === "yes" && outputPos.x > inputPos.x + 200) {
          connResult.warning = "YES connection crosses far right";
        }
        if (branch === "no" && outputPos.x < inputPos.x - 200) {
          connResult.warning = "NO connection crosses far left";
        }
      } else {
        if (!outputPoint) {
          results.errors.push(`Missing output point: ${parentId} ${outputType}`);
        }
        if (!inputPoint) {
          results.errors.push(`Missing input point: ${childId} input-top`);
        }
      }
      
      results.connections.push(connResult);
      if (!connResult.valid) {
        results.valid = false;
      }
    });
  });
  
  return results;
}

// Export for bundling
module.exports = {
  init,
  drawAllConnections,
  drawTreeConnections,
  verifyConnections,
  ConnectionVerification,
  findConnectionPoint,
  getElementCenter,
  setupNodeDragging,
  simulateDrag,
  recordConnectionPointPositions
};

// Make jsgui available globally for debugging
if (typeof window !== "undefined") {
  window.jsgui3 = jsgui;
  window.jsgui = jsgui;
  window.verifyConnections = verifyConnections;
  window.simulateDrag = simulateDrag;
  window.recordConnectionPointPositions = recordConnectionPointPositions;
}

// Initialize when DOM is ready
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
