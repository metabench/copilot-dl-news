"use strict";

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
const { buildDocTree, sortTree } = require("./utils/docTree");
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
    .option("-H, --host <address>", "Host to bind to (0.0.0.0 for LAN access)", "localhost")
    .option("-d, --docs <path>", "Path to documentation directory", DEFAULT_DOCS_PATH)
    .option("--detached", "Run server as a detached background process")
    .option("--stop", "Stop a running detached server")
    .option("--status", "Check if a detached server is running")
    .option("--plugins <path>", "Path to plugins directory");

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
    host: opts.host || "localhost",
    docsPath: opts.docs || DEFAULT_DOCS_PATH,
    detached: !!opts.detached,
    stop: !!opts.stop,
    status: !!opts.status,
    pluginsPath: opts.plugins || null
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
    "--host", args.host,
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
  const displayHost = args.host === "0.0.0.0" ? "<your-ip>" : args.host;
  console.log(`   URL: http://${displayHost}:${args.port}`);
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

  // Enable gzip compression for all responses
  try {
    const compression = require("compression");
    app.use(compression());
  } catch (e) {
    console.log("Compression module not available, serving uncompressed");
  }

  // Serve static assets
  const publicDir = path.join(__dirname, "public");
  if (fs.existsSync(publicDir)) {
    app.use("/assets", express.static(publicDir));
  }

  // Plugin System
  const plugins = [];
  if (options.pluginsPath) {
    const absPluginsPath = path.resolve(options.pluginsPath);
    if (fs.existsSync(absPluginsPath)) {
      console.log(`🔌 Loading plugins from: ${absPluginsPath}`);
      const pluginDirs = fs.readdirSync(absPluginsPath, { withFileTypes: true });

      for (const dirent of pluginDirs) {
        if (!dirent.isDirectory()) continue;
        const pluginName = dirent.name;
        const pluginDir = path.join(absPluginsPath, pluginName);

        const plugin = { name: pluginName, clientScript: null };

        // Load Server-side Logic
        const serverEntry = path.join(pluginDir, "server.js");
        if (fs.existsSync(serverEntry)) {
          try {
            const pluginModule = require(serverEntry);
            if (typeof pluginModule.init === 'function') {
              pluginModule.init(app, { docsPath });
              console.log(`   ✓ [${pluginName}] Server logic loaded`);
            }
          } catch (e) {
            console.error(`   ✗ [${pluginName}] Failed to load server.js:`, e.message);
          }
        }

        // Check for Client-side Script
        const clientEntry = path.join(pluginDir, "client.js");
        if (fs.existsSync(clientEntry)) {
          // Serve the client script with no-cache headers
          const publicPath = `/plugins/${pluginName}/client.js`;
          app.get(publicPath, (req, res) => {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(clientEntry);
          });
          plugin.clientScript = publicPath;
          console.log(`   ✓ [${pluginName}] Client script registered`);
        }

        plugins.push(plugin);
      }
    }
  }

  // Build documentation tree on startup
  let docTree = buildDocTree(docsPath);

  // Cache for rendered pages (key: query string, value: html)
  // Cache for rendered pages (key: query string, value: html)
  let pageCache = new Map();
  let cacheEnabled = false; // DISABLED: SVG Editor needs fresh content on every load

  /**
   * Get a shallow copy of the tree (top-level only, folders have empty children)
   * This enables lazy loading - folders will be expanded via API
   */
  function getShallowTree(tree, depth = 1) {
    if (depth <= 0) return [];

    return tree.map(item => {
      if (item.type === 'folder') {
        return {
          ...item,
          children: depth > 1 ? getShallowTree(item.children || [], depth - 1) : [],
          hasChildren: (item.children || []).length > 0
        };
      }
      return item;
    });
  }

  // Main page route - renders the doc viewer app
  app.get("/", (req, res) => {
    try {
      // Create cache key from query params
      const cacheKey = req.originalUrl || "/";

      // Return cached page if available
      if (cacheEnabled && pageCache.has(cacheKey)) {
        return res.type("html").send(pageCache.get(cacheKey));
      }

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

      // Use shallow tree for initial render (lazy loading will fetch children)
      const shallowTree = getShallowTree(sortedTree, 1);

      const context = new jsgui.Page_Context();

      // Load doc content with context so SVGs can render via jsgui3
      const docContent = selectedPath
        ? loadDocContent(docsPath, selectedPath, context)
        : null;

      const docApp = new DocAppControl({
        context,
        docTree: shallowTree,  // Use shallow tree for faster initial load
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
        sortOrder,
        plugins // Pass loaded plugins to render
      });

      // Cache the rendered page
      if (cacheEnabled) {
        pageCache.set(cacheKey, html);
      }

      res.type("html").send(html);
    } catch (err) {
      console.error("Docs viewer error:", err);
      res.status(500).type("text/plain").send("Error rendering page");
    }
  });

  // API endpoint to get document content
  app.get("/api/doc", (req, res) => {
    const docPath = req.query.path;
    if (!docPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }

    const content = loadDocContent(docsPath, docPath);
    if (!content) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(content);
  });

  // API endpoint to get the doc tree structure only
  app.get("/api/tree", (req, res) => {
    res.json({ tree: docTree, count: countDocs(docTree) });
  });

  // API endpoint to refresh doc tree
  app.post("/api/refresh", (req, res) => {
    docTree = buildDocTree(docsPath);
    pageCache.clear(); // Clear page cache when docs change
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
  const plugins = options.plugins || [];
  const html = control.all_html_render();

  // Check if jsgui3 client bundle exists
  const clientBundlePath = path.join(__dirname, "public", "docs-viewer-client.js");
  const hasClientBundle = fs.existsSync(clientBundlePath);

  const clientBundleScript = hasClientBundle
    ? '<!-- jsgui3 client bundle for control activation -->\n  <script src="/assets/docs-viewer-client.js" defer></script>'
    : '<!-- jsgui3 client bundle not built - run: npm run ui:docs:build -->';

  // Embed state for client-side hydration
  const stateScript = `<script>
    window.__DOCS_FILTERS__ = ${JSON.stringify(filters)};
    window.__DOCS_COLUMNS__ = ${JSON.stringify(columns)};
    window.__DOCS_SORT__ = { sortBy: ${JSON.stringify(sortBy)}, sortOrder: ${JSON.stringify(sortOrder)} };
  </script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
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
   <script src="/assets/docs-viewer.js" defer></script>
   <!-- Plugins -->
   ${plugins.map(p => p.clientScript ? `<script src="${p.clientScript}" defer></script>` : '').join('\n')}
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
  const { app, docsPath } = createDocsViewerServer({
    docsPath: args.docsPath,
    pluginsPath: args.pluginsPath
  });

  app.listen(args.port, args.host, () => {
    const displayHost = args.host === "0.0.0.0" ? "<your-ip>" : args.host;
    console.log(`📚 Documentation Viewer running at http://${displayHost}:${args.port}`);
    console.log(`   Serving docs from: ${docsPath}`);
    if (args.host === "0.0.0.0") {
      console.log(`   LAN access enabled - accessible from other devices on the network`);
    }
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
