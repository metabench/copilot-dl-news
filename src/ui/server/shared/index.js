"use strict";

/**
 * Shared UI Server Utilities
 * 
 * Common functions and base classes used across all UI servers:
 * - Data Explorer
 * - Diagram Atlas
 * - Gazetteer
 * - Docs Viewer
 * - Design Studio
 * 
 * This module provides:
 * - BaseAppControl: Base class for app-level page composition
 * - Page rendering helpers
 * - Common HTML escaping
 * - Shared utilities (file tree, renderers)
 * - Shared isomorphic controls
 */

const { BaseAppControl } = require("./BaseAppControl");
const utils = require("./utils");
const isomorphic = require("./isomorphic");

/**
 * Render a complete HTML page from a jsgui3 control
 * 
 * @param {Control} control - The root jsgui3 control
 * @param {Object} options - Page options
 * @param {string} options.title - Page title
 * @param {string[]} options.cssFiles - CSS files to include (paths relative to /assets/)
 * @param {string[]} options.jsFiles - JS files to include (paths relative to /assets/)
 * @param {Object} options.state - State to embed as window.__STATE__
 * @returns {string} Complete HTML document
 */
function renderPageHtml(control, options = {}) {
  const {
    title = "Application",
    cssFiles = [],
    jsFiles = [],
    state = null,
    bodyClass = ""
  } = options;
  
  const html = control.all_html_render();
  
  const cssLinks = cssFiles
    .map(file => `<link rel="stylesheet" href="/assets/${escapeHtml(file)}">`)
    .join("\n  ");
  
  const jsScripts = jsFiles
    .map(file => `<script src="/assets/${escapeHtml(file)}"></script>`)
    .join("\n  ");
  
  const stateScript = state 
    ? `<script>window.__STATE__ = ${JSON.stringify(state)};</script>`
    : "";
  
  const bodyClassAttr = bodyClass ? ` class="${escapeHtml(bodyClass)}"` : "";
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${cssLinks}
  ${stateScript}
</head>
<body${bodyClassAttr}>
  ${html}
  ${jsScripts}
</body>
</html>`;
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format a date/time for display
 * @param {Date|string|number} value - Date value
 * @param {boolean} includeSeconds - Whether to include seconds
 * @returns {string} Formatted date string
 */
function formatDateTime(value, includeSeconds = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  const base = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${includeSeconds ? `:${pad(date.getUTCSeconds())}` : ""}`;
  return `${base} ${time} UTC`;
}

/**
 * Format a number with locale-aware separators
 * @param {number} value - Number to format
 * @returns {string} Formatted number
 */
function formatCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return "0";
  return numeric.toLocaleString("en-US");
}

module.exports = {
  BaseAppControl,
  renderPageHtml,
  escapeHtml,
  formatDateTime,
  formatCount,
  // Shared utilities
  utils,
  // Shared isomorphic controls and jsgui
  isomorphic,
  // Re-export key controls directly for convenience
  ResizableSplitLayoutControl: isomorphic.ResizableSplitLayoutControl
};
