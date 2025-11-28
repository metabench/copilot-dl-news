"use strict";

/**
 * Isomorphic jsgui module resolver
 * 
 * This module provides the correct jsgui implementation based on environment.
 * - Server (Node.js): returns jsgui3-html
 * - Client (Browser): returns jsgui3-client
 * 
 * Usage in isomorphic controls:
 *   const jsgui = require("../jsgui");
 * 
 * The bundler (esbuild) will resolve this at build time for client bundles,
 * while Node.js will resolve it at runtime for server rendering.
 */

// Detect environment
const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

let jsgui;

if (isBrowser) {
  // Client-side: use jsgui3-client
  // This path is resolved by esbuild alias in the build script
  jsgui = require("jsgui3-client");
} else {
  // Server-side: use jsgui3-html
  jsgui = require("jsgui3-html");
}

module.exports = jsgui;
