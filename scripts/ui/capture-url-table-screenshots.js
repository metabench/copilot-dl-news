"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const puppeteer = require("puppeteer");

const { openNewsDb } = require("../../src/db/dbAccess");
const { findProjectRoot } = require("../../src/utils/project-root");
const { selectInitialUrls } = require("../../src/db/sqlite/v1/queries/ui/urlListingNormalized");
const { renderHtml, resolveDbPath } = require("../../src/ui/render-url-table");
const {
  buildColumns,
  buildDisplayRows,
  formatDateTime
} = require("../../src/ui/controls/UrlListingTable");

const DEFAULT_LIMITS = [10];
const DEFAULT_VIEWPORT = { width: 1400, height: 900 };
const DEFAULT_CLIP_SELECTOR = ".page-shell";

function parseArgs(argv) {
  const args = { limits: [] };
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
      case "--limits":
      case "-l":
        args.limits.push(next());
        break;
      case "--output-dir":
      case "-o":
        args.outputDir = next();
        break;
      case "--title":
        args.title = next();
        break;
      case "--viewport-width":
        args.viewportWidth = Number(next());
        break;
      case "--viewport-height":
        args.viewportHeight = Number(next());
        break;
      case "--clip-selector":
        args.clipSelector = next();
        break;
      default:
        if (token.startsWith("--")) {
          const [key, value] = token.split("=");
          if (value == null) break;
          if (key === "--db") args.dbPath = value;
          if (key === "--limits") args.limits.push(value);
          if (key === "--output-dir") args.outputDir = value;
          if (key === "--title") args.title = value;
          if (key === "--viewport-width") args.viewportWidth = Number(value);
          if (key === "--viewport-height") args.viewportHeight = Number(value);
          if (key === "--clip-selector") args.clipSelector = value;
        }
        break;
    }
  }
  return args;
}

function sanitizeLimits(rawValues) {
  const pool = Array.isArray(rawValues) && rawValues.length > 0 ? rawValues : DEFAULT_LIMITS;
  const parsed = pool
    .flatMap((value) => String(value).split(/[,\s]+/))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.min(5000, Math.trunc(value)));
  const unique = Array.from(new Set(parsed));
  return unique.length ? unique : DEFAULT_LIMITS;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeHtmlArtifact(outputDir, baseName, html) {
  const target = path.join(outputDir, `${baseName}.html`);
  fs.writeFileSync(target, html, "utf8");
  return target;
}

async function captureScreenshot(page, clipSelector, htmlPath, screenshotPath) {
  const targetUrl = pathToFileURL(htmlPath).href;
  await page.goto(targetUrl, { waitUntil: "networkidle0" });
  if (clipSelector) {
    const target = await page.$(clipSelector);
    if (target) {
      await target.screenshot({ path: screenshotPath });
      return;
    }
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

function buildGallery(htmlArtifacts) {
  const rows = htmlArtifacts
    .map((artifact) => {
      const htmlName = path.basename(artifact.htmlPath);
      const pngName = path.basename(artifact.screenshotPath);
      return `      <li>
        <h2>Limit ${artifact.limit}</h2>
        <p>
          <a href="${htmlName}" target="_blank" rel="noopener">Open HTML</a> ·
          <a href="${pngName}" target="_blank" rel="noopener">View PNG</a>
        </p>
        <img src="${pngName}" alt="URL table preview for limit ${artifact.limit}" loading="lazy" />
      </li>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>URL Table Screenshots</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0 auto; padding: 16px; max-width: 960px; background: #f8fafc; color: #0f172a; }
    h1 { margin-top: 0; }
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 32px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #fff; }
    img { width: 100%; height: auto; border: 1px solid #cbd5f5; border-radius: 4px; background: #fff; }
    a { color: #1d4ed8; }
  </style>
</head>
<body>
  <h1>URL Table Screenshot Gallery</h1>
  <p>Artifacts generated at ${new Date().toISOString()}.</p>
  <ul>
${rows}
  </ul>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = findProjectRoot(__dirname);
  const limits = sanitizeLimits(args.limits);
  const dbPath = resolveDbPath(args.dbPath);
  const outputDir = args.outputDir
    ? path.isAbsolute(args.outputDir)
      ? args.outputDir
      : path.resolve(projectRoot, args.outputDir)
    : path.join(projectRoot, "screenshots", "url-table");
  ensureDir(outputDir);

  const titleBase = args.title || "Crawler URL Snapshot";
  const dbAccess = openNewsDb(dbPath);
  const columns = buildColumns();
  const relativeDb = path.relative(projectRoot, dbPath) || path.basename(dbPath);
  const artifacts = [];

  try {
    for (const limit of limits) {
      const rawRows = selectInitialUrls(dbAccess.db, { limit });
      const rows = buildDisplayRows(rawRows);
      const meta = {
        rowCount: rows.length,
        limit,
        dbLabel: relativeDb,
        generatedAt: formatDateTime(new Date(), true),
        subtitle: `First ${rows.length} URLs (limit ${limit}) from ${relativeDb}`
      };
      const html = renderHtml({ columns, rows, meta, title: `${titleBase} (limit ${limit})` });
      const baseName = `url-table-limit-${limit}`;
      const htmlPath = writeHtmlArtifact(outputDir, baseName, html);
      artifacts.push({ limit, baseName, htmlPath });
    }
  } finally {
    try {
      dbAccess.close();
    } catch (_) {}
  }

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const viewportWidth = Number.isFinite(args.viewportWidth) ? Math.max(800, Math.trunc(args.viewportWidth)) : DEFAULT_VIEWPORT.width;
  const viewportHeight = Number.isFinite(args.viewportHeight) ? Math.max(600, Math.trunc(args.viewportHeight)) : DEFAULT_VIEWPORT.height;
  await page.setViewport({ width: viewportWidth, height: viewportHeight });
  const clipSelector = args.clipSelector || DEFAULT_CLIP_SELECTOR;

  for (const artifact of artifacts) {
    const screenshotPath = path.join(outputDir, `${artifact.baseName}.png`);
    await captureScreenshot(page, clipSelector, artifact.htmlPath, screenshotPath);
    artifact.screenshotPath = screenshotPath;
  }

  await browser.close();

  const galleryPath = path.join(outputDir, "gallery.html");
  const galleryHtml = buildGallery(artifacts);
  fs.writeFileSync(galleryPath, galleryHtml, "utf8");

  const relativeGallery = path.relative(projectRoot, galleryPath);
  console.log(`Screenshot gallery ready: ${relativeGallery}`);
  artifacts.forEach((artifact) => {
    const relHtml = path.relative(projectRoot, artifact.htmlPath);
    const relPng = path.relative(projectRoot, artifact.screenshotPath);
    console.log(`limit ${artifact.limit}: ${relHtml} | ${relPng}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to capture URL table screenshots:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  sanitizeLimits,
  captureScreenshot,
  buildGallery
};
