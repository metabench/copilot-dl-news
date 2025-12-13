"use strict";

/**
 * Decision Tree Viewer - Connection System E2E Test
 * 
 * Fast, reliable tests for connection points and SVG rendering.
 */

const puppeteer = require("puppeteer");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const SERVER_PATH = path.join(__dirname, "..", "..", "..", "src", "ui", "server", "decisionTreeViewer", "server.js");
let PORT;
let URL;

let browser;
let page;
let serverProcess;

// Quick delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : null;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { method: "GET" });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body && body.status === "ok") return;
      }
    } catch (err) {
      lastErr = err;
    }
    await delay(150);
  }

  const suffix = lastErr ? ` (last error: ${lastErr.message})` : "";
  throw new Error(`Server health check timeout${suffix}`);
}

function startServer({ port }) {
  return new Promise((resolve, reject) => {
    const stderrChunks = [];
    const stdoutChunks = [];
    const timeout = setTimeout(() => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`Server timeout (stdout: ${stdout || "<empty>"}) (stderr: ${stderr || "<empty>"})`));
    }, 15000);
    
    serverProcess = spawn("node", [SERVER_PATH], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,  // Don't create process group
      env: {
        ...process.env,
        DECISION_TREE_VIEWER_PORT: String(port)
      }
    });
    
    serverProcess.stdout.on("data", (data) => {
      stdoutChunks.push(Buffer.from(data));
    });

    serverProcess.stderr.on("data", (data) => {
      stderrChunks.push(Buffer.from(data));
    });

    serverProcess.once("exit", (code) => {
      if (code === 0) return;
      clearTimeout(timeout);
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`Server exited early with code ${code} (stderr: ${stderr || "<empty>"})`));
    });
    
    serverProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    // Readiness: don't depend on stdout formatting; poll /health instead.
    waitForHealth(`http://localhost:${port}`, 15000)
      .then(() => {
        clearTimeout(timeout);
        resolve();
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }
    
    const pid = serverProcess.pid;
    
    const timeout = setTimeout(() => {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          process.kill(pid, "SIGKILL");
        }
      } catch (e) {}
      serverProcess = null;
      resolve();
    }, 1500);
    
    serverProcess.once("close", () => {
      clearTimeout(timeout);
      serverProcess = null;
      resolve();
    });
    
    try {
      serverProcess.kill("SIGTERM");
    } catch (e) {
      clearTimeout(timeout);
      serverProcess = null;
      resolve();
    }
  });
}

// Single setup/teardown for all tests
beforeAll(async () => {
  PORT = await getAvailablePort();
  URL = `http://localhost:${PORT}`;
  await startServer({ port: PORT });
  
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  
  page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 8000 });
  
  // Wait for connections to be drawn
  await page.waitForFunction(
    () => window.__CONNECTION_VERIFICATION__ !== undefined,
    { timeout: 3000 }
  );
}, 20000);

afterAll(async () => {
  if (page) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await stopServer();
}, 10000);

describe("Connection Points", () => {
  test("renders connection point elements", async () => {
    const points = await page.$$('[data-jsgui-control="dt_connection_point"]');
    expect(points.length).toBeGreaterThan(0);
  });
  
  test("has YES and NO output points on branch nodes", async () => {
    const yesPoints = await page.$$('[data-point-type="output-yes"]');
    const noPoints = await page.$$('[data-point-type="output-no"]');
    const branches = await page.$$('[data-jsgui-control="dt_branch_node"]');
    
    expect(yesPoints.length).toBe(branches.length);
    expect(noPoints.length).toBe(branches.length);
  });
  
  test("points have required data attributes", async () => {
    const point = await page.$('[data-jsgui-control="dt_connection_point"]');
    const nodeId = await point.evaluate(el => el.getAttribute("data-node-id"));
    const pointType = await point.evaluate(el => el.getAttribute("data-point-type"));
    
    expect(nodeId).toBeTruthy();
    expect(pointType).toBeTruthy();
  });
});

describe("Connection Verification", () => {
  test("verification reports success with no errors", async () => {
    const result = await page.evaluate(() => window.__CONNECTION_VERIFICATION__);
    expect(result.success).toBe(true);
    expect(result.errors).toBe(0);
  });
  
  test("has expected number of connections (10)", async () => {
    const result = await page.evaluate(() => window.__CONNECTION_VERIFICATION__);
    expect(result.connections).toBe(10);
  });
  
  test("all connections have valid positions", async () => {
    const result = await page.evaluate(() => {
      const viewerEl = document.querySelector('[data-jsgui-control="dt_viewer"]');
      return window.verifyConnections(viewerEl);
    });
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("SVG Rendering", () => {
  test("renders SVG with connection paths", async () => {
    const svg = await page.$(".dt-connections-svg");
    const paths = await page.$$(".dt-connection");
    
    expect(svg).not.toBeNull();
    expect(paths.length).toBe(10);
  });
  
  test("has YES and NO styled paths", async () => {
    const yesPaths = await page.$$(".dt-connection--yes");
    const noPaths = await page.$$(".dt-connection--no");
    
    expect(yesPaths.length).toBeGreaterThan(0);
    expect(noPaths.length).toBeGreaterThan(0);
  });
  
  test("has arrow markers", async () => {
    const yesMarker = await page.$("#arrow-yes");
    const noMarker = await page.$("#arrow-no");
    
    expect(yesMarker).not.toBeNull();
    expect(noMarker).not.toBeNull();
  });
});

describe("Node Dragging", () => {
  test("drag state is initialized", async () => {
    const state = await page.evaluate(() => window.__DRAG_STATE__);
    expect(state).toBeDefined();
    expect(state.isDragging).toBe(false);
  });
  
  test("can drag a node and connections remain valid", async () => {
    // Don't hard-code a specific node id; pick a rendered branch node.
    await page.waitForSelector('[data-jsgui-control="dt_branch_node"]', { timeout: 3000 });
    const nodeEl = await page.$('[data-jsgui-control="dt_branch_node"]');
    expect(nodeEl).not.toBeNull();

    await nodeEl.evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
    });

    const nodeId = await nodeEl.evaluate((el) => el.getAttribute("data-node-id"));
    expect(nodeId).toBeTruthy();
    
    const rect = await nodeEl.boundingBox();
    expect(rect).not.toBeNull();
    
    // Perform drag
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 20, { steps: 2 });
    await page.mouse.up();
    
    await delay(100);
    
    // Check drag was recorded
    const state = await page.evaluate(() => window.__DRAG_STATE__);
    expect(state.dragCount).toBeGreaterThan(0);
    
    // Connections should still be valid
    const result = await page.evaluate(() => {
      const viewerEl = document.querySelector('[data-jsgui-control="dt_viewer"]');
      return window.verifyConnections(viewerEl);
    });
    expect(result.valid).toBe(true);
  });
});
