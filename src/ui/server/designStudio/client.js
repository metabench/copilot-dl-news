"use strict";

/**
 * Design Studio Client Bundle Entry Point
 * 
 * This file is bundled with esbuild to create the client-side JavaScript
 * that hydrates the server-rendered jsgui3 controls.
 * 
 * Architecture (follows Docs Viewer pattern):
 * 1. Define CONTROL_TYPES map linking data-jsgui-control values to classes
 * 2. activateMarkedControls() finds all marked elements and activates them
 * 3. Bootstrap hooks into DOMContentLoaded + window.load for reliability
 * 
 * Build with: npm run ui:design:build
 */

// jsgui3-client expects a global `page_context` when running under strict mode.
if (typeof window !== "undefined" && typeof window.page_context === "undefined") {
  window.page_context = null;
}

const jsgui = require("jsgui3-client");

// Import controls for registration
const { DesignAppControl } = require("./isomorphic/controls/DesignAppControl");
const { DesignNavControl } = require("./isomorphic/controls/DesignNavControl");
const { DesignViewerControl } = require("./isomorphic/controls/DesignViewerControl");
const { ResizableSplitLayoutControl } = require("../../../shared/isomorphic/controls");

// Control type map for lookup by data-jsgui-control attribute value
const CONTROL_TYPES = {
  "resizable_split_layout": ResizableSplitLayoutControl,
  "design_nav": DesignNavControl,
  "design_viewer": DesignViewerControl,
  "design_theme_toggle": null, // Handled by vanilla JS in design-studio.js
  "design_nav_toggle": null,   // Handled by vanilla JS in design-studio.js
  "design_search": null        // Search input - no client control needed
};

/**
 * Ensure we have a jsgui context for control instantiation
 */
function ensureContext() {
  if (typeof document === "undefined") return null;
  
  if (jsgui.context) return jsgui.context;
  
  if (typeof jsgui.Client_Page_Context !== "function") {
    console.warn("[Design Studio] Missing Client_Page_Context");
    return null;
  }
  
  const context = new jsgui.Client_Page_Context({ document });
  jsgui.context = context;
  window.page_context = context;
  return context;
}

/**
 * Find and activate all elements with data-jsgui-control attribute
 */
function activateMarkedControls(context) {
  if (typeof document === "undefined") return;
  
  const elements = document.querySelectorAll("[data-jsgui-control]");
  console.log("[Design Studio] Found", elements.length, "elements with data-jsgui-control");
  
  elements.forEach(el => {
    // Skip if already activated
    if (el.__jsgui_control) return;
    
    const controlType = el.getAttribute("data-jsgui-control");
    const ControlClass = CONTROL_TYPES[controlType];
    
    // Skip null entries (vanilla JS handlers) or unknown types
    if (!ControlClass) {
      if (!(controlType in CONTROL_TYPES)) {
        console.warn("[Design Studio] Unknown control type:", controlType);
      }
      return;
    }
    
    // Create control instance with existing DOM element
    const control = new ControlClass({
      context: context,
      el: el
    });
    
    // Link control to DOM element
    control.dom = control.dom || {};
    control.dom.el = el;
    
    // Store reference on element for debugging
    el.__jsgui_control = control;
    
    // Activate the control (binds events)
    if (typeof control.activate === "function") {
      control.activate();
      console.log("[Design Studio] Activated:", controlType);
    }
  });
}

/**
 * Bootstrap the Design Studio client
 */
function bootstrap() {
  if (typeof window === "undefined") return;
  
  // Make jsgui available globally
  window.jsgui3 = jsgui;
  window.jsgui = jsgui;
  
  // Expose for debugging
  window.DesignStudio = {
    controls: CONTROL_TYPES,
    activateMarkedControls,
    ensureContext
  };
  
  const activateAll = () => {
    const context = ensureContext();
    if (context) {
      activateMarkedControls(context);
    } else {
      console.warn("[Design Studio] No context available for activation");
    }
  };
  
  // Run activation on DOMContentLoaded or immediately if already loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(activateAll, 10));
  } else {
    setTimeout(activateAll, 10);
  }
  
  // Also try on window load as a fallback
  window.addEventListener("load", () => setTimeout(activateAll, 50));
  
  console.log("[Design Studio] Client bootstrap complete");
}

// Run bootstrap
bootstrap();
