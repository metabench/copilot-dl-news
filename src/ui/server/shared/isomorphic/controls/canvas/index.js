/**
 * @fileoverview Canvas Controls Index
 * 
 * Exports controls for building WYSIWYG editors, diagram builders, and visual
 * composition interfaces. Includes the canvas drawing surface and shape primitives.
 * 
 * ## Available Controls
 * 
 * | Control | Description |
 * |---------|-------------|
 * | `CanvasControl` | Drawing surface with grid, zoom, and drop support |
 * | `ShapeControl` | Base class for diagram shapes |
 * | `DiamondShape` | Diamond shape for decision nodes |
 * | `RectangleShape` | Rectangle shape for action nodes |
 * | `EllipseShape` | Ellipse shape for start/end nodes |
 * | `ParallelogramShape` | Parallelogram for input/output nodes |
 * 
 * ## Usage
 * ```javascript
 * const { 
 *   CanvasControl, 
 *   DiamondShape, 
 *   RectangleShape 
 * } = require('shared/isomorphic/controls/canvas');
 * 
 * const canvas = new CanvasControl({ context, gridSize: 25 });
 * const decision = new DiamondShape({ context, label: 'Is Valid?' });
 * canvas.addElement(decision, 100, 100);
 * ```
 * 
 * @module shared/isomorphic/controls/canvas
 */

const CanvasControl = require('./CanvasControl');
const { 
  ShapeControl, 
  DiamondShape, 
  RectangleShape, 
  EllipseShape, 
  ParallelogramShape 
} = require('./ShapeControl');

module.exports = {
  CanvasControl,
  ShapeControl,
  DiamondShape,
  RectangleShape,
  EllipseShape,
  ParallelogramShape
};
