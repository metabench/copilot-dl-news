"use strict";

/**
 * @server Design Studio
 * @description A jsgui3 + Express web app to view design assets (SVGs) with a 2-column layout.
 * @ui true
 * @port 4900
 */

/**
 * Design Studio Server
 * 
 * A jsgui3 + Express web app to view design assets
 * with a 2-column layout: navigation on left, asset viewer on right.
 * 
 * Theme: "Luxury White Leather, Industrial Obsidian Features"
 * - White/cream leather backgrounds (#FAFAFA, #F5F5F0)
 * - Obsidian black accents (#1A1A1A, #2D2D2D)
 * - Gold highlights (#C9A227, #DAA520)
 * 
 * Usage:
 *   node src/ui/server/designStudio/server.js [--port 4900] [--design ./design] [--detached]
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const jsgui = require("jsgui3-html");
const { Command } = require("commander");

const { DesignAppControl } = require("./isomorphic/controls");
const { buildFileTree } = require("../shared/utils/fileTree");
const { renderSvgContent } = require("../shared/utils/svgRenderer");

const DEFAULT_PORT = 4900;
const DEFAULT_DESIGN_PATH = path.join(__dirname, "../../../../design");
const PID_FILE = path.join(__dirname, ".design-studio.pid");

/**
 * Create CLI program with Commander
 */
function createProgram() {
  const program = new Command();
  
  program
    .name("design-studio")
    .description("Design Studio server with 2-column layout for viewing design assets")
    .version("1.0.0")
    .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
    .option("-d, --design <path>", "Path to design directory", DEFAULT_DESIGN_PATH)
    .option("--detached", "Run server as a detached background process")
    .option("--stop", "Stop a running detached server")
    .option("--status", "Check if a detached server is running");
  
  return program;
}

/**
 * Parse command line arguments using Commander
 */
function parseArgs(argv = process.argv) {
  const program = createProgram();
  program.parse(argv);
  const opts = program.opts();
  
  return {
    port: Number(opts.port) || DEFAULT_PORT,
    designPath: opts.design || DEFAULT_DESIGN_PATH,
    detached: !!opts.detached,
    stop: !!opts.stop,
    status: !!opts.status
  };
}

/**
 * Spawn server as detached background process
 */
function spawnDetached(args) {
  const scriptPath = __filename;
  const childArgs = [
    scriptPath,
    "--port", String(args.port),
    "--design", args.designPath
  ];
  
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: { ...process.env, DESIGN_STUDIO_DETACHED: "1" }
  });
  
  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");
  child.unref();
  
  console.log(`🎨 Design Studio started in background (PID: ${child.pid})`);
  console.log(`   URL: http://localhost:${args.port}`);
  console.log(`   Design: ${path.resolve(args.designPath)}`);
  console.log(`   Stop with: node ${path.relative(process.cwd(), scriptPath)} --stop`);
}

/**
 * Stop a running detached server
 */
function stopDetached() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("No detached server found (no PID file)");
    return false;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  
  try {
    process.kill(pid, 0);
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    console.log(`🎨 Design Studio stopped (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      fs.unlinkSync(PID_FILE);
      console.log("Server was not running (stale PID file removed)");
      return false;
    }
    throw err;
  }
}

/**
 * Check status of detached server
 */
function checkStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log("🎨 Design Studio: not running (no PID file)");
    return false;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  
  try {
    process.kill(pid, 0);
    console.log(`🎨 Design Studio: running (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log("🎨 Design Studio: not running (stale PID file)");
      return false;
    }
    throw err;
  }
}

/**
 * Build a tree of design assets from a directory
 * Only include SVG, PNG, and other design file types
 */
function buildDesignTree(designPath) {
  // Use the shared file tree builder with design-focused extensions
  const extensions = [".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"];
  return buildFileTree(designPath, {
    extensions,
    includeHidden: false
  });
}

/**
 * Create the Design Studio Express app
 */
function createDesignStudioServer(options = {}) {
  const designPath = path.resolve(options.designPath || DEFAULT_DESIGN_PATH);
  
  if (!fs.existsSync(designPath)) {
    throw new Error(`Design directory not found: ${designPath}`);
  }

  const app = express();

  // Serve static assets (CSS, JS, etc.)
  const publicDir = path.join(__dirname, "public");
  if (fs.existsSync(publicDir)) {
    app.use("/assets", express.static(publicDir));
  }

  // Also serve design files directly (for download/raw access)
  app.use("/design-files", express.static(designPath));

  // Handle favicon requests (suppress 404)
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  // Build asset tree on startup
  let assetTree = buildDesignTree(designPath);

  // Main page route - renders the design studio app
  app.get("/", (req, res) => {
    try {
      const selectedPath = req.query.asset || null;

      const context = new jsgui.Page_Context();
      
      // Load asset content with context so SVGs can render via jsgui3
      const assetContent = selectedPath 
        ? loadAssetContent(designPath, selectedPath, context)
        : null;

      const designApp = new DesignAppControl({
        context,
        assetTree,
        selectedPath,
        assetContent
      });

      const html = renderPage(designApp, { 
        title: assetContent?.title || "Design Studio"
      });
      res.type("html").send(html);
    } catch (err) {
      console.error("Design Studio error:", err);
      res.status(500).type("text/plain").send("Error rendering page");
    }
  });

  // API endpoint to get asset content
  app.get("/api/asset", (req, res) => {
    const assetPath = req.query.path;
    if (!assetPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }
    
    const content = loadAssetContent(designPath, assetPath);
    if (!content) {
      return res.status(404).json({ error: "Asset not found" });
    }
    
    res.json(content);
  });

  // API endpoint to refresh asset tree
  app.post("/api/refresh", (req, res) => {
    assetTree = buildDesignTree(designPath);
    res.json({ ok: true, count: countAssets(assetTree) });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error("Design Studio error:", err);
    res.status(500).type("text/plain").send("Internal server error");
  });

  return { app, designPath };
}

/**
 * Load and render a design asset (SVG, etc.)
 */
function loadAssetContent(designPath, relativePath, context = null) {
  try {
    // Sanitize path to prevent directory traversal
    const safePath = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
    const fullPath = path.join(designPath, safePath);
    
    // Ensure path is within design directory
    if (!fullPath.startsWith(designPath)) {
      return null;
    }
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const ext = path.extname(relativePath).toLowerCase();
    const content = fs.readFileSync(fullPath, "utf-8");
    
    // Handle SVG files
    if (ext === ".svg") {
      const title = path.basename(relativePath, ".svg");
      
      // If context provided, render via jsgui3 controls
      if (context) {
        const svgControl = renderSvgContent(context, content, relativePath);
        return { path: relativePath, title, html: null, svgControl };
      }
      
      // Fallback: raw HTML
      const html = `<div class="design-svg-container">
        <div class="design-svg-wrapper">${content}</div>
        <p class="design-svg-filename"><code>${escapeHtml(relativePath)}</code></p>
      </div>`;
      return { path: relativePath, title, html };
    }
    
    // Handle image files (PNG, JPG, etc.)
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      const title = path.basename(relativePath, ext);
      const html = `<div class="design-image-container">
        <img src="/design-files/${escapeHtml(safePath)}" alt="${escapeHtml(title)}" class="design-image" />
        <p class="design-image-filename"><code>${escapeHtml(relativePath)}</code></p>
      </div>`;
      return { path: relativePath, title, html };
    }
    
    return null;
  } catch (err) {
    console.error(`Error loading asset: ${relativePath}`, err.message);
    return null;
  }
}

/**
 * Count total assets in tree
 */
function countAssets(tree) {
  let count = 0;
  function walk(nodes) {
    for (const node of nodes) {
      if (node.type === "file") count++;
      if (node.children) walk(node.children);
    }
  }
  walk(tree);
  return count;
}

/**
 * Render a full HTML page with the jsgui3 control
 */
function renderPage(control, options = {}) {
  const title = options.title || "Design Studio";
  const html = control.all_html_render();
  
  // Check if jsgui3 client bundle exists
  const clientBundlePath = path.join(__dirname, "public", "design-studio-client.js");
  const hasClientBundle = fs.existsSync(clientBundlePath);
  
  const clientBundleScript = hasClientBundle 
    ? '<!-- jsgui3 client bundle for control activation -->\n  <script src="/assets/design-studio-client.js"></script>'
    : '<!-- jsgui3 client bundle not built - run: npm run ui:design:build -->';
  
  // Inline script to restore split layout width BEFORE render to prevent flickering
  const preloadScript = `<script>
(function() {
  // Restore split layout width from localStorage before first paint
  // This prevents flickering when navigating between pages
  var storageKey = 'design-studio-nav-width';
  var minWidth = 180;
  var maxWidth = 500;
  var defaultWidth = 260;
  
  try {
    var saved = localStorage.getItem(storageKey);
    if (saved) {
      var width = parseInt(saved, 10);
      if (width >= minWidth && width <= maxWidth) {
        // Create a style element to set the width before render
        var style = document.createElement('style');
        style.id = 'split-layout-preload';
        style.textContent = '[data-panel="left"] { width: ' + width + 'px !important; }';
        document.head.appendChild(style);
      }
    }
  } catch (e) {
    // localStorage may be disabled
  }
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${preloadScript}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/design-studio.css">
</head>
<body>
  ${html}
  ${clientBundleScript}
  <script src="/assets/design-studio.js"></script>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Run server if this is the main module
if (require.main === module) {
  const args = parseArgs();
  
  // Handle --stop command
  if (args.stop) {
    stopDetached();
    process.exit(0);
  }
  
  // Handle --status command
  if (args.status) {
    checkStatus();
    process.exit(0);
  }
  
  // Handle --detached flag (spawn background process and exit)
  if (args.detached) {
    spawnDetached(args);
    process.exit(0);
  }
  
  // Normal foreground server
  const { app, designPath } = createDesignStudioServer({ designPath: args.designPath });
  
  app.listen(args.port, () => {
    console.log(`🎨 Design Studio running at http://localhost:${args.port}`);
    console.log(`   Serving designs from: ${designPath}`);
  });
}

module.exports = {
  createDesignStudioServer,
  parseArgs,
  createProgram,
  spawnDetached,
  stopDetached,
  checkStatus,
  DEFAULT_PORT,
  DEFAULT_DESIGN_PATH
};
