"use strict";

/**
 * ExplorerAppControl Check Script
 * 
 * Verifies that ExplorerAppControl renders correctly for all view types.
 * Run with: node src/ui/server/dataExplorer/checks/ExplorerAppControl.check.js
 */

const jsgui = require("jsgui3-html");
const { ExplorerAppControl, VIEW_TYPES } = require("../");
const { buildDisplayRows, buildColumns } = require("../../../controls/UrlListingTable");
const { buildDomainSummaryColumns, buildDomainSummaryRows } = require("../../../controls/DomainSummaryTable");

const SAMPLE_URL_RECORDS = [
  { id: 1, url: "https://example.com/article1", host: "example.com" },
  { id: 2, url: "https://test.org/page", host: "test.org" }
];

const SAMPLE_DOMAIN_ENTRIES = [
  { host: "example.com", windowArticles: 10, allArticles: 100, fetches: 500 },
  { host: "test.org", windowArticles: 5, allArticles: 50, fetches: 200 }
];

function createContext() {
  return new jsgui.Page_Context();
}

function checkUrlListing() {
  console.log("📋 Testing URL Listing View...");
  const ctx = createContext();
  const cols = buildColumns();
  const rows = buildDisplayRows(SAMPLE_URL_RECORDS);
  
  const app = new ExplorerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.URLS,
    title: "Crawler URL Snapshot",
    navLinks: [
      { key: "home", href: "/", label: "Home" },
      { key: "urls", href: "/urls", label: "URLs", active: true },
      { key: "domains", href: "/domains", label: "Domains" }
    ],
    columns: cols,
    rows: rows,
    meta: {
      rowCount: rows.length,
      dbLabel: "data/news.db",
      generatedAt: "2025-11-26 10:00 UTC"
    }
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has ui-table class", pass: html.includes("ui-table") },
    { name: "has nav", pass: html.includes("data-explorer__nav") },
    { name: "has header", pass: html.includes("data-explorer__header") },
    { name: "has footer", pass: html.includes("data-explorer__footer") },
    { name: "contains example.com", pass: html.includes("example.com") },
    { name: "has active nav item", pass: html.includes("data-explorer__nav-item--active") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function checkDomainListing() {
  console.log("📋 Testing Domain Listing View...");
  const ctx = createContext();
  const cols = buildDomainSummaryColumns();
  const rows = buildDomainSummaryRows(SAMPLE_DOMAIN_ENTRIES);
  
  const app = new ExplorerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.DOMAINS,
    title: "Recent Domain Activity",
    columns: cols,
    rows: rows,
    navLinks: [{ key: "domains", href: "/domains", label: "Domains", active: true }]
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has ui-table class", pass: html.includes("ui-table") },
    { name: "contains example.com", pass: html.includes("example.com") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function checkDashboard() {
  console.log("📋 Testing Dashboard View...");
  const ctx = createContext();
  
  const app = new ExplorerAppControl({
    context: ctx,
    viewType: VIEW_TYPES.DASHBOARD,
    title: "Crawler Operations Dashboard",
    homeCards: [
      { title: "Total URLs", value: "1,234", variant: "primary" },
      { title: "Active Crawls", value: "3", variant: "info" }
    ],
    navLinks: [{ key: "home", href: "/", label: "Home", active: true }]
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has cards container", pass: html.includes("data-explorer__cards") },
    { name: "has card element", pass: html.includes("data-explorer__card") },
    { name: "contains Total URLs", pass: html.includes("Total URLs") },
    { name: "contains value", pass: html.includes("1,234") }
  ];
  
  let passed = 0;
  for (const check of checks) {
    const status = check.pass ? "✅" : "❌";
    console.log(`  ${status} ${check.name}`);
    if (check.pass) passed++;
  }
  
  console.log(`  Result: ${passed}/${checks.length} passed\n`);
  return passed === checks.length;
}

function main() {
  console.log("ExplorerAppControl Verification\n" + "=".repeat(40) + "\n");
  
  const results = [
    checkUrlListing(),
    checkDomainListing(),
    checkDashboard()
  ];
  
  const allPassed = results.every(r => r);
  console.log("=".repeat(40));
  console.log(allPassed 
    ? "✅ All checks passed!" 
    : "❌ Some checks failed");
  
  process.exit(allPassed ? 0 : 1);
}

main();
