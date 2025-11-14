"use strict";

const langTools = require("lang-tools");

const INSTALL_FLAG = Symbol.for("copilot.bindingPlugin.installed");
const WATCHERS_KEY = Symbol("copilot.bindingPlugin.watchers");
const CLASS_PREFIX_STATE_KEY = Symbol("copilot.bindingPlugin.classPrefix");

function installBindingPlugin(jsguiInstance = require("jsgui3-html")) {
  const jsgui = jsguiInstance;
  if (!jsgui || !jsgui.Control) {
    throw new Error("bindingPlugin requires a jsgui3-html instance with Control available");
  }
  if (jsgui[INSTALL_FLAG]) {
    return jsgui.bindingToolkit;
  }

  const Control = jsgui.Control;
  const ControlData = jsgui.Control_Data;
  const DataObjectCtor = langTools.Data_Object || jsgui.Data_Object;

  if (!DataObjectCtor) {
    throw new Error("bindingPlugin could not find Data_Object constructor");
  }

  function ensureDomAttributes(control) {
    control.dom = control.dom || {};
    control.dom.attributes = control.dom.attributes || {};
    return control.dom.attributes;
  }

  function normalizeBindingValue(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map((item) => normalizeBindingValue(item));
    if (value && typeof value === "object") {
      if (value.__data_value && typeof value.value === "function") {
        return normalizeBindingValue(value.value());
      }
      if (value.__data_value && typeof value.get === "function") {
        return normalizeBindingValue(value.get());
      }
    }
    return value;
  }

  function modelNeedsUpgrade(model) {
    return !(model && typeof model === "object" && model.__data_object);
  }

  function ensureDataModel(control, defaults = {}) {
    control.data = control.data || new ControlData({ context: control.context });
    let model;
    try {
      model = control.data.model;
    } catch (err) {
      model = control.data && control.data._model;
    }
    if (modelNeedsUpgrade(model)) {
      model = new DataObjectCtor({ context: control.context });
      control.data.model = model;
      const attrs = ensureDomAttributes(control);
      if (typeof model._id === "function") {
        attrs["data-jsgui-data-model"] = model._id();
      }
    }
    if (model && typeof model.set === "function") {
      Object.entries(defaults || {}).forEach(([key, value]) => {
        const existing = typeof model.get === "function" ? model.get(key) : model[key];
        if (typeof existing === "undefined") {
          model.set(key, value);
        }
      });
    }
    return model;
  }

  function ensureViewModel(control, defaults = {}) {
    control.view = control.view || {};
    if (!control.view.data) {
      control.view.data = new ControlData({ context: control.context });
    }
    const holder = control.view.data;
    let viewModel;
    try {
      viewModel = holder.model;
    } catch (err) {
      viewModel = holder && holder._model;
    }
    if (modelNeedsUpgrade(viewModel)) {
      viewModel = new DataObjectCtor({ context: control.context });
      holder.model = viewModel;
      const attrs = ensureDomAttributes(control);
      if (typeof viewModel._id === "function") {
        attrs["data-jsgui-view-data-model"] = viewModel._id();
      }
    }
    if (viewModel && typeof viewModel.set === "function") {
      Object.entries(defaults || {}).forEach(([key, value]) => {
        const existing = typeof viewModel.get === "function" ? viewModel.get(key) : viewModel[key];
        if (typeof existing === "undefined") {
          viewModel.set(key, value);
        }
      });
    }
    return viewModel;
  }

  function trackWatcher(control, model, handler) {
    if (!model || typeof model.on !== "function") return;
    const bucket = control[WATCHERS_KEY] || [];
    bucket.push({ model, handler });
    control[WATCHERS_KEY] = bucket;
  }

  function cleanupWatchers(control) {
    const bucket = control[WATCHERS_KEY];
    if (!Array.isArray(bucket) || !bucket.length) return;
    bucket.forEach(({ model, handler }) => {
      if (model && typeof model.off === "function") {
        model.off("change", handler);
      }
    });
    control[WATCHERS_KEY] = [];
  }

  function toBoolean(value) {
    const normalized = normalizeBindingValue(value);
    if (typeof normalized === "string") {
      const trimmed = normalized.trim().toLowerCase();
      if (!trimmed || trimmed === "false" || trimmed === "0" || trimmed === "no") return false;
    }
    return Boolean(normalized);
  }

  function applyToggleClass(control, classes, isActive) {
    const list = Array.isArray(classes)
      ? classes
      : String(classes)
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean);
    list.forEach((cls) => {
      if (!cls) return;
      if (isActive) control.add_class(cls);
      else control.remove_class(cls);
    });
  }

  function applyClassPrefix(control, prefix, value) {
    if (!prefix) return;
    const state = control[CLASS_PREFIX_STATE_KEY] || {};
    if (state[prefix]) {
      control.remove_class(state[prefix]);
    }
    if (value == null || value === "") {
      state[prefix] = undefined;
      control[CLASS_PREFIX_STATE_KEY] = state;
      return;
    }
    const cls = `${prefix}${value}`;
    control.add_class(cls);
    state[prefix] = cls;
    control[CLASS_PREFIX_STATE_KEY] = state;
  }

  function setAttribute(control, attrName, value, action = {}) {
    const attrs = ensureDomAttributes(control);
    const normalized = normalizeBindingValue(value);
    const isBoolean = action.boolean === true;
    if (isBoolean) {
      const boolVal = toBoolean(normalized);
      if (!boolVal && action.falseValue == null && action.keepFalse !== true) {
        delete attrs[attrName];
        return;
      }
      attrs[attrName] = boolVal ? action.trueValue || "true" : action.falseValue || "false";
      return;
    }
    if (normalized == null || (normalized === false && action.keepFalse !== true)) {
      delete attrs[attrName];
      return;
    }
    attrs[attrName] = String(normalized);
  }

  function applyAction(control, propName, rawValue, action = {}) {
    if (!action) return;
    const baseValue = normalizeBindingValue(rawValue);
    const transformed = typeof action.transform === "function" ? action.transform(baseValue, control, propName) : baseValue;
    if (typeof action.when === "function" && !action.when(transformed, control, propName)) {
      return;
    }
    if (action.attr) {
      setAttribute(control, action.attr, transformed, action);
    }
    if (action.booleanAttr) {
      setAttribute(control, action.booleanAttr, transformed, { ...action, boolean: true });
    }
    if (action.toggleClass) {
      const flag = action.negate ? !toBoolean(transformed) : toBoolean(transformed);
      applyToggleClass(control, action.toggleClass, flag);
    }
    if (action.classPrefix) {
      applyClassPrefix(control, action.classPrefix, transformed);
    }
    if (typeof action.onChange === "function") {
      action.onChange(transformed, control, propName, action);
    }
  }

  function bindDataToView(control, bindings = {}, options) {
    if (!bindings || typeof bindings !== "object") return null;
    ensureDataModel(control, options && options.dataDefaults);
    ensureViewModel(control, options && options.viewDefaults);
    const normalized = {};
    Object.entries(bindings).forEach(([source, target]) => {
      if (!target) return;
      if (typeof target === "string") {
        normalized[source] = target;
      } else if (typeof target === "object") {
        normalized[source] = target;
      }
    });
    if (!Object.keys(normalized).length) return null;
    if (typeof control.bind !== "function") {
      throw new Error("Control does not support bind(); ensure it extends Data_Model_View_Model_Control");
    }
    return control.bind(normalized, options && options.bindingOptions);
  }

  Control.prototype.ensureBindingDataModel = function ensureBindingDataModel(defaults) {
    return ensureDataModel(this, defaults);
  };

  Control.prototype.ensureBindingViewModel = function ensureBindingViewModel(defaults) {
    return ensureViewModel(this, defaults);
  };

  Control.prototype.bindDataToView = function bindDataToViewWrapper(bindings, options) {
    return bindDataToView(this, bindings, options);
  };

  Control.prototype.bindViewToAttributes = function bindViewToAttributes(attributeMap = {}, options = {}) {
    const viewModel = ensureViewModel(this, options.viewDefaults);
    if (!viewModel || typeof viewModel.on !== "function") return;

    Object.entries(attributeMap).forEach(([propName, config]) => {
      if (!config) return;
      const actions = Array.isArray(config) ? config : [config];
      const validActions = actions.filter(Boolean);
      if (!validActions.length) return;

      const applyAll = (value) => {
        validActions.forEach((action) => applyAction(this, propName, value, action));
      };

      const initialValue = typeof viewModel.get === "function" ? viewModel.get(propName) : viewModel[propName];
      applyAll(initialValue);

      const handler = (evt) => {
        if (!evt || evt.name !== propName) return;
        applyAll(evt.value);
      };
      viewModel.on("change", handler);
      trackWatcher(this, viewModel, handler);
    });
  };

  Control.prototype.applyBindingDefaults = function applyBindingDefaults(config = {}) {
    if (config.dataToView) {
      this.bindDataToView(config.dataToView, { viewDefaults: config.viewDefaults, dataDefaults: config.dataDefaults });
    }
    if (config.viewAttributeBindings) {
      this.bindViewToAttributes(config.viewAttributeBindings, { viewDefaults: config.viewDefaults });
    }
  };

  const originalDestroy = Control.prototype.destroy;
  Control.prototype.destroy = function bindingPluginDestroy(...args) {
    cleanupWatchers(this);
    if (typeof originalDestroy === "function") {
      return originalDestroy.apply(this, args);
    }
    return undefined;
  };

  jsgui.bindingToolkit = {
    normalizeValue: normalizeBindingValue,
    ensureViewModel: (control, defaults) => ensureViewModel(control, defaults),
    ensureDataModel: (control, defaults) => ensureDataModel(control, defaults)
  };

  jsgui[INSTALL_FLAG] = true;
  return jsgui.bindingToolkit;
}

module.exports = {
  installBindingPlugin
};
