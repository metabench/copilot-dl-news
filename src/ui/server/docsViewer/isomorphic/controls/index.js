"use strict";

/**
 * Isomorphic Controls Index
 * 
 * All controls in this directory are isomorphic - they work identically
 * on both server (Node.js with jsgui3-html) and client (Browser with jsgui3-client).
 * 
 * Pattern:
 * - compose() builds the control tree (server for SSR, client for dynamic creation)
 * - activate() binds event handlers (client-side only, for hydration)
 * - All controls use require("../jsgui") which resolves to the correct implementation
 */

// Layout controls
const { ResizableSplitLayoutControl } = require("./ResizableSplitLayoutControl");

// App structure controls
const { DocAppControl } = require("./DocAppControl");
const { DocNavControl } = require("./DocNavControl");
const { DocViewerControl, DocContentControl } = require("./DocViewerControl");

// Interactive controls
const { ContextMenuControl } = require("./ContextMenuControl");
const { ColumnContextMenuControl } = require("./ColumnContextMenuControl");
const { ColumnHeaderControl } = require("./ColumnHeaderControl");
const { DocsThemeToggleControl } = require("./DocsThemeToggleControl");
const { DocsNavToggleControl } = require("./DocsNavToggleControl");
const { DocsSearchControl } = require("./DocsSearchControl");
const { DocsFileFilterControl } = require("./DocsFileFilterControl");

module.exports = {
  // Layout
  ResizableSplitLayoutControl,
  
  // App structure
  DocAppControl,
  DocNavControl,
  DocViewerControl,
  DocContentControl,
  
  // Interactive
  ContextMenuControl,
  ColumnContextMenuControl,
  ColumnHeaderControl,
  DocsThemeToggleControl,
  DocsNavToggleControl,
  DocsSearchControl,
  DocsFileFilterControl
};
