"use strict";

/**
 * Documentation Viewer Client Bundle
 * 
 * Client-side entry point for jsgui3 activation and control hydration.
 * This file is bundled by esbuild and served to the browser.
 * 
 * Architecture:
 * 1. jsgui3-client sets up the base framework and activation system
 * 2. On window.load, jsgui.activate() is called automatically
 * 3. We hook into pre_activate to register our custom controls
 * 4. Custom controls are activated when elements with data-jsgui-control are found
 * 
 * All controls are imported from isomorphic/controls/ - they work on both
 * server and client using the same code.
 */

// jsgui3-client from npm (v0.0.121+ has browser compatibility fixes)
const jsguiClient = require("jsgui3-client");

// Import ALL controls from isomorphic directory
// These controls work on both server and client
const {
  ResizableSplitLayoutControl,
  DocAppControl,
  DocNavControl,
  DocViewerControl,
  ContextMenuControl,
  ColumnContextMenuControl,
  ColumnHeaderControl,
  DocsThemeToggleControl,
  DocsNavToggleControl,
  DocsSearchControl,
  DocsFileFilterControl
} = require("../isomorphic/controls");

// Control type map for lookup by data-jsgui-control attribute value
const CONTROL_TYPES = {
  "resizable_split_layout": ResizableSplitLayoutControl,
  "context_menu": ContextMenuControl,
  "column_context_menu": ColumnContextMenuControl,
  "column_header": ColumnHeaderControl,
  "docs_theme_toggle": DocsThemeToggleControl,
  "docs_nav_toggle": DocsNavToggleControl,
  "docs_search": DocsSearchControl,
  "docs_file_filter": DocsFileFilterControl
};

/**
 * Register docs viewer controls with jsgui
 */
function registerDocsViewerControls(jsgui) {
  if (!jsgui) return;
  
  const controls = jsgui.controls = jsgui.controls || {};
  
  // Register each control type
  controls.DocsThemeToggle = DocsThemeToggleControl;
  controls.DocsNavToggle = DocsNavToggleControl;
  controls.DocsSearch = DocsSearchControl;
  controls.DocsFileFilter = DocsFileFilterControl;
  controls.ContextMenu = ContextMenuControl;
  controls.ColumnContextMenu = ColumnContextMenuControl;
  controls.ColumnHeader = ColumnHeaderControl;
  controls.ResizableSplitLayout = ResizableSplitLayoutControl;
  
  // Also register with map_Controls for activation lookup
  const mapControls = jsgui.map_Controls = jsgui.map_Controls || {};
  Object.entries(CONTROL_TYPES).forEach(([type, ControlClass]) => {
    mapControls[type] = ControlClass;
  });
  
  console.log("[docs-viewer] Registered client controls:", Object.keys(CONTROL_TYPES));
}

/**
 * Find and activate all elements with data-jsgui-control attribute
 */
function activateMarkedControls(context) {
  if (typeof document === "undefined") return;
  
  const elements = document.querySelectorAll("[data-jsgui-control]");
  console.log("[docs-viewer] Found", elements.length, "elements with data-jsgui-control");
  
  elements.forEach(el => {
    const controlType = el.getAttribute("data-jsgui-control");
    const ControlClass = CONTROL_TYPES[controlType];
    
    if (!ControlClass) {
      console.warn("[docs-viewer] Unknown control type:", controlType);
      return;
    }
    
    // Create control instance with existing DOM element
    const control = new ControlClass({
      context: context,
      el: el
    });
    
    // Store reference on element for debugging
    el.__jsgui_control = control;
    
    // Activate the control (binds events)
    if (typeof control.activate === "function") {
      control.activate();
    }
    
    // Register with context
    if (context && typeof context.register_control === "function") {
      context.register_control(control);
    }
  });
}

/**
 * Hook into jsgui activation lifecycle
 */
function setupActivationHooks(jsgui) {
  // Store original pre_activate
  const originalPreActivate = jsgui.pre_activate;
  
  jsgui.pre_activate = function(context) {
    // Register our controls in the context
    if (context && context.map_Controls) {
      Object.entries(CONTROL_TYPES).forEach(([type, ControlClass]) => {
        context.map_Controls[type] = ControlClass;
      });
    }
    
    // Call original
    if (typeof originalPreActivate === "function") {
      originalPreActivate.call(this, context);
    }
  };
  
  // Hook into the activate event to find and activate our controls
  if (typeof jsgui.on === "function") {
    jsgui.on("activate", (e) => {
      const context = e?.context;
      if (context) {
        activateMarkedControls(context);
      }
    });
  }
}

/**
 * Manual activation for when jsgui3-client's window.load has already fired
 */
function manualActivation() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  
  // Create a page context if jsgui hasn't done so
  let context = jsguiClient.context;
  
  if (!context && jsguiClient.Client_Page_Context) {
    context = new jsguiClient.Client_Page_Context({
      document: document
    });
    jsguiClient.context = context;
  }
  
  if (context) {
    activateMarkedControls(context);
  }
}

/**
 * Bootstrap the docs viewer client
 */
function bootstrap() {
  if (typeof window === "undefined") {
    return;
  }
  
  // Register controls
  registerDocsViewerControls(jsguiClient);
  
  // Setup activation hooks
  setupActivationHooks(jsguiClient);
  
  // Expose jsgui globally for debugging
  window.jsgui = jsguiClient;
  window.DocsViewer = {
    controls: CONTROL_TYPES,
    activateMarkedControls,
    manualActivation
  };
  
  // Ensure controls are activated after DOM is ready
  const activateAll = () => {
    console.log("[docs-viewer] Activating all marked controls...");
    
    // Create context if needed
    let context = jsguiClient.context;
    if (!context && jsguiClient.Client_Page_Context) {
      context = new jsguiClient.Client_Page_Context({
        document: document
      });
      jsguiClient.context = context;
    }
    
    if (context) {
      activateMarkedControls(context);
    } else {
      console.warn("[docs-viewer] No context available for activation");
    }
  };
  
  // Run activation on DOMContentLoaded or immediately if already loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(activateAll, 10);
    });
  } else {
    // DOM already loaded - activate after a short delay
    setTimeout(activateAll, 10);
  }
  
  // Also try on window load as a fallback
  window.addEventListener("load", () => {
    setTimeout(activateAll, 50);
  });
  
  console.log("[docs-viewer] Client bootstrap complete");
}

// Run bootstrap
bootstrap();

module.exports = jsguiClient;
