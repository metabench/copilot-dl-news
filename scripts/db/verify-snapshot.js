#!/usr/bin/env node
"use strict";

const { openNewsCrawlerDb } = require("../../src/db/openNewsCrawlerDb");
const fs = require("fs");
const path = require("path");

async function main() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const snapshot = process.argv[2] || "mini";
  const dbPath = path.join(repoRoot, "data", "perf-snapshots", snapshot, "news.db");
  if (!fs.existsSync(dbPath)) {
    console.error("Snapshot DB not found:", dbPath);
    process.exit(2);
  }

  const db = openNewsCrawlerDb(dbPath, { readonly: true });
  try {
    const required = ["urls", "errors", "crawl_jobs", "articles"];
    const missing = [];
    for (const table of required) {
      if (!(await db.maintenance.tableExists(table))) {
        missing.push(table);
      }
    }
    if (missing.length) {
      console.error("Missing required tables:", missing.join(","));
      process.exit(3);
    }
    console.log("Snapshot verification passed for", snapshot);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Snapshot verification failed:", error.message);
    process.exit(1);
  });
}
