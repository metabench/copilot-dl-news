#!/usr/bin/env node
"use strict";

const Database = require("better-sqlite3");
const { getRecentDownloadVerifications } = require("../../../../data/db/queries/downloadEvidence");

function assert(name, condition) {
  if (!condition) {
    throw new Error(`Assertion failed: ${name}`);
  }
  console.log(`✓ ${name}`);
}

function createFixtureDb() {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      host TEXT NOT NULL
    );

    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY,
      url_id INTEGER NOT NULL,
      fetched_at TEXT,
      http_status INTEGER,
      content_type TEXT,
      content_encoding TEXT,
      bytes_downloaded INTEGER
    );

    CREATE TABLE compression_types (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      level INTEGER NOT NULL,
      memory_mb INTEGER,
      window_bits INTEGER,
      block_bits INTEGER
    );

    CREATE TABLE compression_buckets (
      id INTEGER PRIMARY KEY,
      bucket_type TEXT NOT NULL,
      status TEXT,
      compression_type_id INTEGER
    );

    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY,
      storage_type TEXT NOT NULL,
      compression_type_id INTEGER,
      compression_bucket_id INTEGER,
      bucket_entry_key TEXT,
      content_sha256 TEXT,
      uncompressed_size INTEGER,
      compressed_size INTEGER,
      compression_ratio REAL,
      created_at TEXT NOT NULL,
      http_response_id INTEGER
    );
  `);

  db.prepare("INSERT INTO urls (id, url, host) VALUES (?, ?, ?)").run(1, "https://example.com/a", "example.com");
  db.prepare("INSERT INTO urls (id, url, host) VALUES (?, ?, ?)").run(2, "https://example.net/b", "example.net");
  db.prepare("INSERT INTO urls (id, url, host) VALUES (?, ?, ?)").run(3, "https://bad.example/c", "bad.example");
  db.prepare("INSERT INTO compression_types (id, name, algorithm, level, memory_mb, window_bits, block_bits) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(1, "brotli_6", "brotli", 6, 0, 22, null);

  db.prepare("INSERT INTO http_responses (id, url_id, fetched_at, http_status, content_type, content_encoding, bytes_downloaded) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(10, 1, "2026-04-29 21:10:04", 200, "text/html", null, 1000);
  db.prepare("INSERT INTO http_responses (id, url_id, fetched_at, http_status, content_type, content_encoding, bytes_downloaded) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(11, 2, "2026-04-29 21:10:03", 200, "text/html", null, 500);
  db.prepare("INSERT INTO http_responses (id, url_id, fetched_at, http_status, content_type, content_encoding, bytes_downloaded) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(12, 3, "2026-04-29 21:10:02", 500, "text/html", null, 0);

  db.prepare("INSERT INTO content_storage (id, storage_type, compression_type_id, content_sha256, uncompressed_size, compressed_size, compression_ratio, created_at, http_response_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(20, "db_compressed", 1, "abcdef1234567890", 1000, 300, 0.3, "2026-04-29 21:10:05", 10);
  db.prepare("INSERT INTO content_storage (id, storage_type, compression_type_id, content_sha256, uncompressed_size, compressed_size, compression_ratio, created_at, http_response_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(21, "gzip", null, "123456abcdef7890", 500, 200, 0.4, "2026-04-29 21:10:04", 11);

  return db;
}

function main() {
  const db = createFixtureDb();
  try {
    const result = getRecentDownloadVerifications(db, { limit: 10 });
    assert("returns ok row count", result.items.length === 3);
    assert("summarizes verified persisted rows", result.summary.verified === 2);
    assert("summarizes saved rows", result.summary.savedToDb === 2);
    assert("records typed compression level", result.items[0].compression.level === 6);
    assert("records typed compression algorithm", result.items[0].compression.algorithm === "brotli");
    assert("records typed compression options", result.items[0].compression.options.includes("window_bits=22"));

    const legacy = result.items.find((item) => item.httpResponseId === 11);
    assert("infers legacy storage algorithm", legacy.compression.algorithm === "gzip");
    assert("does not invent legacy compression level", legacy.compression.levelRecorded === false);
    assert("shows legacy storage option", legacy.compression.options.includes("storage_type=gzip"));

    console.log(JSON.stringify(result, null, 2));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}