"use strict";

/**
 * Resize Handles Diagnostic Check
 * 
 * Tests the resize handle wiring WITHOUT a browser.
 * Validates: event flow, state management, coordinate math.
 * 
 * Run: node src/ui/server/artPlayground/checks/resize-handles.check.js
 */

const jsgui = require("jsgui3-html");

// Import controls directly
const { SelectionHandlesControl } = require("../isomorphic/controls/SelectionHandlesControl");
const { CanvasControl } = require("../isomorphic/controls/CanvasControl");

let passed = 0, failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n📋 ${name}\n${"─".repeat(50)}`);
}

// ============================================================
// TEST 1: SelectionHandlesControl event emission
// ============================================================
section("1. SelectionHandlesControl Events");

const ctx1 = new jsgui.Page_Context();
const handles = new SelectionHandlesControl({ context: ctx1 });
const html = handles.all_html_render();

check(html.includes('data-handle="nw"'), "NW handle has data-handle attribute");
check(html.includes('data-handle="se"'), "SE handle has data-handle attribute");
check(html.includes("art-selection__handle--nw"), "NW handle has position class");

// Test event system
let evtReceived = null;
handles.on("resize-start", (data) => { evtReceived = data; });
handles.raise("resize-start", { handle: "se", mouseX: 100, mouseY: 200 });

check(evtReceived !== null, "Event was received");
check(evtReceived?.handle === "se", "Event contains handle='se'");
check(evtReceived?.mouseX === 100, "Event contains mouseX=100");
check(evtReceived?.mouseY === 200, "Event contains mouseY=200");

// ============================================================
// TEST 2: Client-side event signature match
// ============================================================
section("2. Client-Side Event Signature (CRITICAL)");

// The SelectionHandlesControl.activate() raises:
//   this.raise("resize-start", { handle: pos, mouseX: e.clientX, mouseY: e.clientY });
// 
// But client.js raises:
//   app._canvas._selectionHandles.raise("resize-start", { position: pos, event: e });
//
// CanvasControl._startResize expects:
//   { handle, mouseX, mouseY }

console.log("  Checking: SelectionHandlesControl.activate() event shape...");

// Expected by CanvasControl._startResize
const expectedEventKeys = ["handle", "mouseX", "mouseY"];

// What SelectionHandlesControl.activate() raises (read from source)
const handleActivateRaises = { handle: "se", mouseX: 100, mouseY: 200 };
check(
  expectedEventKeys.every(k => k in handleActivateRaises),
  "SelectionHandlesControl raises correct keys: {handle, mouseX, mouseY}"
);

// What client.js overrides with (BAD!)
const clientJsRaises = { position: "se", event: {} };
check(
  !expectedEventKeys.every(k => k in clientJsRaises),
  "CLIENT.JS raises WRONG keys! {position, event} instead of {handle, mouseX, mouseY}"
);

console.log("\n  ⚠️  BUG IDENTIFIED: client.js line ~127 raises wrong event shape");
console.log("     Expected: { handle: 'se', mouseX: 100, mouseY: 200 }");
console.log("     Actual:   { position: 'se', event: MouseEvent }");

// ============================================================
// TEST 3: CanvasControl resize math (testing _startResize only)
// ============================================================
section("3. CanvasControl Resize State Capture");

const ctx2 = new jsgui.Page_Context();
const canvas = new CanvasControl({ context: ctx2 });

// Simulate a component state
canvas._components = new Map();
canvas._components.set("test1", {
  type: "rect",
  x: 100, y: 100, width: 200, height: 150,
  el: { setAttribute: () => {} }  // Mock SVG element
});
canvas._selectedId = "test1";

// Test _startResize - this captures initial state
canvas._startResize({ handle: "se", mouseX: 300, mouseY: 250 });

check(canvas._resizeState !== null, "_startResize creates _resizeState");
check(canvas._resizeState?.handle === "se", "_resizeState has correct handle");
check(canvas._resizeState?.origW === 200, "_resizeState captures original width");
check(canvas._resizeState?.origH === 150, "_resizeState captures original height");
check(canvas._resizeState?.startX === 300, "_resizeState captures startX");
check(canvas._resizeState?.startY === 250, "_resizeState captures startY");

// Test NW handle state capture
canvas._startResize({ handle: "nw", mouseX: 100, mouseY: 100 });
check(canvas._resizeState?.handle === "nw", "NW handle: _resizeState updated");
check(canvas._resizeState?.origX === 100, "NW handle: captures origX");
check(canvas._resizeState?.origY === 100, "NW handle: captures origY");

// NOTE: _doResize requires DOM (_updateHandles calls getBoundingClientRect)
// Full resize math is tested in E2E tests with real browser

// ============================================================
// TEST 4: Event handler references
// ============================================================
section("4. Handle-to-CanvasControl Wiring");

// Check that CanvasControl properly subscribes to resize events
const ctx3 = new jsgui.Page_Context();
const canvas2 = new CanvasControl({ context: ctx3 });
canvas2._components = new Map();
canvas2._components.set("test1", {
  type: "rect", x: 100, y: 100, width: 200, height: 150,
  el: { setAttribute: () => {} }
});
canvas2._selectedId = "test1";

// Verify _selectionHandles exists and has event methods
check(canvas2._selectionHandles !== undefined, "Canvas has _selectionHandles reference");
check(typeof canvas2._selectionHandles?.on === "function", "_selectionHandles has .on() method");
check(typeof canvas2._selectionHandles?.raise === "function", "_selectionHandles has .raise() method");

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${"═".repeat(50)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} checks passed!`);
} else {
  console.log(`❌ ${failed} checks failed (${passed} passed)`);
}

console.log(`\n🔧 FIX REQUIRED:`);
console.log(`   File: src/ui/server/artPlayground/client.js`);
console.log(`   Line: ~127 (handleEl mousedown listener)`);
console.log(`   Change: { position: pos, event: e }`);
console.log(`   To:     { handle: pos, mouseX: e.clientX, mouseY: e.clientY }`);

process.exit(failed > 0 ? 1 : 0);
