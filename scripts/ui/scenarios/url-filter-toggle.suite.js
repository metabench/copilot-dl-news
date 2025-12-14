"use strict";

const fs = require("fs");
const path = require("path");

const { openNewsDb } = require("../../../src/db/dbAccess");
const { createDataExplorerServer } = require("../../../src/ui/server/dataExplorerServer");

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeTempDbPath(artifactsDir) {
  const baseDir = path.join(artifactsDir || path.join(process.cwd(), "tmp"), "db");
  ensureDir(baseDir);
  const stamp = Date.now();
  return path.join(baseDir, `data-explorer-fixture-${stamp}.sqlite`);
}

function seedUrlData(dbHandle) {
  const insertUrl = dbHandle.prepare(
    "INSERT INTO urls (url, host, canonical_url, created_at, last_seen_at, analysis) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const created = "2025-11-14T00:00:00.000Z";
  const lastSeen = "2025-11-15T00:00:00.000Z";

  const fetchedUrlId = Number(
    insertUrl.run(
      "https://fetched.example/news",
      "fetched.example",
      "https://fetched.example/news",
      created,
      lastSeen,
      null
    ).lastInsertRowid
  );

  insertUrl.run(
    "https://nofetch.example/story",
    "nofetch.example",
    "https://nofetch.example/story",
    created,
    lastSeen,
    null
  );

  const insertHttp = dbHandle.prepare(
    "INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type, bytes_downloaded) VALUES (?, ?, ?, ?, ?, ?)"
  );

  insertHttp.run(
    fetchedUrlId,
    "2025-11-15T10:00:00.000Z",
    "2025-11-15T10:00:00.000Z",
    200,
    "text/html",
    2048
  );
}

async function startServer({ artifactsDir } = {}) {
  const dbPath = makeTempDbPath(artifactsDir);

  // Build + seed DB file so the server can open its own connection.
  const db = openNewsDb(dbPath);
  try {
    seedUrlData(db.db);
  } finally {
    db.close();
  }

  const { app, close } = createDataExplorerServer({
    dbPath,
    pageSize: 10,
    quietClientBuild: process.env.COPILOT_UI_SCENARIOS_QUIET_BUILD === "1"
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
      try {
        fs.unlinkSync(dbPath);
      } catch (_) {}
    }
  };
}

async function setCheckboxChecked(page, checked) {
  await page.evaluate((nextValue) => {
    const checkbox = document.querySelector(".filter-toggle__checkbox");
    if (!checkbox) {
      throw new Error("Filter toggle checkbox not found");
    }
    checkbox.checked = !!nextValue;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }, checked);
}

async function waitForUrlToggleHydration(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const registered = window.__COPILOT_REGISTERED_CONTROLS__;
      if (!Array.isArray(registered)) return false;
      return registered.includes("url_filter_toggle") && !!window.__COPILOT_URL_LISTING_STORE__;
    },
    { timeout: timeoutMs }
  );
}

async function toggleAndWaitForApi(page, checked, timeoutMs) {
  const apiResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/urls") && response.request().method() === "GET",
    { timeout: timeoutMs }
  );
  await setCheckboxChecked(page, checked);
  const apiResponse = await apiResponsePromise;
  if (!apiResponse.ok()) {
    throw new Error(`Expected /api/urls OK, got ${apiResponse.status()}`);
  }
  const apiPayload = await apiResponse.json();
  return { apiPayload };
}

async function toggleAndWaitForApiWithHydrationRetry(page, checked, options = {}) {
  const fastTimeoutMs = Number.isFinite(options.fastTimeoutMs) ? options.fastTimeoutMs : 5000;
  const hydrationTimeoutMs = Number.isFinite(options.hydrationTimeoutMs) ? options.hydrationTimeoutMs : 15000;
  const retryTimeoutMs = Number.isFinite(options.retryTimeoutMs) ? options.retryTimeoutMs : 15000;
  try {
    const result = await toggleAndWaitForApi(page, checked, fastTimeoutMs);
    return { ...result, hydrationWaited: false };
  } catch (_) {
    await waitForUrlToggleHydration(page, hydrationTimeoutMs);
    const result = await toggleAndWaitForApi(page, checked, retryTimeoutMs);
    return { ...result, hydrationWaited: true };
  }
}

async function readMeta(page) {
  const [rowCount, subtitle] = await Promise.all([
    page.$eval('[data-meta-field="rowCount"]', (el) => el.textContent.trim()),
    page.$eval('[data-meta-field="subtitle"]', (el) => el.textContent.trim())
  ]);
  return { rowCount, subtitle };
}

module.exports = {
  startServer,
  scenarios: [
    {
      id: "001",
      name: "Urls page renders",
      url: "/urls",
      waitUntil: "load",
      waitForSelector: "table.ui-table tbody tr",
      async assert({ page }) {
        const meta = await readMeta(page);
        if (meta.rowCount !== "2") throw new Error(`Expected rowCount 2, got ${meta.rowCount}`);
      }
    },
    {
      id: "002",
      name: "Toggle on filters fetched URLs",
      url: "/urls",
      waitUntil: "load",
      waitForSelector: "table.ui-table tbody tr",
      async run({ page }) {
        const { apiPayload, hydrationWaited } = await toggleAndWaitForApiWithHydrationRetry(page, true);
        await page.evaluate((flag, waited, ts) => {
          window.__COPILOT_SCENARIO_NOTE__ = { hasFetches: flag, hydrationWaited: waited, ts };
        }, true, hydrationWaited, nowIso());
        if (!apiPayload || !apiPayload.filters || apiPayload.filters.hasFetches !== true) {
          throw new Error(`Expected apiPayload.filters.hasFetches true, got ${JSON.stringify(apiPayload)}`);
        }
      },
      async assert({ page }) {
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
      }
    },
    {
      id: "003",
      name: "Toggle off restores all URLs",
      url: "/urls?hasFetches=1",
      waitUntil: "load",
      waitForSelector: "table.ui-table tbody tr",
      async run({ page }) {
        const { apiPayload } = await toggleAndWaitForApiWithHydrationRetry(page, false);
        if (!apiPayload || !apiPayload.filters || apiPayload.filters.hasFetches !== false) {
          throw new Error(`Expected apiPayload.filters.hasFetches false, got ${JSON.stringify(apiPayload)}`);
        }
      },
      async assert({ page }) {
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
      }
    }
  ]
};
