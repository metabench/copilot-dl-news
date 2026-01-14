"use strict";

const request = require("supertest");
const Database = require("better-sqlite3");

jest.mock("../../../src/data/db/dbAccess", () => ({
  openNewsDb: jest.fn()
}));

const { openNewsDb } = require("../../../src/data/db/dbAccess");
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
    INNER JOIN http_responses hr ON hr.url_id = u.id
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    GROUP BY u.id, u.url, u.host, u.canonical_url, u.created_at, u.last_seen_at;

    CREATE TABLE crawler_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE crawl_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      ts TEXT DEFAULT (datetime('now')),
      kind TEXT,
      scope TEXT,
      target TEXT,
      message TEXT,
      details TEXT
    );
  `);

  db.setSetting = (key, value) => {
    if (!key) return false;
    db.prepare(
      "INSERT INTO crawler_settings(key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(key, value != null ? String(value) : null);
    return true;
  };

  db.listMilestones = ({ job = null, kind = null, scope = null, target = null, targetLike = null, limit = 100 } = {}) => {
    const clauses = [];
    const params = [];
    if (job) { clauses.push('job_id = ?'); params.push(job); }
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (scope) { clauses.push('scope = ?'); params.push(scope); }
    if (target) { clauses.push('target = ?'); params.push(target); }
    else if (targetLike) { clauses.push('target LIKE ?'); params.push(`%${targetLike}%`); }
    const sql = `SELECT id, ts, kind, scope, target, message, details, job_id AS jobId FROM crawl_milestones ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    try {
      const rows = db.prepare(sql).all(...params, Math.min(500, limit));
      return { items: rows, cursors: {} };
    } catch (_) { return { items: [], cursors: {} }; }
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

function seedUrlOnly(db, { url = "https://example.com/seed", host = "example.com" } = {}) {
  const insertUrl = db.prepare(
    "INSERT INTO urls (url, host, canonical_url, created_at, last_seen_at, analysis) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const timestamps = {
    created: "2025-11-01T00:00:00.000Z",
    lastSeen: "2025-11-02T12:00:00.000Z"
  };
  const result = insertUrl.run(url, host, url, timestamps.created, timestamps.lastSeen, null);
  return Number(result.lastInsertRowid);
}

function createServer(seedFn) {
  const db = buildInMemoryDb();
  const payload = typeof seedFn === "function" ? seedFn(db) : {};
  const dbAccess = {
    db,
    setSetting: (key, value) => db.setSetting(key, value),
    listMilestones: (options) => (typeof db.listMilestones === "function" ? db.listMilestones(options) : { items: [], cursors: {} }),
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

describe("dataExplorerServer health endpoint", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns ok payload", async () => {
    const { app, shutdown } = createServer();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: "data-explorer" });
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

describe("dataExplorerServer /api/urls filtering", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("filters urls by host (case-insensitive exact match)", async () => {
    const hostA = "example.com";
    const hostB = "other.example";

    const { app, shutdown } = createServer((db) => {
      seedUrlWithFetches(db, { url: "https://example.com/a", host: hostA });
      seedUrlWithFetches(db, { url: "https://example.com/b", host: hostA });
      seedUrlOnly(db, { url: "https://example.com/c", host: hostA });
      seedUrlWithFetches(db, { url: "https://other.example/x", host: hostB });
      return {};
    });

    const response = await request(app).get("/api/urls?host=Example.COM");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBeGreaterThan(0);
    expect(response.body.records.every((record) => record.host === hostA)).toBe(true);
    expect(response.body.meta.pagination.totalRows).toBe(3);

    shutdown();
  });

  test("filters fetched urls by host when hasFetches enabled", async () => {
    const hostA = "example.com";
    const hostB = "other.example";

    const { app, shutdown } = createServer((db) => {
      seedUrlWithFetches(db, { url: "https://example.com/a", host: hostA });
      seedUrlWithFetches(db, { url: "https://other.example/x", host: hostB });
      seedUrlOnly(db, { url: "https://example.com/unfetched", host: hostA });
      return {};
    });

    const response = await request(app).get("/api/urls?host=example.com&hasFetches=1");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBeGreaterThan(0);
    expect(response.body.records.every((record) => record.host === hostA)).toBe(true);
    expect(response.body.meta.pagination.totalRows).toBe(1);

    shutdown();
  });

  test("filters urls by host with hostMode=prefix", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://news.example.com/a", host: "news.example.com" });
      seedUrlOnly(db, { url: "https://news.example.org/b", host: "news.example.org" });
      seedUrlOnly(db, { url: "https://other.com/c", host: "other.com" });
      return {};
    });

    const response = await request(app).get("/api/urls?host=news.example&hostMode=prefix");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBe(2);
    expect(response.body.records.every((r) => r.host.startsWith("news.example"))).toBe(true);

    shutdown();
  });

  test("filters urls by host with hostMode=contains", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://sub.example.net/a", host: "sub.example.net" });
      seedUrlOnly(db, { url: "https://example.com/b", host: "example.com" });
      seedUrlOnly(db, { url: "https://other.com/c", host: "other.com" });
      return {};
    });

    const response = await request(app).get("/api/urls?host=example&hostMode=contains");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBe(2);
    expect(response.body.records.every((r) => r.host.includes("example"))).toBe(true);

    shutdown();
  });

  test("filters urls by multiple hosts (comma-separated)", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://example.com/a", host: "example.com" });
      seedUrlOnly(db, { url: "https://other.net/b", host: "other.net" });
      seedUrlOnly(db, { url: "https://third.org/c", host: "third.org" });
      return {};
    });

    const response = await request(app).get("/api/urls?hosts=example.com,other.net");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBe(2);
    const hosts = response.body.records.map((r) => r.host);
    expect(hosts).toContain("example.com");
    expect(hosts).toContain("other.net");
    expect(hosts).not.toContain("third.org");

    shutdown();
  });

  test("pagination links preserve filter params (hasFetches, hostMode)", async () => {
    const { app, shutdown } = createServer((db) => {
      // Seed enough data to trigger pagination
      for (let i = 0; i < 30; i++) {
        seedUrlWithFetches(db, { url: `https://news.example.com/article-${i}`, host: "news.example.com" });
        seedUrlWithFetches(db, { url: `https://other.net/page-${i}`, host: "other.net" });
      }
      return {};
    });

    const response = await request(app).get("/api/urls?host=news.example&hostMode=prefix&hasFetches=1");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.meta).toBeDefined();
    expect(response.body.meta.pagination).toBeDefined();
    expect(response.body.meta.pagination.totalPages).toBeGreaterThan(1);

    const { nextHref } = response.body.meta.pagination;
    expect(nextHref).toBeDefined();
    expect(nextHref).toContain("hasFetches=1");
    expect(nextHref).toContain("hostMode=prefix");
    expect(nextHref).toContain("host=news.example");

    shutdown();
  });
});

describe("dataExplorerServer /api/domains/counts", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns counts for multiple hosts using batched queries", async () => {
    const hostA = "example.com";
    const hostB = "other.example";
    const hostBInput = "Other.Example";

    const { app, shutdown, db } = createServer((db) => {
      seedUrlWithFetches(db, { url: "https://example.com/story-1", host: hostA });
      seedUrlWithFetches(db, { url: "https://example.com/story-2", host: hostA });
      seedUrlWithFetches(db, { url: "https://other.example/story-1", host: hostB });
      return {};
    });

    const callCounts = { get: 0, all: 0 };
    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      const stmt = originalPrepare(sql);
      const originalGet = stmt.get.bind(stmt);
      const originalAll = stmt.all.bind(stmt);
      stmt.get = (...args) => {
        callCounts.get += 1;
        return originalGet(...args);
      };
      stmt.all = (...args) => {
        callCounts.all += 1;
        return originalAll(...args);
      };
      return stmt;
    };

    const response = await request(app)
      .get(`/api/domains/counts?hosts=${encodeURIComponent(`${hostA}, ${hostBInput}`)}`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/json/);
    expect(response.body.counts).toBeDefined();

    expect(response.body.counts[hostA]).toEqual({ allArticles: 2, fetches: 4 });
    expect(response.body.counts[hostBInput]).toEqual({ allArticles: 1, fetches: 2 });

    expect(callCounts.get).toBe(0);
    expect(callCounts.all).toBe(2);

    shutdown();
  });
});

describe("dataExplorerServer /api/domains", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns paginated domain listing with url_count and last_seen", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://example.com/a", host: "example.com" });
      seedUrlOnly(db, { url: "https://example.com/b", host: "example.com" });
      seedUrlOnly(db, { url: "https://other.net/c", host: "other.net" });
      return {};
    });

    const response = await request(app).get("/api/domains");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records).toBeDefined();
    expect(response.body.records.length).toBe(2);
    expect(response.body.meta.pagination).toBeDefined();
    expect(response.body.meta.pagination.totalRows).toBe(2);

    // Check records have expected fields
    const exampleDomain = response.body.records.find((r) => r.host === "example.com");
    expect(exampleDomain).toBeDefined();
    expect(exampleDomain.url_count).toBe(2);

    shutdown();
  });

  test("filters domains by search param (case-insensitive contains)", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://example.com/a", host: "example.com" });
      seedUrlOnly(db, { url: "https://news.example.com/b", host: "news.example.com" });
      seedUrlOnly(db, { url: "https://other.net/c", host: "other.net" });
      return {};
    });

    const response = await request(app).get("/api/domains?search=example");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBe(2);
    const hosts = response.body.records.map((r) => r.host);
    expect(hosts).toContain("example.com");
    expect(hosts).toContain("news.example.com");
    expect(hosts).not.toContain("other.net");

    shutdown();
  });

  test("sorts domains by host ascending", async () => {
    const { app, shutdown } = createServer((db) => {
      seedUrlOnly(db, { url: "https://z-last.com/a", host: "z-last.com" });
      seedUrlOnly(db, { url: "https://a-first.com/b", host: "a-first.com" });
      seedUrlOnly(db, { url: "https://m-middle.net/c", host: "m-middle.net" });
      return {};
    });

    const response = await request(app).get("/api/domains?sortBy=host&sortDir=ASC");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.records.length).toBe(3);
    expect(response.body.records[0].host).toBe("a-first.com");
    expect(response.body.records[1].host).toBe("m-middle.net");
    expect(response.body.records[2].host).toBe("z-last.com");

    shutdown();
  });

  test("pagination links preserve search and sort params", async () => {
    const { app, shutdown } = createServer((db) => {
      for (let i = 0; i < 50; i++) {
        seedUrlOnly(db, { url: `https://domain${i}.example.com/page`, host: `domain${i}.example.com` });
      }
      return {};
    });

    const response = await request(app).get("/api/domains?search=example&sortBy=host&sortDir=ASC");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.meta.pagination.totalPages).toBeGreaterThan(1);

    const { nextHref } = response.body.meta.pagination;
    expect(nextHref).toBeDefined();
    expect(nextHref).toContain("search=example");
    expect(nextHref).toContain("sortBy=host");
    expect(nextHref).toContain("sortDir=ASC");

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

describe("dataExplorerServer /decisions route", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("renders decisions view with empty state", async () => {
    const { app, shutdown } = createServer();

    const response = await request(app).get("/decisions");

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);
    expect(response.text).toContain("Crawler Decisions");
    expect(response.text).toContain("No decision traces found");

    shutdown();
  });

  test("renders decisions view with milestone data", async () => {
    const { app, shutdown } = createServer((db) => {
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-123", "2025-12-01T10:00:00.000Z", "fetch-policy-decision", "crawler", "https://example.com/article", "Fetched due to freshness policy");
      return {};
    });

    const response = await request(app).get("/decisions");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Crawler Decisions");
    expect(response.text).toContain("fetch-policy-decision");
    expect(response.text).toContain("Fetched due to freshness policy");
    expect(response.text).toContain("example.com/article");

    shutdown();
  });

  test("filters decisions by kind query param", async () => {
    const { app, shutdown } = createServer((db) => {
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-1", "2025-12-01T10:00:00Z", "fetch-policy-decision", "crawler", "https://a.com/", "msg1");
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-2", "2025-12-01T11:00:00Z", "skip-reason-decision", "crawler", "https://b.com/", "msg2");
      return {};
    });

    const response = await request(app).get("/decisions?kind=skip-reason-decision");

    expect(response.status).toBe(200);
    expect(response.text).toContain("skip-reason-decision");
    expect(response.text).not.toContain("fetch-policy-decision");

    shutdown();
  });

  test("hides cache reflex milestones by default", async () => {
    const { app, shutdown } = createServer((db) => {
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-1", "2025-12-01T10:00:00Z", "cache-priority-hit", "crawler", "https://cached.example/", "Served cached page while rate limited");
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-2", "2025-12-01T11:00:00Z", "fetch-policy-decision", "crawler", "https://fresh.example/", "Fetched due to freshness policy");
      return {};
    });

    const response = await request(app).get("/decisions");

    expect(response.status).toBe(200);
    expect(response.text).toContain("fetch-policy-decision");
    expect(response.text).not.toContain("cache-priority-hit");

    shutdown();
  });

  test("shows cache reflex milestones when includeReflexes=true", async () => {
    const { app, shutdown } = createServer((db) => {
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-1", "2025-12-01T10:00:00Z", "cache-priority-hit", "crawler", "https://cached.example/", "Served cached page while rate limited");
      return {};
    });

    const response = await request(app).get("/decisions?includeReflexes=true");

    expect(response.status).toBe(200);
    expect(response.text).toContain("cache-priority-hit");

    shutdown();
  });
});

describe("dataExplorerServer URL detail with decisions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("shows decision count card when traces exist for URL", async () => {
    const { app, shutdown, urlId } = createServer((db) => {
      const urlId = seedUrlWithFetches(db);
      db.prepare(
        "INSERT INTO crawl_milestones (job_id, ts, kind, scope, target, message) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("job-1", "2025-12-01T10:00:00Z", "fetch-policy-decision", "crawler", "https://example.com/article", "Fetched fresh");
      return { urlId };
    });

    const response = await request(app).get(`/urls/${urlId}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain("Decisions");
    expect(response.text).toContain("Why traces");
    expect(response.text).toContain("Why (Decision Traces)");

    shutdown();
  });
});

