"use strict";

/**
 * Art Playground Client Entry Point
 * 
 * Activates the server-rendered controls for client-side interactivity.
 * Uses jsgui3-client for browser-side control activation.
 */

// jsgui3-client expects a global `page_context` when running under strict mode.
if (typeof window !== "undefined" && typeof window.page_context === "undefined") {
  window.page_context = null;
}

const jsgui = require("jsgui3-client");

// Import controls - they check for spec.el to skip compose on client
const { ArtPlaygroundAppControl } = require("./isomorphic/controls/ArtPlaygroundAppControl");
const { ToolbarControl } = require("./isomorphic/controls/ToolbarControl");
const { CanvasControl } = require("./isomorphic/controls/CanvasControl");
const { ToolPanelControl } = require("./isomorphic/controls/ToolPanelControl");
const { PropertiesPanelControl } = require("./isomorphic/controls/PropertiesPanelControl");
const { StatusBarControl } = require("./isomorphic/controls/StatusBarControl");

/**
 * Ensure we have a jsgui context for control instantiation
 */
function ensureContext() {
  if (typeof document === "undefined") return null;
  
  if (jsgui.context) return jsgui.context;
  
  if (typeof jsgui.Client_Page_Context !== "function") {
    console.warn("[Art Playground] Missing Client_Page_Context");
    return null;
  }
  
  const context = new jsgui.Client_Page_Context({ document });
  jsgui.context = context;
  window.page_context = context;
  return context;
}

/**
 * Initialize the client - find and activate all controls
 */
function init() {
  console.log("[Art Playground] Initializing client...");
  
  const context = ensureContext();
  if (!context) {
    console.error("[Art Playground] Could not create context");
    return;
  }
  
  // Find the app root element
  const appEl = document.querySelector(".art-app");
  if (!appEl) {
    console.error("[Art Playground] Could not find .art-app element");
    return;
  }
  
  // Create control instance wrapping existing DOM (el: appEl skips compose)
  const app = new ArtPlaygroundAppControl({
    el: appEl,
    context: context
  });
  
  // Link DOM
  app.dom = app.dom || {};
  app.dom.el = appEl;
  appEl.__jsgui_control = app;

  const attachChildControl = (ControlClass, selector, assignKey) => {
    const childEl = appEl.querySelector(selector);
    if (!childEl) return null;
    const ctrl = new ControlClass({ el: childEl, context });
    ctrl.dom = ctrl.dom || {};
    ctrl.dom.el = childEl;
    childEl.__jsgui_control = ctrl;
    app[assignKey] = ctrl;
    return ctrl;
  };
  
  // Find and wrap child controls
  attachChildControl(ToolbarControl, ".art-toolbar", "_toolbar");
  attachChildControl(CanvasControl, ".art-canvas", "_canvas");
  attachChildControl(ToolPanelControl, ".ap-tool-panel", "_toolPanel");
  attachChildControl(PropertiesPanelControl, ".ap-properties-panel", "_propertiesPanel");
  attachChildControl(StatusBarControl, ".ap-status-bar", "_statusBar");
  
  // Activate controls
  if (app._toolbar) app._toolbar.activate();
  if (app._toolPanel) app._toolPanel.activate();
  if (app._propertiesPanel) app._propertiesPanel.activate();
  if (app._statusBar) app._statusBar.activate();

  if (app._canvas) {
    app._canvas.activate();
  }

  // Wire app-level events (tool panel, properties panel, export, etc)
  app.activate();

  // Keyboard shortcuts
  if (!window.__artPlaygroundShortcutsBound) {
    window.__artPlaygroundShortcutsBound = true;
    document.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        app._canvas?.deleteSelected?.();
        app._updatePanels?.();
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        const svg = app._canvas?.exportSvg?.() || "";
        if (svg) app._downloadTextFile?.("art-playground.svg", svg, "image/svg+xml");
      }
    });
  }

  console.log("[Art Playground] Client activated");
}

// Make jsgui available globally for debugging
if (typeof window !== "undefined") {
  window.jsgui3 = jsgui;
  window.jsgui = jsgui;
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
