"use strict";

/**
 * Design Studio Isomorphic Controls
 * 
 * Re-exports all controls for easy importing.
 */

const { DesignAppControl } = require("./DesignAppControl");
const { DesignNavControl } = require("./DesignNavControl");
const { DesignViewerControl } = require("./DesignViewerControl");

module.exports = {
  DesignAppControl,
  DesignNavControl,
  DesignViewerControl
};
