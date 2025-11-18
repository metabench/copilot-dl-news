#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { UrlListingTableControl } = require("../UrlListingTable");

function buildRecords() {
  return [
    {
      id: 101,
      url: "https://news.example.com/story/alpha",
      host: "news.example.com",
      createdAt: "2025-11-14T08:30:00.000Z",
      lastSeenAt: "2025-11-15T01:00:00.000Z",
      lastFetchAt: "2025-11-15T00:00:00.000Z",
      httpStatus: 200
    },
    {
      id: 202,
      url: "https://another.example.org/article",
      host: "another.example.org",
      createdAt: "2025-11-14T04:05:00.000Z",
      lastSeenAt: "2025-11-14T23:10:00.000Z",
      lastFetchAt: null,
      httpStatus: 404
    }
  ];
}

function main() {
  const context = new jsgui.Page_Context();
  const control = new UrlListingTableControl({
    context,
    records: buildRecords(),
    rowOptions: { startIndex: 101 }
  });
  const html = control.all_html_render();
  if (!html.includes("news.example.com")) {
    throw new Error("UrlListingTable check missing expected host entry");
  }
  console.log(html);
  console.log("Rendered", buildRecords().length, "URL rows");
}

if (require.main === module) {
  main();
}
