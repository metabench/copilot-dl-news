"use strict";

/**
 * SVG Renderer Utility
 * 
 * Parses SVG files and converts them to jsgui3 Controls for proper rendering.
 * Each SVG element becomes a jsgui3 Control with the appropriate tagName.
 */

const jsgui = require("jsgui3-html");
const { XMLParser } = require("fast-xml-parser");

/**
 * Parse SVG content and return a jsgui3 Control tree
 * @param {Object} context - jsgui Page_Context
 * @param {string} svgContent - Raw SVG file content
 * @returns {jsgui.Control} - Root SVG control
 */
function parseSvgToControls(context, svgContent) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: false,
    trimValues: true,
    textNodeName: "_text"
  });
  
  const parsed = parser.parse(svgContent);
  
  if (!parsed.svg) {
    throw new Error("No SVG element found in content");
  }
  
  // Convert to jsgui3 control tree
  return convertNodeToControl(context, "svg", parsed.svg);
}

/**
 * Convert a parsed XML node to a jsgui3 Control
 * @param {Object} context - jsgui context
 * @param {string} tagName - Element tag name
 * @param {Object|string|Array} nodeData - Node content from parser
 * @returns {jsgui.Control}
 */
function convertNodeToControl(context, tagName, nodeData) {
  const control = new jsgui.Control({ 
    context, 
    tagName
  });
  
  // Handle simple text content
  if (typeof nodeData === "string") {
    control.add(new jsgui.String_Control({ context, text: nodeData }));
    return control;
  }
  
  if (typeof nodeData !== "object" || nodeData === null) {
    return control;
  }
  
  // Track if we have width/height for SVG root
  let hasWidth = false;
  let hasHeight = false;
  let viewBox = null;
  
  // Process attributes and children
  for (const [key, value] of Object.entries(nodeData)) {
    if (key.startsWith("@_")) {
      // Attribute - remove prefix and set
      const attrName = key.slice(2);
      control.dom.attributes[attrName] = String(value);
      
      // Track dimensions
      if (attrName === "width") hasWidth = true;
      if (attrName === "height") hasHeight = true;
      if (attrName === "viewBox") viewBox = String(value);
    } else if (key === "_text") {
      // Text content
      const text = String(value).trim();
      if (text) {
        control.add(new jsgui.String_Control({ context, text }));
      }
    } else {
      // Child element(s)
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        const childControl = convertNodeToControl(context, key, child);
        control.add(childControl);
      }
    }
  }
  
  // For SVG root element: make it responsive
  // Use 100% width and auto height, preserving aspect ratio via viewBox
  if (tagName === "svg") {
    // Always set responsive dimensions
    control.dom.attributes["width"] = "100%";
    control.dom.attributes["height"] = "auto";
    
    // Ensure preserveAspectRatio is set for proper scaling
    if (!control.dom.attributes["preserveAspectRatio"]) {
      control.dom.attributes["preserveAspectRatio"] = "xMidYMid meet";
    }
  }
  
  return control;
}

/**
 * Render SVG content to a jsgui3 control wrapped in a container
 * @param {Object} context - jsgui Page_Context  
 * @param {string} svgContent - Raw SVG content
 * @param {string} filename - Original filename for display
 * @returns {jsgui.Control} - Container with SVG
 */
function renderSvgContent(context, svgContent, filename) {
  const container = new jsgui.Control({ context, tagName: "div" });
  container.add_class("doc-svg-container");
  
  const wrapper = new jsgui.Control({ context, tagName: "div" });
  wrapper.add_class("doc-svg-wrapper");
  
  try {
    const svgControl = parseSvgToControls(context, svgContent);
    wrapper.add(svgControl);
  } catch (err) {
    // Fallback: show error message
    const errorMsg = new jsgui.Control({ context, tagName: "p" });
    errorMsg.add_class("doc-svg-error");
    errorMsg.add(new jsgui.String_Control({ 
      context, 
      text: `Error parsing SVG: ${err.message}` 
    }));
    wrapper.add(errorMsg);
  }
  
  container.add(wrapper);
  
  // Add filename caption
  const caption = new jsgui.Control({ context, tagName: "p" });
  caption.add_class("doc-svg-filename");
  
  const code = new jsgui.Control({ context, tagName: "code" });
  code.add(new jsgui.String_Control({ context, text: filename }));
  caption.add(code);
  
  container.add(caption);
  
  return container;
}

module.exports = { parseSvgToControls, renderSvgContent };
