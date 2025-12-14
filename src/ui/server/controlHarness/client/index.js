"use strict";

// jsgui3-client expects a global page_context under strict mode.
if (typeof window !== "undefined" && typeof window.page_context === "undefined") {
  window.page_context = null;
}

const jsgui = require("jsgui3-client");
const { CounterControl } = require("../isomorphic/controls/CounterControl");

function ensureContext() {
  if (typeof document === "undefined") return null;

  if (jsgui.context) return jsgui.context;

  if (typeof jsgui.Client_Page_Context !== "function") {
    console.warn("[Control Harness] Missing Client_Page_Context");
    return null;
  }

  const context = new jsgui.Client_Page_Context({ document });
  jsgui.context = context;
  window.page_context = context;
  return context;
}

function init() {
  const context = ensureContext();
  if (!context) return;

  const rootEl = document.querySelector(".counter-demo");
  if (!rootEl) {
    console.warn("[Control Harness] Missing .counter-demo root element");
    return;
  }

  const ctrl = new CounterControl({ el: rootEl, context });
  ctrl.dom = ctrl.dom || {};
  ctrl.dom.el = rootEl;
  rootEl.__jsgui_control = ctrl;

  ctrl.activate();

  window.__COPILOT_CONTROL_HARNESS_INITIALIZED__ = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
