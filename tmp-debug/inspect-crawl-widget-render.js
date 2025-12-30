"use strict";

const path = require("path");

const jsgui = require("jsgui3-html");
const { createCrawlWidgetControls } = require(path.join(__dirname, "..", "crawl-widget", "ui", "crawlWidgetControlsFactory"));

(async function main() {
  const api = {
    async getCrawlTypes() {
      return [];
    },
    async getNewsSources() {
      return { success: true, sources: [] };
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
  const context = new jsgui.Page_Context();
  const app = new controls.CrawlWidgetAppControl({ context, api });

  const html = app.all_html_render();
  console.log("has tools btn:", html.includes("cw-title-bar__btn--tools"));
  console.log("has tools panel:", html.includes("cw-tools-panel"));

  const idx = html.indexOf("cw-title-bar__controls");
  console.log("title-bar snippet:", html.slice(Math.max(0, idx - 200), idx + 400));
})();
