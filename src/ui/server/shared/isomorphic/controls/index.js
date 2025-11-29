"use strict";

/**
 * Shared Isomorphic Controls - Index
 * 
 * Re-exports shared controls that can be used by multiple jsgui3 apps.
 * 
 * These controls work identically on server (jsgui3-html) and client (jsgui3-client):
 * - Server: compose() builds tree, all_html_render() outputs HTML
 * - Client: activate() binds events, hydrates server-rendered DOM
 * 
 * @module src/ui/server/shared/isomorphic/controls
 */

const { ResizableSplitLayoutControl } = require("./ResizableSplitLayoutControl");

module.exports = {
  ResizableSplitLayoutControl
};
