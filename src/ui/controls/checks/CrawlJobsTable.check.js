#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { CrawlJobsTableControl } = require("../CrawlJobsTable");

function buildJobs() {
  return [
    {
      id: 987,
      status: "Completed",
      crawlType: "Daily Crawl",
      startedAt: "2025-11-15T01:00:00.000Z",
      endedAt: "2025-11-15T02:10:00.000Z",
      url: "https://news.example.com/seed"
    },
    {
      id: 988,
      status: "Running",
      crawlType: "Intensive Crawl",
      startedAt: "2025-11-15T04:05:00.000Z",
      endedAt: null,
      url: "https://another.example.org/seed"
    }
  ];
}

function main() {
  const context = new jsgui.Page_Context();
  const control = new CrawlJobsTableControl({
    context,
    entries: buildJobs()
  });
  const html = control.all_html_render();
  if (!html.includes("Daily Crawl")) {
    throw new Error("CrawlJobsTable check missing expected crawl type");
  }
  console.log(html);
  console.log("Rendered crawl rows:", buildJobs().length);
}

if (require.main === module) {
  main();
}
