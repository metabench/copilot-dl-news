#!/usr/bin/env node
"use strict";

const path = require("path");
const jsgui = require("jsgui3-html");
const { CrawlConfigWorkspaceControl } = require("../CrawlConfigWorkspaceControl");
const { buildWorkspacePayload } = require("../helpers/crawlConfigWorkspaceBuilder");

function loadWorkspaceSpec() {
  const rootDir = path.resolve(__dirname, "../../../..");
  return buildWorkspacePayload({
    rootDir,
    runnerPath: path.join(rootDir, "config", "crawl-runner.json"),
    defaultsPath: path.join(rootDir, "config", "defaults.crawl-runner.json"),
    sequencesDir: path.join(rootDir, "config", "crawl-sequences")
  });
}

function main() {
  const context = new jsgui.Page_Context();
  const spec = loadWorkspaceSpec();
  const control = new CrawlConfigWorkspaceControl({ context, ...spec });
  const html = control.all_html_render();
  if (!html.includes("Crawl Profile") || !html.includes("Config Diff Mini-Map")) {
    throw new Error("Workspace control failed to render expected headings");
  }
  console.log(html);
  console.log(`Rendered workspace with ${spec.groups.length} groups, ${spec.sequenceProfiles.length} profiles, and ${spec.timeline.length} steps`);
}

if (require.main === module) {
  main();
}
