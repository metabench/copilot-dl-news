"use strict";

/**
 * Data Explorer Module
 * 
 * jsgui3-based Data Explorer UI with component-based architecture.
 * 
 * Usage:
 *   const { ExplorerAppControl, VIEW_TYPES } = require("./dataExplorer");
 *   
 *   const context = new jsgui.Page_Context();
 *   const app = new ExplorerAppControl({
 *     context,
 *     viewType: VIEW_TYPES.URLS,
 *     columns: [...],
 *     rows: [...],
 *     navLinks: [...]
 *   });
 *   
 *   const html = app.all_html_render();
 */

const { ExplorerAppControl, VIEW_TYPES } = require("./controls");

module.exports = {
  ExplorerAppControl,
  VIEW_TYPES
};
