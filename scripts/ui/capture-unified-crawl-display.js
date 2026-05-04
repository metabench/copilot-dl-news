"use strict";

const path = require("path");
const {
  captureRouteSet,
  DEFAULT_MOBILE_VIEWPORT,
  parseCaptureArgs
} = require("./lib/screenshotCapture");

const DEFAULT_OUTPUT_DIR = path.join("screenshots", "unified-crawl-display");
const DEFAULT_VIEWPORT = { width: 1440, height: 1000 };
const VIEWPORTS = [
  { key: "desktop", ...DEFAULT_VIEWPORT },
  DEFAULT_MOBILE_VIEWPORT
];

const ROUTES = [
  {
    key: "cloud-crawl",
    appId: "cloud-crawl",
    path: "/?app=cloud-crawl",
    waitSelector: "[data-cloud-crawl-root]",
    readySelector: "[data-cloud-crawl-ready]",
    inspect: inspectUnifiedRoute
  },
  {
    key: "downloads",
    appId: "downloads",
    path: "/?app=downloads",
    waitSelector: ".downloads-list__row",
    inspect: inspectUnifiedRoute
  },
  {
    key: "crawl-status",
    appId: "crawl-status",
    path: "/?app=crawl-status",
    waitSelector: "iframe.app-embed",
    waitForFrameText: ["Manual URL", "No active crawls."],
    inspect: inspectUnifiedRoute
  },
  {
    key: "screenshot-review",
    appId: "screenshot-review",
    path: "/?app=screenshot-review",
    waitSelector: "[data-screenshot-review-root]",
    readySelector: "[data-screenshot-review-ready]",
    inspect: inspectUnifiedRoute
  }
];

async function inspectUnifiedRoute(page) {
  const shellMetrics = await page.evaluate(() => ({
    bbcMentions: ((document.body.innerText || "").match(/bbc\.com/gi) || []).length,
    downloadsStats: Array.from(document.querySelectorAll("[data-downloads-stat]")).reduce((acc, el) => {
      acc[el.dataset.downloadsStat] = (el.textContent || "").trim();
      return acc;
    }, {}),
    cloudCrawlStats: Array.from(document.querySelectorAll("[data-cloud-crawl-stat]")).reduce((acc, el) => {
      acc[el.dataset.cloudCrawlStat] = (el.textContent || "").trim();
      return acc;
    }, {})
  }));

  const iframeTexts = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    try {
      iframeTexts.push({
        url: frame.url(),
        text: await frame.evaluate(() => document.body.innerText.slice(0, 2000))
      });
    } catch (_) {}
  }

  return {
    ...shellMetrics,
    iframeCount: iframeTexts.length,
    iframeTexts,
    iframeLoadingMentions: iframeTexts.reduce((count, entry) => count + ((entry.text.match(/Loading/gi) || []).length), 0)
  };
}

async function run() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const args = parseCaptureArgs(process.argv.slice(2), { outputDir: DEFAULT_OUTPUT_DIR });
  const report = await captureRouteSet({
    routes: ROUTES,
    outputDir: args.outputDir || DEFAULT_OUTPUT_DIR,
    saveScreenshots: args.saveScreenshots,
    saveDomSnapshots: args.saveDomSnapshots,
    headful: args.headful,
    viewports: VIEWPORTS,
    settleMs: 1250,
    serverOptions: {
      baseUrl: args.baseUrl,
      cwd: repoRoot,
      serverPath: path.join("src", "ui", "server", "unifiedApp", "server.js"),
      env: {
        DB_PATH: args.dbPath ? path.resolve(args.dbPath) : path.join(repoRoot, "data", "news.db")
      }
    }
  });

  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  inspectUnifiedRoute,
  run,
  ROUTES,
  VIEWPORTS
};