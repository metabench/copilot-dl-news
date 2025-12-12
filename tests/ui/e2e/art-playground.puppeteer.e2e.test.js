"use strict";

/**
 * Art Playground E2E Tests (Puppeteer)
 * 
 * Tests the art playground UI renders and interactive features work.
 */

const puppeteer = require("puppeteer");
const path = require("path");
const express = require("express");
const fs = require("fs");
const { execFileSync } = require("child_process");

// Import the server's createApp logic
const jsgui = require("jsgui3-html");
const { ArtPlaygroundAppControl } = require("../../../src/ui/server/artPlayground/isomorphic/controls");

/** Helper: wait for ms */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let _artPlaygroundBundleEnsured = false;

function ensureArtPlaygroundClientBundleBuilt() {
  if (_artPlaygroundBundleEnsured) return;

  if (process.env.SKIP_ART_PLAYGROUND_BUNDLE_BUILD === "1") return;

  const repoRoot = process.cwd();
  const buildScript = path.join(repoRoot, "scripts", "build-art-playground-client.js");

  try {
    execFileSync(process.execPath, [buildScript], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    _artPlaygroundBundleEnsured = true;
  } catch (error) {
    _artPlaygroundBundleEnsured = false;
    throw error;
  }
}

/**
 * Create a minimal Express app for testing
 */
function createTestApp() {
  const app = express();
  
  const publicPath = path.join(__dirname, "../../../src/ui/server/artPlayground/public");
  app.use("/public", express.static(publicPath));
  
  // Serve client bundle if it exists
  const bundlePath = path.join(__dirname, "../../../src/ui/server/artPlayground/client.bundle.js");
  app.get("/client.bundle.js", (req, res) => {
    if (fs.existsSync(bundlePath)) {
      res.type("application/javascript").sendFile(bundlePath);
    } else {
      res.status(404).send("// Client bundle not built");
    }
  });
  
  // Main page
  app.get("/", (req, res) => {
    const context = new jsgui.Page_Context();
    const appControl = new ArtPlaygroundAppControl({ context });
    const html = renderPage(appControl, { title: "Art Playground Test" });
    res.type("html").send(html);
  });
  
  return app;
}

/**
 * Render HTML page
 */
function renderPage(control, options = {}) {
  const title = options.title || "Art Playground";
  const html = control.all_html_render();
  const bundlePath = path.join(__dirname, "../../../src/ui/server/artPlayground/client.bundle.js");
  const hasBundle = fs.existsSync(bundlePath);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/public/art-playground.css">
</head>
<body>
  ${html}
  ${hasBundle ? '<script src="/client.bundle.js" defer></script>' : ''}
</body>
</html>`;
}

/**
 * Start test server on random port
 */
async function startServer() {
  ensureArtPlaygroundClientBundleBuilt();
  const app = createTestApp();
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    async shutdown() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

describe("Art Playground · Puppeteer E2E", () => {
  let browser;
  let serverHandle;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    serverHandle = await startServer();
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (serverHandle) await serverHandle.shutdown();
  });

  test("page loads and renders main structure", async () => {
    const page = await browser.newPage();
    
    // Log console messages for debugging
    page.on("console", (msg) => console.log("[browser]", msg.text()));
    page.on("pageerror", (error) => console.error("[browser-error]", error));
    
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check main app container exists
    const hasApp = await page.$eval("[data-jsgui-control='art_app']", el => !!el).catch(() => false);
    expect(hasApp).toBe(true);
    
    await page.close();
  }, 15000);

  test("toolbar renders with all buttons", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check toolbar exists
    const hasToolbar = await page.$eval("[data-jsgui-control='art_toolbar']", el => !!el).catch(() => false);
    expect(hasToolbar).toBe(true);
    
    // Check for toolbar buttons
    const buttons = await page.$$eval(".art-toolbar__btn", els => 
      els.map(el => ({
        action: el.getAttribute("data-action"),
        text: el.textContent.trim()
      }))
    );
    
    const actions = buttons.map(b => b.action);
    expect(actions).toContain("add-rect");
    expect(actions).toContain("add-ellipse");
    expect(actions).toContain("add-text");
    expect(actions).toContain("delete");
    expect(actions).toContain("undo");
    expect(actions).toContain("redo");
    expect(actions).toContain("export");
    
    await page.close();
  }, 15000);

  test("tool panel renders with select + pan tools", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const hasToolPanel = await page.$eval("[data-jsgui-control='ap_tool_panel']", el => !!el).catch(() => false);
    expect(hasToolPanel).toBe(true);

    const hasSelectTool = await page.$eval("[data-jsgui-control='ap_tool_panel'] [data-tool='select']", el => !!el).catch(() => false);
    expect(hasSelectTool).toBe(true);

    const hasPanTool = await page.$eval("[data-jsgui-control='ap_tool_panel'] [data-tool='pan']", el => !!el).catch(() => false);
    expect(hasPanTool).toBe(true);

    await page.close();
  }, 15000);

  test("canvas renders with SVG element", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check canvas container exists
    const hasCanvas = await page.$eval("[data-jsgui-control='art_canvas']", el => !!el).catch(() => false);
    expect(hasCanvas).toBe(true);
    
    // Check SVG exists within canvas
    const hasSvg = await page.$eval("[data-jsgui-control='art_canvas'] svg", el => !!el).catch(() => false);
    expect(hasSvg).toBe(true);
    
    // Check SVG has components group
    const hasComponentsGroup = await page.$eval(
      "[data-jsgui-control='art_canvas'] svg g.art-canvas__components",
      el => !!el
    ).catch(() => false);
    expect(hasComponentsGroup).toBe(true);
    
    await page.close();
  }, 15000);

  test("selection handles render with 8 resize handles", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check selection container exists
    const hasSelection = await page.$eval("[data-jsgui-control='art_selection']", el => !!el).catch(() => false);
    expect(hasSelection).toBe(true);
    
    // Check outline exists
    const hasOutline = await page.$eval(".art-selection__outline", el => !!el).catch(() => false);
    expect(hasOutline).toBe(true);
    
    // Check all 8 handles exist
    const handlePositions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (const pos of handlePositions) {
      const hasHandle = await page.$eval(
        `.art-selection__handle--${pos}`,
        el => !!el
      ).catch(() => false);
      expect(hasHandle).toBe(true);
    }
    
    await page.close();
  }, 15000);

  test("select tool is active by default", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    // Tool selection moved to the ToolPanelControl.
    const selectActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='select']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    ).catch(() => false);
    expect(selectActive).toBe(true);

    const panActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='pan']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    ).catch(() => false);
    expect(panActive).toBe(false);
    
    await page.close();
  }, 15000);

  test("page has CSS loaded", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check that CSS file was loaded (toolbar should have styles)
    const toolbarStyles = await page.$eval(".art-toolbar", el => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        padding: computed.padding
      };
    }).catch(() => null);
    
    // If CSS loaded, it should have some styling applied
    expect(toolbarStyles).not.toBeNull();
    
    await page.close();
  }, 15000);

  test("renders valid HTML structure", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Count key elements to ensure structure is correct
    const structure = await page.evaluate(() => {
      return {
        app: document.querySelectorAll("[data-jsgui-control='art_app']").length,
        toolbar: document.querySelectorAll("[data-jsgui-control='art_toolbar']").length,
        toolPanel: document.querySelectorAll("[data-jsgui-control='ap_tool_panel']").length,
        canvas: document.querySelectorAll("[data-jsgui-control='art_canvas']").length,
        propertiesPanel: document.querySelectorAll("[data-jsgui-control='ap_properties_panel']").length,
        statusBar: document.querySelectorAll("[data-jsgui-control='ap_status_bar']").length,
        selection: document.querySelectorAll("[data-jsgui-control='art_selection']").length,
        toolbarSections: document.querySelectorAll(".art-toolbar__section").length,
        toolbarButtons: document.querySelectorAll(".art-toolbar__btn").length,
        selectionHandles: document.querySelectorAll(".art-selection__handle").length
      };
    });
    
    expect(structure.app).toBe(1);
    expect(structure.toolbar).toBe(1);
    expect(structure.toolPanel).toBe(1);
    expect(structure.canvas).toBe(1);
    expect(structure.propertiesPanel).toBe(1);
    expect(structure.statusBar).toBe(1);
    expect(structure.selection).toBe(1);
    expect(structure.toolbarSections).toBeGreaterThanOrEqual(2);
    expect(structure.toolbarButtons).toBe(7);
    expect(structure.selectionHandles).toBe(8);
    
    await page.close();
  }, 15000);
});

/**
 * Interactive Tests - User Actions
 */
describe("Art Playground · Interactive Tests", () => {
  let browser;
  let serverHandle;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    serverHandle = await startServer();
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (serverHandle) await serverHandle.shutdown();
  });

  test("clicking Pan button switches active tool", async () => {
    const page = await browser.newPage();
    page.on("console", (msg) => console.log("[browser]", msg.text()));
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Verify Select is active initially
    let selectActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='select']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    );
    expect(selectActive).toBe(true);

    // Click Pan tool
    await page.click("[data-jsgui-control='ap_tool_panel'] [data-tool='pan']");
    await wait(100);
    
    // Verify Pan is now active
    const panActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='pan']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    );
    expect(panActive).toBe(true);
    
    // Verify Select is no longer active
    selectActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='select']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    );
    expect(selectActive).toBe(false);

    const canvasTool = await page.$eval(
      "[data-jsgui-control='art_canvas']",
      el => el.getAttribute("data-tool")
    ).catch(() => null);
    expect(canvasTool).toBe("pan");
    
    await page.close();
  }, 15000);

  test("clicking Select button after Pan restores Select as active", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Switch to Pan
    await page.click("[data-jsgui-control='ap_tool_panel'] [data-tool='pan']");
    await wait(100);
    
    // Switch back to Select
    await page.click("[data-jsgui-control='ap_tool_panel'] [data-tool='select']");
    await wait(100);
    
    // Verify Select is active
    const selectActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='select']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    );
    expect(selectActive).toBe(true);
    
    // Verify Pan is not active
    const panActive = await page.$eval(
      "[data-jsgui-control='ap_tool_panel'] [data-tool='pan']",
      el => el.classList.contains("ap-tool-panel__btn--active")
    );
    expect(panActive).toBe(false);
    
    await page.close();
  }, 15000);

  test("toolbar add-rect then undo/redo updates SVG component count", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const componentsSelector = "[data-jsgui-control='art_canvas'] svg [data-component-id]";
    const addRectSelector = "[data-jsgui-control='art_toolbar'] button[data-action='add-rect']";
    const undoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='undo']";
    const redoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='redo']";

    // Wait for activation to wire handlers.
    await page.waitForSelector(addRectSelector, { timeout: 5000 });

    const initialCount = await page.$$eval(componentsSelector, (els) => els.length);
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // Undo/redo should be disabled initially.
    const initialUndoDisabled = await page.$eval(undoSelector, (el) => !!el.disabled);
    const initialRedoDisabled = await page.$eval(redoSelector, (el) => !!el.disabled);
    expect(initialUndoDisabled).toBe(true);
    expect(initialRedoDisabled).toBe(true);

    // Add a rect.
    await page.click(addRectSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelectorAll(sel).length === expected,
      {},
      componentsSelector,
      initialCount + 1
    );

    // Undo should now be enabled.
    const afterAddUndoDisabled = await page.$eval(undoSelector, (el) => !!el.disabled);
    expect(afterAddUndoDisabled).toBe(false);

    // Undo the add.
    await page.click(undoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelectorAll(sel).length === expected,
      {},
      componentsSelector,
      initialCount
    );

    // Redo should now be enabled.
    const afterUndoRedoDisabled = await page.$eval(redoSelector, (el) => !!el.disabled);
    expect(afterUndoRedoDisabled).toBe(false);

    // Redo the add.
    await page.click(redoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelectorAll(sel).length === expected,
      {},
      componentsSelector,
      initialCount + 1
    );

    await page.close();
  }, 20000);

  test("toolbar buttons have hover/pointer cursor", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check cursor style on buttons
    const cursor = await page.$eval(".art-toolbar__btn", el => {
      return window.getComputedStyle(el).cursor;
    });
    
    // Should be pointer or inherit pointer from parent
    expect(["pointer", "auto"]).toContain(cursor);
    
    await page.close();
  }, 15000);

  test("SVG canvas is clickable area", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Get SVG bounding box
    const svgBox = await page.$eval("[data-jsgui-control='art_canvas'] svg", el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    
    // SVG should have reasonable dimensions
    expect(svgBox.width).toBeGreaterThan(100);
    expect(svgBox.height).toBeGreaterThan(100);
    
    // Click in center of SVG (should not throw)
    await page.mouse.click(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
    
    await page.close();
  }, 15000);

  test("resize handles have correct data attributes", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check each handle has correct data-handle attribute
    const handles = await page.$$eval(".art-selection__handle", els => 
      els.map(el => el.getAttribute("data-handle"))
    );
    
    const expectedHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    expect(handles.sort()).toEqual(expectedHandles.sort());
    
    await page.close();
  }, 15000);

  test("keyboard events reach the page", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Set up listener for keydown
    const keyPromise = page.evaluate(() => {
      return new Promise(resolve => {
        document.addEventListener("keydown", (e) => {
          resolve({ key: e.key, code: e.code });
        }, { once: true });
      });
    });
    
    // Press Delete key
    await page.keyboard.press("Delete");
    
    const keyEvent = await keyPromise;
    expect(keyEvent.key).toBe("Delete");
    
    await page.close();
  }, 15000);

  test("mouse events on canvas are captured", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const canvas = await page.$("[data-jsgui-control='art_canvas']");
    expect(canvas).toBeTruthy();

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // Set up mousedown listener (capture phase to avoid propagation-stopping flakiness).
    const mousePromise = page.evaluate(() => {
      return new Promise(resolve => {
        const el = document.querySelector("[data-jsgui-control='art_canvas']");
        el.addEventListener(
          "mousedown",
          (e) => resolve({ type: e.type, clientX: e.clientX, clientY: e.clientY }),
          { once: true, capture: true }
        );
      });
    });

    // Click inside the canvas element.
    const clickX = box.x + Math.min(50, Math.max(1, box.width / 2));
    const clickY = box.y + Math.min(50, Math.max(1, box.height / 2));
    await page.mouse.click(clickX, clickY);

    const mouseEvent = await mousePromise;
    expect(mouseEvent.type).toBe("mousedown");
    expect(mouseEvent.clientX).toBeCloseTo(clickX, 0);
    expect(mouseEvent.clientY).toBeCloseTo(clickY, 0);
    
    await page.close();
  }, 20000);

  test("selecting a component updates properties; editing fill updates SVG", async () => {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("[browser-error]", error));
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    // Wait for demo components to render.
    await page.waitForSelector("[data-component-id]", { timeout: 5000 });

    // Click the first component.
    await page.click("[data-component-id]");
    await wait(100);

    // Properties panel should populate.
    const fillVal = await page.$eval(
      "[data-jsgui-control='ap_properties_panel'] input[data-prop='fill']",
      el => el.value
    );
    expect(fillVal).not.toBe("—");

    // Edit fill and verify SVG updates (realistic input interaction).
    await page.click("[data-jsgui-control='ap_properties_panel'] input[data-prop='fill']", { clickCount: 3 });
    await page.keyboard.type("#ff0000");
    await page.keyboard.press("Enter");
    await wait(150);

    const svgFill = await page.$eval("[data-component-id]", el => el.getAttribute("fill"));
    expect(svgFill).toBe("#ff0000");

    await page.close();
  }, 15000);

  test("editing fill is undoable/redoable via toolbar", async () => {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("[browser-error]", error));
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const firstComponentSelector = "[data-component-id]";
    const fillInputSelector = "[data-jsgui-control='ap_properties_panel'] input[data-prop='fill']";
    const undoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='undo']";
    const redoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='redo']";

    await page.waitForSelector(firstComponentSelector, { timeout: 5000 });
    await page.waitForSelector(fillInputSelector, { timeout: 5000 });

    // Select first component.
    await page.click(firstComponentSelector);
    await wait(100);

    const originalFill = await page.$eval(firstComponentSelector, el => el.getAttribute("fill"));
    expect(typeof originalFill).toBe("string");

    // Edit fill (realistic input interaction).
    const newFill = "#00ff00";
    await page.click(fillInputSelector, { clickCount: 3 });
    await page.keyboard.type(newFill);
    await page.keyboard.press("Enter");

    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      newFill
    );

    // Wait for undo to enable.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      undoSelector
    );

    // Undo should revert fill.
    await page.click(undoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      originalFill
    );

    // Wait for redo to enable.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      redoSelector
    );

    // Redo should re-apply fill.
    await page.click(redoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      newFill
    );

    await page.close();
  }, 30000);

  test("clicking a fill palette swatch updates SVG and is undoable/redoable", async () => {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("[browser-error]", error));
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const firstComponentSelector = "[data-component-id]";
    const fillPaletteSelector = "[data-jsgui-control='ap_properties_panel'] [data-role='ap-fill-palette']";
    const undoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='undo']";
    const redoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='redo']";

    await page.waitForSelector(firstComponentSelector, { timeout: 5000 });
    await page.waitForSelector(fillPaletteSelector, { timeout: 5000 });

    // Select first component.
    await page.click(firstComponentSelector);
    await wait(100);

    const originalFill = await page.$eval(firstComponentSelector, (el) => el.getAttribute("fill"));
    expect(typeof originalFill).toBe("string");

    // Choose a swatch that differs from the current fill.
    const newFill = await page.$eval(
      fillPaletteSelector,
      (paletteEl, current) => {
        const currentNorm = String(current || "").trim().toLowerCase();
        const swatches = Array.from(paletteEl.querySelectorAll('button[data-role="ap-color-swatch"][data-value]'))
          .map((b) => String(b.getAttribute("data-value") || "").trim())
          .filter((v) => v && v.toLowerCase() !== "none");

        const pick = swatches.find((v) => v.toLowerCase() !== currentNorm) || swatches[0];
        return pick;
      },
      originalFill
    );

    expect(typeof newFill).toBe("string");
    expect(newFill.length).toBeGreaterThan(0);

    // Click the swatch.
    await page.click(`${fillPaletteSelector} button[data-role='ap-color-swatch'][data-value='${newFill}']`);

    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      newFill
    );

    // Wait for undo to enable.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      undoSelector
    );

    // Undo should revert fill.
    await page.click(undoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      originalFill
    );

    // Wait for redo to enable.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      redoSelector
    );

    // Redo should re-apply fill.
    await page.click(redoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      newFill
    );

    await page.close();
  }, 30000);

  test("keyboard: Arrow navigation + Space on fill palette updates SVG and is undoable/redoable", async () => {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("[browser-error]", error));
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });

    const firstComponentSelector = "[data-component-id]";
    const fillInputSelector = "[data-jsgui-control='ap_properties_panel'] input[data-prop='fill']";
    const fillPaletteSelector = "[data-jsgui-control='ap_properties_panel'] [data-role='ap-fill-palette']";
    const undoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='undo']";
    const redoSelector = "[data-jsgui-control='art_toolbar'] button[data-action='redo']";

    await page.waitForSelector(firstComponentSelector, { timeout: 5000 });
    await page.waitForSelector(fillInputSelector, { timeout: 5000 });
    await page.waitForSelector(fillPaletteSelector, { timeout: 5000 });

    // Select first component.
    await page.click(firstComponentSelector);
    await wait(100);

    const originalFill = await page.$eval(firstComponentSelector, (el) => el.getAttribute("fill"));
    expect(typeof originalFill).toBe("string");

    // Focus fill input then Tab into the (roving-tabindex) fill palette.
    await page.click(fillInputSelector);
    await page.keyboard.press("Tab");

    await page.waitForFunction(
      () => {
        const ae = document.activeElement;
        return !!ae &&
          ae.matches &&
          ae.matches("[data-role='ap-fill-palette'] button[data-role='ap-color-swatch']");
      },
      { timeout: 5000 }
    );

    // Move right to a new swatch and activate with Space.
    await page.keyboard.press("ArrowRight");

    let candidateFill = await page.evaluate(() => {
      const ae = document.activeElement;
      return ae?.getAttribute?.("data-value") || "";
    });

    if (String(candidateFill).trim().toLowerCase() === String(originalFill).trim().toLowerCase()) {
      await page.keyboard.press("ArrowRight");
      candidateFill = await page.evaluate(() => {
        const ae = document.activeElement;
        return ae?.getAttribute?.("data-value") || "";
      });
    }

    expect(typeof candidateFill).toBe("string");
    expect(candidateFill.length).toBeGreaterThan(0);

    await page.keyboard.press(" ");

    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      candidateFill
    );

    // Undo should now be enabled.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      undoSelector
    );

    // Undo should revert fill.
    await page.click(undoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      originalFill
    );

    // Redo should now be enabled.
    await page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && !el.disabled;
      },
      { timeout: 5000 },
      redoSelector
    );

    // Redo should re-apply fill.
    await page.click(redoSelector);
    await page.waitForFunction(
      (sel, expected) => document.querySelector(sel)?.getAttribute("fill") === expected,
      { timeout: 5000 },
      firstComponentSelector,
      candidateFill
    );

    await page.close();
  }, 30000);
});

/**
 * Visual/Screenshot Tests
 */
describe("Art Playground · Visual Tests", () => {
  let browser;
  let serverHandle;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    serverHandle = await startServer();
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (serverHandle) await serverHandle.shutdown();
  });

  test("page renders without visual errors (no red/error elements)", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Check for common error indicators
    const errorIndicators = await page.evaluate(() => {
      const errors = [];
      
      // Check for error class elements
      const errorEls = document.querySelectorAll(".error, .err, [data-error]");
      if (errorEls.length > 0) errors.push(`Found ${errorEls.length} error elements`);
      
      // Check for missing images
      const imgs = document.querySelectorAll("img");
      imgs.forEach(img => {
        if (!img.complete || img.naturalWidth === 0) {
          errors.push(`Broken image: ${img.src}`);
        }
      });
      
      // Check for 404 in any visible text
      if (document.body.textContent.includes("404")) {
        errors.push("Page contains '404' text");
      }
      
      return errors;
    });
    
    expect(errorIndicators).toEqual([]);
    
    await page.close();
  }, 15000);

  test("toolbar and canvas have non-zero dimensions", async () => {
    const page = await browser.newPage();
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    const dimensions = await page.evaluate(() => {
      const toolbar = document.querySelector("[data-jsgui-control='art_toolbar']");
      const canvas = document.querySelector("[data-jsgui-control='art_canvas']");
      
      const toolbarRect = toolbar.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      return {
        toolbar: { width: toolbarRect.width, height: toolbarRect.height },
        canvas: { width: canvasRect.width, height: canvasRect.height }
      };
    });
    
    expect(dimensions.toolbar.width).toBeGreaterThan(0);
    expect(dimensions.toolbar.height).toBeGreaterThan(0);
    expect(dimensions.canvas.width).toBeGreaterThan(0);
    expect(dimensions.canvas.height).toBeGreaterThan(0);
    
    await page.close();
  }, 15000);

  test("can take screenshot without errors", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(serverHandle.baseUrl, { waitUntil: "networkidle0" });
    
    // Take screenshot (returns buffer, proves rendering works)
    const screenshot = await page.screenshot({ type: "png" });
    
    expect(screenshot).toBeInstanceOf(Buffer);
    expect(screenshot.length).toBeGreaterThan(1000); // Non-trivial image
    
    await page.close();
  }, 15000);
});
