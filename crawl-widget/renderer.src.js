"use strict";

/**
 * Crawl Widget - Renderer Process
 * Compact Winamp-style crawl control with Industrial Luxury Obsidian theme
 */

// Define globals required by jsgui3-client/htmlparser before loading modules
if (typeof window !== "undefined") {
  window.page_context = null;
  
  // htmlparser expects this global namespace
  if (!window.Tautologistics) {
    window.Tautologistics = { NodeHtmlParser: {} };
  }
}

console.log("[CrawlWidget] Renderer starting...");

function showError(message) {
  const rootEl = document.getElementById("app-root");
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="padding: 20px; background: #1a0000; border: 2px solid #ff4444; color: #ff8888; font-family: monospace; margin: 10px; border-radius: 4px;">
        <strong>Error Loading Widget</strong><br><br>
        <pre style="white-space: pre-wrap; word-break: break-all;">${message}</pre>
      </div>
    `;
  }
}

let jsgui, createCrawlWidgetControls;
try {
  jsgui = require("jsgui3-client");
  console.log("[CrawlWidget] jsgui3-client loaded:", Object.keys(jsgui).slice(0, 8));
  createCrawlWidgetControls = require("./ui/crawlWidgetControlsFactory").createCrawlWidgetControls;
  console.log("[CrawlWidget] Controls factory loaded");
} catch (err) {
  console.error("[CrawlWidget] Failed to load modules:", err.message);
  console.error("[CrawlWidget] Stack:", err.stack);
  document.addEventListener("DOMContentLoaded", () => {
    showError(`Module load failed: ${err.message}\n\n${err.stack}`);
  });
}

// Initialize controls
let CrawlWidgetAppControl;
try {
  if (createCrawlWidgetControls && jsgui) {
    const controls = createCrawlWidgetControls(jsgui);
    CrawlWidgetAppControl = controls.CrawlWidgetAppControl;
    console.log("[CrawlWidget] CrawlWidgetAppControl created");
  }
} catch (err) {
  console.error("[CrawlWidget] Failed to create controls:", err.message);
  console.error("[CrawlWidget] Stack:", err.stack);
  document.addEventListener("DOMContentLoaded", () => {
    showError(`Control creation failed: ${err.message}\n\n${err.stack}`);
  });
}

// Wait for DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  console.log("[CrawlWidget] DOMContentLoaded fired");
  
  if (!CrawlWidgetAppControl) {
    console.error("[CrawlWidget] CrawlWidgetAppControl not available");
    return;
  }
  
  // Create jsgui client context
  let context;
  try {
    context = new jsgui.Client_Page_Context();
    console.log("[CrawlWidget] Context created");
  } catch (err) {
    console.error("[CrawlWidget] Failed to create context:", err.message);
    showError(`Context creation failed: ${err.message}\n\n${err.stack}`);
    return;
  }
  
  // Create root app control
  let app;
  try {
    app = new CrawlWidgetAppControl({
      context,
      api: window.crawlAPI
    });
    console.log("[CrawlWidget] App control created");
  } catch (err) {
    console.error("[CrawlWidget] Failed to create app:", err);
    showError(`App control creation failed: ${err.message}\n\n${err.stack}`);
    return;
  }
  
  // Render to DOM
  const rootEl = document.getElementById("app-root");
  if (rootEl) {
    try {
      const html = app.all_html_render();
      console.log("[CrawlWidget] Rendered HTML length:", html.length);
      console.log("[CrawlWidget] First 500 chars:", html.substring(0, 500));
      rootEl.innerHTML = html;
      
      // Register all controls in context
      app.register_this_and_subcontrols();
      console.log("[CrawlWidget] Controls registered, count:", Object.keys(context.map_controls).length);
      
      // Link app's DOM element
      const appEl = rootEl.querySelector('[data-jsgui-id="' + app._id() + '"]');
      if (appEl) {
        app.dom.el = appEl;
        console.log("[CrawlWidget] App DOM linked, id:", app._id());
        
        // Recursively link child controls to DOM
        app.rec_desc_ensure_ctrl_el_refs(appEl);
        console.log("[CrawlWidget] Child controls linked");
      } else {
        console.warn("[CrawlWidget] Could not find app element with id:", app._id());
      }
      
      // Activate controls (bind event handlers)
      // Use activate_this_and_subcontrols to ensure ALL controls get activated
      app.activate_this_and_subcontrols();
      console.log("[CrawlWidget] App and all subcontrols activated");
      
      // Initialize (load crawl types, set up listeners)
      await app.init();
      console.log("[CrawlWidget] App initialized");
    } catch (err) {
      console.error("[CrawlWidget] Failed during render/activate:", err);
      showError(`Render/Activate failed: ${err.message}\n\n${err.stack}`);
    }
  } else {
    console.error("[CrawlWidget] App root element not found");
    showError("App root element not found (#app-root)");
  }
});
