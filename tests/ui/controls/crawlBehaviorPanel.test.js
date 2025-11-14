"use strict";

const jsgui = require("jsgui3-html");
const { CrawlBehaviorPanelControl } = require("../../../src/ui/controls/CrawlBehaviorPanel");

describe("CrawlBehaviorPanelControl", () => {
  test("renders behavior cards with details", () => {
    const context = new jsgui.Page_Context();
    const behaviors = [
      {
        key: "robots",
        label: "Robots Compliance",
        description: "Always fetch robots.txt and respect disallow rules",
        scope: "host",
        mode: "policy",
        impact: { "queue pruning": "excludes blocked paths" },
        derivedFrom: ["config/crawl-runner.json#respectRobots"],
        cues: ["robots:allow", "robots:disallow"],
        status: { level: "ok", text: "active" }
      }
    ];

    const control = new CrawlBehaviorPanelControl({ context, behaviors });
    const html = control.all_html_render();

    expect(html).toContain("Robots Compliance");
    expect(html).toContain("policy");
    expect(html).toContain("Derived From");
    expect(html).toContain("config/crawl-runner.json#respectRobots");
    expect(html).toContain("badge--success");
  });
});
