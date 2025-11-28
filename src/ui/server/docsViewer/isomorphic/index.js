"use strict";

/**
 * Isomorphic Module Index
 * 
 * This module provides isomorphic controls and utilities that work
 * identically on both server (Node.js) and client (Browser).
 * 
 * All controls use the jsgui resolver which returns:
 * - jsgui3-html on server
 * - jsgui3-client on browser (via esbuild alias)
 */

// Re-export all controls
module.exports = require("./controls");

// Also export jsgui resolver for direct use if needed
module.exports.jsgui = require("./jsgui");
