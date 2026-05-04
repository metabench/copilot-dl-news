#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { CloudCrawlPanelControl } = require("../CloudCrawlPanelControl");

function main() {
  const context = new jsgui.Page_Context();
  const control = new CloudCrawlPanelControl({ context });
  const html = control.renderHtml();

  const required = [
    'data-cloud-crawl-root="true"',
    'data-cloud-crawl-api-base="/api/cloud-crawl"',
    'data-cloud-crawl-domains="bbc.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com"',
    'data-cloud-crawl-max-pages="5"',
    'data-cloud-crawl-recent-limit="12"',
    'data-cloud-crawl-since="',
    'data-cloud-crawl-stat="remote"',
    'data-cloud-crawl-stat="activeJobs"',
    'data-cloud-crawl-stat="downloaded"',
    'data-cloud-crawl-stat="errors"',
    'data-cloud-crawl-targets="true"',
    'data-cloud-crawl-domain="bbc.com"',
    'data-cloud-crawl-domain="france24.com"',
    'data-cloud-crawl-recent="true"',
    'data-screenshot-subject="cloud-crawl"',
    'data-screenshot-route="/?app=cloud-crawl"'
  ];

  const missing = required.filter((needle) => !html.includes(needle));
  if (missing.length) {
    throw new Error(`CloudCrawlPanelControl missing markers: ${missing.join(", ")}`);
  }

  console.log(html);
  console.log("Rendered CloudCrawlPanelControl with screenshot route, target grid, status filters, stats, and recent download regions");
}

if (require.main === module) {
  main();
}