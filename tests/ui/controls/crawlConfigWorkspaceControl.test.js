"use strict";

const jsgui = require("jsgui3-html");
const { CrawlConfigWorkspaceControl } = require("../../../src/ui/controls/CrawlConfigWorkspaceControl");

describe("CrawlConfigWorkspaceControl", () => {
  test("renders workspace tabs, drawer, timeline, and diff map", () => {
    const context = new jsgui.Page_Context();
    const groups = [
      {
        key: "runner",
        label: "Runner Defaults",
        description: "values from crawl-runner",
        stats: { overrides: 2, summary: "basicArticleDiscovery" },
        sections: [
          {
            key: "core",
            title: "Core",
            properties: [
              { key: "mode", label: "Mode", value: "sequence", source: "config/crawl-runner.json" },
              { key: "startUrl", label: "Seed", value: "https://example.com", source: "config/crawl-runner.json" }
            ]
          }
        ]
      }
    ];

    const timeline = [
      {
        id: "frontpage",
        label: "Fetch front page",
        operation: "downloadFrontpage",
        summary: "Seeds crawl",
        overrides: { priority: "frontpage" },
        impact: { continueOnError: "tolerant" },
        status: { level: "info", text: "resilient" }
      }
    ];

    const diffSummary = [
      {
        key: "runner.concurrency",
        label: "concurrency",
        scope: "runner",
        source: "config/crawl-runner.json",
        defaultValue: 1,
        overrideValue: 2,
        note: "applies globally",
        status: { level: "accent", text: "custom" }
      }
    ];

    const behaviors = [
      {
        key: "concurrency",
        label: "Host Concurrency",
        description: "Stay polite",
        scope: "host",
        mode: "throttle",
        limits: { concurrency: "2 requests/host" },
        status: { level: "ok", text: "active" }
      }
    ];

    const sequenceProfile = {
      name: "basicArticleDiscovery",
      host: "www.theguardian.com",
      startUrl: "https://www.theguardian.com",
      version: "1.0.0",
      stats: { steps: 1, overrides: 1, behaviors: 1 },
      sharedOverrides: { concurrency: 2 }
    };

    const control = new CrawlConfigWorkspaceControl({
      context,
      groups,
      timeline,
      diffSummary,
      behaviors,
      sequenceProfile
    });

    const html = control.all_html_render();
    expect(html).toContain("Runner Defaults");
    expect(html).toContain("Crawl Profile");
    expect(html).toContain("Behavior Timeline");
    expect(html).toContain("Config Diff Mini-Map");
    expect(html).toContain("badge--accent");
  });
});
