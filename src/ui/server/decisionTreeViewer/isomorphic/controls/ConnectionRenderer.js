"use strict";

/**
 * ConnectionRenderer - Robust SVG connection drawing for decision trees
 * 
 * Features:
 * - Bezier curves with smooth connections
 * - Arrow heads for direction indication  
 * - Branch labels (YES/NO)
 * - Path highlighting for evaluation visualization
 * - Responsive to container resizing
 * - Handles edge cases (overlapping nodes, extreme angles)
 * 
 * @module decisionTreeViewer/isomorphic/controls/ConnectionRenderer
 */

/**
 * Configuration for connection rendering.
 */
const DEFAULT_CONFIG = {
  // Curve styling
  strokeWidth: 2,
  strokeOpacity: 0.7,
  highlightStrokeWidth: 3,
  highlightStrokeOpacity: 1,
  
  // Colors (CSS custom properties or fallbacks)
  yesColor: "var(--dt-success, #22c55e)",
  noColor: "var(--dt-error, #ef4444)",
  highlightColor: "var(--dt-gold, #c9a227)",
  
  // Arrow configuration
  arrowSize: 8,
  showArrows: true,
  
  // Label configuration
  showLabels: true,
  labelOffset: 20,
  labelFontSize: 10,
  labelFontFamily: "var(--dt-font-mono, 'Fira Code', monospace)",
  
  // Bezier curve control
  curveTension: 0.5, // 0 = straight, 1 = very curved
  minCurveOffset: 30, // Minimum vertical offset for control points
  
  // Animation
  animationDuration: 300,
  animateOnDraw: true
};

/**
 * Calculate bezier curve control points for a connection.
 * 
 * @param {Object} start - Start point {x, y}
 * @param {Object} end - End point {x, y}
 * @param {Object} config - Curve configuration
 * @returns {Object} Control points {cp1: {x,y}, cp2: {x,y}}
 */
function calculateControlPoints(start, end, config = {}) {
  const tension = config.curveTension ?? DEFAULT_CONFIG.curveTension;
  const minOffset = config.minCurveOffset ?? DEFAULT_CONFIG.minCurveOffset;
  
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Vertical offset for control points (ensures smooth S-curve)
  const verticalOffset = Math.max(minOffset, Math.abs(dy) * tension);
  
  // Horizontal offset based on direction and distance
  const horizontalBias = dx * 0.2;
  
  return {
    cp1: {
      x: start.x + horizontalBias,
      y: start.y + verticalOffset
    },
    cp2: {
      x: end.x - horizontalBias,
      y: end.y - verticalOffset
    }
  };
}

/**
 * Generate SVG path data for a bezier curve.
 * 
 * @param {Object} start - Start point {x, y}
 * @param {Object} end - End point {x, y}
 * @param {Object} controlPoints - Control points from calculateControlPoints
 * @returns {string} SVG path d attribute
 */
function generatePathData(start, end, controlPoints) {
  const { cp1, cp2 } = controlPoints;
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

/**
 * Generate SVG arrow marker definition.
 * 
 * @param {string} id - Marker ID
 * @param {string} color - Arrow color
 * @param {number} size - Arrow size
 * @returns {SVGMarkerElement}
 */
function createArrowMarker(id, color, size) {
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", size);
  marker.setAttribute("markerHeight", size);
  marker.setAttribute("orient", "auto-start-reverse");
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", color);
  
  marker.appendChild(path);
  return marker;
}

/**
 * ConnectionRenderer class - manages all connection drawing for a tree.
 */
class ConnectionRenderer {
  /**
   * @param {HTMLElement} container - Container element for SVG
   * @param {Object} config - Optional configuration overrides
   */
  constructor(container, config = {}) {
    this._container = container;
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._svg = null;
    this._defs = null;
    this._connections = new Map(); // connectionId -> {path, label, data}
    this._highlightedConnections = new Set();
    
    this._init();
  }
  
  /**
   * Initialize the SVG element and definitions.
   */
  _init() {
    // Create SVG element
    this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this._svg.setAttribute("class", "dt-connections-svg");
    this._svg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
      z-index: 1;
    `;
    
    // Create defs for markers and filters
    this._defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    
    // Add arrow markers
    if (this._config.showArrows) {
      this._defs.appendChild(
        createArrowMarker("arrow-yes", this._config.yesColor, this._config.arrowSize)
      );
      this._defs.appendChild(
        createArrowMarker("arrow-no", this._config.noColor, this._config.arrowSize)
      );
      this._defs.appendChild(
        createArrowMarker("arrow-highlight", this._config.highlightColor, this._config.arrowSize + 2)
      );
    }
    
    // Add glow filter for highlights
    const glowFilter = this._createGlowFilter();
    this._defs.appendChild(glowFilter);
    
    this._svg.appendChild(this._defs);
    
    // Connections group (for layering)
    this._connectionsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this._connectionsGroup.setAttribute("class", "dt-connections-group");
    this._svg.appendChild(this._connectionsGroup);
    
    // Labels group (renders on top)
    this._labelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this._labelsGroup.setAttribute("class", "dt-labels-group");
    this._svg.appendChild(this._labelsGroup);
    
    // Append to container
    this._container.innerHTML = "";
    this._container.appendChild(this._svg);
  }
  
  /**
   * Create a glow filter for highlighted connections.
   */
  _createGlowFilter() {
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "connection-glow");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    
    const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("stdDeviation", "3");
    blur.setAttribute("result", "coloredBlur");
    
    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const mergeNode1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeNode1.setAttribute("in", "coloredBlur");
    const mergeNode2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mergeNode2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mergeNode1);
    merge.appendChild(mergeNode2);
    
    filter.appendChild(blur);
    filter.appendChild(merge);
    
    return filter;
  }
  
  /**
   * Add a connection between two nodes.
   * 
   * @param {string} id - Unique connection ID
   * @param {Object} fromNode - Source node element or position
   * @param {Object} toNode - Target node element or position
   * @param {string} branch - Branch type ("yes" or "no")
   * @param {Object} options - Additional options
   */
  addConnection(id, fromNode, toNode, branch, options = {}) {
    const positions = this._calculatePositions(fromNode, toNode, branch);
    if (!positions) return null;
    
    const { start, end } = positions;
    const controlPoints = calculateControlPoints(start, end, this._config);
    const pathData = generatePathData(start, end, controlPoints);
    
    // Create path element
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("id", `connection-${id}`);
    path.setAttribute("d", pathData);
    path.setAttribute("class", `dt-connection dt-connection--${branch}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", branch === "yes" ? this._config.yesColor : this._config.noColor);
    path.setAttribute("stroke-width", this._config.strokeWidth);
    path.setAttribute("stroke-opacity", this._config.strokeOpacity);
    path.setAttribute("stroke-linecap", "round");
    
    if (this._config.showArrows) {
      path.setAttribute("marker-end", `url(#arrow-${branch})`);
    }
    
    // Animate if configured
    if (this._config.animateOnDraw) {
      const length = path.getTotalLength?.() || 100;
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      path.style.transition = `stroke-dashoffset ${this._config.animationDuration}ms ease-out`;
      
      // Trigger animation
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = "0";
      });
    }
    
    this._connectionsGroup.appendChild(path);
    
    // Create label
    let label = null;
    if (this._config.showLabels) {
      label = this._createLabel(start, end, branch);
      this._labelsGroup.appendChild(label);
    }
    
    // Store connection data
    const connectionData = {
      id,
      path,
      label,
      branch,
      start,
      end,
      controlPoints,
      fromNode,
      toNode
    };
    
    this._connections.set(id, connectionData);
    
    return connectionData;
  }
  
  /**
   * Calculate start and end positions for a connection.
   */
  _calculatePositions(fromNode, toNode, branch) {
    // Get container rect for relative positioning
    const containerRect = this._container.getBoundingClientRect();
    
    const getPointRect = (nodeEl, pointType, pointBranch) => {
      if (!nodeEl?.querySelector) return null;
      let selector = `[data-jsgui-control="dt_connection_point"][data-point-type="${pointType}"]`;
      if (pointBranch) selector += `[data-branch="${pointBranch}"]`;
      const pointEl = nodeEl.querySelector(selector);
      return pointEl?.getBoundingClientRect?.() || null;
    };
    
    // Prefer explicit connection points when available for precise geometry
    const fromRect = fromNode.getBoundingClientRect?.() || fromNode;
    const toRect = toNode.getBoundingClientRect?.() || toNode;
    if (!fromRect || !toRect) return null;
    
    const fromPoint = getPointRect(fromNode, branch === "yes" ? "output-yes" : "output-no", branch);
    const toPoint = getPointRect(toNode, "input-top");
    
    const startBox = fromPoint || fromRect;
    const endBox = toPoint || toRect;
    
    // Calculate start point (center of explicit connector when present)
    const startX = startBox.left + startBox.width / 2 - containerRect.left;
    const startY = startBox.top + startBox.height / 2 - containerRect.top;
    
    // Calculate end point (center of input connector or top center)
    const endX = endBox.left + endBox.width / 2 - containerRect.left;
    const endY = endBox.top + endBox.height / 2 - containerRect.top;
    
    return {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY }
    };
  }
  
  /**
   * Create a label for a connection.
   */
  _createLabel(start, end, branch) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    
    // Position label near the start of the curve
    const labelX = start.x + (end.x - start.x) * 0.15;
    const labelY = start.y + this._config.labelOffset;
    
    text.setAttribute("x", labelX);
    text.setAttribute("y", labelY);
    text.setAttribute("class", `dt-connection-label dt-connection-label--${branch}`);
    text.setAttribute("fill", branch === "yes" ? this._config.yesColor : this._config.noColor);
    text.setAttribute("font-family", this._config.labelFontFamily);
    text.setAttribute("font-size", this._config.labelFontSize);
    text.setAttribute("font-weight", "bold");
    text.setAttribute("text-anchor", "middle");
    text.textContent = branch.toUpperCase();
    
    return text;
  }
  
  /**
   * Remove a connection.
   */
  removeConnection(id) {
    const connection = this._connections.get(id);
    if (!connection) return;
    
    connection.path.remove();
    connection.label?.remove();
    this._connections.delete(id);
    this._highlightedConnections.delete(id);
  }
  
  /**
   * Update a connection's positions (e.g., after layout change).
   */
  updateConnection(id) {
    const connection = this._connections.get(id);
    if (!connection) return;
    
    const positions = this._calculatePositions(
      connection.fromNode, 
      connection.toNode, 
      connection.branch
    );
    
    if (!positions) return;
    
    const { start, end } = positions;
    const controlPoints = calculateControlPoints(start, end, this._config);
    const pathData = generatePathData(start, end, controlPoints);
    
    connection.path.setAttribute("d", pathData);
    
    if (connection.label) {
      const labelX = start.x + (end.x - start.x) * 0.15;
      const labelY = start.y + this._config.labelOffset;
      connection.label.setAttribute("x", labelX);
      connection.label.setAttribute("y", labelY);
    }
    
    connection.start = start;
    connection.end = end;
    connection.controlPoints = controlPoints;
  }
  
  /**
   * Highlight a connection.
   */
  highlightConnection(id, highlight = true) {
    const connection = this._connections.get(id);
    if (!connection) return;
    
    if (highlight) {
      connection.path.setAttribute("stroke", this._config.highlightColor);
      connection.path.setAttribute("stroke-width", this._config.highlightStrokeWidth);
      connection.path.setAttribute("stroke-opacity", this._config.highlightStrokeOpacity);
      connection.path.setAttribute("filter", "url(#connection-glow)");
      
      if (this._config.showArrows) {
        connection.path.setAttribute("marker-end", "url(#arrow-highlight)");
      }
      
      if (connection.label) {
        connection.label.setAttribute("fill", this._config.highlightColor);
      }
      
      this._highlightedConnections.add(id);
    } else {
      const color = connection.branch === "yes" ? this._config.yesColor : this._config.noColor;
      connection.path.setAttribute("stroke", color);
      connection.path.setAttribute("stroke-width", this._config.strokeWidth);
      connection.path.setAttribute("stroke-opacity", this._config.strokeOpacity);
      connection.path.removeAttribute("filter");
      
      if (this._config.showArrows) {
        connection.path.setAttribute("marker-end", `url(#arrow-${connection.branch})`);
      }
      
      if (connection.label) {
        connection.label.setAttribute("fill", color);
      }
      
      this._highlightedConnections.delete(id);
    }
  }
  
  /**
   * Highlight a path of connections.
   */
  highlightPath(connectionIds) {
    // Clear existing highlights
    this.clearHighlights();
    
    // Highlight new path
    connectionIds.forEach(id => this.highlightConnection(id, true));
  }
  
  /**
   * Clear all highlights.
   */
  clearHighlights() {
    this._highlightedConnections.forEach(id => {
      this.highlightConnection(id, false);
    });
  }
  
  /**
   * Redraw all connections (e.g., after resize).
   */
  redrawAll() {
    this._connections.forEach((connection, id) => {
      this.updateConnection(id);
    });
  }
  
  /**
   * Clear all connections.
   */
  clear() {
    this._connections.forEach((connection, id) => {
      this.removeConnection(id);
    });
    this._connections.clear();
    this._highlightedConnections.clear();
  }
  
  /**
   * Get connection by ID.
   */
  getConnection(id) {
    return this._connections.get(id);
  }
  
  /**
   * Get all connection IDs.
   */
  getConnectionIds() {
    return Array.from(this._connections.keys());
  }
  
  /**
   * Dispose of the renderer.
   */
  dispose() {
    this.clear();
    this._svg?.remove();
    this._svg = null;
    this._container = null;
  }
}


module.exports = { 
  ConnectionRenderer,
  calculateControlPoints,
  generatePathData,
  createArrowMarker,
  DEFAULT_CONFIG
};
