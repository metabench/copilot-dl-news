"use strict";

const { getDefaultTelemetryPanels } = require("../ui/telemetry/telemetryPanels");

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "AssertionError";
    throw err;
  }
}

function main() {
  const panels = getDefaultTelemetryPanels();
  const panel = panels.find((p) => p.id === "progress-tree");
  assert(panel, "Expected progress-tree panel to exist");

  const evt = {
    type: "crawl:progress-tree:updated",
    timestamp: new Date().toISOString(),
    severity: "debug",
    data: {
      root: {
        id: "countries",
        label: "All Countries",
        current: 1,
        total: 3,
        unit: "countries",
        status: "running",
        children: [
          { id: "fr", label: "France", current: 4, total: 10, unit: "cities", status: "running" },
          { id: "jp", label: "Japan", current: 10, total: 10, unit: "cities", status: "done" }
        ]
      },
      activePath: ["countries", "fr"]
    }
  };

  assert(panel.match(evt), "Expected progress-tree panel match");
  const state = panel.reduce(undefined, evt);
  const rendered = panel.render(state, { events: [evt] });

  assert(rendered && typeof rendered === "object", "Expected rendered panel object");
  assert(typeof rendered.bodyHtml === "string" && rendered.bodyHtml.includes("cw-pbar"), "Expected nested progress markup");

  console.log("[progressTreeTelemetryPanel.check] OK");
}

main();
