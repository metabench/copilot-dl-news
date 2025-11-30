/**
 * @fileoverview Interactive Controls Index
 * 
 * Exports controls that provide interactive functionality like dragging,
 * selecting, and resizing. These controls wrap jsgui3-html mixins to provide
 * clean, reusable APIs for building interactive interfaces.
 * 
 * ## Available Controls
 * 
 * | Control | Description | Mixin Used |
 * |---------|-------------|------------|
 * | `DraggableControl` | Enables drag-and-drop | `dragable` |
 * | `SelectableControl` | Enables selection | `selectable` |
 * 
 * ## Usage
 * ```javascript
 * const { DraggableControl, SelectableControl } = require('shared/isomorphic/controls/interactive');
 * ```
 * 
 * @module shared/isomorphic/controls/interactive
 */

const DraggableControl = require('./DraggableControl');
const SelectableControl = require('./SelectableControl');

module.exports = {
  DraggableControl,
  SelectableControl
};
