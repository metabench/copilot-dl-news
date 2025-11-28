"use strict";

/**
 * ContextMenuControl Check Script
 * 
 * Verifies that the ContextMenuControl and ColumnContextMenuControl
 * render correctly and can be activated.
 * 
 * Run with: node src/ui/server/docsViewer/client/checks/ContextMenuControl.check.js
 */

const path = require("path");

// Mock DOM for testing - must be set BEFORE requiring jsgui3-client
const mockDocument = {
  activeElement: null,
  eventListeners: new Map(),
  addEventListener(type, fn) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, []);
    }
    this.eventListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    if (this.eventListeners.has(type)) {
      const listeners = this.eventListeners.get(type);
      const index = listeners.indexOf(fn);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  },
  querySelectorAll() { return []; },
  querySelector() { return null; }
};

// Mock window - must be set BEFORE requiring jsgui3-client
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  location: { href: "http://localhost:4700/" },
  addEventListener(type, fn) {},
  removeEventListener(type, fn) {}
};
global.document = mockDocument;

// Now require the controls
const { ContextMenuControl } = require("../controls/ContextMenuControl");
const { ColumnContextMenuControl } = require("../controls/ColumnContextMenuControl");

console.log("ContextMenuControl Check Script");
console.log("========================================\n");

let totalPassed = 0;
let totalFailed = 0;

function check(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    totalPassed++;
  } else {
    console.log(`  ❌ ${name}`);
    totalFailed++;
  }
}

// Test 1: ContextMenuControl instantiation
console.log("📋 Testing ContextMenuControl instantiation...");
{
  const control = new ContextMenuControl({});
  
  check(control.__type_name === "context_menu", "has correct __type_name");
  check(typeof control.show === "function", "has show method");
  check(typeof control.hide === "function", "has hide method");
  check(typeof control.toggle === "function", "has toggle method");
  check(typeof control.isVisible === "function", "has isVisible method");
  check(typeof control.activate === "function", "has activate method");
  check(control._isVisible === false, "starts not visible");
}

// Test 2: ColumnContextMenuControl instantiation
console.log("\n📋 Testing ColumnContextMenuControl instantiation...");
{
  const control = new ColumnContextMenuControl({});
  
  check(control.__type_name === "column_context_menu", "has correct __type_name");
  check(typeof control.show === "function", "inherits show method");
  check(typeof control.hide === "function", "inherits hide method");
  check(typeof control._handleColumnToggle === "function", "has column toggle handler");
}

// Test 3: ContextMenuControl with callbacks
console.log("\n📋 Testing callbacks...");
{
  let closeCalled = false;
  let selectCalled = false;
  
  const control = new ContextMenuControl({
    onClose: () => { closeCalled = true; },
    onSelect: () => { selectCalled = true; }
  });
  
  check(typeof control.onClose === "function", "accepts onClose callback");
  check(typeof control.onSelect === "function", "accepts onSelect callback");
  
  // Test that calling onClose triggers the callback
  control.onClose();
  check(closeCalled === true, "onClose callback is callable");
}

// Test 4: Activation guard
console.log("\n📋 Testing activation guard...");
{
  const control = new ContextMenuControl({});
  
  check(control.__active !== true, "starts not active");
  
  // Activate without DOM element (should set __active but not fail)
  control.activate();
  check(control.__active === true, "activate sets __active flag");
  
  // Second activation should be no-op
  control.activate();
  check(control.__active === true, "second activation is no-op");
}

// Summary
console.log("\n========================================");
if (totalFailed === 0) {
  console.log(`✅ All checks passed! (${totalPassed}/${totalPassed})`);
  process.exit(0);
} else {
  console.log(`❌ ${totalFailed} checks failed`);
  process.exit(1);
}
