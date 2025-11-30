/**
 * @fileoverview ShapeControl - Base class for visual shapes in WYSIWYG diagram editors.
 * 
 * This control combines DraggableControl and SelectableControl functionality to create
 * a base class for geometric shapes used in flowcharts, decision trees, and diagrams.
 * Shapes can be dragged, selected, resized, and connected to other shapes.
 * 
 * ## Key Features
 * - **Draggable**: Inherits full drag functionality from DraggableControl
 * - **Selectable**: Can be selected individually or as part of a multi-selection
 * - **SVG-based**: Uses SVG for crisp, scalable rendering
 * - **Connection Points**: Defines anchor points for connectors
 * - **Resizable**: Optional resize handles (subclass feature)
 * - **Customizable**: Override render methods for custom shapes
 * 
 * ## Built-in Shape Types
 * - **RectangleShape** - Standard rectangle (action/process)
 * - **DiamondShape** - Diamond/rhombus (decision)
 * - **EllipseShape** - Oval/ellipse (start/end)
 * - **ParallelogramShape** - Parallelogram (input/output)
 * 
 * ## Usage Examples
 * 
 * ### Using a Built-in Shape
 * ```javascript
 * const { DiamondShape } = require('shared/isomorphic/controls/canvas/ShapeControl');
 * 
 * const decisionNode = new DiamondShape({
 *   context: this.context,
 *   width: 120,
 *   height: 80,
 *   label: 'Is Valid?',
 *   fillColor: '#fff3e0',
 *   strokeColor: '#ff9800'
 * });
 * canvas.addElement(decisionNode, 200, 150);
 * ```
 * 
 * ### Creating a Custom Shape
 * ```javascript
 * class HexagonShape extends ShapeControl {
 *   _renderShape(svg, width, height) {
 *     const points = this._calculateHexagonPoints(width, height);
 *     const polygon = this._createSVGElement('polygon');
 *     polygon.setAttribute('points', points.join(' '));
 *     this._applyStyles(polygon);
 *     svg.appendChild(polygon);
 *   }
 *   
 *   _getConnectionPoints() {
 *     // Return 6 connection points for hexagon
 *   }
 * }
 * ```
 * 
 * ### Handling Shape Events
 * ```javascript
 * shape.on('drag-end', (e) => {
 *   console.log('Shape moved to:', e.endPosition);
 *   updateConnectors();
 * });
 * 
 * shape.on('selection-changed', (e) => {
 *   if (e.selected) {
 *     showPropertiesPanel(shape);
 *   }
 * });
 * ```
 * 
 * ## CSS Classes Applied
 * - `.shape-control` - Base class
 * - `.shape-{type}` - Type-specific class (e.g., `.shape-diamond`)
 * - `.shape-selected` - When selected
 * - `.shape-dragging` - During drag
 * - `.shape-hovered` - On mouse hover
 * 
 * ## Connection Points
 * 
 * Shapes define connection points where connectors can attach:
 * ```
 *          top
 *           │
 *   left ───┼─── right
 *           │
 *         bottom
 * ```
 * 
 * @module shared/isomorphic/controls/canvas/ShapeControl
 * @requires jsgui3-html
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const dragable = require('jsgui3-html/control_mixins/dragable');
const selectable = require('jsgui3-html/control_mixins/selectable');

/**
 * Connection point on a shape
 * @typedef {Object} ConnectionPoint
 * @property {string} id - Point identifier (e.g., 'top', 'bottom', 'left', 'right')
 * @property {number} x - X position relative to shape
 * @property {number} y - Y position relative to shape
 * @property {'in'|'out'|'both'} direction - Connection direction
 */

/**
 * Configuration options for ShapeControl
 * @typedef {Object} ShapeControlOptions
 * @property {Object} context - jsgui3 context object (required)
 * @property {number} [width=100] - Shape width in pixels
 * @property {number} [height=60] - Shape height in pixels
 * @property {string} [label=''] - Text label inside shape
 * @property {string} [fillColor='#ffffff'] - Shape fill color
 * @property {string} [strokeColor='#333333'] - Shape stroke color
 * @property {number} [strokeWidth=2] - Stroke width in pixels
 * @property {string} [labelColor='#333333'] - Label text color
 * @property {number} [labelSize=14] - Label font size
 * @property {boolean} [draggable=true] - Whether shape can be dragged
 * @property {boolean} [selectable=true] - Whether shape can be selected
 * @property {*} [data] - Custom data associated with shape
 * @property {string} [shapeType='rectangle'] - Type identifier
 */

/**
 * ShapeControl - Base class for diagram shapes.
 * 
 * Combines draggable and selectable functionality with SVG rendering
 * for creating diagram elements.
 * 
 * @extends Control
 */
class ShapeControl extends Control {
  /**
   * The shape type identifier.
   * Override in subclasses.
   * @type {string}
   * @static
   */
  static SHAPE_TYPE = 'shape';
  
  /**
   * Creates a new ShapeControl instance.
   * 
   * @param {ShapeControlOptions} spec - Configuration options
   */
  constructor(spec = {}) {
    const {
      width = 100,
      height = 60,
      label = '',
      fillColor = '#ffffff',
      strokeColor = '#333333',
      strokeWidth = 2,
      labelColor = '#333333',
      labelSize = 14,
      draggable: isDraggable = true,
      selectable: isSelectable = true,
      data = null,
      shapeType,
      ...parentSpec
    } = spec;
    
    super(parentSpec);
    
    /**
     * Shape width
     * @type {number}
     */
    this.shapeWidth = width;
    
    /**
     * Shape height
     * @type {number}
     */
    this.shapeHeight = height;
    
    /**
     * Shape label
     * @type {string}
     */
    this.label = label;
    
    /**
     * Fill color
     * @type {string}
     */
    this.fillColor = fillColor;
    
    /**
     * Stroke color
     * @type {string}
     */
    this.strokeColor = strokeColor;
    
    /**
     * Stroke width
     * @type {number}
     */
    this.strokeWidth = strokeWidth;
    
    /**
     * Label color
     * @type {string}
     */
    this.labelColor = labelColor;
    
    /**
     * Label font size
     * @type {number}
     */
    this.labelSize = labelSize;
    
    /**
     * Whether dragging is enabled
     * @type {boolean}
     * @private
     */
    this._isDraggable = isDraggable;
    
    /**
     * Whether selection is enabled
     * @type {boolean}
     * @private
     */
    this._isSelectable = isSelectable;
    
    /**
     * Custom data
     * @type {*}
     */
    this.data = data;
    
    /**
     * Shape type identifier
     * @type {string}
     */
    this.shapeType = shapeType || this.constructor.SHAPE_TYPE;
    
    /**
     * Selection state
     * @type {boolean}
     */
    this.isSelected = false;
    
    /**
     * Current position [x, y]
     * @type {[number, number]}
     */
    this.position = [0, 0];
  }
  
  /**
   * Composes the control's DOM structure.
   * @protected
   */
  compose() {
    // Add base CSS classes
    this.add_class('shape-control');
    this.add_class(`shape-${this.shapeType}`);
    
    // Set dimensions
    this.style.width = `${this.shapeWidth}px`;
    this.style.height = `${this.shapeHeight}px`;
    this.style.position = 'absolute';
    this.style.cursor = this._isDraggable ? 'move' : 'pointer';
    
    // Create SVG container
    this._createSVG();
    
    // Server-side render state
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.shapeWidth = this.shapeWidth;
      this._fields.shapeHeight = this.shapeHeight;
      this._fields.label = this.label;
      this._fields.fillColor = this.fillColor;
      this._fields.strokeColor = this.strokeColor;
      this._fields.strokeWidth = this.strokeWidth;
      this._fields.labelColor = this.labelColor;
      this._fields.labelSize = this.labelSize;
      this._fields.shapeType = this.shapeType;
      this._fields.isSelected = this.isSelected;
      this._fields.position = this.position;
      this._fields.data = this.data;
    });
  }
  
  /**
   * Creates the SVG element and renders the shape.
   * @private
   */
  _createSVG() {
    // Create SVG wrapper control
    this.ctrl_svg = new Control({ context: this.context, tagName: 'svg' });
    this.ctrl_svg.add_class('shape-svg');
    this.ctrl_svg.dom.attributes.width = this.shapeWidth;
    this.ctrl_svg.dom.attributes.height = this.shapeHeight;
    this.ctrl_svg.dom.attributes.viewBox = `0 0 ${this.shapeWidth} ${this.shapeHeight}`;
    
    // The actual shape path will be rendered in activate()
    // For server-side, we need to set up the SVG content
    this._renderShapeToControl();
    
    this.add(this.ctrl_svg);
  }
  
  /**
   * Renders the shape content to the SVG control.
   * Override in subclasses for custom shapes.
   * @protected
   */
  _renderShapeToControl() {
    // Default rectangle shape
    const shapeCtrl = new Control({ context: this.context, tagName: 'rect' });
    shapeCtrl.add_class('shape-path');
    shapeCtrl.dom.attributes.x = this.strokeWidth / 2;
    shapeCtrl.dom.attributes.y = this.strokeWidth / 2;
    shapeCtrl.dom.attributes.width = this.shapeWidth - this.strokeWidth;
    shapeCtrl.dom.attributes.height = this.shapeHeight - this.strokeWidth;
    shapeCtrl.dom.attributes.fill = this.fillColor;
    shapeCtrl.dom.attributes.stroke = this.strokeColor;
    shapeCtrl.dom.attributes['stroke-width'] = this.strokeWidth;
    this.ctrl_svg.add(shapeCtrl);
    this.ctrl_shapePath = shapeCtrl;
    
    // Add label
    if (this.label) {
      this._addLabel();
    }
  }
  
  /**
   * Adds a label to the shape.
   * @protected
   */
  _addLabel() {
    const labelCtrl = new Control({ context: this.context, tagName: 'text' });
    labelCtrl.add_class('shape-label');
    labelCtrl.dom.attributes.x = this.shapeWidth / 2;
    labelCtrl.dom.attributes.y = this.shapeHeight / 2;
    labelCtrl.dom.attributes['text-anchor'] = 'middle';
    labelCtrl.dom.attributes['dominant-baseline'] = 'middle';
    labelCtrl.dom.attributes.fill = this.labelColor;
    labelCtrl.dom.attributes['font-size'] = this.labelSize;
    labelCtrl.dom.attributes['font-family'] = 'system-ui, sans-serif';
    labelCtrl.add(this.label);
    this.ctrl_svg.add(labelCtrl);
    this.ctrl_label = labelCtrl;
  }
  
  /**
   * Activates the control.
   * @protected
   */
  activate() {
    super.activate();
    
    // Restore state from SSR
    if (this._fields) {
      if (this._fields.shapeWidth) this.shapeWidth = this._fields.shapeWidth;
      if (this._fields.shapeHeight) this.shapeHeight = this._fields.shapeHeight;
      if (this._fields.label) this.label = this._fields.label;
      if (this._fields.fillColor) this.fillColor = this._fields.fillColor;
      if (this._fields.strokeColor) this.strokeColor = this._fields.strokeColor;
      if (this._fields.strokeWidth) this.strokeWidth = this._fields.strokeWidth;
      if (this._fields.isSelected) this.isSelected = this._fields.isSelected;
      if (this._fields.position) this.position = this._fields.position;
      if (this._fields.data) this.data = this._fields.data;
    }
    
    // Apply mixins
    if (this._isDraggable) {
      this._setupDraggable();
    }
    
    if (this._isSelectable) {
      this._setupSelectable();
    }
    
    // Hover effect
    this._setupHover();
  }
  
  /**
   * Sets up draggable mixin.
   * @private
   */
  _setupDraggable() {
    dragable(this, {
      mode: 'translate',
      start_distance: 3
    });
    
    this.on('dragstart', () => {
      this.add_class('shape-dragging');
      this.raise('drag-start', { shape: this });
    });
    
    this.on('dragend', (e) => {
      this.remove_class('shape-dragging');
      
      if (e.movement_offset) {
        this.position = [
          this.position[0] + e.movement_offset[0],
          this.position[1] + e.movement_offset[1]
        ];
      }
      
      this.raise('drag-end', {
        shape: this,
        position: [...this.position],
        movementOffset: e.movement_offset || [0, 0]
      });
    });
  }
  
  /**
   * Sets up selectable mixin.
   * @private
   */
  _setupSelectable() {
    selectable(this, null, {
      toggle: true,
      selection_action: ['mousedown']
    });
    
    this.selectable = true;
    
    this.on('change', (e) => {
      if (e.name === 'selected') {
        this.isSelected = e.value;
        
        if (e.value) {
          this.add_class('shape-selected');
        } else {
          this.remove_class('shape-selected');
        }
        
        this.raise('selection-changed', {
          shape: this,
          selected: e.value
        });
      }
    });
  }
  
  /**
   * Sets up hover effect.
   * @private
   */
  _setupHover() {
    this.on('mouseenter', () => {
      this.add_class('shape-hovered');
    });
    
    this.on('mouseleave', () => {
      this.remove_class('shape-hovered');
    });
  }
  
  // ============================================
  // Public API
  // ============================================
  
  /**
   * Gets the connection points for this shape.
   * Override in subclasses for custom connection points.
   * 
   * @returns {ConnectionPoint[]}
   */
  getConnectionPoints() {
    const w = this.shapeWidth;
    const h = this.shapeHeight;
    
    return [
      { id: 'top', x: w / 2, y: 0, direction: 'both' },
      { id: 'right', x: w, y: h / 2, direction: 'both' },
      { id: 'bottom', x: w / 2, y: h, direction: 'both' },
      { id: 'left', x: 0, y: h / 2, direction: 'both' }
    ];
  }
  
  /**
   * Gets a specific connection point by ID.
   * 
   * @param {string} pointId - Connection point ID
   * @returns {ConnectionPoint|null}
   */
  getConnectionPoint(pointId) {
    return this.getConnectionPoints().find(p => p.id === pointId) || null;
  }
  
  /**
   * Gets the absolute position of a connection point.
   * 
   * @param {string} pointId - Connection point ID
   * @returns {{x: number, y: number}|null}
   */
  getAbsoluteConnectionPoint(pointId) {
    const point = this.getConnectionPoint(pointId);
    if (!point) return null;
    
    return {
      x: this.position[0] + point.x,
      y: this.position[1] + point.y
    };
  }
  
  /**
   * Sets the shape label.
   * 
   * @param {string} text - New label text
   */
  setLabel(text) {
    this.label = text;
    
    if (this.ctrl_label?.dom?.el) {
      this.ctrl_label.dom.el.textContent = text;
    }
    
    this.raise('label-changed', {
      shape: this,
      label: text
    });
  }
  
  /**
   * Sets the fill color.
   * 
   * @param {string} color - New fill color
   */
  setFillColor(color) {
    this.fillColor = color;
    
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('fill', color);
    }
  }
  
  /**
   * Sets the stroke color.
   * 
   * @param {string} color - New stroke color
   */
  setStrokeColor(color) {
    this.strokeColor = color;
    
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('stroke', color);
    }
  }
  
  /**
   * Resizes the shape.
   * 
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    this.shapeWidth = width;
    this.shapeHeight = height;
    
    this.style.width = `${width}px`;
    this.style.height = `${height}px`;
    
    // Update SVG
    if (this.ctrl_svg?.dom?.el) {
      this.ctrl_svg.dom.el.setAttribute('width', width);
      this.ctrl_svg.dom.el.setAttribute('height', height);
      this.ctrl_svg.dom.el.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    
    // Subclasses should override to update shape path
    this._updateShapeSize();
    
    this.raise('resized', {
      shape: this,
      width,
      height
    });
  }
  
  /**
   * Updates the shape path after resize.
   * Override in subclasses.
   * @protected
   */
  _updateShapeSize() {
    // Default rectangle update
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('width', this.shapeWidth - this.strokeWidth);
      this.ctrl_shapePath.dom.el.setAttribute('height', this.shapeHeight - this.strokeWidth);
    }
    
    // Update label position
    if (this.ctrl_label?.dom?.el) {
      this.ctrl_label.dom.el.setAttribute('x', this.shapeWidth / 2);
      this.ctrl_label.dom.el.setAttribute('y', this.shapeHeight / 2);
    }
  }
  
  /**
   * Moves the shape to a position.
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  moveTo(x, y) {
    this.position = [x, y];
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    
    this.raise('moved', {
      shape: this,
      position: [...this.position]
    });
  }
  
  /**
   * Gets the bounding box of the shape.
   * 
   * @returns {{x: number, y: number, width: number, height: number}}
   */
  getBounds() {
    return {
      x: this.position[0],
      y: this.position[1],
      width: this.shapeWidth,
      height: this.shapeHeight
    };
  }
  
  /**
   * Checks if a point is inside the shape.
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean}
   */
  containsPoint(x, y) {
    const bounds = this.getBounds();
    return x >= bounds.x && 
           x <= bounds.x + bounds.width &&
           y >= bounds.y && 
           y <= bounds.y + bounds.height;
  }
  
  /**
   * Serializes the shape to JSON.
   * 
   * @returns {Object}
   */
  toJSON() {
    return {
      shapeType: this.shapeType,
      position: [...this.position],
      width: this.shapeWidth,
      height: this.shapeHeight,
      label: this.label,
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      labelColor: this.labelColor,
      labelSize: this.labelSize,
      data: this.data
    };
  }
}

// ============================================
// Built-in Shape Types
// ============================================

/**
 * DiamondShape - Diamond/rhombus shape for decision nodes.
 * @extends ShapeControl
 */
class DiamondShape extends ShapeControl {
  static SHAPE_TYPE = 'diamond';
  
  /**
   * @param {ShapeControlOptions} spec
   */
  constructor(spec = {}) {
    super({
      ...spec,
      shapeType: 'diamond',
      width: spec.width || 120,
      height: spec.height || 80
    });
  }
  
  /**
   * Renders diamond shape.
   * @protected
   */
  _renderShapeToControl() {
    const w = this.shapeWidth;
    const h = this.shapeHeight;
    const sw = this.strokeWidth;
    
    // Diamond points: top, right, bottom, left
    const points = [
      `${w/2},${sw}`,           // top
      `${w-sw},${h/2}`,         // right
      `${w/2},${h-sw}`,         // bottom
      `${sw},${h/2}`            // left
    ].join(' ');
    
    const shapeCtrl = new Control({ context: this.context, tagName: 'polygon' });
    shapeCtrl.add_class('shape-path');
    shapeCtrl.dom.attributes.points = points;
    shapeCtrl.dom.attributes.fill = this.fillColor;
    shapeCtrl.dom.attributes.stroke = this.strokeColor;
    shapeCtrl.dom.attributes['stroke-width'] = this.strokeWidth;
    this.ctrl_svg.add(shapeCtrl);
    this.ctrl_shapePath = shapeCtrl;
    
    if (this.label) {
      this._addLabel();
    }
  }
  
  /**
   * @protected
   */
  _updateShapeSize() {
    const w = this.shapeWidth;
    const h = this.shapeHeight;
    const sw = this.strokeWidth;
    
    const points = [
      `${w/2},${sw}`,
      `${w-sw},${h/2}`,
      `${w/2},${h-sw}`,
      `${sw},${h/2}`
    ].join(' ');
    
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('points', points);
    }
    
    if (this.ctrl_label?.dom?.el) {
      this.ctrl_label.dom.el.setAttribute('x', w / 2);
      this.ctrl_label.dom.el.setAttribute('y', h / 2);
    }
  }
}

/**
 * RectangleShape - Standard rectangle shape for action/process nodes.
 * @extends ShapeControl
 */
class RectangleShape extends ShapeControl {
  static SHAPE_TYPE = 'rectangle';
  
  /**
   * @param {ShapeControlOptions} spec
   */
  constructor(spec = {}) {
    super({
      ...spec,
      shapeType: 'rectangle'
    });
    
    /**
     * Border radius
     * @type {number}
     */
    this.borderRadius = spec.borderRadius || 0;
  }
  
  /**
   * @protected
   */
  _renderShapeToControl() {
    const shapeCtrl = new Control({ context: this.context, tagName: 'rect' });
    shapeCtrl.add_class('shape-path');
    shapeCtrl.dom.attributes.x = this.strokeWidth / 2;
    shapeCtrl.dom.attributes.y = this.strokeWidth / 2;
    shapeCtrl.dom.attributes.width = this.shapeWidth - this.strokeWidth;
    shapeCtrl.dom.attributes.height = this.shapeHeight - this.strokeWidth;
    shapeCtrl.dom.attributes.rx = this.borderRadius;
    shapeCtrl.dom.attributes.ry = this.borderRadius;
    shapeCtrl.dom.attributes.fill = this.fillColor;
    shapeCtrl.dom.attributes.stroke = this.strokeColor;
    shapeCtrl.dom.attributes['stroke-width'] = this.strokeWidth;
    this.ctrl_svg.add(shapeCtrl);
    this.ctrl_shapePath = shapeCtrl;
    
    if (this.label) {
      this._addLabel();
    }
  }
}

/**
 * EllipseShape - Ellipse/oval shape for start/end nodes.
 * @extends ShapeControl
 */
class EllipseShape extends ShapeControl {
  static SHAPE_TYPE = 'ellipse';
  
  /**
   * @param {ShapeControlOptions} spec
   */
  constructor(spec = {}) {
    super({
      ...spec,
      shapeType: 'ellipse',
      width: spec.width || 100,
      height: spec.height || 50
    });
  }
  
  /**
   * @protected
   */
  _renderShapeToControl() {
    const cx = this.shapeWidth / 2;
    const cy = this.shapeHeight / 2;
    const rx = (this.shapeWidth - this.strokeWidth) / 2;
    const ry = (this.shapeHeight - this.strokeWidth) / 2;
    
    const shapeCtrl = new Control({ context: this.context, tagName: 'ellipse' });
    shapeCtrl.add_class('shape-path');
    shapeCtrl.dom.attributes.cx = cx;
    shapeCtrl.dom.attributes.cy = cy;
    shapeCtrl.dom.attributes.rx = rx;
    shapeCtrl.dom.attributes.ry = ry;
    shapeCtrl.dom.attributes.fill = this.fillColor;
    shapeCtrl.dom.attributes.stroke = this.strokeColor;
    shapeCtrl.dom.attributes['stroke-width'] = this.strokeWidth;
    this.ctrl_svg.add(shapeCtrl);
    this.ctrl_shapePath = shapeCtrl;
    
    if (this.label) {
      this._addLabel();
    }
  }
  
  /**
   * @protected
   */
  _updateShapeSize() {
    const cx = this.shapeWidth / 2;
    const cy = this.shapeHeight / 2;
    const rx = (this.shapeWidth - this.strokeWidth) / 2;
    const ry = (this.shapeHeight - this.strokeWidth) / 2;
    
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('cx', cx);
      this.ctrl_shapePath.dom.el.setAttribute('cy', cy);
      this.ctrl_shapePath.dom.el.setAttribute('rx', rx);
      this.ctrl_shapePath.dom.el.setAttribute('ry', ry);
    }
    
    if (this.ctrl_label?.dom?.el) {
      this.ctrl_label.dom.el.setAttribute('x', cx);
      this.ctrl_label.dom.el.setAttribute('y', cy);
    }
  }
}

/**
 * ParallelogramShape - Parallelogram shape for input/output nodes.
 * @extends ShapeControl
 */
class ParallelogramShape extends ShapeControl {
  static SHAPE_TYPE = 'parallelogram';
  
  /**
   * @param {ShapeControlOptions} spec
   */
  constructor(spec = {}) {
    super({
      ...spec,
      shapeType: 'parallelogram',
      width: spec.width || 120,
      height: spec.height || 50
    });
    
    /**
     * Skew amount in pixels
     * @type {number}
     */
    this.skew = spec.skew || 20;
  }
  
  /**
   * @protected
   */
  _renderShapeToControl() {
    const w = this.shapeWidth;
    const h = this.shapeHeight;
    const s = this.skew;
    const sw = this.strokeWidth;
    
    // Parallelogram points
    const points = [
      `${s},${sw}`,             // top-left
      `${w-sw},${sw}`,          // top-right
      `${w-s},${h-sw}`,         // bottom-right
      `${sw},${h-sw}`           // bottom-left
    ].join(' ');
    
    const shapeCtrl = new Control({ context: this.context, tagName: 'polygon' });
    shapeCtrl.add_class('shape-path');
    shapeCtrl.dom.attributes.points = points;
    shapeCtrl.dom.attributes.fill = this.fillColor;
    shapeCtrl.dom.attributes.stroke = this.strokeColor;
    shapeCtrl.dom.attributes['stroke-width'] = this.strokeWidth;
    this.ctrl_svg.add(shapeCtrl);
    this.ctrl_shapePath = shapeCtrl;
    
    if (this.label) {
      this._addLabel();
    }
  }
  
  /**
   * @protected
   */
  _updateShapeSize() {
    const w = this.shapeWidth;
    const h = this.shapeHeight;
    const s = this.skew;
    const sw = this.strokeWidth;
    
    const points = [
      `${s},${sw}`,
      `${w-sw},${sw}`,
      `${w-s},${h-sw}`,
      `${sw},${h-sw}`
    ].join(' ');
    
    if (this.ctrl_shapePath?.dom?.el) {
      this.ctrl_shapePath.dom.el.setAttribute('points', points);
    }
    
    if (this.ctrl_label?.dom?.el) {
      this.ctrl_label.dom.el.setAttribute('x', w / 2);
      this.ctrl_label.dom.el.setAttribute('y', h / 2);
    }
  }
}

module.exports = {
  ShapeControl,
  DiamondShape,
  RectangleShape,
  EllipseShape,
  ParallelogramShape
};
