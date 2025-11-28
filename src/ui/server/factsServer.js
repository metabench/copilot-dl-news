"use strict";

/**
 * @server Facts Server
 * @description Fact Determination Layer - Industrial Luxury Obsidian themed server for exploring URL facts.
 */

/**
 * Facts Server - Fact Determination Layer
 * 
 * Industrial Luxury Obsidian themed server for exploring URL facts.
 * 
 * Usage:
 *   node src/ui/server/factsServer.js [options]
 * 
 * Options:
 *   --port <port>     Port to listen on (default: 4800)
 *   --detached        Start in background (daemon) mode
 *   --stop            Stop running detached server
 *   --status          Check if server is running
 *   --help            Show help message
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const compression = require("compression");
const { spawn } = require("child_process");
const jsgui = require("jsgui3-html");

const { openNewsDb } = require("../../db/dbAccess");
const { findProjectRoot } = require("../../utils/project-root");
const { buildLuxuryObsidianCss } = require("../styles/luxuryObsidianCss");
const { FactsUrlListControl, formatCount, formatDateTime } = require("../controls/FactsUrlList");
const { UrlFactsPopup } = require("../controls/UrlFactsPopup");

// Database query adapters - use existing normalized queries
const {
  selectUrlPage,
  countUrls
} = require("../../db/sqlite/v1/queries/ui/urlListingNormalized");

const StringControl = jsgui.String_Control;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PORT = 4800;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const PID_FILE = path.join(process.cwd(), "tmp", ".facts-server.pid");
const SERVER_NAME = "Facts Server";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function sanitizePage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.trunc(numeric);
}

function sanitizePageSize(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.trunc(numeric)));
}

function resolveDbPath(cliPath) {
  const projectRoot = findProjectRoot(__dirname);
  if (cliPath) {
    return path.isAbsolute(cliPath) ? cliPath : path.resolve(process.cwd(), cliPath);
  }
  return path.join(projectRoot, "data", "news.db");
}

/**
 * Get the raw better-sqlite3 handle from a NewsDatabase wrapper
 * The db adapters expect the raw handle, not the wrapper
 */
function getDbHandle(newsDb) {
  if (!newsDb) return null;
  // NewsDatabase wrapper stores raw handle at .db
  return newsDb.db || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function createStyleTag(context, css) {
  const style = new jsgui.Control({ context, tagName: "style" });
  style.add(new StringControl({ context, text: css }));
  return style;
}

/**
 * Render the full HTML page with Luxury Obsidian styling
 */
function renderFactsPage({ urls, pagination, title = "Fact Determination Layer", basePath = "/" }) {
  const context = new jsgui.Page_Context();
  const document = new jsgui.Blank_HTML_Document({ context });

  // Head
  document.title.add(new StringControl({ context, text: title }));
  const head = document.head;
  head.add(new jsgui.meta({ context, attrs: { charset: "utf-8" } }));
  head.add(new jsgui.meta({ context, attrs: { name: "viewport", content: "width=device-width, initial-scale=1" } }));

  // Google Fonts
  const preconnect1 = new jsgui.link({ context });
  preconnect1.dom.attributes.rel = "preconnect";
  preconnect1.dom.attributes.href = "https://fonts.googleapis.com";
  head.add(preconnect1);

  const preconnect2 = new jsgui.link({ context });
  preconnect2.dom.attributes.rel = "preconnect";
  preconnect2.dom.attributes.href = "https://fonts.gstatic.com";
  preconnect2.dom.attributes.crossorigin = "";
  head.add(preconnect2);

  const fontsLink = new jsgui.link({ context });
  fontsLink.dom.attributes.rel = "stylesheet";
  fontsLink.dom.attributes.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:wght@600;700&display=swap";
  head.add(fontsLink);

  // Luxury Obsidian CSS
  head.add(createStyleTag(context, buildLuxuryObsidianCss()));

  // Body
  const body = document.body;
  body.add_class("luxury-obsidian");

  // Decorative corner flourishes
  ["tl", "tr", "bl", "br"].forEach(pos => {
    const flourish = new jsgui.div({ context, class: `lux-flourish lux-flourish--${pos}` });
    body.add(flourish);
  });

  // Shell
  const shell = new jsgui.div({ context, class: "lux-shell" });

  // Header
  const header = new jsgui.Control({ context, tagName: "header", class: "lux-shell__header" });
  const nav = new jsgui.Control({ context, tagName: "nav", class: "lux-nav" });
  
  const homeLink = new jsgui.a({ context, class: "lux-nav__link lux-nav__link--active" });
  homeLink.dom.attributes.href = "/";
  homeLink.add(new StringControl({ context, text: "🔍 Facts" }));
  nav.add(homeLink);

  const divider = new jsgui.span({ context, class: "lux-nav__divider" });
  nav.add(divider);

  const explorerLink = new jsgui.a({ context, class: "lux-nav__link" });
  explorerLink.dom.attributes.href = "http://localhost:4600/";
  explorerLink.dom.attributes.target = "_blank";
  explorerLink.add(new StringControl({ context, text: "📊 Data Explorer" }));
  nav.add(explorerLink);

  header.add(nav);
  shell.add(header);

  // Main content
  const main = new jsgui.Control({ context, tagName: "main", class: "lux-shell__main" });

  // Hero section
  const hero = new jsgui.div({ context, class: "lux-hero" });
  
  const heroIcon = new jsgui.span({ context, class: "lux-hero__icon" });
  heroIcon.add(new StringControl({ context, text: "◈" }));
  hero.add(heroIcon);

  const heroTitle = new jsgui.Control({ context, tagName: "h1", class: "lux-hero__title" });
  heroTitle.add(new StringControl({ context, text: "Fact Determination Layer" }));
  hero.add(heroTitle);

  const heroSubtitle = new jsgui.Control({ context, tagName: "p", class: "lux-hero__subtitle" });
  heroSubtitle.add(new StringControl({ context, text: "Objective URL Classification Through Neutral Observations" }));
  hero.add(heroSubtitle);

  main.add(hero);

  // Stats section
  const stats = new jsgui.div({ context, class: "lux-stats" });
  
  const statItems = [
    { value: formatCount(pagination.totalRows), label: "Total URLs", color: "gold" },
    { value: "5", label: "Fact Types", color: "emerald" },
    { value: "5", label: "URL Facts", color: "sapphire" },
    { value: "—", label: "Facts Computed", color: "amethyst" }
  ];

  statItems.forEach(item => {
    const stat = new jsgui.div({ context, class: `lux-stat${item.color !== "gold" ? ` lux-stat--${item.color}` : ""}` });
    
    const value = new jsgui.div({ context, class: "lux-stat__value" });
    value.add(new StringControl({ context, text: item.value }));
    stat.add(value);

    const label = new jsgui.div({ context, class: "lux-stat__label" });
    label.add(new StringControl({ context, text: item.label }));
    stat.add(label);

    stats.add(stat);
  });

  main.add(stats);

  // Decorative divider
  const dividerEl = new jsgui.div({ context, class: "lux-divider" });
  const gem = new jsgui.span({ context, class: "lux-divider__gem" });
  gem.add(new StringControl({ context, text: "◆" }));
  dividerEl.add(gem);
  main.add(dividerEl);

  // URL List
  const urlList = new FactsUrlListControl({
    context,
    urls,
    pagination,
    basePath
  });
  main.add(urlList);

  shell.add(main);

  // Footer
  const footer = new jsgui.Control({ context, tagName: "footer", class: "lux-shell__footer" });
  const footerText = `Facts Server • ${formatDateTime(new Date())} • Port ${DEFAULT_PORT}`;
  footer.add(new StringControl({ context, text: footerText }));
  shell.add(footer);

  body.add(shell);

  // Facts popup (hidden by default, activated by client JS)
  const popup = new UrlFactsPopup({ context });
  body.add(popup);

  // Client script for facts popup
  const script = new jsgui.Control({ context, tagName: "script" });
  script.dom.attributes.src = "/assets/facts-client.js";
  script.dom.attributes.defer = "defer";
  body.add(script);

  return document.html;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETACHED MODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function ensureTmpDir() {
  const tmpDir = path.dirname(PID_FILE);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
}

function writePidFile(pid) {
  ensureTmpDir();
  fs.writeFileSync(PID_FILE, String(pid), "utf8");
}

function readPidFile() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const content = fs.readFileSync(PID_FILE, "utf8").trim();
    const pid = parseInt(content, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function deletePidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // ignore
  }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopServer() {
  const pid = readPidFile();
  if (!pid) {
    console.log(`[${SERVER_NAME}] No PID file found. Server may not be running.`);
    return false;
  }

  if (!isProcessRunning(pid)) {
    console.log(`[${SERVER_NAME}] Process ${pid} is not running. Cleaning up PID file.`);
    deletePidFile();
    return false;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`[${SERVER_NAME}] Sent SIGTERM to process ${pid}`);
    
    // Wait briefly for graceful shutdown
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts && isProcessRunning(pid)) {
      require("child_process").execSync("timeout /t 1 >nul 2>&1", { shell: true });
      attempts++;
    }

    if (isProcessRunning(pid)) {
      console.log(`[${SERVER_NAME}] Process ${pid} did not stop gracefully. Sending SIGKILL.`);
      process.kill(pid, "SIGKILL");
    }

    deletePidFile();
    console.log(`[${SERVER_NAME}] Server stopped.`);
    return true;
  } catch (err) {
    console.error(`[${SERVER_NAME}] Error stopping server:`, err.message);
    deletePidFile();
    return false;
  }
}

function checkStatus() {
  const pid = readPidFile();
  if (!pid) {
    console.log(`[${SERVER_NAME}] Status: NOT RUNNING (no PID file)`);
    return false;
  }

  if (isProcessRunning(pid)) {
    console.log(`[${SERVER_NAME}] Status: RUNNING (PID ${pid})`);
    return true;
  } else {
    console.log(`[${SERVER_NAME}] Status: NOT RUNNING (stale PID file for ${pid})`);
    deletePidFile();
    return false;
  }
}

function startDetached(port) {
  // Check if already running
  const existingPid = readPidFile();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`[${SERVER_NAME}] Already running with PID ${existingPid}. Stop first with --stop`);
    process.exit(1);
  }

  const scriptPath = __filename;
  const logDir = path.join(process.cwd(), "tmp");
  ensureTmpDir();
  
  const outLog = path.join(logDir, "facts-server.out.log");
  const errLog = path.join(logDir, "facts-server.err.log");
  
  const out = fs.openSync(outLog, "a");
  const err = fs.openSync(errLog, "a");

  const child = spawn(process.execPath, [scriptPath, "--port", String(port)], {
    detached: true,
    stdio: ["ignore", out, err],
    env: { ...process.env, FACTS_DETACHED: "1" }
  });

  child.unref();
  writePidFile(child.pid);

  console.log(`[${SERVER_NAME}] Started in detached mode`);
  console.log(`  PID: ${child.pid}`);
  console.log(`  Port: ${port}`);
  console.log(`  URL: http://localhost:${port}/`);
  console.log(`  Logs: ${outLog}`);
  console.log(`  Stop with: node ${path.relative(process.cwd(), scriptPath)} --stop`);

  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER CREATION
// ═══════════════════════════════════════════════════════════════════════════════

function createServer(options = {}) {
  const dbPath = resolveDbPath(options.db);
  const relativeDb = path.relative(process.cwd(), dbPath);
  
  let newsDb = null;
  let dbHandle = null;
  try {
    newsDb = openNewsDb(dbPath);
    dbHandle = getDbHandle(newsDb);
  } catch (err) {
    console.error(`[${SERVER_NAME}] Failed to open database: ${err.message}`);
  }

  const app = express();
  app.use(compression());

  // Serve static assets (client bundles)
  const projectRoot = findProjectRoot(__dirname);
  app.use("/assets", express.static(path.join(projectRoot, "public", "assets")));

  // Main page
  app.get("/", (req, res, next) => {
    try {
      const page = sanitizePage(req.query.page);
      const pageSize = sanitizePageSize(req.query.pageSize || DEFAULT_PAGE_SIZE);
      
      const totalRows = dbHandle ? countUrls(dbHandle) : 0;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * pageSize;
      
      const urls = dbHandle ? selectUrlPage(dbHandle, { offset, limit: pageSize }) : [];
      
      const pagination = {
        currentPage: safePage,
        totalPages,
        totalRows,
        pageSize,
        startRow: totalRows === 0 ? 0 : offset + 1,
        endRow: totalRows === 0 ? 0 : offset + urls.length
      };

      const html = renderFactsPage({
        urls,
        pagination,
        basePath: "/"
      });

      res.type("html").send(html);
    } catch (err) {
      next(err);
    }
  });

  // API endpoint for JSON data
  app.get("/api/urls", (req, res, next) => {
    try {
      const page = sanitizePage(req.query.page);
      const pageSize = sanitizePageSize(req.query.pageSize || DEFAULT_PAGE_SIZE);
      
      const totalRows = dbHandle ? countUrls(dbHandle) : 0;
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * pageSize;
      
      const urls = dbHandle ? selectUrlPage(dbHandle, { offset, limit: pageSize }) : [];

      res.json({
        ok: true,
        data: urls,
        pagination: {
          currentPage: safePage,
          totalPages,
          totalRows,
          pageSize
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({ 
      ok: true, 
      server: SERVER_NAME,
      pid: process.pid,
      uptime: process.uptime(),
      db: relativeDb
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(`[${SERVER_NAME}] Error:`, err);
    res.status(500).json({ ok: false, error: err.message });
  });

  return { app, newsDb, dbHandle, dbPath, relativeDb };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const args = { port: DEFAULT_PORT };
  const tokens = argv.slice(2);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token) {
      case "--port":
      case "-p":
        args.port = parseInt(tokens[++i], 10) || DEFAULT_PORT;
        break;
      case "--detached":
        args.detached = true;
        break;
      case "--stop":
        args.stop = true;
        break;
      case "--status":
        args.status = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--db":
        args.db = tokens[++i];
        break;
    }
  }
  
  return args;
}

function showHelp() {
  console.log(`
${SERVER_NAME} - Industrial Luxury Obsidian UI for URL Facts

Usage:
  node src/ui/server/factsServer.js [options]

Options:
  --port <port>     Port to listen on (default: ${DEFAULT_PORT})
  --db <path>       Database path (default: data/news.db)
  --detached        Start in background (daemon) mode
  --stop            Stop running detached server
  --status          Check if server is running
  --help            Show this help message

Examples:
  node src/ui/server/factsServer.js                    # Start on port ${DEFAULT_PORT}
  node src/ui/server/factsServer.js --detached         # Start in background
  node src/ui/server/factsServer.js --stop             # Stop background server
  node src/ui/server/factsServer.js --status           # Check status
`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.stop) {
    stopServer();
    process.exit(0);
  }

  if (args.status) {
    checkStatus();
    process.exit(0);
  }

  if (args.detached) {
    startDetached(args.port);
    return; // startDetached calls process.exit
  }

  // Normal startup
  const { app, dbPath, relativeDb } = createServer({ db: args.db });
  const port = args.port;

  const server = app.listen(port, () => {
    console.log(`[${SERVER_NAME}] Started`);
    console.log(`  URL: http://localhost:${port}/`);
    console.log(`  Database: ${relativeDb}`);
    console.log(`  PID: ${process.pid}`);
    
    // Write PID file if in detached mode (FACTS_DETACHED env var)
    if (process.env.FACTS_DETACHED === "1") {
      writePidFile(process.pid);
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log(`[${SERVER_NAME}] Received SIGTERM, shutting down...`);
    server.close(() => {
      deletePidFile();
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log(`[${SERVER_NAME}] Received SIGINT, shutting down...`);
    server.close(() => {
      deletePidFile();
      process.exit(0);
    });
  });
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  createServer,
  renderFactsPage,
  DEFAULT_PORT
};
