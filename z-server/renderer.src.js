"use strict";

/**
 * Z-Server Manager - Renderer Process
 * Uses jsgui3-client for UI components with Industrial Luxury Obsidian theme
 */

// FIX: Define page_context globally to prevent ReferenceError in jsgui3-client
if (typeof window !== 'undefined') {
    window.page_context = null;
}

console.log("[Z-Server] Renderer starting...");

let jsgui, createZServerControls;
try {
  jsgui = require("jsgui3-client");
  console.log("[Z-Server] jsgui3-client loaded:", Object.keys(jsgui).slice(0, 10));
  createZServerControls = require("./ui/controls/zServerControlsFactory").createZServerControls;
  console.log("[Z-Server] Controls factory loaded");
} catch (err) {
  console.error("[Z-Server] Failed to load modules:", err.message);
  console.error("[Z-Server] Stack:", err.stack);
}

// Initialize jsgui3 controls
let ZServerAppControl;
try {
  const controls = createZServerControls(jsgui);
  ZServerAppControl = controls.ZServerAppControl;
  console.log("[Z-Server] ZServerAppControl created");
} catch (err) {
  console.error("[Z-Server] Failed to create controls:", err.message);
  console.error("[Z-Server] Stack:", err.stack);
}

// Wait for DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[Z-Server] DOMContentLoaded fired");
  
  // Create jsgui client context
  let context;
  try {
    context = new jsgui.Client_Page_Context();
    console.log("[Z-Server] Context created");
  } catch (err) {
    console.error("[Z-Server] Failed to create context:", err.message);
    console.error("[Z-Server] Stack:", err.stack);
    return;
  }
  
  // Create root app control
  let app;
  try {
    app = new ZServerAppControl({
      context,
      api: window.electronAPI
    });
    console.log("[Z-Server] App control created");
  } catch (err) {
    console.error("[Z-Server] Failed to create app:", err);
    return;
  }
  
  // Render to DOM
  const rootEl = document.getElementById("app-root");
  if (rootEl) {
    try {
      const html = app.all_html_render();
      console.log("[Z-Server] Rendered HTML length:", html.length);
      rootEl.innerHTML = html;
      
      // CRITICAL: Register all controls in context before activation
      // This adds all controls to context.map_controls keyed by jsgui_id
      app.register_this_and_subcontrols();
      console.log("[Z-Server] All controls registered in context, map_controls size:", Object.keys(context.map_controls).length);
      
      // Find the app's DOM element and assign it
      const appEl = rootEl.querySelector('[data-jsgui-id="' + app._id() + '"]');
      if (appEl) {
        app.dom.el = appEl;
        console.log("[Z-Server] App DOM element linked, id:", app._id());
        
        // Use jsgui3's method to recursively link all child controls to their DOM elements
        // This populates context.map_els and sets each control's dom.el
        app.rec_desc_ensure_ctrl_el_refs(appEl);
        console.log("[Z-Server] Child controls linked to DOM, map_els size:", Object.keys(context.map_els).length);
      } else {
        console.warn("[Z-Server] Could not find app element with id:", app._id());
      }
      
      // Now activate controls (bind event handlers) - DOM refs are now valid
      app.activate();
      console.log("[Z-Server] App activated");
      
      // Initialize (fetch servers)
      await app.init();
      console.log("[Z-Server] App initialized");
    } catch (err) {
      console.error("[Z-Server] Failed during render/activate:", err);
      console.error("[Z-Server] Stack:", err.stack);
    }
  } else {
    console.error("App root element not found");
  }
});
