#!/usr/bin/env node
"use strict";

const { CrawlProgressPanelControl } = require("../CrawlProgressPanelControl");
const { runRenderCases, assertIncludes } = require("./renderCheckHarness");

function main() {
  const samples = runRenderCases("CrawlProgressPanelControl Check", [
    {
      name: "running crawl with determinate progress",
      ControlClass: CrawlProgressPanelControl,
      spec: {
        title: "Simple distributed crawl",
        progress: {
          visited: 5,
          queued: 2,
          articles: 4,
          errors: 0,
          total: 10,
          phase: "acquisition",
          currentUrl: "https://www.bbc.com/news/example-article"
        }
      },
      includes: [
        "crawl-progress-panel",
        "Simple distributed crawl",
        "Running",
        "https://www.bbc.com/news/example-article",
        "crawl-progress-panel__phase--active",
        "progress-bar",
        "50%",
        ">5<",
        ">2<",
        ">4<"
      ]
    },
    {
      name: "throttled indeterminate crawl",
      ControlClass: CrawlProgressPanelControl,
      spec: {
        progress: {
          visited: 12,
          queued: 0,
          errors: 1,
          phase: "discovery",
          throttled: true,
          throttleReason: "rate-limit",
          throttleDomain: "example.test"
        }
      },
      includes: ["Throttled", "Throttle: rate-limit (example.test)", "progress-bar--indeterminate", "progress-bar--ruby"]
    }
  ]);

  assertIncludes(samples[0].html, "Visited", "visited stat label");
  console.log("\nSample HTML:\n" + samples[0].html);
  console.log("\nCrawlProgressPanelControl checks passed");
}

if (require.main === module) main();

module.exports = { main };
