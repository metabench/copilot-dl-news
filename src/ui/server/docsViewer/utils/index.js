"use strict";

/**
 * Documentation Viewer Utilities
 * 
 * Exports all utility functions for the documentation viewer.
 */

const { buildDocTree, findNodeByPath, getAllFilePaths, countFiles, sortTree } = require("./docTree");
const { renderMarkdown, markdownToHtml } = require("./markdownRenderer");

module.exports = {
  // Doc tree utilities
  buildDocTree,
  findNodeByPath,
  getAllFilePaths,
  countFiles,
  sortTree,
  
  // Markdown utilities
  renderMarkdown,
  markdownToHtml
};
