#!/usr/bin/env node
"use strict";

const { ActivityLogControl } = require("../ActivityLogControl");
const { runRenderCases, assertIncludes, assertNotIncludes } = require("./renderCheckHarness");

function main() {
  const samples = runRenderCases("ActivityLogControl Check", [
    {
      name: "renders recent typed lines",
      ControlClass: ActivityLogControl,
      spec: {
        title: "Crawl log",
        visibleLines: 2,
        lines: [
          { type: "info", timestamp: "10:00:00", text: "Starting" },
          { type: "success", timestamp: "10:00:01", text: "Downloaded https://example.test/a" },
          { type: "error", timestamp: "10:00:02", text: "Failed https://example.test/b", meta: "500" }
        ]
      },
      includes: ["activity-log", "Crawl log", "Downloaded https://example.test/a", "Failed https://example.test/b", "activity-log__row--error", "500"],
      custom: ({ html }) => assertNotIncludes(html, "Starting", "line outside visible window")
    },
    {
      name: "empty state",
      ControlClass: ActivityLogControl,
      spec: { emptyText: "No entries" },
      includes: ["activity-log__empty", "No entries"]
    }
  ]);

  assertIncludes(samples[0].html, "data-line-type=\"success\"", "success data marker");
  console.log("\nSample HTML:\n" + samples[0].html);
  console.log("\nActivityLogControl checks passed");
}

if (require.main === module) main();

module.exports = { main };
