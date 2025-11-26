"use strict";

/**
 * Documentation Viewer Utilities
 * 
 * Exports all utility functions for the documentation viewer.
 */

const { buildDocTree, findNodeByPath, getAllFilePaths, countFiles } = require("./docTree");
const { renderMarkdown, markdownToHtml } = require("./markdownRenderer");

module.exports = {
  // Doc tree utilities
  buildDocTree,
  findNodeByPath,
  getAllFilePaths,
  countFiles,
  
  // Markdown utilities
  renderMarkdown,
  markdownToHtml
};
