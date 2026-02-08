"use strict";

/**
 * Shared Isomorphic Module - Index
 * 
 * Provides shared isomorphic functionality for jsgui3 apps:
 * - jsgui: Isomorphic resolver for jsgui3-html (server) or jsgui3-client (browser)
 * - controls: Shared controls that work on both server and client
 * 
 * Usage:
 *   // For jsgui3 base classes
 *   const jsgui = require("../../../../shared/isomorphic/jsgui");
 *   
 *   // For shared controls
 *   const { ResizableSplitLayoutControl } = require("../../../../shared/isomorphic/controls");
 * 
 * @module src/ui/server/shared/isomorphic
 */

const jsgui = require("./jsgui");
const controls = require("./controls");

module.exports = {
  jsgui,
  ...controls
};
