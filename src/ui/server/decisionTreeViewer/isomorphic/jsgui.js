"use strict";

/**
 * jsgui3 wrapper for Decision Tree Viewer controls.
 * 
 * This module provides access to jsgui3 in an isomorphic way,
 * working on both server (jsgui3-html) and client (jsgui3-client).
 */

let jsgui;

if (typeof window === "undefined") {
  // Server-side
  jsgui = require("jsgui3-html");
} else {
  // Client-side
  jsgui = require("jsgui3-client");
}

module.exports = jsgui;
