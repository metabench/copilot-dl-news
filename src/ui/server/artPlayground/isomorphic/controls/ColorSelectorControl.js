"use strict";

const jsgui = require("../jsgui");
const { createColorSelectorControl } = require("../../../../controls/helpers/colorSelectorFactory");

const ColorSelectorControl = createColorSelectorControl(jsgui, { identifier: "art_color_selector" });

module.exports = { ColorSelectorControl };
