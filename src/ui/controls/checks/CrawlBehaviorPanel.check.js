#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");
const { CrawlBehaviorPanelControl } = require("../CrawlBehaviorPanel");

function loadConfig(file) {
  const configPath = path.resolve(__dirname, "../../../..", file);
  const payload = fs.readFileSync(configPath, "utf8");
  return JSON.parse(payload);
}

function buildBehaviors(crawlRunner) {
  const shared = crawlRunner.sharedOverrides || {};
  const behaviors = [];
  if (typeof shared.concurrency === "number") {
    behaviors.push({
      key: "host-concurrency",
      label: "Host Concurrency",
      description: "Controls simultaneous fetches per host to stay polite",
      scope: "host",
      mode: "throttle",
      limits: { concurrency: `${shared.concurrency} requests/host` },
      derivedFrom: ["config/crawl-runner.json#sharedOverrides.concurrency"],
      status: { level: "ok", text: "active" }
    });
  }
  if (typeof shared.maxDownloads === "number") {
    behaviors.push({
      key: "download-budget",
      label: "Download Budget",
      description: "Stops crawls once the maximum download budget is met",
      scope: "crawl",
      mode: "budget",
      limits: { maxDownloads: shared.maxDownloads },
      derivedFrom: ["config/crawl-runner.json#sharedOverrides.maxDownloads"],
      status: { level: "info", text: "cap" }
    });
  }
  behaviors.push({
    key: "robots",
    label: "Robots Compliance",
    description: "Fetch robots.txt before queueing URLs; obey disallow rules",
    scope: "host",
    mode: "policy",
    cues: ["robots:allow", "robots:disallow"],
    derivedFrom: ["config/crawl-runner.json"],
    status: { level: "ok", text: "enabled" }
  });
  return behaviors;
}

function main() {
  const context = new jsgui.Page_Context();
  const crawlRunner = loadConfig("config/crawl-runner.json");
  const behaviors = buildBehaviors(crawlRunner);
  const control = new CrawlBehaviorPanelControl({ context, behaviors });
  const html = control.all_html_render();
  if (!html.includes("Host Concurrency")) {
    throw new Error("CrawlBehaviorPanel check did not render concurrency behavior");
  }
  console.log(html);
  console.log(`Rendered ${behaviors.length} crawl behavior cards`);
}

if (require.main === module) {
  main();
}
