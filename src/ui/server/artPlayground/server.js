"use strict";

/**
 * @server Art Playground
 * @description Interactive SVG component editor - select, resize, drag UI components.
 * @ui true
 * @port 4950
 */

/**
 * Art Playground Server
 * 
 * An interactive SVG component editor for building visual editing methodology.
 * Stepping stone toward decision tree editor.
 * 
 * Features:
 * - Click to select components
 * - Resize handles on selection
 * - Drag to move components
 * - Component abstraction over SVG
 * 
 * Theme: "Luxury White Leather, Industrial Obsidian Features"
 * 
 * Usage:
 *   node src/ui/server/artPlayground/server.js [--port 4950] [--detached]
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const express = require("express");
const jsgui = require("jsgui3-html");
const { Command } = require("commander");

const { ArtPlaygroundAppControl } = require("./isomorphic/controls");

const DEFAULT_PORT = 4950;
const PID_FILE = path.join(__dirname, ".art-playground.pid");

/**
 * Create CLI program with Commander
 */
function createProgram() {
  const program = new Command();
  
  program
    .name("art-playground")
    .description("Art Playground - Interactive SVG component editor")
    .version("1.0.0")
    .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
    .option("--detached", "Run server in detached mode")
    .option("--stop", "Stop detached server")
    .option("--status", "Check if detached server is running");
    
  return program;
}

/**
 * Check if a detached server is running
 */
function isServerRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  
  const pid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

/**
 * Stop detached server
 */
function stopServer() {
  const pid = isServerRunning();
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
      fs.unlinkSync(PID_FILE);
      console.log(`Stopped Art Playground server (PID: ${pid})`);
      return true;
    } catch (err) {
      console.error(`Failed to stop server: ${err.message}`);
      return false;
    }
  } else {
    console.log("No Art Playground server running");
    return false;
  }
}

/**
 * Start server in detached mode
 */
function startDetached(port) {
  const existingPid = isServerRunning();
  if (existingPid) {
    console.log(`Art Playground already running on PID ${existingPid}`);
    return;
  }
  
  const child = spawn(process.execPath, [__filename, "--port", port], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ART_PLAYGROUND_DETACHED: "1" }
  });
  
  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log(`Art Playground started in detached mode (PID: ${child.pid}, port: ${port})`);
}

/**
 * Create Express app
 */
function createApp() {
  const app = express();
  
  // Serve static files
  app.use("/public", express.static(path.join(__dirname, "public")));
  
  // Serve client bundle
  app.get("/client.bundle.js", (req, res) => {
    const bundlePath = path.join(__dirname, "client.bundle.js");
    if (fs.existsSync(bundlePath)) {
      res.type("application/javascript").sendFile(bundlePath);
    } else {
      res.status(404).send("// Client bundle not built yet. Run: node scripts/build-art-playground-client.js");
    }
  });
  
  // Main page
  app.get("/", (req, res) => {
    const context = new jsgui.Page_Context();
    
    // Create the app control
    const appControl = new ArtPlaygroundAppControl({ context });
    
    // Render full page with manual HTML wrapper
    const html = renderPage(appControl, { title: "Art Playground" });
    res.type("html").send(html);
  });
  
  // API: Get component data (for future persistence)
  app.get("/api/components", (req, res) => {
    // Return sample components for now
    res.json({
      components: [
        { id: "rect1", type: "rect", x: 100, y: 100, width: 150, height: 100, fill: "#4A90D9" },
        { id: "rect2", type: "rect", x: 300, y: 150, width: 120, height: 80, fill: "#D94A4A" },
        { id: "ellipse1", type: "ellipse", cx: 500, cy: 200, rx: 60, ry: 40, fill: "#4AD94A" }
      ]
    });
  });
  
  return app;
}

/**
 * Render a full HTML page with the control
 */
function renderPage(control, options = {}) {
  const title = options.title || "Art Playground";
  const html = control.all_html_render();
  
  // Check if client bundle exists
  const clientBundlePath = path.join(__dirname, "client.bundle.js");
  const hasClientBundle = fs.existsSync(clientBundlePath);
  
  const clientBundleScript = hasClientBundle 
    ? '<script src="/client.bundle.js" defer></script>'
    : '<!-- Client bundle not built - run: node scripts/build-art-playground-client.js -->';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/public/art-playground.css">
</head>
<body>
  ${html}
  ${clientBundleScript}
</body>
</html>`;
}

/**
 * Escape HTML for safe insertion
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Main entry point
 */
function main() {
  const program = createProgram();
  program.parse(process.argv);
  const opts = program.opts();
  
  // Handle --stop
  if (opts.stop) {
    stopServer();
    process.exit(0);
  }
  
  // Handle --status
  if (opts.status) {
    const pid = isServerRunning();
    if (pid) {
      console.log(`Art Playground running (PID: ${pid})`);
    } else {
      console.log("Art Playground not running");
    }
    process.exit(0);
  }
  
  // Handle --detached
  if (opts.detached && !process.env.ART_PLAYGROUND_DETACHED) {
    startDetached(opts.port);
    process.exit(0);
  }
  
  // Start server normally
  const app = createApp();
  const port = parseInt(opts.port, 10);
  
  app.listen(port, () => {
    console.log(`Art Playground running at http://localhost:${port}`);
  });
}

main();
