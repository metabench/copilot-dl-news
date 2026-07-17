#!/usr/bin/env node
"use strict";
const { openNewsCrawlerDb } = require('../../../../db/openNewsCrawlerDb');
const {
  createDownloadVerificationCheckFixture,
  getRecentDownloadVerifications
} = require("news-crawler-db");

function assert(name, condition) {
  if (!condition) {
    throw new Error(`Assertion failed: ${name}`);
  }
  console.log(`✓ ${name}`);
}

function createFixtureDb() {
  const db = openNewsCrawlerDb(":memory:");
  createDownloadVerificationCheckFixture(db);
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
