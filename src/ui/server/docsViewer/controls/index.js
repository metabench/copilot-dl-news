"use strict";

/**
 * Documentation Viewer Controls
 * 
 * Exports all jsgui3 controls for the documentation viewer.
 */

const { DocAppControl } = require("./DocAppControl");
const { DocNavControl } = require("./DocNavControl");
const { DocViewerControl, DocContentControl } = require("./DocViewerControl");

module.exports = {
  DocAppControl,
  DocNavControl,
  DocViewerControl,
  DocContentControl
};
