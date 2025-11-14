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
  const insertFetch = db.prepare(
    "INSERT INTO fetches (url_id, fetched_at, request_started_at, http_status, content_type, content_length, bytes_downloaded, file_path, file_size, classification, word_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  insertFetch.run(
    urlId,
    "2025-11-02T12:05:00.000Z",
    "2025-11-02T12:05:00.000Z",
    200,
    "text/html",
    2048,
    2048,
    null,
    null,
    "article",
    450
  );
  insertFetch.run(
    urlId,
    "2025-11-02T11:45:00.000Z",
    "2025-11-02T11:45:00.000Z",
    304,
    "text/html",
    null,
    null,
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
    close: jest.fn(() => db.close())
  };
  openNewsDb.mockReturnValueOnce(dbAccess);
  const server = createDataExplorerServer({ dbPath: ":memory:", pageSize: 20 });
  return { ...payload, app: server.app, shutdown: () => server.close() };
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
