#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const jsgui = require("jsgui3-html");
const { ConfigMatrixControl } = require("../ConfigMatrixControl");

function loadCrawlRunnerConfig() {
  const configPath = path.resolve(__dirname, "../../../..", "config", "crawl-runner.json");
  const payload = fs.readFileSync(configPath, "utf8");
  return JSON.parse(payload);
}

function buildSections(config) {
  const sourceLabel = "config/crawl-runner.json";
  const shared = config.sharedOverrides || {};
  const properties = [
    {
      key: "mode",
      label: "Execution Mode",
      value: config.mode,
      source: sourceLabel,
      validation: { level: "info", text: "sequence" },
      behaviorSummary: `Sequence: ${config.sequence || "n/a"}`
    },
    {
      key: "startUrl",
      label: "Seed URL",
      value: config.startUrl,
      source: sourceLabel,
      behaviorSummary: "Initial discovery surface"
    }
  ];

  Object.entries(shared).forEach(([key, value]) => {
    properties.push({
      key: `shared.${key}`,
      label: key,
      value,
      unit: key.toLowerCase().includes("concurrency") ? "requests/host" : undefined,
      source: sourceLabel,
      validation: { level: "ok", text: "override" },
      behaviorSummary: key === "concurrency" ? "Limits parallel host fetches" : undefined,
      isOverride: true
    });
  });

  return [
    {
      key: "crawl-runner",
      title: "Crawler Defaults",
      description: "Current crawl-runner.json values",
      properties
    }
  ];
}

function main() {
  const context = new jsgui.Page_Context();
  const config = loadCrawlRunnerConfig();
  const sections = buildSections(config);
  const control = new ConfigMatrixControl({ context, sections });
  const html = control.all_html_render();
  if (!html.includes("Crawler Defaults")) {
    throw new Error("ConfigMatrixControl check did not render expected section title");
  }
  if (!html.includes("config/crawl-runner.json")) {
    throw new Error("ConfigMatrixControl check missing source label");
  }
  console.log(html);
  console.log(`Rendered ${sections[0].properties.length} config rows`);
}

if (require.main === module) {
  main();
}
