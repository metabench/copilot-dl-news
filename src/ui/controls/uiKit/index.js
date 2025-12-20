"use strict";

function ensureMap(obj, key) {
  if (!obj[key]) obj[key] = {};
  return obj[key];
}

function register(jsgui, typeName, ControlClass) {
  if (!jsgui || !typeName || !ControlClass) return ControlClass;
  const controls = ensureMap(jsgui, "controls");
  const map = ensureMap(jsgui, "map_Controls");
  const key = String(typeName).trim().toLowerCase();
  if (!key) return ControlClass;
  controls[key] = ControlClass;
  map[key] = ControlClass;
  return ControlClass;
}

/**
 * Register shared UI kit controls into the provided jsgui instance.
 * Intended for isomorphic bundles that run both server-side and client-side.
 */
function registerUiKitControls(jsgui) {
  if (!jsgui || !jsgui.Control) {
    return { registered: false };
  }

  const { Control } = jsgui;

  class UiButtonControl extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "button", __type_name: spec.__type_name || "ui_button" });
      this.add_class("ui-btn");
      if (spec.variant) this.add_class(`ui-btn--${spec.variant}`);
      this.dom.attributes.type = spec.type || "button";
      if (spec.action) this.dom.attributes["data-action"] = spec.action;
      if (spec.title) this.dom.attributes.title = spec.title;
      if (spec.disabled) this.dom.attributes.disabled = "disabled";
      if (spec.text) this.add_text(spec.text);
    }
  }

  class UiNumberInputControl extends Control {
    constructor(spec = {}) {
      super({ ...spec, tagName: "input", __type_name: spec.__type_name || "ui_number_input" });
      this.add_class("ui-input");
      this.dom.attributes.type = "number";
      if (spec.min != null) this.dom.attributes.min = String(spec.min);
      if (spec.step != null) this.dom.attributes.step = String(spec.step);
      if (spec.value != null) this.dom.attributes.value = String(spec.value);
      if (spec.title) this.dom.attributes.title = spec.title;
    }
  }

  register(jsgui, "ui_button", UiButtonControl);
  register(jsgui, "ui_number_input", UiNumberInputControl);

  return {
    registered: true,
    UiButtonControl,
    UiNumberInputControl
  };
}

module.exports = {
  registerUiKitControls
};
