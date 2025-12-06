"use strict";

/**
 * Decision Tree Viewer - Isomorphic Controls
 * 
 * Luxury Industrial Obsidian themed controls for viewing decision trees.
 * Built with jsgui3 for server-side rendering with client-side activation.
 * 
 * Viewer controls (designed for subclassing into editors):
 * - DecisionNodeControl - Base node control
 * - BranchNodeControl - Branch node with yes/no paths
 * - ResultNodeControl - Result node (match/no-match)
 * - ConnectionPointControl - Explicit anchor points for connections
 * - DecisionTreeControl - Renders full tree with SVG connections
 * - DecisionTreeViewerControl - Main page with tree list and canvas
 * - ConnectionRenderer - Robust SVG connection drawing (client-side)
 * 
 * @module decisionTreeViewer/isomorphic/controls
 */

const { 
  DecisionNodeControl, 
  BranchNodeControl, 
  ResultNodeControl 
} = require("./DecisionNodeControl");

const { 
  ConnectionPointControl, 
  ConnectionPointType,
  createBranchNodeConnectors,
  createResultNodeConnector 
} = require("./ConnectionPointControl");

const { DecisionTreeControl } = require("./DecisionTreeControl");

const { 
  DecisionTreeViewerControl, 
  TreeListControl, 
  TreeListItemControl 
} = require("./DecisionTreeViewerControl");

// ConnectionRenderer uses DOM APIs, conditionally export
let ConnectionRenderer = null;
let connectionUtils = {};
try {
  const connectionModule = require("./ConnectionRenderer");
  ConnectionRenderer = connectionModule.ConnectionRenderer;
  connectionUtils = {
    calculateControlPoints: connectionModule.calculateControlPoints,
    generatePathData: connectionModule.generatePathData,
    createArrowMarker: connectionModule.createArrowMarker,
    DEFAULT_CONFIG: connectionModule.DEFAULT_CONFIG
  };
} catch (e) {
  // Server-side or module not available
}


module.exports = {
  // Base controls
  DecisionNodeControl,
  BranchNodeControl,
  ResultNodeControl,
  
  // Connection points
  ConnectionPointControl,
  ConnectionPointType,
  createBranchNodeConnectors,
  createResultNodeConnector,
  
  // Tree rendering
  DecisionTreeControl,
  
  // Viewer page controls
  DecisionTreeViewerControl,
  TreeListControl,
  TreeListItemControl,
  
  // Connection rendering (client-side only)
  ConnectionRenderer,
  ...connectionUtils
};
