#!/usr/bin/env node
"use strict";

const jsgui = require("jsgui3-html");
const { SearchExplorerControl } = require("../SearchExplorerControl");

function main() {
  const context = new jsgui.Page_Context();
  const control = new SearchExplorerControl({ context, apiBase: "/api/search-explorer" });
  const html = control.renderHtml();

  const required = [
    'data-search-explorer-root="true"',
    'data-search-form="true"',
    'data-search-input="q"',
    'data-search-input="author"',
    'data-search-filter="domain"',
    'data-search-filter="section"',
    'data-search-results="true"',
  ];

  const missing = required.filter((needle) => !html.includes(needle));
  if (missing.length) {
    throw new Error(`SearchExplorerControl missing markers: ${missing.join(", ")}`);
  }

  console.log(html);
  console.log("Rendered SearchExplorerControl with search, filter, freshness, and results regions");
}

if (require.main === module) {
  main();
}