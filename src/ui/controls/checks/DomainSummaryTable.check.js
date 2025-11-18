#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { DomainSummaryTableControl } = require("../DomainSummaryTable");

function buildEntries() {
  return [
    {
      host: "guardian.example",
      windowArticles: 240,
      allArticles: 1240,
      fetches: 1820,
      lastSavedAt: "2025-11-15T02:15:00.000Z"
    },
    {
      host: "global.example",
      windowArticles: 120,
      allArticles: 980,
      fetches: 1500,
      lastSavedAt: "2025-11-15T00:45:00.000Z"
    }
  ];
}

function main() {
  const context = new jsgui.Page_Context();
  const control = new DomainSummaryTableControl({
    context,
    entries: buildEntries(),
    startIndex: 1
  });
  const html = control.all_html_render();
  if (!html.includes("guardian.example")) {
    throw new Error("DomainSummaryTable check missing expected domain row");
  }
  console.log(html);
  console.log("Rendered domain rows:", buildEntries().length);
}

if (require.main === module) {
  main();
}
