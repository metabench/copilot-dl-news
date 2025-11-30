/**
 * @fileoverview DraggableControl - A versatile, isomorphic control that wraps the jsgui3-html
 * `dragable` mixin to provide declarative drag functionality for any jsgui3 control.
 * 
 * This control is designed for use in WYSIWYG editors, diagram builders, and any interface
 * requiring drag-and-drop functionality. It supports both mouse and touch interactions,
 * multiple drag modes, bounds constraints, and integrates seamlessly with server-side rendering.
 * 
 * ## Key Features
 * - **Isomorphic**: Works in both server-side rendering and client-side hydration
 * - **Multiple Drag Modes**: `translate` (CSS transform), `within-parent` (absolute positioning), `x` (horizontal only)
 * - **Bounds Constraints**: Restrict dragging within a parent control or custom bounds
 * - **Touch Support**: Full touch event support for mobile devices
 * - **Event System**: `dragstart`, `dragend` events with movement offset data
 * - **Handle Support**: Optionally restrict drag to a specific handle element
 * 
 * ## Usage Examples
 * 
 * ### Basic Draggable Box
 * ```javascript
 * const DraggableControl = require('shared/isomorphic/controls/interactive/DraggableControl');
 * 
 * class MyCanvas extends Control {
 *   compose() {
 *     const draggableBox = new DraggableControl({
 *       context: this.context,
 *       dragMode: 'translate',  // Use CSS transform for smooth dragging
 *       initialPosition: [100, 50]
 *     });
 *     draggableBox.add_class('my-box');
 *     draggableBox.add('Drag me!');
 *     this.add(draggableBox);
 *   }
 * }
 * ```
 * 
 * ### Constrained Within Parent
 * ```javascript
 * const draggableItem = new DraggableControl({
 *   context: this.context,
 *   dragMode: 'within-parent',  // Use absolute positioning
 *   constrainToParent: true     // Cannot drag outside parent bounds
 * });
 * ```
 * 
 * ### With Drag Handle
 * ```javascript
 * const windowCtrl = new DraggableControl({
 *   context: this.context,
 *   dragMode: 'translate'
 * });
 * // Only the title bar triggers dragging
 * windowCtrl.setDragHandle(windowCtrl.ctrl_titleBar);
 * ```
 * 
 * ### Listening to Drag Events
 * ```javascript
 * draggableBox.on('drag-start', (e) => {
 *   console.log('Started dragging at:', e.startPosition);
 * });
 * 
 * draggableBox.on('drag-end', (e) => {
 *   console.log('Stopped at:', e.endPosition);
 *   console.log('Total movement:', e.movementOffset);
 * });
 * ```
 * 
 * ## CSS Classes Applied
 * - `.draggable` - Always present when dragging is enabled
 * - `.dragging` - Present during active drag operation
 * - `.drag-mode-translate` - When using translate mode
 * - `.drag-mode-within-parent` - When using within-parent mode
 * - `.drag-mode-x` - When using horizontal-only mode
 * 
 * ## Drag Modes Explained
 * 
 * | Mode | CSS Property | Use Case |
 * |------|-------------|----------|
 * | `translate` | `transform: translate3d()` | Smooth dragging, overlapping elements, best performance |
 * | `within-parent` | `left/top` | When element must stay in document flow, uses absolute positioning |
 * | `x` | `transform: translateX()` | Horizontal sliders, constrained horizontal movement |
 * 
 * @module shared/isomorphic/controls/interactive/DraggableControl
 * @requires jsgui3-html
 * @see {@link https://github.com/nicktackes/jsgui3-html|jsgui3-html} for the underlying mixin
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;
const dragable = require('jsgui3-html/control_mixins/dragable');

/**
 * Valid drag modes for DraggableControl
 * @typedef {'translate'|'within-parent'|'x'} DragMode
 */

/**
 * Bounds specification for constraining drag movement
 * @typedef {Object} DragBounds
 * @property {number} [minX] - Minimum X coordinate
 * @property {number} [maxX] - Maximum X coordinate
 * @property {number} [minY] - Minimum Y coordinate
 * @property {number} [maxY] - Maximum Y coordinate
 */

/**
 * Event data for drag-start event
 * @typedef {Object} DragStartEvent
 * @property {[number, number]} startPosition - [x, y] position where drag began
 * @property {DraggableControl} target - The control being dragged
 */

/**
 * Event data for drag-end event
 * @typedef {Object} DragEndEvent
 * @property {[number, number]} startPosition - [x, y] position where drag began
 * @property {[number, number]} endPosition - [x, y] position where drag ended
 * @property {[number, number]} movementOffset - [deltaX, deltaY] total movement
 * @property {DraggableControl} target - The control that was dragged
 */

/**
 * Configuration options for DraggableControl
 * @typedef {Object} DraggableControlOptions
 * @property {Object} context - jsgui3 context object (required)
 * @property {DragMode} [dragMode='translate'] - The drag mode to use
 * @property {boolean} [draggable=true] - Whether dragging is initially enabled
 * @property {boolean} [constrainToParent=false] - Constrain movement to parent bounds
 * @property {Control} [bounds] - A control to use as bounds constraint
 * @property {[number, number]} [initialPosition] - Initial [x, y] position
 * @property {number} [startDistance=3] - Minimum pixels before drag starts (prevents accidental drags)
 * @property {Function} [condition] - Function returning boolean, drag only starts if true
 * @property {string} [tagName='div'] - HTML tag to use for the control
 */

/**
 * DraggableControl - Isomorphic control providing declarative drag functionality.
 * 
 * Wraps the jsgui3-html `dragable` mixin to provide a clean, reusable control
 * for drag-and-drop interfaces.
 * 
 * @extends Control
 */
class DraggableControl extends Control {
  /**
   * Creates a new DraggableControl instance.
   * 
   * @param {DraggableControlOptions} spec - Configuration options
   * @throws {Error} If context is not provided
   * 
   * @example
   * const ctrl = new DraggableControl({
   *   context: this.context,
   *   dragMode: 'translate',
   *   constrainToParent: true,
   *   initialPosition: [50, 50]
   * });
   */
  constructor(spec = {}) {
    // Extract our options before passing to parent
    const {
      dragMode = 'translate',
      draggable = true,
      constrainToParent = false,
      bounds,
      initialPosition,
      startDistance = 3,
      condition,
      ...parentSpec
    } = spec;
    
    super(parentSpec);
    
    /**
     * The current drag mode
     * @type {DragMode}
     * @private
     */
    this._dragMode = dragMode;
    
    /**
     * Whether dragging is enabled
     * @type {boolean}
     * @private
     */
    this._draggable = draggable;
    
    /**
     * Whether to constrain to parent bounds
     * @type {boolean}
     * @private
     */
    this._constrainToParent = constrainToParent;
    
    /**
     * Custom bounds control
     * @type {Control|null}
     * @private
     */
    this._bounds = bounds || null;
    
    /**
     * Initial position [x, y]
     * @type {[number, number]|null}
     * @private
     */
    this._initialPosition = initialPosition || null;
    
    /**
     * Minimum distance before drag starts
     * @type {number}
     * @private
     */
    this._startDistance = startDistance;
    
    /**
     * Condition function for drag
     * @type {Function|null}
     * @private
     */
    this._condition = condition || null;
    
    /**
     * The drag handle control (if different from this)
     * @type {Control|null}
     * @private
     */
    this._dragHandle = null;
    
    /**
     * Whether currently being dragged
     * @type {boolean}
     */
    this.isDragging = false;
    
    /**
     * Current position [x, y]
     * @type {[number, number]}
     */
    this.position = this._initialPosition ? [...this._initialPosition] : [0, 0];
  }
  
  /**
   * Composes the control's DOM structure.
   * Called automatically during control construction.
   * Override in subclasses to add child elements.
   * 
   * @protected
   */
  compose() {
    // Add base CSS class
    this.add_class('draggable-control');
    
    // Add mode-specific class
    this.add_class(`drag-mode-${this._dragMode}`);
    
    // Add draggable class if enabled
    if (this._draggable) {
      this.add_class('draggable');
    }
    
    // Set initial position if specified
    if (this._initialPosition) {
      this._applyPosition(this._initialPosition);
    }
    
    // Set up server-side render event for state persistence
    this.on('server-pre-render', () => {
      this._fields = this._fields || {};
      this._fields.dragMode = this._dragMode;
      this._fields.draggable = this._draggable;
      this._fields.constrainToParent = this._constrainToParent;
      this._fields.position = this.position;
      this._fields.startDistance = this._startDistance;
    });
  }
  
  /**
   * Activates the control, binding event handlers.
   * Called when the control is attached to the DOM.
   * 
   * @protected
   */
  activate() {
    super.activate();
    
    // Restore state from server-rendered fields if present
    if (this._fields) {
      if (this._fields.dragMode) this._dragMode = this._fields.dragMode;
      if (this._fields.draggable !== undefined) this._draggable = this._fields.draggable;
      if (this._fields.constrainToParent !== undefined) this._constrainToParent = this._fields.constrainToParent;
      if (this._fields.position) this.position = this._fields.position;
      if (this._fields.startDistance) this._startDistance = this._fields.startDistance;
    }
    
    // Apply the dragable mixin
    this._setupDragable();
  }
  
  /**
   * Sets up the dragable mixin with current configuration.
   * @private
   */
  _setupDragable() {
    if (!this._draggable) return;
    
    // Determine bounds control
    let boundsCtrl = this._bounds;
    if (this._constrainToParent && !boundsCtrl && this.parent) {
      boundsCtrl = this.parent;
    }
    
    // Build mixin options
    const mixinOpts = {
      mode: this._dragMode,
      start_distance: this._startDistance
    };
    
    if (boundsCtrl) {
      mixinOpts.bounds = boundsCtrl;
    }
    
    if (this._condition) {
      mixinOpts.condition = this._condition;
    }
    
    if (this._dragHandle) {
      mixinOpts.handle = this._dragHandle;
    }
    
    // Apply the mixin
    dragable(this, mixinOpts);
    
    // Listen to dragable events and re-emit with richer data
    this.on('dragstart', (e) => {
      this.isDragging = true;
      this.add_class('dragging');
      
      this.raise('drag-start', {
        startPosition: [...this.position],
        target: this
      });
    });
    
    this.on('dragend', (e) => {
      this.isDragging = false;
      this.remove_class('dragging');
      
      // Update position based on movement
      if (e.movement_offset) {
        this.position = [
          this.position[0] + e.movement_offset[0],
          this.position[1] + e.movement_offset[1]
        ];
      }
      
      this.raise('drag-end', {
        startPosition: [this.position[0] - (e.movement_offset?.[0] || 0), this.position[1] - (e.movement_offset?.[1] || 0)],
        endPosition: [...this.position],
        movementOffset: e.movement_offset || [0, 0],
        target: this
      });
    });
  }
  
  /**
   * Applies position to the control based on drag mode.
   * @param {[number, number]} pos - [x, y] position
   * @private
   */
  _applyPosition(pos) {
    const [x, y] = pos;
    
    switch (this._dragMode) {
      case 'translate':
        this.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        break;
      case 'within-parent':
        this.style.position = 'absolute';
        this.style.left = `${x}px`;
        this.style.top = `${y}px`;
        break;
      case 'x':
        this.style.transform = `translateX(${x}px)`;
        break;
    }
  }
  
  // ============================================
  // Public API
  // ============================================
  
  /**
   * Gets the current drag mode.
   * @returns {DragMode}
   */
  get dragMode() {
    return this._dragMode;
  }
  
  /**
   * Sets the drag mode.
   * Note: Changing mode after activation may require re-initialization.
   * @param {DragMode} mode - The new drag mode
   */
  set dragMode(mode) {
    this.remove_class(`drag-mode-${this._dragMode}`);
    this._dragMode = mode;
    this.add_class(`drag-mode-${this._dragMode}`);
  }
  
  /**
   * Enables or disables dragging.
   * @param {boolean} enabled - Whether dragging should be enabled
   */
  setDraggable(enabled) {
    this._draggable = enabled;
    if (enabled) {
      this.add_class('draggable');
    } else {
      this.remove_class('draggable');
      this.remove_class('dragging');
    }
  }
  
  /**
   * Checks if dragging is enabled.
   * @returns {boolean}
   */
  isDraggableEnabled() {
    return this._draggable;
  }
  
  /**
   * Sets a specific control as the drag handle.
   * Only interactions with this handle will trigger dragging.
   * 
   * @param {Control} handle - The control to use as drag handle
   * @example
   * const window = new DraggableControl({ context });
   * window.setDragHandle(window.ctrl_titleBar);
   */
  setDragHandle(handle) {
    this._dragHandle = handle;
  }
  
  /**
   * Sets the bounds constraint for dragging.
   * 
   * @param {Control} boundsCtrl - The control to constrain movement within
   */
  setBounds(boundsCtrl) {
    this._bounds = boundsCtrl;
  }
  
  /**
   * Moves the control to a specific position.
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  moveTo(x, y) {
    this.position = [x, y];
    this._applyPosition(this.position);
    
    this.raise('position-changed', {
      position: [...this.position],
      target: this
    });
  }
  
  /**
   * Moves the control by a relative offset.
   * 
   * @param {number} deltaX - Horizontal offset
   * @param {number} deltaY - Vertical offset
   */
  moveBy(deltaX, deltaY) {
    this.moveTo(this.position[0] + deltaX, this.position[1] + deltaY);
  }
  
  /**
   * Gets the current position.
   * @returns {[number, number]} [x, y] position
   */
  getPosition() {
    return [...this.position];
  }
  
  /**
   * Sets a condition function that must return true for drag to start.
   * 
   * @param {Function} conditionFn - Function returning boolean
   * @example
   * ctrl.setCondition(() => !isLocked);
   */
  setCondition(conditionFn) {
    this._condition = conditionFn;
  }
}

module.exports = DraggableControl;
