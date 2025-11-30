"use strict";

const jsgui = require("../jsgui");
const { Control } = jsgui;

/**
 * Base class for visual SVG components on the canvas.
 */
class ComponentControl extends Control {
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
  get y() { return this._y; }
  get width() { return this._width; }
  get height() { return this._height; }
  get fill() { return this._fill; }
  get selected() { return this._selected; }
  
  set x(v) { this._x = v; this._updatePosition(); }
  set y(v) { this._y = v; this._updatePosition(); }
  set width(v) { this._width = v; this._updateSize(); }
  set height(v) { this._height = v; this._updateSize(); }
  set fill(v) { this._fill = v; this._updateFill(); }
  set selected(v) { this._selected = v; this._updateSelection(); }
  
  getBounds() { return { x: this._x, y: this._y, width: this._width, height: this._height }; }
  
  // Override in subclasses
  _updatePosition() {}
  _updateSize() {}
  _updateFill() {}
  _updateSelection() {}
  
  moveBy(dx, dy) {
    this._x += dx;
    this._y += dy;
    this._updatePosition();
  }
  
  resize(w, h) {
    this._width = Math.max(20, w);
    this._height = Math.max(20, h);
    this._updateSize();
  }
  
  toJSON() {
    return { id: this._id, type: this._type, x: this._x, y: this._y, width: this._width, height: this._height, fill: this._fill };
  }
  
  static fromJSON(data, context) {
    return new ComponentControl({ context, ...data });
  }
}

module.exports = { ComponentControl };
