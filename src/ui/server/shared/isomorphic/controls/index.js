"use strict";

/**
 * @fileoverview Shared Isomorphic Controls - Main Index
 * 
 * Re-exports all shared controls that can be used by multiple jsgui3 apps.
 * Controls are organized into categories:
 * 
 * ## Categories
 * 
 * | Category | Purpose | Controls |
 * |----------|---------|----------|
 * | **interactive** | User interaction | DraggableControl, SelectableControl |
 * | **canvas** | WYSIWYG/diagram building | CanvasControl, ShapeControl, shapes |
 * | **ui** | General UI patterns | ToolboxControl, ContextMenuControl |
 * | **layout** | Spatial organization | ResizableSplitLayoutControl |
 * 
 * ## Isomorphic Pattern
 * 
 * These controls work identically on server (jsgui3-html) and client (jsgui3-client):
 * - Server: `compose()` builds tree, `all_html_render()` outputs HTML
 * - Client: `activate()` binds events, hydrates server-rendered DOM
 * 
 * ## Usage Examples
 * 
 * ### Import All
 * ```javascript
 * const controls = require('shared/isomorphic/controls');
 * const { DraggableControl, CanvasControl } = controls;
 * ```
 * 
 * ### Import by Category
 * ```javascript
 * const { DraggableControl } = require('shared/isomorphic/controls/interactive');
 * const { CanvasControl, DiamondShape } = require('shared/isomorphic/controls/canvas');
 * const { ToolboxControl } = require('shared/isomorphic/controls/ui');
 * ```
 * 
 * @module src/ui/server/shared/isomorphic/controls
 */

// Layout controls
const { ResizableSplitLayoutControl } = require("./ResizableSplitLayoutControl");

// Interactive controls (wrappers around jsgui3-html mixins)
const { DraggableControl, SelectableControl } = require("./interactive");

// Canvas controls (WYSIWYG/diagram building)
const {
  CanvasControl,
  ShapeControl,
  DiamondShape,
  RectangleShape,
  EllipseShape,
  ParallelogramShape
} = require("./canvas");

// UI controls (general patterns)
const { ToolboxControl, ContextMenuControl, MatrixTableControl, VirtualMatrixControl } = require("./ui");

module.exports = {
  // Layout
  ResizableSplitLayoutControl,
  
  // Interactive
  DraggableControl,
  SelectableControl,
  
  // Canvas & Shapes
  CanvasControl,
  ShapeControl,
  DiamondShape,
  RectangleShape,
  EllipseShape,
  ParallelogramShape,
  
  // UI
  ToolboxControl,
  ContextMenuControl,
  MatrixTableControl,
  VirtualMatrixControl
};
