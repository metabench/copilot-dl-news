/**
 * @fileoverview UI Controls Index
 * 
 * Exports general-purpose UI controls for building interfaces.
 * These controls provide common UI patterns like toolboxes, panels, and menus.
 * 
 * ## Available Controls
 * 
 * | Control | Description |
 * |---------|-------------|
 * | `ToolboxControl` | Tool palette with draggable items and grouping |
 * 
 * ## Usage
 * ```javascript
 * const { ToolboxControl } = require('shared/isomorphic/controls/ui');
 * 
 * const toolbox = new ToolboxControl({
 *   context,
 *   layout: 'grid',
 *   tools: [
 *     { id: 'rect', label: 'Rectangle', icon: '▭' },
 *     { id: 'diamond', label: 'Diamond', icon: '◇' }
 *   ]
 * });
 * ```
 * 
 * @module shared/isomorphic/controls/ui
 */

const ToolboxControl = require('./ToolboxControl');

module.exports = {
  ToolboxControl
};
