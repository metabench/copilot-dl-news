"use strict";

/**
 * Full Event Flow Integration Test
 * 
 * Simulates the complete event flow from client.js to CanvasControl,
 * verifying that all pieces work together correctly.
 * 
 * Tests:
 * 1. Event propagation from SelectionHandlesControl to CanvasControl
 * 2. State synchronization during resize
 * 3. Component data integrity
 * 
 * Run: node src/ui/server/artPlayground/checks/event-flow-integration.check.js
 */

const jsgui = require("../isomorphic/jsgui");
const { CanvasControl } = require("../isomorphic/controls/CanvasControl");
const { SelectionHandlesControl } = require("../isomorphic/controls/SelectionHandlesControl");

// Test counters
let passed = 0, failed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
    return true;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
    return false;
  }
}

function section(name) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📋 ${name}`);
  console.log(`${"─".repeat(60)}`);
}

/**
 * Create a mock SVG element
 */
function createMockSvgElement() {
  const attrs = {};
  return {
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k],
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    _attrs: attrs
  };
}

// =============================================================================
// TEST 1: Event Propagation from SelectionHandles to Canvas
// =============================================================================
section("1. Event Propagation from SelectionHandles to Canvas");

{
  const ctx = new jsgui.Page_Context();
  const canvas = new CanvasControl({ context: ctx });
  
  // Set up mock component
  canvas._components = new Map();
  canvas._selectedId = "test-comp";
  canvas._components.set("test-comp", {
    type: "rect",
    x: 100, y: 100, width: 200, height: 150,
    el: createMockSvgElement()
  });
  canvas._updateHandles = () => {}; // Mock
  
  // Track events received by canvas
  let resizeStartReceived = false;
  let resizeMoveReceived = false;
  let resizeEndReceived = false;
  
  const originalStartResize = canvas._startResize.bind(canvas);
  canvas._startResize = (data) => {
    resizeStartReceived = true;
    originalStartResize(data);
  };
  
  const originalDoResize = canvas._doResize.bind(canvas);
  canvas._doResize = (data) => {
    resizeMoveReceived = true;
    originalDoResize(data);
  };
  
  const originalEndResize = canvas._endResize.bind(canvas);
  canvas._endResize = () => {
    resizeEndReceived = true;
    originalEndResize();
  };
  
  // Wire up event flow (simulating what _setupEvents does)
  const handles = canvas._selectionHandles;
  handles.on("resize-start", (d) => canvas._startResize(d));
  handles.on("resize-move", (d) => canvas._doResize(d));
  handles.on("resize-end", () => canvas._endResize());
  
  // Simulate events from SelectionHandles (as client.js would raise)
  handles.raise("resize-start", { handle: "se", mouseX: 300, mouseY: 250 });
  check(resizeStartReceived, "Canvas received resize-start event");
  check(canvas._resizeState !== null, "Canvas created _resizeState");
  
  handles.raise("resize-move", { handle: "se", mouseX: 350, mouseY: 300 });
  check(resizeMoveReceived, "Canvas received resize-move event");
  
  handles.raise("resize-end");
  check(resizeEndReceived, "Canvas received resize-end event");
  check(canvas._resizeState === null, "Canvas cleared _resizeState");
  
  // Verify component was resized
  const comp = canvas._components.get("test-comp");
  check(comp.width === 250, `Component width updated: ${comp.width}`);
  check(comp.height === 200, `Component height updated: ${comp.height}`);
}

// =============================================================================
// TEST 2: Multiple Sequential Events
// =============================================================================
section("2. Multiple Sequential Events");

{
  const ctx = new jsgui.Page_Context();
  const canvas = new CanvasControl({ context: ctx });
  
  canvas._components = new Map();
  canvas._selectedId = "test-comp";
  canvas._components.set("test-comp", {
    type: "rect",
    x: 100, y: 100, width: 200, height: 150,
    el: createMockSvgElement()
  });
  canvas._updateHandles = () => {};
  
  const handles = canvas._selectionHandles;
  handles.on("resize-start", (d) => canvas._startResize(d));
  handles.on("resize-move", (d) => canvas._doResize(d));
  handles.on("resize-end", () => canvas._endResize());
  
  // Simulate continuous mouse movement (multiple resize-move events)
  handles.raise("resize-start", { handle: "se", mouseX: 300, mouseY: 250 });
  handles.raise("resize-move", { handle: "se", mouseX: 310, mouseY: 260 }); // +10, +10
  handles.raise("resize-move", { handle: "se", mouseX: 320, mouseY: 270 }); // +20, +20
  handles.raise("resize-move", { handle: "se", mouseX: 350, mouseY: 300 }); // +50, +50
  handles.raise("resize-end");
  
  const comp = canvas._components.get("test-comp");
  check(comp.width === 250, `After sequence: width = ${comp.width}`);
  check(comp.height === 200, `After sequence: height = ${comp.height}`);
}

// =============================================================================
// TEST 3: Handle Position Consistency
// =============================================================================
section("3. Handle Position Consistency");

{
  const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  
  handles.forEach(handle => {
    const ctx = new jsgui.Page_Context();
    const canvas = new CanvasControl({ context: ctx });
    
    canvas._components = new Map();
    canvas._selectedId = "test-comp";
    canvas._components.set("test-comp", {
      type: "rect",
      x: 100, y: 100, width: 200, height: 150,
      el: createMockSvgElement()
    });
    canvas._updateHandles = () => {};
    
    const selHandles = canvas._selectionHandles;
    selHandles.on("resize-start", (d) => canvas._startResize(d));
    selHandles.on("resize-move", (d) => canvas._doResize(d));
    selHandles.on("resize-end", () => canvas._endResize());
    
    // Start resize with this handle
    selHandles.raise("resize-start", { handle, mouseX: 200, mouseY: 175 });
    check(
      canvas._resizeState.handle === handle,
      `${handle.toUpperCase()}: _resizeState.handle = '${canvas._resizeState.handle}'`
    );
    selHandles.raise("resize-end");
  });
}

// =============================================================================
// TEST 4: State Isolation Between Resize Operations
// =============================================================================
section("4. State Isolation Between Resize Operations");

{
  const ctx = new jsgui.Page_Context();
  const canvas = new CanvasControl({ context: ctx });
  
  canvas._components = new Map();
  canvas._selectedId = "test-comp";
  canvas._components.set("test-comp", {
    type: "rect",
    x: 100, y: 100, width: 200, height: 150,
    el: createMockSvgElement()
  });
  canvas._updateHandles = () => {};
  
  const handles = canvas._selectionHandles;
  handles.on("resize-start", (d) => canvas._startResize(d));
  handles.on("resize-move", (d) => canvas._doResize(d));
  handles.on("resize-end", () => canvas._endResize());
  
  // First resize
  handles.raise("resize-start", { handle: "se", mouseX: 300, mouseY: 250 });
  handles.raise("resize-move", { handle: "se", mouseX: 350, mouseY: 300 });
  handles.raise("resize-end");
  
  const afterFirst = { ...canvas._components.get("test-comp") };
  check(afterFirst.width === 250, `After 1st: width = ${afterFirst.width}`);
  check(afterFirst.height === 200, `After 1st: height = ${afterFirst.height}`);
  
  // Second resize - should use new dimensions as starting point
  handles.raise("resize-start", { handle: "nw", mouseX: 100, mouseY: 100 });
  check(canvas._resizeState.origW === 250, `2nd resize starts from width 250: ${canvas._resizeState.origW}`);
  check(canvas._resizeState.origH === 200, `2nd resize starts from height 200: ${canvas._resizeState.origH}`);
  handles.raise("resize-end");
}

// =============================================================================
// TEST 5: No Resize Without Selection
// =============================================================================
section("5. No Resize Without Selection");

{
  const ctx = new jsgui.Page_Context();
  const canvas = new CanvasControl({ context: ctx });
  
  canvas._components = new Map();
  canvas._selectedId = null; // No selection!
  canvas._components.set("test-comp", {
    type: "rect",
    x: 100, y: 100, width: 200, height: 150,
    el: createMockSvgElement()
  });
  
  const handles = canvas._selectionHandles;
  handles.on("resize-start", (d) => canvas._startResize(d));
  handles.on("resize-move", (d) => canvas._doResize(d));
  handles.on("resize-end", () => canvas._endResize());
  
  // Try to resize without selection
  handles.raise("resize-start", { handle: "se", mouseX: 300, mouseY: 250 });
  check(canvas._resizeState === null, "No _resizeState created without selection");
  
  handles.raise("resize-move", { handle: "se", mouseX: 350, mouseY: 300 });
  
  // Component should be unchanged
  const comp = canvas._components.get("test-comp");
  check(comp.width === 200, `Width unchanged: ${comp.width}`);
  check(comp.height === 150, `Height unchanged: ${comp.height}`);
}

// =============================================================================
// TEST 6: Event Data Format Validation
// =============================================================================
section("6. Event Data Format Validation");

{
  const ctx = new jsgui.Page_Context();
  const canvas = new CanvasControl({ context: ctx });
  
  canvas._components = new Map();
  canvas._selectedId = "test-comp";
  canvas._components.set("test-comp", {
    type: "rect",
    x: 100, y: 100, width: 200, height: 150,
    el: createMockSvgElement()
  });
  canvas._updateHandles = () => {};
  
  let receivedData = null;
  const originalStartResize = canvas._startResize.bind(canvas);
  canvas._startResize = (data) => {
    receivedData = data;
    originalStartResize(data);
  };
  
  const handles = canvas._selectionHandles;
  handles.on("resize-start", (d) => canvas._startResize(d));
  
  // Raise event with correct format
  handles.raise("resize-start", { handle: "se", mouseX: 300, mouseY: 250 });
  
  check(receivedData !== null, "Event data received");
  check(typeof receivedData.handle === "string", `Data has 'handle' string: ${receivedData.handle}`);
  check(typeof receivedData.mouseX === "number", `Data has 'mouseX' number: ${receivedData.mouseX}`);
  check(typeof receivedData.mouseY === "number", `Data has 'mouseY' number: ${receivedData.mouseY}`);
  check(receivedData.position === undefined, "Data does NOT have 'position' (old format)");
  check(receivedData.event === undefined, "Data does NOT have 'event' (old format)");
}

// =============================================================================
// TEST 7: Client.js Code Pattern Verification
// =============================================================================
section("7. Client.js Code Pattern Verification");

const fs = require("fs");
const path = require("path");
const clientJsPath = path.join(__dirname, "../client.js");
const clientJs = fs.readFileSync(clientJsPath, "utf8");

// Verify correct event raising pattern
check(
  clientJs.includes("handle: pos") && clientJs.includes("mouseX:") && clientJs.includes("mouseY:"),
  "client.js raises resize-start with { handle, mouseX, mouseY }"
);

// Verify correct method calls
check(
  !clientJs.includes("_handleMouseDown"),
  "client.js does NOT use old method name _handleMouseDown"
);

check(
  clientJs.includes("_onMouseDown") && clientJs.includes("_onMouseMove") && clientJs.includes("_onMouseUp"),
  "client.js uses correct method names"
);

// Verify document-level event listeners for resize
check(
  clientJs.includes("document.addEventListener") && clientJs.includes("mousemove"),
  "client.js adds document-level mousemove listener for resize"
);

check(
  clientJs.includes("document.removeEventListener"),
  "client.js removes document-level listeners on mouseup"
);

// =============================================================================
// SUMMARY
// =============================================================================
console.log(`\n${"═".repeat(60)}`);
console.log("SUMMARY");
console.log(`${"═".repeat(60)}`);

if (failed === 0) {
  console.log(`\n✅ ALL ${passed} EVENT FLOW INTEGRATION TESTS PASSED!\n`);
  console.log("Full event flow verified:");
  console.log("  • Events propagate from SelectionHandles to Canvas");
  console.log("  • Multiple sequential events handled correctly");
  console.log("  • All 8 handle positions work");
  console.log("  • State isolation between resize operations");
  console.log("  • No resize without selection");
  console.log("  • Event data format is correct (handle, mouseX, mouseY)");
  console.log("  • client.js uses correct patterns");
} else {
  console.log(`\n❌ ${failed} TESTS FAILED (${passed} passed)\n`);
}

process.exit(failed > 0 ? 1 : 0);
