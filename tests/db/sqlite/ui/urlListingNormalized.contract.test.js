"use strict";

const Database = require("better-sqlite3");

const {
  selectUrlPage,
  countUrls,
  parseHosts,
  normalizeHostMode
} = require("../../../../src/db/sqlite/v1/queries/ui/urlListingNormalized");

function buildDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      host TEXT,
      canonical_url TEXT,
      created_at TEXT,
      last_seen_at TEXT
    );
  `);
  return db;
}

function seedUrls(db, count) {
  const insert = db.prepare(
    "INSERT INTO urls (url, host, canonical_url, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
  );

  const tx = db.transaction((n) => {
    for (let i = 0; i < n; i += 1) {
      const idx = i + 1;
      insert.run(
        `https://example.com/page-${idx}`,
        "example.com",
        `https://example.com/page-${idx}`,
        "2025-11-01T00:00:00.000Z",
        "2025-11-02T00:00:00.000Z"
      );
    }
  });

  tx(count);
}

describe("urlListingNormalized UI query contract", () => {
  test("selectUrlPage returns stable keys and nullables", () => {
    const db = buildDb();
    seedUrls(db, 1);

    const rows = selectUrlPage(db, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("url");
    expect(row).toHaveProperty("host");
    expect(row).toHaveProperty("canonicalUrl");
    expect(row).toHaveProperty("createdAt");
    expect(row).toHaveProperty("lastSeenAt");
    expect(row).toHaveProperty("lastFetchAt");
    expect(row).toHaveProperty("httpStatus");
    expect(row).toHaveProperty("classification");
    expect(row).toHaveProperty("wordCount");
    expect(row).toHaveProperty("fetchCount");

    db.close();
  });

  test("selectUrlPage clamps limit to <= 5000", () => {
    const db = buildDb();
    seedUrls(db, 5100);

    const rows = selectUrlPage(db, { limit: 999999, offset: 0 });
    expect(rows.length).toBe(5000);
    expect(rows[0].id).toBe(1);
    expect(rows[rows.length - 1].id).toBe(5000);

    db.close();
  });

  test("countUrls returns a finite number", () => {
    const db = buildDb();
    seedUrls(db, 3);

    const total = countUrls(db);
    expect(total).toBe(3);

    db.close();
  });

  test("host parsing and mode normalization are bounded", () => {
    expect(parseHosts("a.com, a.com ,b.com")).toEqual(["a.com", "b.com"]);
    expect(normalizeHostMode("prefix")).toBe("prefix");
    expect(normalizeHostMode("nope")).toBe("exact");
  });
});
