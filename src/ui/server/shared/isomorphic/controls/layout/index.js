/**
 * @fileoverview Layout Controls Index
 * 
 * Exports controls for managing layout and spatial organization.
 * 
 * ## Available Controls
 * 
 * | Control | Description |
 * |---------|-------------|
 * | `ResizableSplitLayoutControl` | Split pane layout with resizable divider |
 * 
 * ## Usage
 * ```javascript
 * const { ResizableSplitLayoutControl } = require('shared/isomorphic/controls/layout');
 * 
 * const split = new ResizableSplitLayoutControl({
 *   context,
 *   direction: 'horizontal',
 *   initialSplit: 0.3
 * });
 * split.setLeftContent(sidebar);
 * split.setRightContent(mainContent);
 * ```
 * 
 * @module shared/isomorphic/controls/layout
 */

// Import from parent directory (existing control)
const ResizableSplitLayoutControl = require('../ResizableSplitLayoutControl');

module.exports = {
  ResizableSplitLayoutControl
};
