"use strict";

/**
 * DiagramAtlasAppControl Check Script
 * 
 * Verifies that DiagramAtlasAppControl renders correctly.
 * Run with: node src/ui/server/diagramAtlas/checks/DiagramAtlasAppControl.check.js
 */

const jsgui = require("jsgui3-html");
const { DiagramAtlasAppControl } = require("../");

const SAMPLE_DIAGRAM_DATA = {
  code: {
    summary: {
      fileCount: 150,
      totalBytes: 2048000
    },
    topFiles: [
      { file: "src/modules/crawler.js", bytes: 85000 },
      { file: "src/db/queries.js", bytes: 62000 }
    ],
    sections: [
      { name: "src", files: 100, bytes: 1500000 }
    ]
  },
  db: {
    totalTables: 25,
    tables: [
      { name: "urls", rows: 10000 },
      { name: "articles", rows: 5000 }
    ]
  },
  features: {
    featureCount: 30,
    features: [
      { name: "URL Crawling", status: "active" },
      { name: "Article Extraction", status: "active" }
    ]
  },
  generatedAt: "2025-11-26T10:00:00Z"
};

function createContext() {
  return new jsgui.Page_Context();
}

function checkWithData() {
  console.log("📋 Testing Diagram Atlas with data...");
  const ctx = createContext();
  
  const app = new DiagramAtlasAppControl({
    context: ctx,
    title: "Code + DB Diagram Atlas",
    diagramData: SAMPLE_DIAGRAM_DATA
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has diagram-atlas class", pass: html.includes("diagram-atlas") },
    { name: "has header", pass: html.includes("diagram-atlas__header") },
    { name: "has diagnostics", pass: html.includes("diagram-diagnostics") },
    { name: "has toolbar", pass: html.includes("diagram-toolbar") },
    { name: "has sections container", pass: html.includes("diagram-atlas__sections") },
    { name: "has refresh button", pass: html.includes("diagram-refresh") },
    { name: "contains file count (150)", pass: html.includes("150") },
    { name: "progress shows complete", pass: html.includes("complete") }
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

function checkShellMode() {
  console.log("📋 Testing Diagram Atlas shell mode (no data)...");
  const ctx = createContext();
  
  const app = new DiagramAtlasAppControl({
    context: ctx,
    title: "Loading Diagram Atlas",
    diagramData: null,
    loadingLabel: "Preparing...",
    loadingDetail: "Gathering data..."
  });
  
  const html = app.all_html_render();
  
  const checks = [
    { name: "has diagram-atlas class", pass: html.includes("diagram-atlas") },
    { name: "has placeholder", pass: html.includes("diagram-atlas__placeholder") },
    { name: "progress shows loading", pass: html.includes("loading") },
    { name: "contains loading label", pass: html.includes("Preparing") }
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
  console.log("DiagramAtlasAppControl Verification\n" + "=".repeat(40) + "\n");
  
  const results = [
    checkWithData(),
    checkShellMode()
  ];
  
  const allPassed = results.every(r => r);
  console.log("=".repeat(40));
  console.log(allPassed 
    ? "✅ All checks passed!" 
    : "❌ Some checks failed");
  
  process.exit(allPassed ? 0 : 1);
}

main();
