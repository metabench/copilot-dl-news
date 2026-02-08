"use strict";

/**
 * @server Diagram Atlas
 * @description Visualizes code structure, database schema, and system features.
 * @ui true
 * @port 4620
 */

const express = require("express");
const compression = require("compression");
const path = require("path");
const jsgui = require("jsgui3-html");

const { DiagramDataService } = require("./services/diagramDataService");
const {
  DiagramProgressControl,
  buildDiagramAtlasStyles,
  buildCodeSection,
  buildDbSection,
  buildFeatureSection
} = require("../controls/DiagramAtlasControls");
const { findProjectRoot } = require("../../shared/utils/project-root");
const { ensureClientBundle } = require("./utils/ensureClientBundle");
const {
  createTelemetry,
  attachTelemetryEndpoints,
  attachTelemetryMiddleware
} = require("./utils/telemetry");

const StringControl = jsgui.String_Control;
const DEFAULT_PORT = 4620;
const DEFAULT_HOST = "0.0.0.0";

function createStat(context, label, value, options = {}) {
  const wrapper = new jsgui.div({ context, class: "diagram-diagnostics__item" });
  if (options.metric) {
    wrapper.dom.attributes["data-metric"] = options.metric;
  }
  if (options.tooltip) {
    wrapper.dom.attributes.title = options.tooltip;
  }
  if (options.icon) {
    wrapper.dom.attributes["data-icon"] = options.icon;
  }
  const title = new jsgui.div({ context, class: "diagram-diagnostics__label" });
  title.add(new StringControl({ context, text: label }));
  const metric = new jsgui.div({ context, class: "diagram-diagnostics__value" });
  const displayValue = value == null ? "—" : value;
  metric.add(new StringControl({ context, text: String(displayValue) }));
  wrapper.add(title);
  wrapper.add(metric);
  if (options.detail) {
    const detail = new jsgui.div({ context, class: "diagram-diagnostics__detail" });
    detail.add(new StringControl({ context, text: options.detail }));
    wrapper.add(detail);
  }
  return wrapper;
}

function buildBaseStyles() {
  return `
body {
  margin: 0;
  background: #020817;
}
.diagram-diagnostics__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}
.diagram-diagnostics__value {
  font-size: 1.2rem;
  font-weight: 600;
}
`;
}

function formatStatValue(value, fallback = "—") {
  if (value == null) return fallback;
  if (typeof value === "number") {
    return value.toLocaleString("en-US");
  }
  return String(value);
}

function formatBytes(bytes, fallback = "—") {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return fallback;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / (1024 ** exponent);
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${fixed} ${units[exponent]}`;
}

function formatDisplayTimestamp(value, fallback = "—") {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function summarizePath(value, segments = 2) {
  if (!value || typeof value !== "string") {
    return value || "";
  }
  const normalized = value.split("\\").join("/");
  const parts = normalized.split("/");
  if (parts.length <= segments) {
    return normalized;
  }
  return `.../${parts.slice(-segments).join("/")}`;
}

function sanitizeInlineJson(payload) {
  return JSON.stringify(payload || {}).replace(/</g, "\\u003c");
}

function buildStateScript(context, state) {
  const script = new jsgui.script({ context });
  script.add(new StringControl({ context, text: `window.__DIAGRAM_ATLAS__ = ${sanitizeInlineJson(state)};` }));
  return script;
}

function renderDiagramAtlasHtml(diagramData = null, options = {}) {
  const context = new jsgui.Page_Context();
  const document = new jsgui.Blank_HTML_Document({ context });
  const titleText = options.title || "Code + DB Diagram Atlas";
  const subtitleText = options.subtitle || "Derived from js-scan/js-edit CLI outputs";

  document.title.add(new StringControl({ context, text: titleText }));
  const head = document.head;
  head.add(new jsgui.meta({ context, attrs: { charset: "utf-8" } }));
  head.add(new jsgui.meta({ context, attrs: { name: "viewport", content: "width=device-width, initial-scale=1" } }));
  const style = new jsgui.Control({ context, tagName: "style" });
  style.add(new StringControl({ context, text: `${buildBaseStyles()}${buildDiagramAtlasStyles()}` }));
  head.add(style);

  const body = document.body;
  const shell = new jsgui.div({ context, class: "diagram-shell" });
  shell.dom.attributes["data-role"] = "diagram-shell";
  shell.dom.attributes["data-shell-mode"] = diagramData ? "static" : "shell";

  const header = new jsgui.div({ context, class: "diagram-shell__header" });
  header.add_class("diagram-hero");
  const title = new jsgui.h1({ context });
  title.add(new StringControl({ context, text: titleText }));
  const heroHeading = new jsgui.div({ context, class: "diagram-hero__heading" });
  heroHeading.add(title);
  const subtitle = new jsgui.p({ context, class: "diagram-shell__subtitle" });
  subtitle.add(new StringControl({ context, text: subtitleText }));
  heroHeading.add(subtitle);
  header.add(heroHeading);

  const codeSummary = diagramData && diagramData.code && diagramData.code.summary ? diagramData.code.summary : {};
  const generatedDisplay = formatDisplayTimestamp(diagramData && diagramData.generatedAt);

  const diagnostics = new jsgui.div({ context, class: "diagram-diagnostics" });
  diagnostics.dom.attributes["data-role"] = "diagram-diagnostics";
  diagnostics.add(createStat(
    context,
    "Generated",
    generatedDisplay,
    {
      metric: "generatedAt",
      icon: "🕒",
      detail: diagramData && diagramData.generatedAt ? diagramData.generatedAt : null
    }
  ));
  diagnostics.add(createStat(
    context,
    "Code Files",
    formatStatValue(codeSummary.fileCount, "—"),
    {
      metric: "codeFiles",
      icon: "📁",
      detail: formatBytes(codeSummary.totalBytes)
    }
  ));
  diagnostics.add(createStat(
    context,
    "Code Bytes",
    formatBytes(codeSummary.totalBytes),
    {
      metric: "codeBytes",
      icon: "💾",
      detail: Number.isFinite(codeSummary.totalBytes) ? `${formatStatValue(codeSummary.totalBytes)} bytes` : null
    }
  ));
  const largestFile = diagramData && diagramData.code && Array.isArray(diagramData.code.topFiles) && diagramData.code.topFiles.length
    ? diagramData.code.topFiles[0]
    : null;
  diagnostics.add(createStat(
    context,
    "Largest File",
    formatBytes(largestFile && largestFile.bytes, "—"),
    {
      metric: "largestFile",
      tooltip: largestFile && largestFile.file ? `${largestFile.file}` : null,
      icon: "🗂️",
      detail: largestFile && largestFile.file ? summarizePath(largestFile.file, 2) : null
    }
  ));
  diagnostics.add(createStat(
    context,
    "DB Tables",
    formatStatValue(diagramData && diagramData.db && diagramData.db.totalTables, "—"),
    { metric: "dbTables", icon: "🗄️" }
  ));
  diagnostics.add(createStat(
    context,
    "Features",
    formatStatValue(diagramData && diagramData.features && diagramData.features.featureCount, "—"),
    { metric: "features", icon: "✨" }
  ));
  const toolbar = new jsgui.div({ context, class: "diagram-toolbar" });
  const statusCard = new jsgui.div({ context, class: "diagram-toolbar__status" });
  const statusTitle = new jsgui.span({ context, class: "diagram-toolbar__status-title" });
  statusTitle.add(new StringControl({ context, text: "Snapshot" }));
  const statusValue = new jsgui.span({ context, class: "diagram-toolbar__status-value" });
  statusValue.dom.attributes["data-toolbar-metric"] = "generatedAt";
  statusValue.add(new StringControl({ context, text: generatedDisplay }));
  statusCard.add(statusTitle);
  statusCard.add(statusValue);
  toolbar.add(statusCard);

  const actions = new jsgui.div({ context, class: "diagram-toolbar__actions" });
  const refreshButton = new jsgui.button({ context, class: "diagram-button" });
  refreshButton.dom.attributes.type = "button";
  refreshButton.dom.attributes["data-role"] = "diagram-refresh";
  refreshButton.add(new StringControl({ context, text: "Refresh data" }));
  actions.add(refreshButton);
  const actionsHint = new jsgui.span({ context, class: "diagram-toolbar__hint" });
  actionsHint.add(new StringControl({ context, text: "Refresh triggers the CLI and bypasses cache." }));
  actions.add(actionsHint);
  toolbar.add(actions);

  const progress = new DiagramProgressControl({
    context,
    status: diagramData ? "complete" : "loading",
    label: diagramData ? "Diagram Atlas ready" : (options.loadingLabel || "Preparing Diagram Atlas"),
    detail: diagramData ? "Loaded from cached snapshot" : (options.loadingDetail || "Collecting sources and metrics...")
  });
  const progressCard = new jsgui.div({ context, class: "diagram-toolbar__progress" });
  progressCard.add(progress);
  toolbar.add(progressCard);

  header.add(toolbar);
  const statsWrap = new jsgui.div({ context, class: "diagram-hero__stats" });
  statsWrap.add(diagnostics);
  header.add(statsWrap);
  shell.add(header);

  const sectionsRoot = new jsgui.div({ context, class: "diagram-shell__sections" });
  sectionsRoot.dom.attributes["data-role"] = "diagram-atlas-sections";
  if (diagramData && diagramData.code) {
    sectionsRoot.add(buildCodeSection(context, diagramData.code));
  }
  if (diagramData && diagramData.db) {
    sectionsRoot.add(buildDbSection(context, diagramData.db));
  }
  if (diagramData && diagramData.features) {
    sectionsRoot.add(buildFeatureSection(context, diagramData.features));
  }
  if (!diagramData) {
    const placeholder = new jsgui.div({ context, class: "diagram-shell__placeholder" });
    placeholder.add(new StringControl({ context, text: "Diagram Atlas will populate once data loads." }));
    sectionsRoot.add(placeholder);
  }
  shell.add(sectionsRoot);

  body.add(shell);

  const state = {
    dataUrl: options.dataUrl || "/api/diagram-data",
    refreshUrl: options.refreshUrl || "/api/diagram-data/refresh",
    statusUrl: options.statusUrl || "/api/diagram-data/status",
    shellMode: !diagramData,
    title: titleText,
    initialData: options.embedInitialData === false ? null : (diagramData || null)
  };
  body.add(buildStateScript(context, state));

  const clientBundlePath = options.clientBundlePath || "/assets/ui-client.js";
  const clientScript = new jsgui.script({ context });
  clientScript.dom.attributes.src = clientBundlePath;
  clientScript.dom.attributes.defer = "defer";
  body.add(clientScript);

  return `<!DOCTYPE html>${document.all_html_render()}`;
}

function createDiagramAtlasServer(options = {}) {
  ensureClientBundle({ silent: options.quietClientBuild });
  const app = express();
  const telemetry = createTelemetry({
    name: "Diagram Atlas",
    entry: "src/ui/server/diagramAtlasServer.js"
  });
  telemetry.wireProcessHandlers();

  const dataService = new DiagramDataService(options.dataService || {});
  const projectRoot = findProjectRoot(__dirname);
  const assetsDir = path.join(projectRoot, "public", "assets");
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));

  attachTelemetryMiddleware(app, telemetry);
  attachTelemetryEndpoints(app, telemetry);

  app.use("/assets", express.static(assetsDir, { maxAge: "1h" }));

  app.get("/diagram-atlas", async (req, res, next) => {
    try {
      const wantsSsr = Boolean(req.query) && ["1", "true", "yes"].includes(String(req.query.ssr || req.query.snapshot || "").toLowerCase());
      const payload = wantsSsr ? await dataService.load() : null;
      const html = renderDiagramAtlasHtml(payload, {
        title: options.title,
        embedInitialData: wantsSsr
      });
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/diagram-data", async (req, res, next) => {
    try {
      const payload = await dataService.load();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/diagram-data/refresh", async (req, res, next) => {
    try {
      const payload = await dataService.refresh();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/diagram-data/status", (req, res) => {
    res.json(dataService.getStatus());
  });

  app.get("/health", async (req, res) => {
    const snapshot = await dataService.load().catch(() => null);
    res.json({
      ok: Boolean(snapshot),
      generatedAt: snapshot && snapshot.generatedAt,
      sections: snapshot ? Object.keys(snapshot) : []
    });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error("Diagram Atlas server error", err);
    telemetry.error("server.error", err);
    res.status(500).json({ error: err.message || "Server error" });
  });

  return { app, dataService, telemetry };
}

function parseServerArgs(argv = [], env = process.env) {
  const hostFromEnv = env.DIAGRAM_ATLAS_HOST || env.DIAGRAM_HOST || env.HOST;
  const portFromEnv = env.DIAGRAM_ATLAS_PORT || env.DIAGRAM_PORT || env.PORT;
  const titleFromEnv = env.DIAGRAM_ATLAS_TITLE || env.DIAGRAM_TITLE;

  const args = {
    port: Number(portFromEnv) || DEFAULT_PORT,
    host: hostFromEnv || DEFAULT_HOST,
    title: titleFromEnv || null,
    explicitPort: Boolean(portFromEnv),
    explicitHost: Boolean(hostFromEnv)
  };

  const input = Array.isArray(argv) ? argv.slice() : [];
  const positional = [];

  for (let i = 0; i < input.length; i += 1) {
    const token = input[i];
    if (!token) continue;
    if (token === "--port" && input[i + 1]) {
      const value = Number(input[++i]);
      if (Number.isFinite(value) && value > 0) {
        args.port = value;
        args.explicitPort = true;
      }
      continue;
    }
    if (token === "--host" && input[i + 1]) {
      args.host = input[++i];
      args.explicitHost = true;
      continue;
    }
    if (token === "--title" && input[i + 1]) {
      args.title = input[++i];
      continue;
    }
    if (token === "--") {
      positional.push(...input.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      continue;
    }
    positional.push(token);
  }

  if (!args.explicitHost && positional.length > 0) {
    args.host = positional.shift();
    args.explicitHost = true;
  }

  if (!args.explicitPort && positional.length > 0) {
    const maybePort = Number(positional.shift());
    if (Number.isFinite(maybePort) && maybePort > 0) {
      args.port = maybePort;
      args.explicitPort = true;
    }
  }

  if (!Number.isFinite(args.port) || args.port <= 0) {
    args.port = DEFAULT_PORT;
    args.explicitPort = false;
  }

  return args;
}

function formatDisplayHost(host) {
  if (!host) {
    return "localhost";
  }
  const normalized = host.trim();
  if (normalized === "0.0.0.0" || normalized === "::" || normalized === "::ffff:0.0.0.0") {
    return "localhost";
  }
  return normalized;
}

function listenOnPort(app, host, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      server.removeListener("error", handleError);
      resolve(server);
    });
    function handleError(error) {
      server.removeListener("error", handleError);
      reject(error);
    }
    server.once("error", handleError);
  });
}

async function main() {
  const args = parseServerArgs(process.argv.slice(2));
  const { app, telemetry } = createDiagramAtlasServer({ title: args.title });
  let server;
  let activePort = args.port;

  telemetry.info("server.starting", undefined, {
    host: args.host,
    port: args.port,
    title: args.title || null
  });

  try {
    server = await listenOnPort(app, args.host, args.port);
  } catch (error) {
    if (error?.code === "EADDRINUSE" && !args.explicitPort) {
      console.warn(`Port ${args.port} is busy; selecting an available port automatically...`);
      server = await listenOnPort(app, args.host, 0);
      activePort = server.address().port;
    } else {
      throw error;
    }
  }

  const root = findProjectRoot(__dirname);
  const displayHost = formatDisplayHost(args.host);
  const link = `http://${displayHost}:${activePort}/diagram-atlas`;
  const bindLabel = `${args.host}:${activePort}`;

  telemetry.setPort(activePort);
  telemetry.info("server.listening", `Diagram Atlas listening on ${link}`, {
    url: link,
    bind: bindLabel,
    root
  });

  console.log(`Diagram Atlas listening on ${link} (bind: ${bindLabel}, root: ${root})`);
  console.log("Press Ctrl+C to stop the server.");
  return server;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start Diagram Atlas server:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  createDiagramAtlasServer,
  renderDiagramAtlasHtml,
  parseServerArgs
};
