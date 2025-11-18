"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const { createDiagramAtlasServer } = require("../../src/ui/server/diagramAtlasServer");
const { findProjectRoot } = require("../../src/utils/project-root");

const DEFAULT_VIEWPORT = { width: 1600, height: 1200 };
const DEFAULT_CLIP_SELECTOR = "[data-role=\"diagram-shell\"]";
const DEFAULT_DELAY_MS = 1500;
const MAX_SCREENSHOT_HEIGHT = 1200;

function parseArgs(argv) {
  const args = {
    viewport: { ...DEFAULT_VIEWPORT },
    clipSelector: DEFAULT_CLIP_SELECTOR,
    delay: DEFAULT_DELAY_MS,
    title: "Diagram Atlas"
  };
  const tokens = Array.isArray(argv) ? argv.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    const next = () => tokens[++i];
    switch (token) {
      case "--output":
      case "-o":
        args.output = next();
        break;
      case "--viewport-width":
        args.viewport.width = Number(next());
        break;
      case "--viewport-height":
        args.viewport.height = Number(next());
        break;
      case "--clip":
      case "--clip-selector":
        args.clipSelector = next();
        break;
      case "--delay":
        args.delay = Number(next());
        break;
      case "--title":
        args.title = next();
        break;
      case "--url":
        args.url = next();
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (!value) break;
          if (key === "--output") args.output = value;
          if (key === "--viewport-width") args.viewport.width = Number(value);
          if (key === "--viewport-height") args.viewport.height = Number(value);
          if (key === "--clip" || key === "--clip-selector") args.clipSelector = value;
          if (key === "--delay") args.delay = Number(value);
          if (key === "--title") args.title = value;
          if (key === "--url") args.url = value;
        }
        break;
    }
  }
  return args;
}

function ensureDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function normalizeViewport(raw) {
  const width = Number.isFinite(raw.width) ? Math.max(800, Math.trunc(raw.width)) : DEFAULT_VIEWPORT.width;
  const requestedHeight = Number.isFinite(raw.height) ? Math.max(600, Math.trunc(raw.height)) : DEFAULT_VIEWPORT.height;
  const height = Math.min(MAX_SCREENSHOT_HEIGHT, requestedHeight);
  return { width, height };
}

async function startServer(options = {}) {
  const { app } = createDiagramAtlasServer({ title: options.title });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
    server.once("error", reject);
  });
}

async function captureScreenshot(page, url, clipSelector, outputPath, delayMs) {
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForSelector(clipSelector || DEFAULT_CLIP_SELECTOR, { timeout: 10000 }).catch(() => null);
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
        await page.screenshot({ path: outputPath, clip: { x: clipX, y: clipY, width: clipWidth, height: clipHeight } });
        return;
      }
    }
  }
  await page.screenshot({ path: outputPath, fullPage: false });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = findProjectRoot(__dirname);
  const outputPath = args.output
    ? path.isAbsolute(args.output)
      ? args.output
      : path.join(projectRoot, args.output)
    : path.join(projectRoot, "screenshots", "diagram-atlas", "diagram-atlas.png");
  ensureDir(outputPath);

  const viewport = normalizeViewport(args.viewport || {});
  const clipSelector = args.clipSelector || DEFAULT_CLIP_SELECTOR;
  const delay = Number.isFinite(args.delay) ? Math.max(0, args.delay) : DEFAULT_DELAY_MS;

  const serverContext = args.url ? null : await startServer({ title: args.title });
  const baseUrl = args.url || `http://127.0.0.1:${serverContext.port}/diagram-atlas?ssr=1`;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport(viewport);

  try {
    await captureScreenshot(page, baseUrl, clipSelector, outputPath, delay);
    const relative = path.relative(projectRoot, outputPath);
    console.log(`Diagram atlas screenshot saved to ${relative}`);
  } finally {
    await browser.close();
    if (serverContext && serverContext.server) {
      await new Promise((resolve) => serverContext.server.close(resolve));
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to capture diagram atlas screenshot:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  captureScreenshot
};
