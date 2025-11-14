"use strict";

const Database = require("better-sqlite3");
const {
  getCachedMetric,
  refreshStat
} = require("../metricsService");

function setupDatabase() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE ui_cached_metrics (
      stat_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      source_window TEXT,
      duration_ms INTEGER,
      max_age_ms INTEGER,
      error TEXT,
      metadata JSON
    );
    CREATE INDEX idx_ui_cached_metrics_generated_at ON ui_cached_metrics(generated_at DESC);
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL
    );
  `);
  return db;
}

describe("metricsService", () => {
  let db;

  beforeEach(() => {
    db = setupDatabase();
  });

  afterEach(() => {
    db.close();
  });

  test("refreshStat caches urls.total_count payloads", async () => {
    db.prepare("INSERT INTO urls(url) VALUES (?)").run("https://example.com/");

    const result = await refreshStat(db, "urls.total_count", { maxAgeMs: 60_000 });

    expect(result.statKey).toBe("urls.total_count");
    expect(result.error).toBeNull();
    expect(result.payload && result.payload.value).toBe(1);

    const cached = getCachedMetric(db, "urls.total_count", { now: new Date(result.generatedAt) });
    expect(cached).not.toBeNull();
    expect(cached.payload.value).toBe(1);
    expect(cached.stale).toBe(false);
    expect(cached.maxAgeMs).toBe(60_000);
  });

  test("getCachedMetric marks stale rows when beyond max_age", () => {
    db.prepare(`
      INSERT INTO ui_cached_metrics (
        stat_key, payload, generated_at, source_window,
        duration_ms, max_age_ms, error, metadata
      ) VALUES (?, ?, ?, NULL, NULL, ?, NULL, NULL)
    `).run(
      "urls.total_count",
      JSON.stringify({ value: 42 }),
      "2024-01-01T00:00:00.000Z",
      1_000
    );

    const cached = getCachedMetric(db, "urls.total_count", {
      now: new Date("2024-01-01T00:00:02.500Z")
    });

    expect(cached).not.toBeNull();
    expect(cached.payload.value).toBe(42);
    expect(cached.stale).toBe(true);
    expect(cached.maxAgeMs).toBe(1_000);
  });

  test("refreshStat handles missing definitions with clear error", async () => {
    await expect(() => refreshStat(db, "unknown.stat"))
      .rejects.toThrow(/Unknown stat key/i);
  });
});
