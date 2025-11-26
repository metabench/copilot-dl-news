"use strict";

/**
 * Documentation Viewer Module
 * 
 * A jsgui3 + Express web application for browsing and viewing markdown documentation.
 * 
 * @module docsViewer
 */

const { createDocsViewerServer, createDocsViewerMiddleware } = require("./server");
const controls = require("./controls");
const utils = require("./utils");

module.exports = {
  // Main server functions
  createDocsViewerServer,
  createDocsViewerMiddleware,
  
  // Controls
  ...controls,
  
  // Utilities
  ...utils
};
