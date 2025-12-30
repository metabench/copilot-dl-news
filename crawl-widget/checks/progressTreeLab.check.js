"use strict";

const { renderProgressTreeHtml } = require("../ui/telemetry/progressBars");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  const franceChildren = [];
  for (let i = 0; i < 55; i++) {
    franceChildren.push({
      id: `fr-city-${i + 1}`,
      label: `City ${i + 1}`,
      current: i + 1,
      total: 55,
      unit: "steps",
      status: "running"
    });
  }

  const tree = {
    root: {
      id: "countries",
      label: "All Countries",
      current: 3,
      total: 5,
      unit: "countries",
      status: "running",
      children: [
        {
          id: "fr",
          label: "France",
          current: 12,
          total: 40,
          unit: "cities",
          status: "running",
          children: franceChildren
        },
        {
          id: "jp",
          label: "Japan",
          current: 120,
          total: 120,
          unit: "cities",
          status: "done"
        },
        {
          id: "us",
          label: "USA",
          current: 18,
          total: 60,
          unit: "cities",
          status: "running",
          children: [
            { id: "us-ca", label: "California", current: 4, total: 12, unit: "regions", status: "running" }
          ]
        }
      ]
    },
    activePath: ["countries", "fr", "fr-city-12"]
  };

  const html = renderProgressTreeHtml(tree, { maxDepth: 3, maxChildrenPerNode: 18 });

  assert(html.includes("cw-ptree"), "Expected progress tree container");
  assert(html.includes("cw-pbar"), "Expected progress bar markup");
  assert(html.includes("All Countries"), "Expected root label");
  assert(html.includes("France"), "Expected nested label");
  assert(html.includes("Japan"), "Expected nested label");
  assert(html.includes("California"), "Expected deep nested label");
  assert(html.includes("cw-ptree__node--active"), "Expected active-path highlighting class");
  assert(html.includes("… ("), "Expected truncation marker for large child lists");

  console.log("[progressTreeLab.check] OK");
  console.log("\n=== SAMPLE OUTPUT (truncated) ===\n");
  console.log(html.slice(0, 800) + (html.length > 800 ? "…" : ""));
}

try {
  main();
} catch (err) {
  console.error("[progressTreeLab.check] FAILED:", err?.message || err);
  process.exitCode = 1;
}
