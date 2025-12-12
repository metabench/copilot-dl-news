"use strict";

const puppeteer = require("puppeteer");
const Database = require("better-sqlite3");

const { ensureClientBundle } = require("../../../src/ui/server/utils/ensureClientBundle");

jest.mock("../../../src/db/dbAccess", () => ({
  openNewsDb: jest.fn()
}));

const { openNewsDb } = require("../../../src/db/dbAccess");
const { createDataExplorerServer } = require("../../../src/ui/server/dataExplorerServer");

let _uiClientBundleEnsured = false;
function ensureUiClientBundleBuiltOnce() {
  if (_uiClientBundleEnsured) return;
  if (process.env.SKIP_UI_CLIENT_BUNDLE_BUILD === "1") return;
  ensureClientBundle({ silent: true });
  _uiClientBundleEnsured = true;
}

async function pause(page, ms) {
  if (page && typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(ms);
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildInMemoryDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      host TEXT,
      canonical_url TEXT,
      created_at TEXT,
      last_seen_at TEXT,
      analysis TEXT
    );
    CREATE TABLE fetches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      fetched_at TEXT,
      request_started_at TEXT,
      http_status INTEGER,
      content_type TEXT,
      content_length INTEGER,
      bytes_downloaded INTEGER,
      file_path TEXT,
      file_size INTEGER,
      classification TEXT,
      word_count INTEGER
    );
  `);
  return db;
}

function seedUrlData(db) {
  const insertUrl = db.prepare(
    "INSERT INTO urls (url, host, canonical_url, created_at, last_seen_at, analysis) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const timestamps = {
    created: "2025-11-14T00:00:00.000Z",
    lastSeen: "2025-11-15T00:00:00.000Z"
  };
  const fetchedUrlId = Number(
    insertUrl.run(
      "https://fetched.example/news",
      "fetched.example",
      "https://fetched.example/news",
      timestamps.created,
      timestamps.lastSeen,
      null
    ).lastInsertRowid
  );
  insertUrl.run(
    "https://nofetch.example/story",
    "nofetch.example",
    "https://nofetch.example/story",
    timestamps.created,
    timestamps.lastSeen,
    null
  );
  const insertFetch = db.prepare(
    "INSERT INTO fetches (url_id, fetched_at, request_started_at, http_status, content_type, content_length, bytes_downloaded, file_path, file_size, classification, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  insertFetch.run(
    fetchedUrlId,
    "2025-11-15T10:00:00.000Z",
    "2025-11-15T10:00:00.000Z",
    200,
    "text/html",
    2048,
    2048,
    null,
    null,
    "article",
    500
  );
  insertFetch.run(
    fetchedUrlId,
    "2025-11-15T09:30:00.000Z",
    "2025-11-15T09:30:00.000Z",
    304,
    "text/html",
    null,
    null,
    null,
    null,
    null,
    null
  );
}

async function startServer() {
  ensureUiClientBundleBuiltOnce();
  const db = buildInMemoryDb();
  seedUrlData(db);
  openNewsDb.mockImplementationOnce(() => ({
    db,
    close: () => db.close()
  }));
  const { app, close } = createDataExplorerServer({
    dbPath: ":memory:",
    pageSize: 10
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    async shutdown() {
      await new Promise((resolve) => server.close(resolve));
      close();
    }
  };
}

async function readMeta(page) {
  const [rowCount, subtitle] = await Promise.all([
    page.$eval('[data-meta-field="rowCount"]', (el) => el.textContent.trim()),
    page.$eval('[data-meta-field="subtitle"]', (el) => el.textContent.trim())
  ]);
  return { rowCount, subtitle };
}

describe("Url filter toggle · Puppeteer e2e", () => {
  let browser;
  let serverHandle;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    serverHandle = await startServer();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (serverHandle) {
      await serverHandle.shutdown();
    }
  });

  test(
    "toggle switches to fetched URLs and updates summary",
    async () => {
      const page = await browser.newPage();
      page.on("console", (msg) => {
        console.log("[browser]", msg.text());
      });
      page.on("pageerror", (error) => {
        console.error("[browser-error]", error);
      });
      await page.goto(`${serverHandle.baseUrl}/urls`, { waitUntil: "domcontentloaded" });

      await page.waitForSelector('[data-meta-field="rowCount"]', { timeout: 5000 });
      await page.waitForSelector('table.ui-table tbody tr', { timeout: 5000 });

      const fallbackStatus = await page.evaluate(() => window.__COPILOT_FALLBACK_STATUS__ || null);
      console.log("[fallback-status]", fallbackStatus);

      const initialMeta = await readMeta(page);
      expect(initialMeta.rowCount).toBe("2");
      expect(initialMeta.subtitle).not.toContain("Fetched URLs only");

      const initialRows = await page.$$eval("table.ui-table tbody tr", (rows) =>
        rows.map((row) => row.textContent.trim())
      );
      expect(initialRows).toHaveLength(2);
      expect(initialRows.some((text) => text.includes("fetched.example"))).toBe(true);
      expect(initialRows.some((text) => text.includes("nofetch.example"))).toBe(true);

      const apiResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/urls") && response.request().method() === "GET",
        { timeout: 5000 }
      );

      await page.evaluate(() => {
        const checkbox = document.querySelector(".filter-toggle__checkbox");
        if (!checkbox) {
          throw new Error("Filter toggle checkbox not found");
        }
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const apiResponse = await apiResponsePromise;
      expect(apiResponse.ok()).toBe(true);
      const apiPayload = await apiResponse.json();
      expect(apiPayload?.filters?.hasFetches).toBe(true);

      await pause(page, 250);
      const debugState = await page.evaluate(() => {
        const toggle = document.querySelector(".filter-toggle");
        const rowCard = document.querySelector('[data-meta-field="rowCount"]');
        const subtitle = document.querySelector('[data-meta-field="subtitle"]');
        return {
          hasFetchesAttr: toggle?.getAttribute("data-has-fetches"),
          rowCountText: rowCard?.textContent?.trim(),
          subtitle: subtitle?.textContent?.trim(),
          rowLength: document.querySelectorAll("table.ui-table tbody tr").length
        };
      });
      console.log("[debug-state]", debugState);

      await page.waitForFunction(
        () => {
          const toggle = document.querySelector(".filter-toggle");
          const rows = document.querySelectorAll("table.ui-table tbody tr");
          const subtitle = document.querySelector('[data-meta-field="subtitle"]');
          const rowCard = document.querySelector('[data-meta-field="rowCount"]');
          return (
            toggle?.getAttribute("data-has-fetches") === "1" &&
            rows.length === 1 &&
            rowCard?.textContent?.trim() === "1" &&
            subtitle?.textContent?.includes("Fetched URLs only")
          );
        },
        { timeout: 10000 }
      );

      const filteredRows = await page.$$eval("table.ui-table tbody tr", (rows) =>
        rows.map((row) => row.textContent.trim())
      );
      expect(filteredRows).toHaveLength(1);
      expect(filteredRows[0]).toContain("fetched.example");

      const resetResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/api/urls") && response.request().method() === "GET",
        { timeout: 5000 }
      );

      await page.evaluate(() => {
        const checkbox = document.querySelector(".filter-toggle__checkbox");
        if (!checkbox) {
          throw new Error("Filter toggle checkbox not found");
        }
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const resetResponse = await resetResponsePromise;
      expect(resetResponse.ok()).toBe(true);
      const resetPayload = await resetResponse.json();
      expect(resetPayload?.filters?.hasFetches).toBe(false);

      await page.waitForFunction(
        () => {
          const toggle = document.querySelector(".filter-toggle");
          const rows = document.querySelectorAll("table.ui-table tbody tr");
          const subtitle = document.querySelector('[data-meta-field="subtitle"]');
          const rowCard = document.querySelector('[data-meta-field="rowCount"]');
          const hasFetchesAttr = toggle?.getAttribute("data-has-fetches");
          return (
            (!hasFetchesAttr || hasFetchesAttr === "0") &&
            rows.length === 2 &&
            rowCard?.textContent?.trim() === "2" &&
            !subtitle?.textContent?.includes("Fetched URLs only")
          );
        },
        { timeout: 10000 }
      );

      const resetRows = await page.$$eval("table.ui-table tbody tr", (rows) =>
        rows.map((row) => row.textContent.trim())
      );
      expect(resetRows).toHaveLength(2);
      expect(resetRows.some((text) => text.includes("fetched.example"))).toBe(true);
      expect(resetRows.some((text) => text.includes("nofetch.example"))).toBe(true);

      await page.close();
    },
    45000
  );
});
