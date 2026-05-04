#!/usr/bin/env node
"use strict";

const { ActionButtonGroupControl } = require("../ActionButtonGroupControl");
const { runRenderCases, assertIncludes } = require("./renderCheckHarness");

function main() {
  const samples = runRenderCases("ActionButtonGroupControl Check", [
    {
      name: "horizontal command group",
      ControlClass: ActionButtonGroupControl,
      spec: {
        ariaLabel: "Crawl commands",
        actions: [
          { id: "start", label: "Start", variant: "success" },
          { id: "pause", label: "Pause", variant: "warning", disabled: true },
          { id: "stop", label: "Stop", variant: "danger" }
        ]
      },
      includes: [
        "action-button-group",
        "aria-label=\"Crawl commands\"",
        "data-action-id=\"start\"",
        "action-button-group__button--success",
        "disabled=\"disabled\""
      ],
      counts: [{ needle: "data-action-id=", expected: 3, label: "action buttons" }]
    },
    {
      name: "vertical quiet group",
      ControlClass: ActionButtonGroupControl,
      spec: {
        orientation: "vertical",
        size: "sm",
        actions: [{ id: "refresh", label: "Refresh", variant: "quiet", title: "Refresh data" }]
      },
      includes: ["action-button-group--vertical", "action-button-group--sm", "title=\"Refresh data\"", "Refresh"]
    }
  ]);

  assertIncludes(samples[0].html, "Stop", "stop action label");
  console.log("\nSample HTML:\n" + samples[0].html);
  console.log("\nActionButtonGroupControl checks passed");
}

if (require.main === module) main();

module.exports = { main };
