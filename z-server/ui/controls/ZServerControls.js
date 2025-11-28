"use strict";

const jsgui = require("jsgui3-client");
const { createZServerControls } = require("./zServerControlsFactory");

module.exports = createZServerControls(jsgui);
