"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const { createDataExplorerServer } = require("../../src/ui/server/dataExplorerServer");
const { findProjectRoot } = require("../../src/utils/project-root");
const { resolveDbPath } = require("../../src/ui/render-url-table");
const { openNewsDb } = require("../../src/db/dbAccess");
const { selectInitialUrls } = require("../../src/db/sqlite/v1/queries/ui/urlListingNormalized");
const { selectHostSummary } = require("../../src/db/sqlite/v1/queries/ui/domainDetails");

const DEFAULT_OUTPUT_DIR = path.join("screenshots", "data-explorer");
const DEFAULT_VIEWPORT = { width: 1440, height: 1200 };
const DEFAULT_CLIP_SELECTOR = ".page-shell";
const DEFAULT_DELAY_MS = 1500;
const DEFAULT_ROUTE_KEYS = [
  "urls",
  "urls-fetched",
  "domains",
  "crawls",
  "errors",
  "url-detail",
  "domain-detail"
];

const ROUTE_DEFINITIONS = {
  urls: {
    key: "urls",
    label: "URLs",
    buildPath: () => "/urls"
  },
  "urls-fetched": {
    key: "urls-fetched",
    label: "Fetched URLs",
    buildPath: () => "/urls?hasFetches=1"
  },
  "urls-page-2": {
    key: "urls-page-2",
    label: "URLs page 2",
    buildPath: () => "/urls?page=2"
  },
  domains: {
    key: "domains",
    label: "Domains",
    buildPath: () => "/domains"
  },
  crawls: {
    key: "crawls",
    label: "Crawls",
    buildPath: () => "/crawls"
  },
  errors: {
    key: "errors",
    label: "Errors",
    buildPath: () => "/errors"
  },
  "url-detail": {
    key: "url-detail",
    label: "URL detail",
    buildPath: (ctx) => (ctx && ctx.sampleUrlId ? `/urls/${ctx.sampleUrlId}` : null),
    requires: "sampleUrlId"
  },
  "domain-detail": {
    key: "domain-detail",
    label: "Domain detail",
    buildPath: (ctx) => (ctx && ctx.sampleHost ? `/domains/${encodeURIComponent(ctx.sampleHost)}` : null),
    requires: "sampleHost"
  }
};

const MAX_SCREENSHOT_HEIGHT = 1200;

function parseArgs(argv) {
  const args = {
    routes: []
  };
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const next = () => tokens[++i];
    switch (token) {
      case "--db":
      case "-d":
        args.dbPath = next();
        break;
      case "--output":
      case "-o":
        args.outputDir = next();
        break;
      case "--routes":
      case "-r":
        args.routes.push(next());
        break;
      case "--viewport-width":
        args.viewportWidth = Number(next());
        break;
      case "--viewport-height":
        args.viewportHeight = Number(next());
        break;
      case "--clip":
      case "--clip-selector":
        args.clipSelector = next();
        break;
      case "--delay":
        args.delay = Number(next());
        break;
      case "--page-size":
        args.pageSize = Number(next());
        break;
      case "--title":
        args.title = next();
        break;
      case "--base-url":
        args.baseUrl = next();
        break;
      case "--html":
        args.saveHtml = true;
        break;
      case "--quiet-client-build":
        args.quietClientBuild = true;
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (!value) break;
          if (key === "--db") args.dbPath = value;
          if (key === "--output") args.outputDir = value;
          if (key === "--routes") args.routes.push(value);
          if (key === "--viewport-width") args.viewportWidth = Number(value);
          if (key === "--viewport-height") args.viewportHeight = Number(value);
          if (key === "--clip" || key === "--clip-selector") args.clipSelector = value;
          if (key === "--delay") args.delay = Number(value);
          if (key === "--page-size") args.pageSize = Number(value);
          if (key === "--title") args.title = value;
          if (key === "--base-url") args.baseUrl = value;
        }
        break;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toSlug(value) {
  return (value || "route")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|[-]+$/g, "") || "route";
}

function sanitizeViewport(width, height) {
  const w = Number.isFinite(width) ? Math.max(800, Math.trunc(width)) : DEFAULT_VIEWPORT.width;
  const requestedHeight = Number.isFinite(height) ? Math.max(600, Math.trunc(height)) : DEFAULT_VIEWPORT.height;
  const h = Math.min(MAX_SCREENSHOT_HEIGHT, requestedHeight);
  return { width: w, height: h };
}

function sanitizeDelay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_DELAY_MS;
  return Math.trunc(numeric);
}

function collectSampleContext(dbPath, options = {}) {
  const context = {
    sampleUrlId: null,
    sampleUrl: null,
    sampleHost: null
  };
  if (!dbPath) {
    return context;
  }
  const dbAccess = openNewsDb(dbPath);
  try {
    const rows = selectInitialUrls(dbAccess.db, { limit: options.sampleLimit || 200 });
    if (rows.length) {
      const firstRow = rows.find((row) => row && Number.isFinite(row.id));
      if (firstRow) {
        context.sampleUrlId = firstRow.id;
        context.sampleUrl = firstRow.url || null;
      }
      const hostRow = rows.find((row) => row && row.host);
      if (hostRow && hostRow.host) {
        const normalizedHost = hostRow.host.toLowerCase();
        const summary = selectHostSummary(dbAccess.db, normalizedHost);
        if (summary && summary.host) {
          context.sampleHost = summary.host;
        } else {
          context.sampleHost = normalizedHost;
        }
      }
    }
  } catch (error) {
    console.warn("Failed to collect sample context:", error.message);
  } finally {
    try {
      dbAccess.close();
    } catch (_) {}
  }
  return context;
}

function buildRouteList(keys, context) {
  const requested = Array.isArray(keys) && keys.length ? keys : DEFAULT_ROUTE_KEYS;
  const normalized = requested
    .flatMap((chunk) => String(chunk || "").split(/[\s,]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueKeys = Array.from(new Set(normalized.length ? normalized : DEFAULT_ROUTE_KEYS));
  const routes = [];
  uniqueKeys.forEach((key) => {
    const def = ROUTE_DEFINITIONS[key];
    if (!def) {
      console.warn(`Unknown route key: ${key}`);
      return;
    }
    const pathValue = typeof def.buildPath === "function" ? def.buildPath(context) : def.path;
    if (!pathValue) {
      console.warn(`Skipping route ${key} (missing prerequisites)`);
      return;
    }
    routes.push({
      key: def.key,
      label: def.label || def.key,
      path: pathValue,
      slug: toSlug(def.key)
    });
  });
  return routes;
}

async function startExplorerServer(options = {}) {
  if (options.baseUrl) {
    return {
      baseUrl: options.baseUrl.replace(/\/$/, ""),
      stop: async () => {}
    };
  }
  const host = "127.0.0.1";
  const { app, close } = createDataExplorerServer({
    dbPath: options.dbPath,
    pageSize: options.pageSize,
    title: options.title,
    quietClientBuild: options.quietClientBuild
  });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, host, () => resolve(listener));
    listener.once("error", reject);
  });
  const address = server.address();
  const baseUrl = `http://${host}:${address.port}`;
  return {
    baseUrl,
    stop: async () => {
      await new Promise((resolve) => server.close(resolve));
      close();
    }
  };
}

async function captureRoutePage(page, url, clipSelector, delayMs, outputPath) {
  await page.goto(url, { waitUntil: "networkidle0" });
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (clipSelector) {
    const target = await page.$(clipSelector);
    if (target) {
      const box = await target.boundingBox();
      if (box) {
        const viewport = page.viewport() || {};
        const maxWidth = Math.max(1, viewport.width || DEFAULT_VIEWPORT.width);
        const maxHeight = Math.max(1, Math.min(viewport.height || MAX_SCREENSHOT_HEIGHT, MAX_SCREENSHOT_HEIGHT));
        const clipX = Math.min(Math.max(Math.floor(box.x), 0), maxWidth - 1);
        const clipY = Math.min(Math.max(Math.floor(box.y), 0), maxHeight - 1);
        const clipWidth = Math.max(1, Math.min(Math.ceil(box.width), maxWidth - clipX));
        const clipHeight = Math.max(1, Math.min(Math.ceil(box.height), maxHeight - clipY));
        const clip = { x: clipX, y: clipY, width: clipWidth, height: clipHeight };
        await page.screenshot({ path: outputPath, clip });
        return;
      }
    }
  }
  await page.screenshot({ path: outputPath, fullPage: false });
}

async function runCaptureWorkflow(options = {}) {
  const projectRoot = findProjectRoot(__dirname);
  const resolvedDbPath = resolveDbPath(options.dbPath);
  const outputDir = options.outputDir
    ? path.isAbsolute(options.outputDir)
      ? options.outputDir
      : path.join(projectRoot, options.outputDir)
    : path.join(projectRoot, DEFAULT_OUTPUT_DIR);
  ensureDir(outputDir);

  const viewport = sanitizeViewport(options.viewportWidth, options.viewportHeight);
  const delayMs = options.delay != null ? sanitizeDelay(options.delay) : DEFAULT_DELAY_MS;
  const clipSelector = options.clipSelector || DEFAULT_CLIP_SELECTOR;

  const context = collectSampleContext(resolvedDbPath, { sampleLimit: 400 });
  const routes = buildRouteList(options.routes, context);
  if (!routes.length) {
    throw new Error("No routes resolved for screenshot capture");
  }

  const serverContext = await startExplorerServer({
    baseUrl: options.baseUrl,
    dbPath: resolvedDbPath,
    pageSize: options.pageSize,
    title: options.title,
    quietClientBuild: options.quietClientBuild
  });

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport(viewport);

  const results = [];
  try {
    for (let i = 0; i < routes.length; i += 1) {
      const route = routes[i];
      const slug = `${String(i + 1).padStart(2, "0")}-${route.slug}`;
      const pngPath = path.join(outputDir, `${slug}.png`);
      const htmlPath = options.saveHtml ? path.join(outputDir, `${slug}.html`) : null;
      const targetUrl = `${serverContext.baseUrl}${route.path}`;
      try {
        await captureRoutePage(page, targetUrl, clipSelector, delayMs, pngPath);
        if (htmlPath) {
          const html = await page.content();
          fs.writeFileSync(htmlPath, html, "utf8");
        }
        const relativePng = path.relative(projectRoot, pngPath);
        console.log(`Captured ${route.key}: ${relativePng}`);
        results.push({
          key: route.key,
          label: route.label,
          url: targetUrl,
          screenshot: path.relative(projectRoot, pngPath),
          html: htmlPath ? path.relative(projectRoot, htmlPath) : null
        });
      } catch (error) {
        console.error(`Failed to capture ${route.key}:`, error.message);
        results.push({
          key: route.key,
          label: route.label,
          url: targetUrl,
          error: error.message
        });
      }
    }
  } finally {
    await browser.close();
    await serverContext.stop();
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = {
    generatedAt: new Date().toISOString(),
    dbPath: path.relative(projectRoot, resolvedDbPath),
    baseUrl: serverContext.baseUrl,
    viewport,
    maxScreenshotHeight: MAX_SCREENSHOT_HEIGHT,
    clipSelector,
    delayMs,
    routes: results
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Manifest written: ${path.relative(projectRoot, manifestPath)}`);

  return { outputDir, results, manifestPath };
}

if (require.main === module) {
  runCaptureWorkflow(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error("Failed to capture data explorer screenshots:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runCaptureWorkflow,
  DEFAULT_ROUTE_KEYS
};
