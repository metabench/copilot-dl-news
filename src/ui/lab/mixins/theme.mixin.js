"use strict";

/**
 * theme_mixin(ctrl, opts?)
 * Adds a theme marker to the control (class + data attribute) and records the mixin in view.data.model.mixins.
 * Designed to be safe on server (no dom.el required).
 */

function ensureMixinStore(ctrl) {
  const view = ctrl.view = ctrl.view || {};
  const data = view.data = view.data || {};
  const model = data.model = data.model || {};
  if (model.mixins) {
    if (Array.isArray(model.mixins)) return model.mixins;
    if (!model.mixins._store) {
      const store = [];
      const originalPush = typeof model.mixins.push === "function" ? model.mixins.push.bind(model.mixins) : null;
      model.mixins._store = store;
      model.mixins.push = function push(v) {
        store.push(v);
        if (originalPush) {
          try { originalPush(v); } catch (e) { /* ignore */ }
        }
      };
      if (typeof model.mixins.each !== "function") {
        model.mixins.each = function each(fn) { store.forEach(fn); };
      }
    }
    return model.mixins;
  }
  const store = [];
  model.mixins = {
    silent: false,
    push(v) { store.push(v); },
    each(fn) { store.forEach(fn); },
    _store: store
  };
  return model.mixins;
}

function addMixinRecord(store, theme) {
  if (!store) return;
  const arr = Array.isArray(store) ? store : store._store;
  const already = arr && arr.some(m => m && m.name === "theme");
  if (already) return;
  const record = { name: "theme", theme };
  if (Array.isArray(store)) store.push(record);
  else if (typeof store.push === "function") store.push(record);
}

function theme_mixin(ctrl, opts = {}) {
  const theme = opts.theme || "dark";
  // class + data attribute (safe without dom.el)
  if (typeof ctrl.add_class === "function") {
    ctrl.add_class(`theme-${theme}`);
  }
  ctrl.dom = ctrl.dom || { attributes: {} };
  ctrl.dom.attributes = ctrl.dom.attributes || {};
  ctrl.dom.attributes["data-theme"] = theme;
  ctrl.theme = theme;

  const mixins = ensureMixinStore(ctrl);
  addMixinRecord(mixins, theme);

  // Convenience setter
  ctrl.set_theme = function set_theme(nextTheme) {
    const t = nextTheme || theme;
    if (typeof this.add_class === "function") {
      // remove old theme class if it exists (naive: strip matching prefix)
      const current = (this.dom?.attributes?.class || "").split(/\s+/).filter(Boolean);
      const filtered = current.filter(c => !c.startsWith("theme-"));
      filtered.push(`theme-${t}`);
      this.dom.attributes.class = filtered.join(" ");
    }
    this.dom = this.dom || { attributes: {} };
    this.dom.attributes["data-theme"] = t;
    this.theme = t;
  };

  return ctrl;
}

module.exports = { theme_mixin };
