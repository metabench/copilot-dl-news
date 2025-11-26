"use strict";

/**
 * Client Controls Index
 * 
 * Exports all client-side controls for the documentation viewer.
 */

const { DocsThemeToggleControl } = require("./DocsThemeToggleControl");
const { DocsNavToggleControl } = require("./DocsNavToggleControl");
const { DocsSearchControl } = require("./DocsSearchControl");

module.exports = {
  DocsThemeToggleControl,
  DocsNavToggleControl,
  DocsSearchControl
};
