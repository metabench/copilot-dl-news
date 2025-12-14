"use strict";

/**
 * @server Control Harness
 * @description Minimal jsgui3 SSR + activation playground for control testing.
 * @ui true
 * @port 4975
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const { Command } = require("commander");

const jsgui = require("jsgui3-html");
const { wrapServerForCheck } = require("../utils/serverStartupCheck");

const { CounterControl } = require("./isomorphic/controls/CounterControl");

const DEFAULT_PORT = 4975;
const DEFAULT_HOST = "127.0.0.1";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function renderPage(control, options = {}) {
  const title = options.title || "Control Harness";
  const html = control.all_html_render();

  const clientPath = path.join(__dirname, "public", "control-harness-client.js");
  const hasClientBundle = fs.existsSync(clientPath);

  const clientScript = hasClientBundle
    ? '<script src="/public/control-harness-client.js" defer></script>'
    : "<!-- Client bundle missing. Run: node scripts/build-control-harness-client.js -->";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/public/control-harness.css">
</head>
<body>
  ${html}
  ${clientScript}
</body>
</html>`;
}

function createControlHarnessServer() {
  const app = express();

  app.use("/public", express.static(path.join(__dirname, "public")));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/", (req, res) => {
    const context = new jsgui.Page_Context();
    const control = new CounterControl({ context, initialCount: 0 });
    res.type("html").send(renderPage(control, { title: "Control Harness" }));
  });

  return {
    app,
    close() {}
  };
}

function createProgram() {
  const program = new Command();

  program
    .name("control-harness")
    .description("Minimal jsgui3 control harness")
    .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
    .option("--host <host>", "Host to bind", DEFAULT_HOST)
    .option("--check", "Start, verify, then exit");

  return program;
}

function main() {
  process.env.SERVER_NAME = process.env.SERVER_NAME || "Control Harness";

  const program = createProgram();
  program.parse(process.argv);
  const opts = program.opts();

  const port = parseInt(opts.port, 10);
  const host = opts.host || DEFAULT_HOST;

  if (!Number.isFinite(port) || port <= 0) {
    console.error("Control Harness: --port must be a positive integer");
    process.exit(2);
  }

  const { app } = createControlHarnessServer();

  wrapServerForCheck(app, port, host, () => {
    console.log(`Control Harness running at http://${host}:${port}`);
  });
}

module.exports = { createControlHarnessServer };

if (require.main === module) {
  main();
}
