"use strict";

/**
 * Diagram Atlas Module
 * 
 * jsgui3-based Diagram Atlas UI with component-based architecture.
 * 
 * Usage:
 *   const { DiagramAtlasAppControl } = require("./diagramAtlas");
 *   
 *   const context = new jsgui.Page_Context();
 *   const app = new DiagramAtlasAppControl({
 *     context,
 *     diagramData: { code: {...}, db: {...}, features: {...} }
 *   });
 *   
 *   const html = app.all_html_render();
 */

const { DiagramAtlasAppControl } = require("./controls");

module.exports = {
  DiagramAtlasAppControl
};
