"use strict";

/**
 * Control Harness reuses the shared isomorphic resolver so that
 * server rendering (jsgui3-html) and client activation (jsgui3-client)
 * stay consistent with the rest of the UI servers.
 */

module.exports = require("../../shared/isomorphic/jsgui");
