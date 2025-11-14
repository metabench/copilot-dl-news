"use strict";

const jsgui = require("jsgui3-html");
const { ConfigMatrixControl } = require("../../../src/ui/controls/ConfigMatrixControl");

describe("ConfigMatrixControl", () => {
  test("renders property rows with badges and metadata", () => {
    const context = new jsgui.Page_Context();
    const sections = [
      {
        key: "crawler-defaults",
        title: "Crawler Defaults",
        description: "Baseline crawl parameters",
        properties: [
          {
            key: "concurrency",
            label: "Host Concurrency",
            value: 2,
            unit: "requests/host",
            source: "config/crawl-runner.json",
            validation: { level: "ok", text: "Within safe range" },
            behaviorSummary: "Limits simultaneous host fetches"
          },
          {
            key: "maxDepth",
            label: "Max Depth",
            value: 4,
            source: "config/crawl-runner.json",
            isOverride: true,
            description: "Caps traversal depth"
          }
        ]
      }
    ];

    const control = new ConfigMatrixControl({ context, sections });
    const html = control.all_html_render();

    expect(html).toContain("Crawler Defaults");
    expect(html).toContain("Host Concurrency");
    expect(html).toContain("requests/host");
    expect(html).toContain("config/crawl-runner.json");
    expect(html).toContain("badge--success");
    expect(html).toContain("badge--accent");
  });
});
