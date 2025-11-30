/**
 * @fileoverview CanvasControl - An isomorphic container control that serves as a
 * drawing surface for WYSIWYG editors, diagram builders, and visual composition tools.
 * 
 * This control provides a bounded area where draggable elements can be placed,
 * moved, and organized. It supports grid snapping, zoom, pan, and acts as
 * the bounds constraint for child DraggableControls.
 * 
 * ## Key Features
 * - **Bounded Container**: Serves as bounds for DraggableControl children
 * - **Grid System**: Optional snap-to-grid for precise element placement
 * - **Zoom & Pan**: Scalable canvas with pan support (planned)
 * - **Drop Target**: Receives elements dragged from toolbox
 * - **Selection Scope**: Can act as a selection scope for multi-select
 * - **Coordinate System**: Provides methods to convert between screen and canvas coordinates
 * 
 * ## Usage Examples
 * 
 * ### Basic Canvas
 * ```javascript
 * const CanvasControl = require('shared/isomorphic/controls/canvas/CanvasControl');
 * 
 * class DiagramEditor extends Control {
 *   compose() {
 *     this.canvas = new CanvasControl({
 *       context: this.context,
 *       width: 800,
 *       height: 600,
 *       gridSize: 20,
 *       snapToGrid: true
 *     });
 *     this.add(this.canvas);
 *   }
 * }
 * ```
 * 
 * ### Adding Draggable Elements
 * ```javascript
 * const shape = new DraggableControl({
 *   context: this.context,
 *   dragMode: 'within-parent',
 *   constrainToParent: true
 * });
 * shape.add('Shape');
 * this.canvas.addElement(shape, 100, 100);  // Place at x:100, y:100
 * ```
 * 
 * ### With Grid Snapping
 * ```javascript
 * const canvas = new CanvasControl({
 *   context: this.context,
 *   gridSize: 25,
 *   snapToGrid: true,
 *   showGrid: true  // Visual grid lines
 * });
 * 
 * // Elements will snap to 25px grid
 * canvas.addElement(shape, 103, 98);  // Will snap to (100, 100)
 * ```
 * 
 * ### Drop Target for Toolbox
 * ```javascript
 * canvas.on('element-dropped', (e) => {
 *   const { element, position } = e;
 *   console.log(`Element dropped at ${position.x}, ${position.y}`);
 * });
 * ```
 * 
 * ## CSS Classes Applied
 * - `.canvas-control` - Always present
 * - `.canvas-grid-visible` - When grid is visible
 * - `.canvas-drop-target` - When being dragged over
 * - `.canvas-snap-enabled` - When snap-to-grid is enabled
 * 
 * ## Coordinate System
 * 
 * The canvas uses a standard coordinate system where (0,0) is the top-left corner.
 * All positions are relative to the canvas origin, not the viewport.
 * 
 * ```
 * (0,0) ─────────────────► X
 *   │
 *   │     Canvas Area
 *   │
 *   ▼
 *   Y
 * ```
 * 
 * @module shared/isomorphic/controls/canvas/CanvasControl
 * @requires jsgui3-html
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * Position in canvas coordinates
 * @typedef {Object} CanvasPosition
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * Event data for element-dropped event
 * @typedef {Object} ElementDroppedEvent
 * @property {Control} element - The element that was dropped
 * @property {CanvasPosition} position - Where it was dropped
 * @property {CanvasControl} canvas - This canvas
 */

/**
 * Configuration options for CanvasControl
 * @typedef {Object} CanvasControlOptions
 * @property {Object} context - jsgui3 context object (required)
 * @property {number} [width=800] - Canvas width in pixels
 * @property {number} [height=600] - Canvas height in pixels
 * @property {number} [gridSize=20] - Grid cell size in pixels
 * @property {boolean} [snapToGrid=false] - Whether to snap elements to grid
 * @property {boolean} [showGrid=false] - Whether to display grid lines
 * @property {string} [gridColor='#e0e0e0'] - Color of grid lines
 * @property {string} [backgroundColor='#ffffff'] - Canvas background color
 * @property {number} [minZoom=0.25] - Minimum zoom level
 * @property {number} [maxZoom=4] - Maximum zoom level
 * @property {boolean} [selectionScope=true] - Act as selection scope for children
 * @property {string} [tagName='div'] - HTML tag to use for the control
 */

/**
 * CanvasControl - Isomorphic control providing a drawing surface.
 * 
 * Acts as a container for draggable elements with support for
 * grid snapping, bounds constraints, and visual organization.
 * 
 * @extends Control
 */
class CanvasControl extends Control {
  /**
   * Creates a new CanvasControl instance.
   * 
   * @param {CanvasControlOptions} spec - Configuration options
   * @throws {Error} If context is not provided
   * 
   * @example
   * const canvas = new CanvasControl({
   *   context: this.context,
   *   width: 1024,
   *   height: 768,
   *   gridSize: 25,
   *   snapToGrid: true,
   *   showGrid: true
   * });
   */
  constructor(spec = {}) {
    // Extract our options before passing to parent
    const {
      width = 800,
      height = 600,
      gridSize = 20,
      snapToGrid = false,
      showGrid = false,
      gridColor = '#e0e0e0',
      backgroundColor = '#ffffff',
      minZoom = 0.25,
      maxZoom = 4,
      selectionScope = true,
      ...parentSpec
    } = spec;
    
    super(parentSpec);
    
    /**
     * Canvas width in pixels
     * @type {number}
     */
    this.canvasWidth = width;
    
    /**
     * Canvas height in pixels
     * @type {number}
     */
    this.canvasHeight = height;
    
    /**
     * Grid cell size in pixels
     * @type {number}
     */
    this.gridSize = gridSize;
    
    /**
     * Whether snap-to-grid is enabled
     * @type {boolean}
     */
    this.snapToGrid = snapToGrid;
    
    /**
     * Whether grid lines are visible
     * @type {boolean}
     */
    this.showGrid = showGrid;
    
    /**
     * Grid line color
     * @type {string}
     */
    this.gridColor = gridColor;
    
    /**
     * Canvas background color
     * @type {string}
     */
    this.backgroundColor = backgroundColor;
    
    /**
     * Minimum zoom level
     * @type {number}
     * @private
     */
    this._minZoom = minZoom;
    
    /**
     * Maximum zoom level
     * @type {number}
     * @private
     */
    this._maxZoom = maxZoom;
    
    /**
     * Current zoom level (1 = 100%)
     * @type {number}
     */
    this.zoom = 1;
    
    /**
     * Whether to act as selection scope
     * @type {boolean}
     * @private
     */
    this._selectionScope = selectionScope;
    
    /**
     * Map of element IDs to elements on the canvas
     * @type {Map<string, Control>}
     * @private
     */
    this._elements = new Map();
    
    /**
     * Currently selected elements
     * @type {Set<Control>}
     * @private
     */
    this._selectedElements = new Set();
  }
  
  /**
   * Composes the control's DOM structure.
   * Called automatically during control construction.
   * 
   * @protected
   */
  compose() {
    // Add base CSS class
    this.add_class('canvas-control');
    
    // Set dimensions
    this.style.width = `${this.canvasWidth}px`;
    this.style.height = `${this.canvasHeight}px`;
    this.style.position = 'relative';
    this.style.overflow = 'hidden';
    this.style.backgroundColor = this.backgroundColor;
    
    // Add state classes
    if (this.showGrid) {
      this.add_class('canvas-grid-visible');
    }
    if (this.snapToGrid) {
      this.add_class('canvas-snap-enabled');
    }
    if (this._selectionScope) {
      this.add_class('selection-scope');
    }
    
    // Create grid layer (renders behind elements)
    this._createGridLayer();
    
    // Create elements layer (where shapes go)
    this.ctrl_elementsLayer = new Control({ 
      context: this.context,
      tagName: 'div'
    });
    this.ctrl_elementsLayer.add_class('canvas-elements-layer');
    this.ctrl_elementsLayer.style.position = 'absolute';
    this.ctrl_elementsLayer.style.top = '0';
    this.ctrl_elementsLayer.style.left = '0';
    this.ctrl_elementsLayer.style.width = '100%';
    this.ctrl_elementsLayer.style.height = '100%';
    this.ctrl_elementsLayer.style.pointerEvents = 'none';
    this.add(this.ctrl_elementsLayer);
    
    // Set up server-side render event
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.canvasWidth = this.canvasWidth;
      this._fields.canvasHeight = this.canvasHeight;
      this._fields.gridSize = this.gridSize;
      this._fields.snapToGrid = this.snapToGrid;
      this._fields.showGrid = this.showGrid;
      this._fields.zoom = this.zoom;
    });
  }
  
  /**
   * Creates the grid layer with CSS background pattern.
   * @private
   */
  _createGridLayer() {
    this.ctrl_gridLayer = new Control({ 
      context: this.context,
      tagName: 'div'
    });
    this.ctrl_gridLayer.add_class('canvas-grid-layer');
    this.ctrl_gridLayer.style.position = 'absolute';
    this.ctrl_gridLayer.style.top = '0';
    this.ctrl_gridLayer.style.left = '0';
    this.ctrl_gridLayer.style.width = '100%';
    this.ctrl_gridLayer.style.height = '100%';
    this.ctrl_gridLayer.style.pointerEvents = 'none';
    
    if (this.showGrid) {
      this._applyGridPattern();
    }
    
    this.add(this.ctrl_gridLayer);
  }
  
  /**
   * Applies the grid pattern as a CSS background.
   * @private
   */
  _applyGridPattern() {
    const size = this.gridSize;
    const color = this.gridColor;
    
    // Create a dot grid pattern using CSS
    this.ctrl_gridLayer.style.backgroundImage = 
      `radial-gradient(circle, ${color} 1px, transparent 1px)`;
    this.ctrl_gridLayer.style.backgroundSize = `${size}px ${size}px`;
    this.ctrl_gridLayer.style.backgroundPosition = `${size/2}px ${size/2}px`;
  }
  
  /**
   * Activates the control, binding event handlers.
   * @protected
   */
  activate() {
    super.activate();
    
    // Restore state from server-rendered fields
    if (this._fields) {
      if (this._fields.canvasWidth) this.canvasWidth = this._fields.canvasWidth;
      if (this._fields.canvasHeight) this.canvasHeight = this._fields.canvasHeight;
      if (this._fields.gridSize) this.gridSize = this._fields.gridSize;
      if (this._fields.snapToGrid !== undefined) this.snapToGrid = this._fields.snapToGrid;
      if (this._fields.showGrid !== undefined) this.showGrid = this._fields.showGrid;
      if (this._fields.zoom) this.zoom = this._fields.zoom;
    }
    
    // Set up drop target events
    this._setupDropTarget();
    
    // Set up click-to-deselect on canvas background
    this._setupBackgroundClick();
  }
  
  /**
   * Sets up drop target event handling.
   * @private
   */
  _setupDropTarget() {
    // Handle dragover for visual feedback
    this.on('dragover', (e) => {
      e.preventDefault();
      this.add_class('canvas-drop-target');
    });
    
    this.on('dragleave', (e) => {
      this.remove_class('canvas-drop-target');
    });
    
    this.on('drop', (e) => {
      e.preventDefault();
      this.remove_class('canvas-drop-target');
      
      // Get drop position relative to canvas
      const bcr = this.bcr();
      const position = {
        x: e.clientX - bcr[0][0],
        y: e.clientY - bcr[0][1]
      };
      
      // Snap if enabled
      if (this.snapToGrid) {
        position.x = this.snapToGridValue(position.x);
        position.y = this.snapToGridValue(position.y);
      }
      
      this.raise('element-dropped', {
        position,
        canvas: this,
        originalEvent: e
      });
    });
  }
  
  /**
   * Sets up background click to deselect all.
   * @private
   */
  _setupBackgroundClick() {
    this.on('click', (e) => {
      // Only if clicking directly on canvas, not on an element
      if (e.target === this.dom.el || e.target === this.ctrl_gridLayer?.dom?.el) {
        this.deselectAll();
      }
    });
  }
  
  // ============================================
  // Public API
  // ============================================
  
  /**
   * Adds an element to the canvas at the specified position.
   * 
   * @param {Control} element - The control to add
   * @param {number} x - X position
   * @param {number} y - Y position
   * @returns {Control} The added element
   * 
   * @example
   * canvas.addElement(myShape, 100, 150);
   */
  addElement(element, x = 0, y = 0) {
    // Snap position if enabled
    if (this.snapToGrid) {
      x = this.snapToGridValue(x);
      y = this.snapToGridValue(y);
    }
    
    // Configure element for canvas placement
    element.style.position = 'absolute';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.pointerEvents = 'auto';
    
    // Store reference
    const id = element._id ? element._id() : `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this._elements.set(id, element);
    element._canvasId = id;
    
    // Add to elements layer
    this.ctrl_elementsLayer.add(element);
    
    // Listen for drag events to snap position
    if (this.snapToGrid) {
      element.on('drag-end', (e) => {
        const snappedX = this.snapToGridValue(parseInt(element.style.left) || 0);
        const snappedY = this.snapToGridValue(parseInt(element.style.top) || 0);
        element.style.left = `${snappedX}px`;
        element.style.top = `${snappedY}px`;
      });
    }
    
    this.raise('element-added', {
      element,
      position: { x, y },
      canvas: this
    });
    
    return element;
  }
  
  /**
   * Removes an element from the canvas.
   * 
   * @param {Control} element - The element to remove
   */
  removeElement(element) {
    const id = element._canvasId;
    if (id && this._elements.has(id)) {
      this._elements.delete(id);
      this._selectedElements.delete(element);
      element.remove();
      
      this.raise('element-removed', {
        element,
        canvas: this
      });
    }
  }
  
  /**
   * Gets all elements on the canvas.
   * 
   * @returns {Control[]} Array of elements
   */
  getElements() {
    return Array.from(this._elements.values());
  }
  
  /**
   * Gets all selected elements.
   * 
   * @returns {Control[]} Array of selected elements
   */
  getSelectedElements() {
    return Array.from(this._selectedElements);
  }
  
  /**
   * Selects an element.
   * 
   * @param {Control} element - Element to select
   * @param {boolean} [additive=false] - Add to existing selection
   */
  selectElement(element, additive = false) {
    if (!additive) {
      this.deselectAll();
    }
    
    this._selectedElements.add(element);
    element.add_class('selected');
    
    if (element.doSelect) {
      element.doSelect();
    }
    
    this.raise('selection-changed', {
      selected: this.getSelectedElements(),
      canvas: this
    });
  }
  
  /**
   * Deselects an element.
   * 
   * @param {Control} element - Element to deselect
   */
  deselectElement(element) {
    this._selectedElements.delete(element);
    element.remove_class('selected');
    
    if (element.doDeselect) {
      element.doDeselect();
    }
    
    this.raise('selection-changed', {
      selected: this.getSelectedElements(),
      canvas: this
    });
  }
  
  /**
   * Deselects all elements.
   */
  deselectAll() {
    for (const element of this._selectedElements) {
      element.remove_class('selected');
      if (element.doDeselect) {
        element.doDeselect();
      }
    }
    this._selectedElements.clear();
    
    this.raise('selection-changed', {
      selected: [],
      canvas: this
    });
  }
  
  /**
   * Snaps a value to the nearest grid point.
   * 
   * @param {number} value - The value to snap
   * @returns {number} The snapped value
   */
  snapToGridValue(value) {
    return Math.round(value / this.gridSize) * this.gridSize;
  }
  
  /**
   * Converts screen coordinates to canvas coordinates.
   * 
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @returns {CanvasPosition} Canvas coordinates
   */
  screenToCanvas(screenX, screenY) {
    const bcr = this.bcr();
    return {
      x: (screenX - bcr[0][0]) / this.zoom,
      y: (screenY - bcr[0][1]) / this.zoom
    };
  }
  
  /**
   * Converts canvas coordinates to screen coordinates.
   * 
   * @param {number} canvasX - Canvas X coordinate
   * @param {number} canvasY - Canvas Y coordinate
   * @returns {{x: number, y: number}} Screen coordinates
   */
  canvasToScreen(canvasX, canvasY) {
    const bcr = this.bcr();
    return {
      x: canvasX * this.zoom + bcr[0][0],
      y: canvasY * this.zoom + bcr[0][1]
    };
  }
  
  /**
   * Sets the zoom level.
   * 
   * @param {number} level - Zoom level (1 = 100%)
   */
  setZoom(level) {
    this.zoom = Math.max(this._minZoom, Math.min(this._maxZoom, level));
    this.ctrl_elementsLayer.style.transform = `scale(${this.zoom})`;
    this.ctrl_elementsLayer.style.transformOrigin = 'top left';
    
    this.raise('zoom-changed', {
      zoom: this.zoom,
      canvas: this
    });
  }
  
  /**
   * Sets grid visibility.
   * 
   * @param {boolean} visible - Whether grid should be visible
   */
  setGridVisible(visible) {
    this.showGrid = visible;
    
    if (visible) {
      this.add_class('canvas-grid-visible');
      this._applyGridPattern();
    } else {
      this.remove_class('canvas-grid-visible');
      this.ctrl_gridLayer.style.backgroundImage = 'none';
    }
  }
  
  /**
   * Enables or disables snap-to-grid.
   * 
   * @param {boolean} enabled - Whether snap should be enabled
   */
  setSnapToGrid(enabled) {
    this.snapToGrid = enabled;
    
    if (enabled) {
      this.add_class('canvas-snap-enabled');
    } else {
      this.remove_class('canvas-snap-enabled');
    }
  }
  
  /**
   * Clears all elements from the canvas.
   */
  clear() {
    for (const element of this._elements.values()) {
      element.remove();
    }
    this._elements.clear();
    this._selectedElements.clear();
    
    this.raise('canvas-cleared', {
      canvas: this
    });
  }
  
  /**
   * Resizes the canvas.
   * 
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.style.width = `${width}px`;
    this.style.height = `${height}px`;
    
    this.raise('canvas-resized', {
      width,
      height,
      canvas: this
    });
  }
}

module.exports = CanvasControl;
