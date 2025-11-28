"use strict";

/**
 * Documentation Viewer Module
 * 
 * A jsgui3 + Express web application for browsing and viewing markdown documentation.
 * 
 * All controls are isomorphic - they work on both server and client.
 * 
 * @module docsViewer
 */

const { createDocsViewerServer, createDocsViewerMiddleware } = require("./server");
const controls = require("./isomorphic/controls");
const utils = require("./utils");

module.exports = {
  // Main server functions
  createDocsViewerServer,
  createDocsViewerMiddleware,
  
  // Controls (all isomorphic)
  ...controls,
  
  // Utilities
  ...utils
};
