"use strict";

/**
 * DiagramToolbarControl Check Script
 * 
 * Verifies the toolbar control renders correctly in isolation.
 * Run with: node src/ui/server/diagramAtlas/checks/DiagramToolbarControl.check.js
 */

const jsgui = require("jsgui3-html");
const { DiagramToolbarControl } = require("../controls/DiagramToolbarControl");

function createContext() {
  return new jsgui.Page_Context();
}

console.log("DiagramToolbarControl Verification");
console.log("========================================\n");

let passed = 0;
let failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

// Test 1: Complete state with snapshot time
console.log("📋 Testing toolbar in complete state...");
{
  const ctx = createContext();
  const toolbar = new DiagramToolbarControl({
    context: ctx,
    snapshotTime: "Nov 26, 2025, 10:30 AM",
    status: "complete",
    progressLabel: "Diagram Atlas ready",
    progressDetail: "Loaded from cached snapshot"
  });
  
  const html = toolbar.all_html_render();
  
  check(html.includes("diagram-toolbar"), "has diagram-toolbar class");
  check(html.includes("diagram-toolbar__status"), "has status card");
  check(html.includes("Snapshot"), "has Snapshot label");
  check(html.includes("Nov 26, 2025, 10:30 AM"), "has snapshot time");
  check(html.includes("diagram-toolbar__actions"), "has actions section");
  check(html.includes("Refresh data"), "has refresh button");
  check(html.includes("data-role=\"diagram-refresh\""), "has refresh data attribute");
  check(html.includes("diagram-toolbar__hint"), "has hint text");
  check(html.includes("diagram-toolbar__progress"), "has progress card");
  check(html.includes("Diagram Atlas ready"), "shows complete label");
  check(html.includes("data-state=\"complete\""), "progress has complete state");
  
  console.log(`  Result: ${passed}/${passed + failed} passed\n`);
}

const completeChecks = passed;
passed = 0;
failed = 0;

// Test 2: Loading state
console.log("📋 Testing toolbar in loading state...");
{
  const ctx = createContext();
  const toolbar = new DiagramToolbarControl({
    context: ctx,
    snapshotTime: "—",
    status: "loading",
    progressLabel: "Preparing Diagram Atlas",
    progressDetail: "Collecting sources and metrics..."
  });
  
  const html = toolbar.all_html_render();
  
  check(html.includes("diagram-toolbar"), "has diagram-toolbar class");
  check(html.includes("Preparing Diagram Atlas"), "shows loading label");
  check(html.includes("data-state=\"loading\""), "progress has loading state");
  check(html.includes("Collecting sources and metrics"), "shows loading detail");
  
  console.log(`  Result: ${passed}/${passed + failed} passed\n`);
}

const loadingChecks = passed;
passed = 0;
failed = 0;

// Test 3: Custom refresh hint
console.log("📋 Testing toolbar with custom hint...");
{
  const ctx = createContext();
  const toolbar = new DiagramToolbarControl({
    context: ctx,
    snapshotTime: "Nov 26, 2025",
    status: "complete",
    refreshHint: "Custom refresh hint text"
  });
  
  const html = toolbar.all_html_render();
  
  check(html.includes("Custom refresh hint text"), "has custom refresh hint");
  
  console.log(`  Result: ${passed}/${passed + failed} passed\n`);
}

const customChecks = passed;
const totalPassed = completeChecks + loadingChecks + customChecks;
const totalTests = 16; // Total checks across all tests

console.log("========================================");
if (totalPassed === totalTests) {
  console.log(`✅ All checks passed! (${totalPassed}/${totalTests})`);
  process.exit(0);
} else {
  console.log(`❌ ${totalTests - totalPassed} checks failed`);
  process.exit(1);
}
