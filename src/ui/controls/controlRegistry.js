"use strict";

const jsgui = require("jsgui3-html");

function registerControlType(typeName, ControlClass, { jsguiInstance = jsgui } = {}) {
  if (!typeName || !ControlClass || !jsguiInstance) {
    return ControlClass;
  }
  const normalized = String(typeName).trim();
  if (!normalized) {
    return ControlClass;
  }
  const key = normalized.toLowerCase();
  const proto = ControlClass.prototype || ControlClass.__proto__;
  if (proto && !proto.__type_name) {
    proto.__type_name = key;
  }

  jsguiInstance.controls = jsguiInstance.controls || {};
  jsguiInstance.controls[key] = ControlClass;

  // Ensure client contexts see the constructor when parsing existing markup.
  if (!jsguiInstance.map_Controls) {
    jsguiInstance.map_Controls = {};
  }
  jsguiInstance.map_Controls[key] = ControlClass;

  if (!jsguiInstance[key]) {
    jsguiInstance[key] = ControlClass;
  }
  return ControlClass;
}

module.exports = {
  registerControlType
};
