"use strict";

/**
 * HTTP Integration Test for Art Playground Resize Handles
 * 
 * Tests the actual server without browser automation:
 * 1. Verify server renders correct HTML structure
 * 2. Verify client.js bundle is served and loadable
 * 3. Verify styles are served correctly
 * 4. Test that all required elements are present
 * 
 * Run: node src/ui/server/artPlayground/checks/resize-http-integration.check.js
 */

const http = require("http");
const path = require("path");
const { fork } = require("child_process");

const PORT = 4953; // Use non-conflicting port for testing
const HOST = `http://localhost:${PORT}`;

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
 * Fetch a URL and return the response body
 */
function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

/**
 * Start the server in a child process
 */
function startServer() {
  return new Promise((resolve, reject) => {
    // Import the server module path
    const serverPath = path.join(__dirname, "../server.js");
    
    // Instead of forking, we'll use exec to run with custom port
    const { exec } = require("child_process");
    
    // Set up environment and start
    const env = { ...process.env, PORT: PORT.toString() };
    const child = exec(`node "${serverPath}" --port ${PORT}`, { env }, (err) => {
      if (err && err.killed) return; // Expected when we kill it
    });
    
    // Wait a bit for server to start
    setTimeout(() => {
      // Check if server is responding
      http.get(`${HOST}/`, (res) => {
        if (res.statusCode === 200) {
          resolve(child);
        } else {
          reject(new Error(`Server returned ${res.statusCode}`));
        }
      }).on("error", (err) => {
        // Might not be ready yet, give it more time
        setTimeout(() => {
          http.get(`${HOST}/`, (res) => {
            if (res.statusCode === 200) resolve(child);
            else reject(new Error(`Server returned ${res.statusCode}`));
          }).on("error", reject);
        }, 1000);
      });
    }, 500);
  });
}

async function runTests() {
  let server = null;
  
  try {
    section("0. Starting Server");
    
    // Check if server is already running on PORT
    try {
      const testRes = await fetch(`${HOST}/`);
      console.log("  ℹ️  Server already running, using existing instance");
    } catch {
      console.log("  ℹ️  Starting new server instance...");
      server = await startServer();
      console.log(`  ✅ Server started on port ${PORT}`);
    }
    
    // =============================================================================
    // SECTION 1: Main Page HTML
    // =============================================================================
    section("1. Main Page HTML Structure");
    
    const mainPage = await fetch(`${HOST}/`);
    const html = mainPage.body;
    
    check(mainPage.status === 200, "GET / returns 200");
    check(html.includes('<!DOCTYPE html>'), "Has DOCTYPE");
    check(html.includes('class="art-app"'), "Has art-app root element");
    check(html.includes('art-toolbar'), "Has toolbar");
    check(html.includes('art-canvas'), "Has canvas");
    check(html.includes('art-canvas__svg'), "Has SVG element");
    check(html.includes('art-canvas__components'), "Has components group");
    
    // Check selection handles
    check(html.includes('art-selection'), "Has selection handles container");
    check(html.includes('art-selection__outline'), "Has selection outline");
    check(html.includes('art-selection__handle'), "Has handle elements");
    
    // Check all 8 handles
    const positions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    positions.forEach(pos => {
      check(html.includes(`data-handle="${pos}"`), `Has ${pos.toUpperCase()} handle`);
    });
    
    // Check for client.bundle.js script tag
    check(html.includes('src="/client.bundle.js"') || html.includes("src='/client.bundle.js'"), "Has client.bundle.js script tag");
    
    // Check toolbar buttons
    check(html.includes('data-action="select"'), "Has select tool button");
    check(html.includes('add-rect'), "Has add rectangle button");
    check(html.includes('add-ellipse'), "Has add ellipse button");
    check(html.includes('add-text'), "Has add text button");
    
    // =============================================================================
    // SECTION 2: Client.js Bundle
    // =============================================================================
    section("2. Client.bundle.js Bundle");
    
    const clientJs = await fetch(`${HOST}/client.bundle.js`);
    
    check(clientJs.status === 200, "GET /client.bundle.js returns 200");
    check(clientJs.body.length > 1000, `Bundle has content (${clientJs.body.length} bytes)`);
    check(!clientJs.body.includes("Cannot find module"), "No module resolution errors in bundle");
    
    // Check for key code patterns in the bundle
    check(clientJs.body.includes("resize-start"), "Bundle contains resize-start event");
    check(clientJs.body.includes("resize-move"), "Bundle contains resize-move event");
    check(clientJs.body.includes("resize-end"), "Bundle contains resize-end event");
    check(clientJs.body.includes("mouseX") && clientJs.body.includes("mouseY"), "Bundle uses mouseX/mouseY format");
    check(clientJs.body.includes("data-handle"), "Bundle handles data-handle attributes");
    
    // Check that the bundle doesn't have obvious errors
    check(!clientJs.body.includes("SyntaxError"), "No SyntaxError in bundle");
    check(!clientJs.body.includes("ReferenceError"), "No ReferenceError in bundle");
    
    // =============================================================================
    // SECTION 3: CSS/Styles
    // =============================================================================
    section("3. CSS Verification");
    
    // Check if CSS is linked in HTML
    check(html.includes('art-playground.css') || html.includes('<style>'), "CSS reference in HTML");
    
    // Fetch the CSS file
    try {
      const styles = await fetch(`${HOST}/public/art-playground.css`);
      check(styles.status === 200, "GET /public/art-playground.css returns 200");
      check(styles.body.includes('.art-selection'), "CSS has selection handle styles");
      check(styles.body.includes('.art-canvas'), "CSS has canvas styles");
      check(styles.body.includes('cursor:'), "CSS has cursor styles for handles");
      check(styles.body.includes('nw-resize'), "CSS has NW resize cursor");
      check(styles.body.includes('se-resize'), "CSS has SE resize cursor");
    } catch (err) {
      check(false, `CSS fetch error: ${err.message}`);
    }
    
    // =============================================================================
    // SECTION 4: Data Attributes
    // =============================================================================
    section("4. Data Attributes for Client Activation");
    
    check(html.includes('data-jsgui-control'), "Has data-jsgui-control attributes");
    check(html.includes('data-jsgui-control="art_app"'), "App control is marked");
    check(html.includes('data-jsgui-control="art_toolbar"'), "Toolbar control is marked");
    check(html.includes('data-jsgui-control="art_canvas"'), "Canvas control is marked");
    check(html.includes('data-jsgui-control="art_selection"'), "Selection handles control is marked");
    
    // =============================================================================
    // SECTION 5: Event Wiring Verification in Bundle
    // =============================================================================
    section("5. Client Bundle Event Wiring");
    
    const bundle = clientJs.body;
    
    // Check for handle event wiring patterns
    check(
      bundle.includes('addEventListener') || bundle.includes('mousedown'),
      "Bundle has event listeners"
    );
    check(
      bundle.includes('querySelectorAll') || bundle.includes('data-handle'),
      "Bundle queries handle elements"
    );
    
    // Check for correct method usage
    check(
      bundle.includes('_startResize') || bundle.includes('startResize'),
      "Bundle references _startResize"
    );
    check(
      bundle.includes('_doResize') || bundle.includes('doResize'),
      "Bundle references _doResize"
    );
    
    // =============================================================================
    // SUMMARY
    // =============================================================================
    console.log(`\n${"═".repeat(60)}`);
    console.log("SUMMARY");
    console.log(`${"═".repeat(60)}`);
    
    if (failed === 0) {
      console.log(`\n✅ ALL ${passed} HTTP INTEGRATION CHECKS PASSED!\n`);
      console.log("Server is correctly configured:");
      console.log("  • HTML structure is complete (all 8 handles, toolbar, canvas)");
      console.log("  • Client.js bundle serves correctly");
      console.log("  • Bundle contains resize event handling code");
      console.log("  • Data attributes enable client activation");
    } else {
      console.log(`\n❌ ${failed} CHECKS FAILED (${passed} passed)\n`);
    }
    
  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
    failed++;
  } finally {
    if (server) {
      server.kill();
      console.log("\n  ℹ️  Server stopped");
    }
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests();
