"use strict";

const request = require("supertest");
const Database = require("better-sqlite3");

jest.mock("../../../src/db/dbAccess", () => ({
  openNewsDb: jest.fn()
}));

const { openNewsDb } = require("../../../src/db/dbAccess");
const { createDataExplorerServer } = require("../../../src/ui/server/dataExplorerServer");

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
    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      request_started_at TEXT,
      fetched_at TEXT,
      http_status INTEGER,
      content_type TEXT,
      content_encoding TEXT,
      bytes_downloaded INTEGER,
      transfer_kbps REAL,
      redirect_chain TEXT,
      ttfb_ms INTEGER,
      download_ms INTEGER,
      total_ms INTEGER,
      cache_category TEXT,
      cache_key TEXT,
      cache_created_at TEXT,
      cache_expires_at TEXT,
      request_method TEXT
    );

    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER,
      uncompressed_size INTEGER,
      compression_type_id INTEGER,
      content_category TEXT,
      content_subtype TEXT
    );

    CREATE TABLE content_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER,
      classification TEXT,
      word_count INTEGER,
      content_category TEXT,
      content_subtype TEXT
    );

    CREATE VIEW fetched_urls AS
    SELECT
      u.id AS url_id,
      u.url,
      u.host,
      u.canonical_url,
      u.created_at AS url_created_at,
      u.last_seen_at AS url_last_seen_at,
      MAX(hr.fetched_at) AS last_fetched_at,
      MAX(hr.http_status) AS last_http_status,
      MAX(ca.classification) AS last_classification,
      MAX(ca.word_count) AS last_word_count,
      COUNT(hr.id) AS fetch_count
    FROM urls u
    LEFT JOIN http_responses hr ON hr.url_id = u.id
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    GROUP BY u.id, u.url, u.host, u.canonical_url, u.created_at, u.last_seen_at;

    CREATE TABLE crawler_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.setSetting = (key, value) => {
    if (!key) return false;
    db.prepare(
      "INSERT INTO crawler_settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(key, value != null ? String(value) : null);
    return true;
  };

  return db;
}

function seedUrlWithFetches(db, { url = "https://example.com/article", host = "example.com" } = {}) {
  const insertUrl = db.prepare(
    "INSERT INTO urls (url, host, canonical_url, created_at, last_seen_at, analysis) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const timestamps = {
    created: "2025-11-01T00:00:00.000Z",
    lastSeen: "2025-11-02T12:00:00.000Z"
  };
  const result = insertUrl.run(url, host, url, timestamps.created, timestamps.lastSeen, null);
  const urlId = Number(result.lastInsertRowid);
  const insertResponse = db.prepare(
    "INSERT INTO http_responses (url_id, fetched_at, request_started_at, http_status, content_type, bytes_downloaded, ttfb_ms, download_ms, total_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertStorage = db.prepare(
    "INSERT INTO content_storage (http_response_id, uncompressed_size, content_category, content_subtype) VALUES (?, ?, ?, ?)"
  );
  const insertAnalysis = db.prepare(
    "INSERT INTO content_analysis (content_id, classification, word_count, content_category, content_subtype) VALUES (?, ?, ?, ?, ?)"
  );

  const primaryFetch = insertResponse.run(
    urlId,
    "2025-11-02T12:05:00.000Z",
    "2025-11-02T12:05:00.000Z",
    200,
    "text/html",
    2048,
    120,
    350,
    470
  );
  const primaryResponseId = Number(primaryFetch.lastInsertRowid);
  const storageRow = insertStorage.run(primaryResponseId, 4096, "article", "html");
  const storageId = Number(storageRow.lastInsertRowid);
  insertAnalysis.run(storageId, "article", 450, "article", "html");

  insertResponse.run(
    urlId,
    "2025-11-02T11:45:00.000Z",
    "2025-11-02T11:45:00.000Z",
    304,
    "text/html",
    null,
    null,
    null,
    null
  );
  return urlId;
}

function createServer(seedFn) {
  const db = buildInMemoryDb();
  const payload = typeof seedFn === "function" ? seedFn(db) : {};
  const dbAccess = {
    db,
    setSetting: (key, value) => db.setSetting(key, value),
    close: jest.fn(() => db.close())
  };
  openNewsDb.mockReturnValueOnce(dbAccess);
  const server = createDataExplorerServer({ dbPath: ":memory:", pageSize: 20 });
  return { db, ...payload, app: server.app, shutdown: () => server.close() };
}

function createBrokenServer() {
  const dbAccess = {
    db: null,
    close: jest.fn()
  };
  openNewsDb.mockReturnValueOnce(dbAccess);
  const server = createDataExplorerServer({ dbPath: ":memory:", pageSize: 20 });
  return { app: server.app, shutdown: () => server.close() };
}

describe("dataExplorerServer /urls/:id routes", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders download history HTML with sparkline for known URL", async () => {
    const { app, shutdown, urlId } = createServer((db) => ({ urlId: seedUrlWithFetches(db) }));
    const response = await request(app).get(`/urls/${urlId}`);

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain(`URL: https://example.com/article`);
    expect(response.text).toContain("Last 2 fetches for https://example.com/article");
    expect(response.text).toContain("class=\"sparkline\"");
    expect(response.text).toContain("Fetched At");
    expect(response.text).toContain("HTTP");

    shutdown();
  });

  test("returns 404 when URL id missing", async () => {
    const { app, shutdown } = createServer();
    const response = await request(app).get("/urls/99999");

    expect(response.status).toBe(404);
    expect(response.text).toContain("URL not found");

    shutdown();
  });

  test("redirects /downloads helper to detail route", async () => {
    const { app, shutdown, urlId } = createServer((db) => ({ urlId: seedUrlWithFetches(db) }));
    const response = await request(app).get(`/urls/${urlId}/downloads`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`/urls/${urlId}`);

    shutdown();
  });

  test("renders domain drilldown with summary cards and links", async () => {
    const host = "example.com";
    const { app, shutdown, firstUrlId } = createServer((db) => {
      const firstUrlId = seedUrlWithFetches(db, { url: "https://example.com/story-1", host });
      seedUrlWithFetches(db, { url: "https://example.com/story-2", host });
      return { firstUrlId };
    });

    const response = await request(app).get(`/domains/${host}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain(`Domain: ${host}`);
    expect(response.text).toContain("Unique URLs");
    expect(response.text).toContain("Downloads (24h)");
    expect(response.text).toContain("class=\"sparkline\"");
    expect(response.text).toContain(`/urls/${firstUrlId}`);

    shutdown();
  });

  test("returns 400 when domain param is empty", async () => {
    const { app, shutdown } = createServer();
    const response = await request(app).get("/domains/%20");

    expect(response.status).toBe(400);
    expect(response.text).toContain("Host is required");

    shutdown();
  });

  test("returns 404 when domain is missing", async () => {
    const { app, shutdown } = createServer();
    const response = await request(app).get("/domains/unknown.example");

    expect(response.status).toBe(404);
    expect(response.text).toContain("Host not found");

    shutdown();
  });
});

describe("dataExplorerServer /api/urls diagnostics", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("includes diagnostics metadata and headers on success", async () => {
    const { app, shutdown } = createServer((db) => ({ urlId: seedUrlWithFetches(db) }));
    const response = await request(app).get("/api/urls");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.diagnostics).toBeDefined();
    expect(response.body.diagnostics.requestId).toBeTruthy();
    expect(response.headers["x-copilot-request-id"]).toBe(response.body.diagnostics.requestId);
    expect(response.headers["x-copilot-duration-ms"]).toBeDefined();

    shutdown();
  });

  test("returns JSON envelope with diagnostics on failure", async () => {
    const { app, shutdown } = createBrokenServer();
    const response = await request(app).get("/api/urls");

    expect(response.status).toBe(500);
    expect(response.type).toMatch(/json/);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe("ERR_UI_SERVER");
    expect(response.body.diagnostics.requestId).toBeTruthy();
    expect(response.headers["x-copilot-error"]).toBe("1");

    shutdown();
  });
});

describe("dataExplorerServer config editing", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders config view with inline edit forms", async () => {
    const { app, shutdown } = createServer((db) => {
      db.setSetting("crawler.delayMs", "250");
      db.setSetting("crawler.maxDepth", "3");
      return {};
    });

    const response = await request(app).get("/config");

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain("Crawler Settings");
    expect(response.text).toContain("config-matrix__edit-form");
    expect(response.text).toContain('action="/api/config"');
    expect(response.text).toContain('name="key"');
    expect(response.text).toContain('name="value"');
    expect(response.text).toContain('value="crawler.delayMs"');
    expect(response.text).toContain('value="250"');

    shutdown();
  });

  test("updates crawler setting via form post and redirects back", async () => {
    const { app, shutdown, db } = createServer((db) => {
      db.setSetting("crawler.delayMs", "250");
      return {};
    });

    const response = await request(app)
      .post("/api/config")
      .set("Referer", "/config?from=test")
      .type("form")
      .send({ key: "crawler.delayMs", value: "500" });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe("/config?from=test");

    const row = db.prepare("SELECT value FROM crawler_settings WHERE key = ?").get("crawler.delayMs");
    expect(row.value).toBe("500");

    shutdown();
  });

  test("returns JSON payload when Accept header requests JSON", async () => {
    const { app, shutdown, db } = createServer((db) => {
      db.setSetting("crawler.maxDepth", "3");
      return {};
    });

    const response = await request(app)
      .post("/api/config")
      .set("Accept", "application/json")
      .send({ key: "crawler.maxDepth", value: "7" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.key).toBe("crawler.maxDepth");
    expect(response.body.value).toBe("7");

    const row = db.prepare("SELECT value FROM crawler_settings WHERE key = ?").get("crawler.maxDepth");
    expect(row.value).toBe("7");

    shutdown();
  });

  test("rejects missing key when posting config", async () => {
    const { app, shutdown } = createServer();

    const response = await request(app)
      .post("/api/config")
      .set("Accept", "application/json")
      .send({ value: "noop" });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);

    shutdown();
  });
});
