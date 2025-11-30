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
const { SelectionHandlesControl } = require("./isomorphic/controls/SelectionHandlesControl");

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
  
  // Find and wrap child controls
  const toolbarEl = appEl.querySelector(".art-toolbar");
  if (toolbarEl) {
    app._toolbar = new ToolbarControl({ el: toolbarEl, context: context });
    app._toolbar.dom = app._toolbar.dom || {};
    app._toolbar.dom.el = toolbarEl;
    toolbarEl.__jsgui_control = app._toolbar;
    
    // Reconnect button references
    app._toolbar._buttons = {
      select: { dom: { el: toolbarEl.querySelector('[data-action="select"]') } },
      pan: { dom: { el: toolbarEl.querySelector('[data-action="pan"]') } },
      addRect: { dom: { el: toolbarEl.querySelector('[data-action="add-rect"]') } },
      addEllipse: { dom: { el: toolbarEl.querySelector('[data-action="add-ellipse"]') } },
      addText: { dom: { el: toolbarEl.querySelector('[data-action="add-text"]') } },
      delete: { dom: { el: toolbarEl.querySelector('[data-action="delete"]') } }
    };
  }
  
  const canvasEl = appEl.querySelector(".art-canvas");
  if (canvasEl) {
    app._canvas = new CanvasControl({ el: canvasEl, context: context });
    app._canvas.dom = app._canvas.dom || {};
    app._canvas.dom.el = canvasEl;
    canvasEl.__jsgui_control = app._canvas;
    
    // Reconnect SVG wrapper
    const svgWrapperEl = canvasEl.querySelector(".art-canvas__svg-wrapper");
    if (svgWrapperEl) {
      app._canvas._svgWrapper = { dom: { el: svgWrapperEl } };
    }
    
    // Reconnect selection handles
    const selectionEl = canvasEl.querySelector(".art-selection");
    if (selectionEl) {
      app._canvas._selectionHandles = new SelectionHandlesControl({ el: selectionEl, context: context });
      app._canvas._selectionHandles.dom = app._canvas._selectionHandles.dom || {};
      app._canvas._selectionHandles.dom.el = selectionEl;
      
      // Reconnect handle elements
      app._canvas._selectionHandles._outline = { dom: { el: selectionEl.querySelector(".art-selection__outline") } };
      app._canvas._selectionHandles._handles = {};
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(pos => {
        const handleEl = selectionEl.querySelector(`[data-handle="${pos}"]`);
        if (handleEl) {
          app._canvas._selectionHandles._handles[pos] = { dom: { el: handleEl } };
        }
      });
    }
  }
  
  // Activate controls in the correct order
  // Don't use super.activate() chains - manually activate each control
  
  // 1. Activate toolbar (sets up button click handlers)
  if (app._toolbar) {
    console.log("[Art Playground] Activating toolbar...");
    // Call our custom activate, not the inherited one
    const toolbarEl = app._toolbar.dom.el;
    Object.entries(app._toolbar._buttons).forEach(([key, btn]) => {
      const btnEl = btn.dom?.el;
      if (!btnEl) return;
      
      const action = btnEl.getAttribute("data-action");
      btnEl.addEventListener("click", () => {
        console.log("[Art Playground] Button clicked:", action);
        app._toolbar._handleAction(action);
      });
    });
  }
  
  // 2. Activate canvas (sets up mouse event handlers)
  if (app._canvas) {
    console.log("[Art Playground] Activating canvas...");
    const canvasEl = app._canvas.dom.el;
    
    // Get SVG element references
    app._canvas._svg = canvasEl.querySelector(".art-canvas__svg");
    app._canvas._componentsGroup = app._canvas._svg?.querySelector(".art-canvas__components");
    
    if (app._canvas._svg) {
      // Setup event listeners
      app._canvas._svg.addEventListener("mousedown", (e) => app._canvas._handleMouseDown(e));
      document.addEventListener("mousemove", (e) => app._canvas._handleMouseMove(e));
      document.addEventListener("mouseup", (e) => app._canvas._handleMouseUp(e));
    }
    
    // Activate selection handles
    if (app._canvas._selectionHandles) {
      const selEl = app._canvas._selectionHandles.dom.el;

      if (selEl) {
        Object.entries(app._canvas._selectionHandles._handles || {}).forEach(([pos, handle]) => {
          const handleEl = handle.dom?.el;
          if (!handleEl) return;

          handleEl.addEventListener("mousedown", (e) => {
            e.stopPropagation();

            // Raise resize-start with normalized payload
            app._canvas._selectionHandles.raise("resize-start", {
              handle: pos,
              mouseX: e.clientX,
              mouseY: e.clientY
            });

            const onMove = (moveEvent) => {
              app._canvas._selectionHandles.raise("resize-move", {
                handle: pos,
                mouseX: moveEvent.clientX,
                mouseY: moveEvent.clientY
              });
            };

            const onUp = () => {
              app._canvas._selectionHandles.raise("resize-end");
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
        });

        // Listen for resize events from selection handles
        app._canvas._selectionHandles.on("resize-start", (data) => app._canvas._startResize(data));
        app._canvas._selectionHandles.on("resize-move", (data) => app._canvas._doResize(data));
        app._canvas._selectionHandles.on("resize-end", () => app._canvas._endResize());
      }
    }
  }
  
  // 3. Wire toolbar to canvas
  console.log("[Art Playground] Wiring toolbar to canvas...");
  if (app._toolbar && app._canvas) {
    app._toolbar.on("tool-change", (toolName) => {
      console.log("[Art Playground] Tool changed to:", toolName);
      app._canvas.setTool(toolName);
    });
    
    app._toolbar.on("add-component", (componentType) => {
      console.log("[Art Playground] Adding component:", componentType);
      app._canvas.addComponent(componentType);
    });
    
    app._toolbar.on("delete", () => {
      console.log("[Art Playground] Deleting selected");
      app._canvas.deleteSelected();
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
