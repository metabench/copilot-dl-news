"use strict";

const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function createTempDbPath(label) {
  const root = path.join(process.cwd(), "tmp", "news-crawler-db-lab");
  ensureDir(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(root, `lab-${label}-${stamp}.db`);
  const seed = path.join(process.cwd(), "data", "news.db");
  if (fs.existsSync(seed)) {
    try {
      const stat = fs.statSync(seed);
      if (stat.size <= 200 * 1024 * 1024) {
        fs.copyFileSync(seed, target);
      }
    } catch (_) {
      // If copy fails, fall back to empty DB.
    }
  }
  return target;
}

function getExternalDbPath() {
  const seed = path.join(process.cwd(), "data", "news.db");
  if (fs.existsSync(seed)) {
    return seed;
  }
  return createTempDbPath("external");
}

function safeClose(instance) {
  try {
    if (instance && typeof instance.close === "function") {
      instance.close();
    }
  } catch (_) {
    // ignore
  }
}

function resolveExternalFactory() {
  try {
    const candidates = ["news-crawler-db", "news-crawler-db/dist/db"];
    let lastError = null;
    for (const id of candidates) {
      try {
        const mod = require(id);
        if (typeof mod.createDatabase === "function") {
          return { name: "news-crawler-db", create: mod.createDatabase };
        }
        if (typeof mod.createDbAdapter === "function") {
          return { name: "news-crawler-db", create: mod.createDbAdapter };
        }
        if (typeof mod.createSQLiteDatabase === "function") {
          return { name: "news-crawler-db", create: mod.createSQLiteDatabase };
        }
        if (typeof mod.default === "function") {
          return { name: "news-crawler-db", create: mod.default };
        }
        if (typeof mod === "function") {
          return { name: "news-crawler-db", create: mod };
        }
        if (mod.dbAdapter) {
          return { name: "news-crawler-db", create: () => mod.dbAdapter };
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError && (lastError.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(lastError.message))) {
      return { name: "news-crawler-db", missing: true };
    }
    return { name: "news-crawler-db", error: "No compatible factory export found" };
  } catch (err) {
    if (err && (err.code === "MODULE_NOT_FOUND" || /Cannot find module/.test(err.message))) {
      return { name: "news-crawler-db", missing: true };
    }
    return { name: "news-crawler-db", error: err.message || String(err) };
  }
}

async function createExternalInstance(factory, dbPath) {
  const candidates = [
    () => factory({ engine: "sqlite", dbPath }),
    () => factory({ type: "sqlite", path: dbPath }),
    () => factory({ type: "sqlite", dbPath }),
    () => factory({ dbPath }),
    () => factory(dbPath)
  ];
  let lastErr = null;
  for (const attempt of candidates) {
    try {
      const value = attempt();
      return value && typeof value.then === "function" ? await value : value;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Unable to create external adapter instance");
}

function writeResult(payload) {
  const outDir = path.join(process.cwd(), "labs", "news-crawler-db", "results");
  ensureDir(outDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `basic-write-read-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

async function runSmoke(instance, { skipWrites = false } = {}) {
  const result = {
    hasUpsertArticle: typeof instance?.upsertArticle === "function",
    hasGetArticleByUrl: typeof instance?.getArticleByUrl === "function",
    hasGetCount: typeof instance?.getCount === "function",
    writeOk: false,
    readOk: false,
    count: null,
    error: null
  };

  if (!result.hasGetCount) {
    result.error = "Missing required methods for smoke test";
    return result;
  }

  try {
    if (!skipWrites && result.hasUpsertArticle && result.hasGetArticleByUrl) {
      const now = new Date().toISOString();
      const url = "https://example.com/news/1";
      instance.upsertArticle({
        url,
        fetched_at: now,
        request_started_at: now,
        http_status: 200,
        content_type: "text/html",
        content_length: 1234,
        bytes_downloaded: 1234,
        ttfb_ms: 10,
        download_ms: 20,
        total_ms: 30,
        host: "example.com"
      });
      result.writeOk = true;

      const row = instance.getArticleByUrl(url);
      result.readOk = !!row;
    }
    result.count = instance.getCount();
  } catch (err) {
    result.error = err.message || String(err);
  }

  return result;
}

async function main() {
  const { createDatabase } = require("../../../src/data/db");

  const currentPath = createTempDbPath("current");
  const current = createDatabase({ engine: "sqlite", dbPath: currentPath });
  const currentResult = await runSmoke(current);

  let external = null;
  let externalResult = null;
  let externalError = null;

  try {
    external = createDatabase({ engine: "news-crawler-db", dbPath: getExternalDbPath() });
    externalResult = await runSmoke(external, { skipWrites: true });
    if (external && external.coreError) {
      externalError = external.coreError;
    }
  } catch (err) {
    externalError = err.message || String(err);
  }

  const payload = {
    timestamp: new Date().toISOString(),
    current: currentResult,
    external: externalResult,
    externalError
  };

  const outPath = writeResult(payload);
  console.log("Basic write/read smoke test complete:");
  console.log(JSON.stringify(payload, null, 2));
  console.log("Result saved:", outPath);

  safeClose(current);
  safeClose(external);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
