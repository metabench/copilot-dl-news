"use strict";

const jsgui = require("../jsgui");

/**
 * Component Control
 * 
 * Base class for visual components on the canvas.
 * Provides abstraction over SVG elements.
 */
class ComponentControl extends jsgui.Control {
  constructor(spec = {}) {
    super(spec);
    
    this._id = spec.id || `comp-${Date.now()}`;
    this._type = spec.type || "unknown";
    this._x = spec.x || 0;
    this._y = spec.y || 0;
    this._width = spec.width || 100;
    this._height = spec.height || 100;
    this._fill = spec.fill || "#4A90D9";
    this._selected = false;
  }
  
  get id() { return this._id; }
  get type() { return this._type; }
  
  get x() { return this._x; }
  set x(val) { this._x = val; this._updatePosition(); }
  
  get y() { return this._y; }
  set y(val) { this._y = val; this._updatePosition(); }
  
  get width() { return this._width; }
  set width(val) { this._width = val; this._updateSize(); }
  
  get height() { return this._height; }
  set height(val) { this._height = val; this._updateSize(); }
  
  get fill() { return this._fill; }
  set fill(val) { this._fill = val; this._updateFill(); }
  
  get selected() { return this._selected; }
  set selected(val) {
    this._selected = val;
    this._updateSelection();
  }
  
  getBounds() {
    return {
      x: this._x,
      y: this._y,
      width: this._width,
      height: this._height
    };
  }
  
  // Override in subclasses
  _updatePosition() {}
  _updateSize() {}
  _updateFill() {}
  _updateSelection() {}
  
  /**
   * Move component by delta
   */
  moveBy(dx, dy) {
    this._x += dx;
    this._y += dy;
    this._updatePosition();
  }
  
  /**
   * Resize component
   */
  resize(width, height) {
    this._width = Math.max(20, width);
    this._height = Math.max(20, height);
    this._updateSize();
  }
  
  /**
   * Serialize component to JSON
   */
  toJSON() {
    return {
      id: this._id,
      type: this._type,
      x: this._x,
      y: this._y,
      width: this._width,
      height: this._height,
      fill: this._fill
    };
  }
  
  /**
   * Create component from JSON
   */
  static fromJSON(data, context) {
    return new ComponentControl({
      context,
      ...data
    });
  }
}

module.exports = { ComponentControl };
