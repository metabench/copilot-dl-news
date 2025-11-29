"use strict";

/**
 * Shared Utilities Index
 * 
 * Common utilities used across UI server apps:
 * - File tree building
 * - Markdown rendering  
 * - SVG rendering
 */

const { buildFileTree, findNodeByPath, getAllFilePaths, countFiles, sortTree, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDE_DIRS } = require("./fileTree");
const { renderMarkdown, markdownToHtml } = require("./markdownRenderer");
const { parseSvgToControls, renderSvgContent } = require("./svgRenderer");

module.exports = {
  // File tree utilities
  buildFileTree,
  findNodeByPath,
  getAllFilePaths,
  countFiles,
  sortTree,
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDE_DIRS,
  
  // Markdown utilities
  renderMarkdown,
  markdownToHtml,
  
  // SVG utilities
  parseSvgToControls,
  renderSvgContent
};
