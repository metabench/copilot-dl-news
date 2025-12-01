"use strict";

/**
 * @server Docs Viewer
 * @description A jsgui3 + Express web app to view markdown documentation with a 2-column layout.
 */

/**
 * Documentation Viewer Server
 * 
 * A jsgui3 + Express web app to view markdown documentation
 * with a 2-column layout: navigation on left, content on right.
 * 
 * Usage:
 *   node src/ui/server/docsViewer/server.js [--port 4700] [--docs ./docs] [--detached]
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const jsgui = require("jsgui3-html");
const { Command } = require("commander");

const { DocAppControl } = require("./isomorphic/controls");
const { buildDocTree, sortTree, findNodeByPath } = require("./utils/docTree");
const { renderMarkdown } = require("./utils/markdownRenderer");
const { renderSvgContent } = require("./utils/svgRenderer");

const DEFAULT_PORT = 4700;
const DEFAULT_DOCS_PATH = path.join(__dirname, "../../../../docs");
const PID_FILE = path.join(__dirname, ".docs-viewer.pid");

/**
 * Create CLI program with Commander
 */
function createProgram() {
  const program = new Command();
  
  program
    .name("docs-viewer")
    .description("Documentation viewer server with 2-column layout")
    .version("1.0.0")
    .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
    .option("-d, --docs <path>", "Path to documentation directory", DEFAULT_DOCS_PATH)
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
    docsPath: opts.docs || DEFAULT_DOCS_PATH,
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
    "--docs", args.docsPath
  ];
  
  // Spawn detached process with stdio ignored
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    cwd: process.cwd(),
    env: { ...process.env, DOCS_VIEWER_DETACHED: "1" }
  });
  
  // Write PID to file for later stop command
  fs.writeFileSync(PID_FILE, String(child.pid), "utf-8");
  
  // Unref so parent can exit
  child.unref();
  
  console.log(`📚 Documentation Viewer started in background (PID: ${child.pid})`);
  console.log(`   URL: http://localhost:${args.port}`);
  console.log(`   Docs: ${path.resolve(args.docsPath)}`);
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
    // Check if process exists
    process.kill(pid, 0);
    // Kill the process
    process.kill(pid, "SIGTERM");
    fs.unlinkSync(PID_FILE);
    console.log(`📚 Documentation Viewer stopped (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      // Process doesn't exist
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
    console.log("📚 Documentation Viewer: not running (no PID file)");
    return false;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  
  try {
    // Check if process exists (signal 0 doesn't kill, just checks)
    process.kill(pid, 0);
    console.log(`📚 Documentation Viewer: running (PID: ${pid})`);
    return true;
  } catch (err) {
    if (err.code === "ESRCH") {
      console.log("📚 Documentation Viewer: not running (stale PID file)");
      return false;
    }
    throw err;
  }
}

/**
 * Create the documentation viewer Express app
 */
function createDocsViewerServer(options = {}) {
  const docsPath = path.resolve(options.docsPath || DEFAULT_DOCS_PATH);
  
  if (!fs.existsSync(docsPath)) {
    throw new Error(`Documentation directory not found: ${docsPath}`);
  }

  const app = express();

  // Serve static assets
  const publicDir = path.join(__dirname, "public");
  if (fs.existsSync(publicDir)) {
    app.use("/assets", express.static(publicDir));
  }

  // Favicon handler (suppress 404 errors)
  app.get("/favicon.ico", (req, res) => res.status(204).end());

  // Build documentation tree on startup
  let docTree = buildDocTree(docsPath);
  console.log(`📚 Doc tree built: ${countDocs(docTree)} files`);

  // Main page route - renders the doc viewer app
  app.get("/", (req, res) => {
    const startTime = Date.now();
    try {
      const selectedPath = req.query.doc || null;
      
      // Parse filter state from URL params (default: both visible)
      // ?show_md=0 means hide .md files, ?show_svg=0 means hide .svg files
      const filters = {
        md: req.query.show_md !== "0",
        svg: req.query.show_svg !== "0"
      };
      
      // Parse column visibility from URL params
      // ?col_mtime=1 means show the Last Modified column
      const columns = {
        mtime: req.query.col_mtime === "1"
      };
      
      // Parse sorting from URL params
      // ?sort_by=mtime&sort_order=desc
      const sortBy = req.query.sort_by || 'name';
      const sortOrder = req.query.sort_order || 'asc';
      
      // Clone and sort the tree based on params
      const sortedTree = sortTree(JSON.parse(JSON.stringify(docTree)), sortBy, sortOrder);

      const context = new jsgui.Page_Context();
      
      // Load doc content with context so SVGs can render via jsgui3
      const docContent = selectedPath 
        ? loadDocContent(docsPath, selectedPath, context)
        : null;

      const docApp = new DocAppControl({
        context,
        docTree: sortedTree,
        selectedPath,
        docContent,
        filters,
        columns,
        sortBy,
        sortOrder
      });

      const html = renderPage(docApp, { 
        title: docContent?.title || "Documentation Viewer",
        filters,
        columns,
        sortBy,
        sortOrder
      });
      
      const renderTime = Date.now() - startTime;
      if (renderTime > 100) {
        console.log(`📚 Page rendered in ${renderTime}ms (doc: ${selectedPath || 'none'})`);
      }
      
      res.type("html").send(html);
    } catch (err) {
      console.error("Docs viewer error:", err);
      res.status(500).type("text/plain").send("Error rendering page");
    }
  });

  // API endpoint to get document content
  // This endpoint is used by the client-side SPA navigation for instant doc loading
  app.get("/api/doc", (req, res) => {
    const docPath = req.query.path;
    if (!docPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }
    
    // Create a jsgui context so SVGs render via the isomorphic control system
    // This ensures SVGs look identical whether loaded via full page or SPA navigation
    const context = new jsgui.Page_Context();
    const content = loadDocContent(docsPath, docPath, context);
    if (!content) {
      return res.status(404).json({ error: "Document not found" });
    }
    
    // If SVG was rendered via jsgui3 controls, serialize it to HTML
    if (content.svgControl) {
      content.html = content.svgControl.all_html_render();
      content.isSvg = true;
      delete content.svgControl; // Don't send the control object
    }
    
    res.json(content);
  });

  // API endpoint to get folder children (for lazy loading)
  // Returns HTML for folder contents to insert into the tree
  app.get("/api/folder", (req, res) => {
    const folderPath = req.query.path;
    if (!folderPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }
    
    // Find folder in tree
    const folder = findNodeByPath(docTree, folderPath);
    if (!folder || folder.type !== "folder") {
      return res.status(404).json({ error: "Folder not found" });
    }
    
    // Parse current filter/sort state
    const filters = {
      md: req.query.show_md !== "0",
      svg: req.query.show_svg !== "0"
    };
    const columns = {
      mtime: req.query.col_mtime === "1"
    };
    const sortBy = req.query.sort_by || 'name';
    const sortOrder = req.query.sort_order || 'asc';
    
    // Sort children
    const sortedChildren = sortTree(JSON.parse(JSON.stringify(folder.children || [])), sortBy, sortOrder);
    
    // Render children HTML
    const context = new jsgui.Page_Context();
    const { DocNavControl } = require("./isomorphic/controls");
    
    // Create a temporary nav control to render just the children
    const tempNav = new DocNavControl({
      context,
      docTree: sortedChildren,
      selectedPath: req.query.doc || null,
      basePath: "/",
      filters,
      columns,
      sortBy,
      sortOrder
    });
    
    // Get just the tree list HTML
    const treeContainer = tempNav._buildTreeList(sortedChildren, 1); // depth 1 since we're inside a folder
    const html = treeContainer.all_html_render();
    
    res.json({ 
      path: folderPath,
      html,
      childCount: sortedChildren.length
    });
  });

  // API endpoint to refresh doc tree
  app.post("/api/refresh", (req, res) => {
    docTree = buildDocTree(docsPath);
    res.json({ ok: true, count: countDocs(docTree) });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error("Docs viewer error:", err);
    res.status(500).type("text/plain").send("Internal server error");
  });

  return { app, docsPath };
}

/**
 * Load and render a document (markdown or SVG)
 * @param {string} docsPath - Base docs directory
 * @param {string} relativePath - Relative path to document
 * @param {Object} context - Optional jsgui context for SVG rendering
 * @returns {Object|null} - { path, title, html, svgControl? }
 */
function loadDocContent(docsPath, relativePath, context = null) {
  try {
    // Sanitize path to prevent directory traversal
    const safePath = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
    const fullPath = path.join(docsPath, safePath);
    
    // Ensure path is within docs directory
    if (!fullPath.startsWith(docsPath)) {
      return null;
    }
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const ext = path.extname(relativePath).toLowerCase();
    const content = fs.readFileSync(fullPath, "utf-8");
    
    // Handle different file types
    if (ext === ".svg") {
      const title = path.basename(relativePath, ".svg");
      
      // If context provided, render via jsgui3 controls
      if (context) {
        const svgControl = renderSvgContent(context, content, relativePath);
        return { path: relativePath, title, html: null, svgControl };
      }
      
      // Fallback: raw HTML (shouldn't be used normally)
      const html = `<div class="doc-svg-container">
        <div class="doc-svg-wrapper">${content}</div>
        <p class="doc-svg-filename"><code>${escapeHtml(relativePath)}</code></p>
      </div>`;
      return { path: relativePath, title, html };
    }
    
    // Default: treat as markdown
    const rendered = renderMarkdown(content);
    return {
      path: relativePath,
      title: rendered.title || path.basename(relativePath, ".md"),
      html: rendered.html
    };
  } catch (err) {
    console.error(`Error loading doc: ${relativePath}`, err.message);
    return null;
  }
}

/**
 * Count total documents in tree
 */
function countDocs(tree) {
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
  const title = options.title || "Documentation Viewer";
  const filters = options.filters || { md: true, svg: true };
  const columns = options.columns || { mtime: false };
  const sortBy = options.sortBy || 'name';
  const sortOrder = options.sortOrder || 'asc';
  const html = control.all_html_render();
  
  // Check if jsgui3 client bundle exists
  const clientBundlePath = path.join(__dirname, "public", "docs-viewer-client.js");
  const hasClientBundle = fs.existsSync(clientBundlePath);
  
  const clientBundleScript = hasClientBundle 
    ? '<!-- jsgui3 client bundle for control activation -->\n  <script src="/assets/docs-viewer-client.js"></script>'
    : '<!-- jsgui3 client bundle not built - run: npm run ui:docs:build -->';
  
  // Embed state for client-side hydration
  const stateScript = `<script>
    window.__DOCS_FILTERS__ = ${JSON.stringify(filters)};
    window.__DOCS_COLUMNS__ = ${JSON.stringify(columns)};
    window.__DOCS_SORT__ = { sortBy: ${JSON.stringify(sortBy)}, sortOrder: ${JSON.stringify(sortOrder)} };
  </script>`;
  
  // Inline script to restore split layout width BEFORE render to prevent flickering
  // This matches the Design Studio pattern for consistent behavior
  const preloadScript = `<script>
(function() {
  // Restore split layout width from localStorage before first paint
  // This prevents flickering when navigating between pages
  var storageKey = 'docs-viewer-nav-width';
  var minWidth = 150;
  var maxWidth = 600;
  var defaultWidth = 280;
  
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
  <link href="https://fonts.googleapis.com/css2?family=Manufacturing+Consent&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/docs-viewer.css">
  ${stateScript}
</head>
<body>
  ${html}
  ${clientBundleScript}
  <!-- Fallback vanilla JS for non-jsgui features -->
  <script src="/assets/docs-viewer.js"></script>
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
  const { app, docsPath } = createDocsViewerServer({ docsPath: args.docsPath });
  
  app.listen(args.port, () => {
    console.log(`📚 Documentation Viewer running at http://localhost:${args.port}`);
    console.log(`   Serving docs from: ${docsPath}`);
  });
}

module.exports = {
  createDocsViewerServer,
  parseArgs,
  createProgram,
  spawnDetached,
  stopDetached,
  checkStatus,
  DEFAULT_PORT,
  DEFAULT_DOCS_PATH
};
