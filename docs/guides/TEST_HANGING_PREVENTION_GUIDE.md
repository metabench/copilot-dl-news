# Test Hanging Prevention Guide

**Purpose**: Comprehensive guide to preventing tests from hanging, ensuring clean exits, and writing reliable async test code.

**When to Read**:
- Writing new E2E or integration tests
- Debugging "Jest did not exit" warnings
- Tests that timeout or run indefinitely
- Server-spawning tests (Puppeteer, API tests)

---

## 🚨 The Core Problem

Tests hang when asynchronous operations aren't properly cleaned up. Jest waits for all handles to close before exiting. Common symptoms:

```
Jest did not exit one second after the test run has completed.
This usually means that there are asynchronous operations that weren't stopped in your tests.
```

**Impact**: 
- CI pipelines timeout
- Developer frustration (ctrl+c required)
- Exit code 1 even when all tests pass
- Unreliable test runs

---

## 🔍 Root Causes (Ranked by Frequency)

### 1. Server Processes Not Killed (Most Common)

```javascript
// ❌ WRONG: Process orphaned after tests
let serverProcess;
beforeAll(() => {
  serverProcess = spawn("node", ["server.js"]);
});
// No afterAll cleanup = hanging process!
```

```javascript
// ✅ CORRECT: Explicit cleanup with timeout
let serverProcess;

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    
    const pid = serverProcess.pid;
    
    // Force kill after 1s if SIGTERM doesn't work
    const forceKillTimeout = setTimeout(() => {
      try { process.kill(pid, "SIGKILL"); } catch (e) {}
      serverProcess = null;
      resolve();
    }, 1000);
    
    serverProcess.once("close", () => {
      clearTimeout(forceKillTimeout);
      serverProcess = null;
      resolve();
    });
    
    try {
      serverProcess.kill("SIGTERM");
    } catch (e) {
      clearTimeout(forceKillTimeout);
      serverProcess = null;
      resolve();
    }
  });
}

afterAll(async () => {
  await stopServer();
}, 5000);  // Timeout for afterAll itself
```

### 2. Browser Instances Not Closed

```javascript
// ❌ WRONG: Browser left open
let browser;
beforeAll(async () => {
  browser = await puppeteer.launch();
});
// Missing close = hanging chromium process!
```

```javascript
// ✅ CORRECT: Close with error handling
afterAll(async () => {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}, 5000);
```

### 3. Timers/Intervals Not Cleared

```javascript
// ❌ WRONG: Interval left running
test("polling test", async () => {
  const interval = setInterval(() => checkStatus(), 100);
  await waitForCondition();
  // Interval still running after test!
});
```

```javascript
// ✅ CORRECT: Clear in finally block
test("polling test", async () => {
  let interval;
  try {
    interval = setInterval(() => checkStatus(), 100);
    await waitForCondition();
  } finally {
    if (interval) clearInterval(interval);
  }
});
```

### 4. Database Connections Not Closed

```javascript
// ❌ WRONG: Connection pool still open
beforeAll(() => {
  db = new Database("test.db");
});
// No close = SQLite handle keeps process alive
```

```javascript
// ✅ CORRECT: Explicit close
afterAll(() => {
  if (db) db.close();
});
```

### 5. Event Listeners on Global Objects

```javascript
// ❌ WRONG: Listener on document persists
document.addEventListener("mousemove", handler);
// Listener keeps reference, prevents GC
```

```javascript
// ✅ CORRECT: Store reference and remove
const handler = (e) => { /* ... */ };
document.addEventListener("mousemove", handler);

// In cleanup:
document.removeEventListener("mousemove", handler);
```

### 6. spawn() with shell=true (Windows-specific)

```javascript
// ❌ RISKY: shell=true creates extra process layer
serverProcess = spawn("node", [SERVER_PATH], {
  shell: true  // Creates cmd.exe wrapper
});
// Killing the wrapper doesn't kill node.exe
```

```javascript
// ✅ BETTER: Direct spawn without shell
serverProcess = spawn("node", [SERVER_PATH], {
  stdio: ["ignore", "pipe", "pipe"],
  detached: false
});
```

---

## 📐 Patterns for Reliable Test Setup/Teardown

### Pattern 1: Promise-Based Server Start with Timeout

```javascript
const SERVER_START_TIMEOUT = 8000;

function startServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Server start timeout"));
    }, SERVER_START_TIMEOUT);
    
    serverProcess = spawn("node", [SERVER_PATH], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    
    serverProcess.stdout.on("data", (data) => {
      if (data.toString().includes("listening on port")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    
    serverProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}
```

### Pattern 2: Comprehensive afterAll with Error Swallowing

```javascript
afterAll(async () => {
  const cleanup = [];
  
  // Close page first (fastest)
  if (page) {
    cleanup.push(page.close().catch(() => {}));
  }
  
  // Then browser
  if (browser) {
    cleanup.push(browser.close().catch(() => {}));
  }
  
  // Then server (may take up to 1s)
  cleanup.push(stopServer());
  
  // Wait for all cleanup to complete
  await Promise.all(cleanup);
}, 10000);  // Total timeout for cleanup
```

### Pattern 3: Resource Tracking for Complex Tests

```javascript
class TestResourceTracker {
  constructor() {
    this.timers = [];
    this.intervals = [];
    this.eventListeners = [];
    this.processes = [];
  }
  
  setTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }
  
  setInterval(fn, ms) {
    const id = setInterval(fn, ms);
    this.intervals.push(id);
    return id;
  }
  
  spawn(...args) {
    const proc = spawn(...args);
    this.processes.push(proc);
    return proc;
  }
  
  addListener(target, event, handler) {
    target.addEventListener(event, handler);
    this.eventListeners.push({ target, event, handler });
  }
  
  async cleanup() {
    this.timers.forEach(id => clearTimeout(id));
    this.intervals.forEach(id => clearInterval(id));
    this.eventListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    
    await Promise.all(
      this.processes.map(proc => {
        return new Promise(resolve => {
          proc.once("close", resolve);
          proc.kill("SIGTERM");
          setTimeout(() => {
            try { proc.kill("SIGKILL"); } catch {}
            resolve();
          }, 1000);
        });
      })
    );
  }
}

// Usage
let tracker;
beforeEach(() => { tracker = new TestResourceTracker(); });
afterEach(async () => { await tracker.cleanup(); });
```

---

## ⏱️ Timeout Best Practices

### Test-Level Timeouts

```javascript
// Short tests (unit tests): 5 seconds default
test("quick check", async () => { /* ... */ });

// Medium tests (integration): explicit 10-15s
test("API call", async () => { /* ... */ }, 15000);

// Long tests (E2E): explicit 30-60s
test("full user flow", async () => { /* ... */ }, 60000);
```

### Operation-Level Timeouts (Inside Tests)

```javascript
// ❌ WRONG: No timeout on waitForFunction
await page.waitForFunction(() => window.ready);  // Could wait forever

// ✅ CORRECT: Explicit timeout
await page.waitForFunction(() => window.ready, { timeout: 5000 });
```

### Timeout Hierarchy

```
Jest global timeout (jest.config.js)
  └── describe block timeout (if supported)
      └── test timeout (3rd argument to test())
          └── operation timeout (e.g., page.waitFor)
```

**Rule**: Inner timeouts should be shorter than outer timeouts.

---

## 🔧 Debugging Hanging Tests

### Step 1: Identify the Handle

```bash
npm run test:by-path your.test.js -- --detectOpenHandles
```

This shows what's keeping Jest alive:
```
Jest has detected the following 1 open handle potentially keeping Jest from exiting:

  ●  Timeout

      at setTimeout (src/server.js:42:5)
      at startPolling (src/server.js:40:3)
```

### Step 2: Add Strategic Logging

```javascript
afterAll(async () => {
  console.log("[CLEANUP] Starting cleanup...");
  
  console.log("[CLEANUP] Closing page...");
  if (page) await page.close().catch(e => console.log("[CLEANUP] Page close error:", e));
  
  console.log("[CLEANUP] Closing browser...");
  if (browser) await browser.close().catch(e => console.log("[CLEANUP] Browser close error:", e));
  
  console.log("[CLEANUP] Stopping server...");
  await stopServer();
  
  console.log("[CLEANUP] Complete");
});
```

### Step 3: Force Exit (Temporary)

```bash
# For immediate verification that tests pass
npm run test:by-path your.test.js -- --forceExit
```

**Warning**: `--forceExit` masks the underlying issue. Use only for verification, then fix properly.

---

## 🎯 Checklist for New E2E Tests

Before submitting, verify:

- [ ] **Server start has timeout** (8-10s max)
- [ ] **Server stop uses SIGTERM → SIGKILL pattern**
- [ ] **Browser close has `.catch(() => {})`**
- [ ] **Page close before browser close**
- [ ] **afterAll has its own timeout** (5-10s)
- [ ] **No `shell: true` in spawn()** (Windows)
- [ ] **All intervals/timeouts cleared**
- [ ] **Test runs cleanly 3 times in a row**
- [ ] **No "Jest did not exit" warning**

---

## 📊 Quick Reference Table

| Resource | Create | Cleanup | Where |
|----------|--------|---------|-------|
| Child process | `spawn()` | `proc.kill()` + wait | `afterAll` |
| Browser | `puppeteer.launch()` | `browser.close()` | `afterAll` |
| Page | `browser.newPage()` | `page.close()` | `afterAll` |
| setTimeout | `setTimeout()` | `clearTimeout()` | `finally` or `afterEach` |
| setInterval | `setInterval()` | `clearInterval()` | `finally` or `afterEach` |
| Database | `new Database()` | `db.close()` | `afterAll` |
| HTTP server | `server.listen()` | `server.close()` | `afterAll` |
| Event listener | `addEventListener()` | `removeEventListener()` | `afterAll` |
| File watcher | `fs.watch()` | `watcher.close()` | `afterAll` |

---

## 🚀 Template: Reliable E2E Test Structure

```javascript
"use strict";

const puppeteer = require("puppeteer");
const { spawn } = require("child_process");
const path = require("path");

const SERVER_PATH = path.join(__dirname, "..", "server.js");
const PORT = 3000;
const URL = `http://localhost:${PORT}`;

let browser;
let page;
let serverProcess;

// Helper
const delay = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server timeout")), 8000);
    
    serverProcess = spawn("node", [SERVER_PATH], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false
    });
    
    serverProcess.stdout.on("data", (data) => {
      if (data.toString().includes("listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    
    serverProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    
    const pid = serverProcess.pid;
    const timeout = setTimeout(() => {
      try { process.kill(pid, "SIGKILL"); } catch {}
      serverProcess = null;
      resolve();
    }, 1000);
    
    serverProcess.once("close", () => {
      clearTimeout(timeout);
      serverProcess = null;
      resolve();
    });
    
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      clearTimeout(timeout);
      serverProcess = null;
      resolve();
    }
  });
}

beforeAll(async () => {
  await startServer();
  
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 8000 });
}, 20000);

afterAll(async () => {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await stopServer();
}, 10000);

describe("Feature Tests", () => {
  test("example test", async () => {
    const element = await page.$(".my-element");
    expect(element).not.toBeNull();
  });
});
```

---

## Related Documentation

- [TESTING_QUICK_REFERENCE.md](../TESTING_QUICK_REFERENCE.md) - Quick lookup for test operations
- [TESTING_ASYNC_CLEANUP_GUIDE.md](../TESTING_ASYNC_CLEANUP_GUIDE.md) - Async patterns
- [TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md](../TEST_TIMEOUT_GUARDS_IMPLEMENTATION.md) - Timeout prevention

---

_Last updated: 2025-12-01_
