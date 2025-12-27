"use strict";

const path = require("path");
const { createRequire } = require("module");

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "AssertionError";
    throw err;
  }
}

async function main() {
  const crawlWidgetRoot = path.resolve(__dirname, "..");

  // Use server-side jsgui3-html to keep the check deterministic and avoid
  // client activation side-effects (which require a full browser environment).
  const rootRequire = createRequire(path.join(crawlWidgetRoot, "..", "package.json"));
  const jsgui = rootRequire("jsgui3-html");

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

  const context = new jsgui.Page_Context();
  const app = new CrawlWidgetAppControl({ context, api: apiStub });

  const html = app.all_html_render();

  assert(typeof html === "string" && html.length > 100, "Expected rendered HTML output");
  assert(html.includes("cw-title-bar"), "Expected title bar markup");
  assert(html.includes("cw-title-bar__btn--tools"), "Expected tools button markup");
  assert(html.includes("cw-tools-panel"), "Expected tools panel markup");
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
