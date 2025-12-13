"use strict";

const path = require("path");

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "AssertionError";
    throw err;
  }
}

async function main() {
  const crawlWidgetRoot = path.resolve(__dirname, "..");
  const jsguiPath = path.join(crawlWidgetRoot, "node_modules", "jsgui3-client");

  if (typeof document === "undefined") {
    try {
      const jsdomPath = path.join(crawlWidgetRoot, "..", "node_modules", "jsdom");
      const { JSDOM } = require(jsdomPath);
      const dom = new JSDOM("<!doctype html><html><body></body></html>");
      global.window = dom.window;
      global.document = dom.window.document;
      global.navigator = dom.window.navigator;
    } catch (err) {
      console.log("[crawlWidget.check] Skipping: no DOM available (jsdom not installed at repo root).");
      console.log("[crawlWidget.check] Install with: npm i -D jsdom");
      return;
    }
  }

  let jsgui;
  try {
    jsgui = require(jsguiPath);
  } catch (err) {
    console.log("[crawlWidget.check] Skipping: crawl-widget dependencies not installed.");
    console.log("[crawlWidget.check] Run: cd crawl-widget && npm i");
    return;
  }

  const { createCrawlWidgetControls } = require(path.join(crawlWidgetRoot, "ui", "crawlWidgetControlsFactory"));

  const apiStub = {
    async getCrawlTypes() {
      return [
        { id: "basic", label: "Basic" },
        { id: "intelligent", label: "Intelligent" }
      ];
    },
    async getNewsSources() {
      return {
        success: true,
        sources: [{ label: "Example", url: "https://example.com" }]
      };
    },
    onCrawlLog() {},
    onCrawlProgress() {},
    onCrawlStopped() {},
    onCrawlError() {},
    async getCrawlStatus() {
      return { isRunning: false, isPaused: false };
    }
  };

  const controls = createCrawlWidgetControls(jsgui);
  const { CrawlWidgetAppControl } = controls;

  const context = new jsgui.Client_Page_Context();
  const app = new CrawlWidgetAppControl({ context, api: apiStub });

  const html = app.all_html_render();

  assert(typeof html === "string" && html.length > 100, "Expected rendered HTML output");
  assert(html.includes("cw-title-bar"), "Expected title bar markup");
  assert(html.includes("cw-control-buttons"), "Expected control buttons markup");
  assert(html.includes("cw-progress-panel"), "Expected progress panel markup");
  assert(html.includes("cw-log-viewer"), "Expected log viewer markup");
  assert(html.includes("cw-log-action-btn--copy"), "Expected log copy action button");
  assert(html.includes("cw-log-action-btn--clear"), "Expected log clear action button");

  console.log("[crawlWidget.check] OK");
}

main().catch((err) => {
  console.error("[crawlWidget.check] FAILED:", err);
  process.exitCode = 1;
});
